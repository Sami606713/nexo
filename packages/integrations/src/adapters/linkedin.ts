import {
  AdapterError,
  NETWORK_LIMITS,
  type ComposedPost,
  type ConnectTarget,
  type Credentials,
  type NetworkAdapter,
  type PublishResult,
} from "@postline/core";
import { downloadMedia, fetchJson, fetchWithBody, request, readBody, httpError, type HttpOptions, type StatusClassifier } from "../http";
import { tokenRequest, tokenToCredentials } from "../oauth";
import { validateForNetwork } from "../rules";
import { assertValid, credString, maxBytesFor, requireCred, requireEnv } from "../util";

const NETWORK = "LINKEDIN" as const;
const LABEL = "LinkedIn";
const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const API = "https://api.linkedin.com";
const SCOPES = ["openid", "profile", "email", "w_member_social"];

/** LinkedIn versions are supported ~12 months; override with LINKEDIN_API_VERSION (YYYYMM). */
const apiVersion = () => process.env.LINKEDIN_API_VERSION || "202601";

/** 403 = missing permission/scope (reconnect to re-grant). */
const classify: StatusClassifier = (status) => (status === 401 || status === 403 ? "auth" : undefined);

function restHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "linkedin-version": apiVersion(),
    "x-restli-protocol-version": "2.0.0",
  };
}

const LITTLE_TEXT_RESERVED = /[\\|{}@[\]()<>#*_~]/g;
const escapeLittle = (s: string) => s.replace(LITTLE_TEXT_RESERVED, (c) => `\\${c}`);

/**
 * Posts API `commentary` uses "little text": reserved characters must be backslash-escaped or the post is
 * truncated/rejected. Hashtags become {hashtag|\#|tag} so they stay clickable.
 */
export function toLittleText(text: string): string {
  const re = /(^|[^\p{L}\p{N}_&/])#([\p{L}\p{N}_]*\p{L}[\p{L}\p{N}_]*)/gu;
  let out = "";
  let last = 0;
  for (const m of text.matchAll(re)) {
    const start = (m.index ?? 0) + (m[1]?.length ?? 0);
    out += escapeLittle(text.slice(last, start));
    out += `{hashtag|\\#|${escapeLittle(m[2] ?? "")}}`;
    last = start + 1 + (m[2]?.length ?? 0);
  }
  return out + escapeLittle(text.slice(last));
}

async function uploadImage(token: string, owner: string, url: string, mime: string, index: number): Promise<string> {
  const init = await fetchJson<{ value: { uploadUrl: string; image: string } }>(`${API}/rest/images?action=initializeUpload`, {
    method: "POST",
    headers: restHeaders(token),
    json: { initializeUploadRequest: { owner } },
    label: LABEL,
    classify,
    idempotent: true,
  });
  const dl = await downloadMedia(url, { maxBytes: maxBytesFor(NETWORK, { mime }), mimeHint: mime, index });
  const res = await request(init.value.uploadUrl, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": dl.mime },
    body: new Blob([dl.data], { type: dl.mime }),
    label: `${LABEL} upload`,
    timeoutMs: 120_000,
  });
  if (!res.ok) throw httpError(res, await readBody(res), `${LABEL} upload`, classify);
  return init.value.image;
}

async function publish(post: ComposedPost, credentials: Credentials): Promise<PublishResult> {
  assertValid(NETWORK, post);
  const token = requireCred(credentials, "accessToken", NETWORK);
  const author = requireCred(credentials, "personUrn", NETWORK);

  const images: Array<{ id: string; altText?: string }> = [];
  for (const [i, m] of post.media.entries()) {
    images.push({ id: await uploadImage(token, author, m.url, m.mime, i), ...(m.alt ? { altText: m.alt.slice(0, 4086) } : {}) });
  }
  const visibility = post.options.visibility === "CONNECTIONS" ? "CONNECTIONS" : "PUBLIC";
  const body: Record<string, unknown> = {
    author,
    commentary: toLittleText(post.caption),
    visibility,
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  const [single] = images;
  if (images.length === 1 && single) body.content = { media: single };
  else if (images.length > 1) body.content = { multiImage: { images } };

  const { res } = await fetchWithBody(`${API}/rest/posts`, {
    method: "POST",
    headers: restHeaders(token),
    json: body,
    label: LABEL,
    classify,
  } satisfies HttpOptions);
  const urn = res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id");
  if (!urn) throw new AdapterError("unknown", "LinkedIn accepted the post but returned no id");
  return { externalId: urn, url: `https://www.linkedin.com/feed/update/${urn}/` };
}

export const linkedinAdapter: NetworkAdapter = {
  network: NETWORK,
  limits: NETWORK_LIMITS.LINKEDIN,
  connectKind: "oauth2",

  getAuthorizeUrl({ state, redirectUri }) {
    const q = new URLSearchParams({
      response_type: "code",
      client_id: requireEnv("LINKEDIN_CLIENT_ID"),
      redirect_uri: redirectUri,
      state,
      scope: SCOPES.join(" "),
    });
    return `${AUTHORIZE_URL}?${q.toString()}`;
  },

  async exchangeCode({ code, redirectUri }): Promise<ConnectTarget[]> {
    const t = await tokenRequest(
      TOKEN_URL,
      {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: requireEnv("LINKEDIN_CLIENT_ID"),
        client_secret: requireEnv("LINKEDIN_CLIENT_SECRET"),
      },
      { label: LABEL },
    );
    const me = await fetchJson<{ sub: string; name?: string; email?: string; picture?: string }>(`${API}/v2/userinfo`, {
      headers: { authorization: `Bearer ${t.access_token}` },
      label: LABEL,
      classify,
    });
    const personUrn = `urn:li:person:${me.sub}`;
    return [
      {
        network: NETWORK,
        externalId: me.sub,
        name: me.name ?? me.email ?? "LinkedIn member",
        username: me.email,
        avatarUrl: me.picture,
        credentials: { ...tokenToCredentials(t), personUrn },
        scopes: t.scope ? t.scope.split(/[ ,]+/).filter(Boolean) : SCOPES,
        extras: { personUrn },
      },
    ];
  },

  /** Refresh tokens are only issued to approved LinkedIn partners; otherwise the user must reconnect (~60 days). */
  async refresh(credentials) {
    const refreshToken = credString(credentials, "refreshToken");
    if (!refreshToken) return null;
    const t = await tokenRequest(
      TOKEN_URL,
      {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: requireEnv("LINKEDIN_CLIENT_ID"),
        client_secret: requireEnv("LINKEDIN_CLIENT_SECRET"),
      },
      { label: LABEL },
    );
    return tokenToCredentials(t, credentials);
  },

  validate: (post) => validateForNetwork(NETWORK, post),
  publish,

  async delete(externalId, credentials) {
    const token = requireCred(credentials, "accessToken", NETWORK);
    const res = await request(`${API}/rest/posts/${encodeURIComponent(externalId)}`, {
      method: "DELETE",
      headers: restHeaders(token),
      label: LABEL,
    });
    if (res.ok || res.status === 404 || res.status === 410) return;
    throw httpError(res, await readBody(res), LABEL, classify);
  },
};
