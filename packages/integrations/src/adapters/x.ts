import {
  AdapterError,
  NETWORK_LIMITS,
  mediaKind,
  type ComposedPost,
  type ConnectTarget,
  type Credentials,
  type MediaItem,
  type NetworkAdapter,
  type PublishResult,
} from "@postline/core";
import { MB, downloadMedia, fetchJson, readBody, request, httpError, sleep, toBlob, type HttpOptions, type StatusClassifier } from "../http";
import { tokenRequest, tokenToCredentials } from "../oauth";
import { validateForNetwork } from "../rules";
import { assertValid, credString, deletionOrder, maxBytesFor, pkceChallenge, requireCred, requireEnv, threadParts } from "../util";

const NETWORK = "X" as const;
const LABEL = "X";
const AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const API = "https://api.x.com/2";
const SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access", "media.write"];
const CHUNK_BYTES = 4 * MB;

const classify: StatusClassifier = (status) => (status === 401 ? "auth" : undefined);

function clientAuth(): { id: string; secret: string } | undefined {
  const secret = process.env.X_CLIENT_SECRET;
  return secret ? { id: requireEnv("X_CLIENT_ID"), secret } : undefined;
}

function xApi(token: string) {
  return <T>(path: string, opts: HttpOptions = {}) =>
    fetchJson<T>(`${API}${path}`, {
      label: LABEL,
      classify,
      ...opts,
      headers: { authorization: `Bearer ${token}`, ...(opts.headers as Record<string, string> | undefined) },
    });
}
type XCall = ReturnType<typeof xApi>;

interface MediaUploadResponse {
  data: {
    id: string;
    media_key?: string;
    processing_info?: { state: "pending" | "in_progress" | "succeeded" | "failed"; check_after_secs?: number; error?: { message?: string } };
  };
}

async function waitForProcessing(call: XCall, first: MediaUploadResponse): Promise<void> {
  let info = first.data.processing_info;
  const deadline = Date.now() + 10 * 60_000;
  while (info && info.state !== "succeeded") {
    if (info.state === "failed") throw new AdapterError("rejected", `X media processing failed: ${info.error?.message ?? "unknown error"}`);
    if (Date.now() > deadline) throw new AdapterError("transient", "X media processing timed out");
    await sleep(Math.max(1, info.check_after_secs ?? 2) * 1000);
    const r = await call<MediaUploadResponse>(`/media/upload?command=STATUS&media_id=${encodeURIComponent(first.data.id)}`);
    info = r.data.processing_info;
  }
}

/** Uploads via the v2 media endpoints (simple upload for images, initialize/append/finalize for video & GIF). */
async function uploadMedia(call: XCall, m: MediaItem, index: number): Promise<string> {
  const dl = await downloadMedia(m.url, { maxBytes: maxBytesFor(NETWORK, m), mimeHint: m.mime, index });
  const isVideo = mediaKind(m) === "video";
  const isGif = dl.mime === "image/gif";
  let id: string;
  if (!isVideo && !isGif) {
    const form = new FormData();
    form.append("media", toBlob(dl), dl.filename);
    form.append("media_category", "tweet_image");
    form.append("media_type", dl.mime);
    const r = await call<MediaUploadResponse>("/media/upload", { method: "POST", body: form, idempotent: true, timeoutMs: 120_000 });
    id = r.data.id;
  } else {
    const init = await call<MediaUploadResponse>("/media/upload/initialize", {
      method: "POST",
      json: { media_type: dl.mime, total_bytes: dl.size, media_category: isGif ? "tweet_gif" : "tweet_video" },
      idempotent: true,
    });
    id = init.data.id;
    for (let seg = 0, off = 0; off < dl.size; seg++, off += CHUNK_BYTES) {
      const form = new FormData();
      form.append("segment_index", String(seg));
      form.append("media", new Blob([dl.data.subarray(off, off + CHUNK_BYTES)], { type: dl.mime }), dl.filename);
      await call(`/media/upload/${encodeURIComponent(id)}/append`, { method: "POST", body: form, idempotent: true, timeoutMs: 120_000 });
    }
    const fin = await call<MediaUploadResponse>(`/media/upload/${encodeURIComponent(id)}/finalize`, { method: "POST", idempotent: true });
    await waitForProcessing(call, fin);
  }
  if (m.alt) {
    // Alt text is best effort: never fail a publish over it.
    await call("/media/metadata", {
      method: "POST",
      json: { id, metadata: { alt_text: { text: m.alt.slice(0, 1000) } } },
      idempotent: true,
    }).catch(() => undefined);
  }
  return id;
}

async function publish(post: ComposedPost, credentials: Credentials): Promise<PublishResult> {
  assertValid(NETWORK, post);
  const call = xApi(requireCred(credentials, "accessToken", NETWORK));
  const mediaIds: string[] = [];
  for (const [i, m] of post.media.entries()) mediaIds.push(await uploadMedia(call, m, i));

  const ids: string[] = [];
  for (const [i, text] of threadParts(NETWORK, post).entries()) {
    const parent = ids[ids.length - 1];
    const r = await call<{ data: { id: string } }>("/tweets", {
      method: "POST",
      json: {
        text,
        ...(i === 0 && mediaIds.length ? { media: { media_ids: mediaIds } } : {}),
        ...(parent ? { reply: { in_reply_to_tweet_id: parent } } : {}),
      },
    });
    ids.push(r.data.id);
  }
  const first = ids[0];
  if (!first) throw new AdapterError("rejected", "Nothing to publish");
  const username = credString(credentials, "username") ?? (typeof post.channelExtras.username === "string" ? post.channelExtras.username : undefined);
  return { externalId: first, url: `https://x.com/${username ?? "i/web"}/status/${first}`, partIds: ids };
}

export const xAdapter: NetworkAdapter = {
  network: NETWORK,
  limits: NETWORK_LIMITS.X,
  connectKind: "oauth2",

  getAuthorizeUrl({ state, redirectUri, codeVerifier }) {
    if (!codeVerifier) throw new AdapterError("rejected", "X OAuth requires a PKCE code verifier");
    const q = new URLSearchParams({
      response_type: "code",
      client_id: requireEnv("X_CLIENT_ID"),
      redirect_uri: redirectUri,
      scope: SCOPES.join(" "),
      state,
      code_challenge: pkceChallenge(codeVerifier),
      code_challenge_method: "S256",
    });
    return `${AUTHORIZE_URL}?${q.toString()}`;
  },

  async exchangeCode({ code, redirectUri, codeVerifier }): Promise<ConnectTarget[]> {
    if (!codeVerifier) throw new AdapterError("rejected", "X OAuth requires a PKCE code verifier");
    const t = await tokenRequest(
      TOKEN_URL,
      {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
        client_id: requireEnv("X_CLIENT_ID"),
      },
      { label: LABEL, basicAuth: clientAuth() },
    );
    const me = await fetchJson<{ data: { id: string; name: string; username: string; profile_image_url?: string } }>(
      `${API}/users/me?user.fields=profile_image_url`,
      { headers: { authorization: `Bearer ${t.access_token}` }, label: LABEL, classify },
    );
    return [
      {
        network: NETWORK,
        externalId: me.data.id,
        name: me.data.name,
        username: me.data.username,
        avatarUrl: me.data.profile_image_url,
        credentials: { ...tokenToCredentials(t), username: me.data.username },
        scopes: t.scope ? t.scope.split(" ") : SCOPES,
        extras: { username: me.data.username },
      },
    ];
  },

  /** X rotates refresh tokens: the caller MUST persist the returned credentials. */
  async refresh(credentials) {
    const refreshToken = credString(credentials, "refreshToken");
    if (!refreshToken) return null;
    const t = await tokenRequest(
      TOKEN_URL,
      { grant_type: "refresh_token", refresh_token: refreshToken, client_id: requireEnv("X_CLIENT_ID") },
      { label: LABEL, basicAuth: clientAuth() },
    );
    return tokenToCredentials(t, credentials);
  },

  validate: (post) => validateForNetwork(NETWORK, post),
  publish,

  async delete(externalId, credentials, _channelExtras, partIds) {
    const token = requireCred(credentials, "accessToken", NETWORK);
    for (const id of deletionOrder(externalId, partIds)) {
      const res = await request(`${API}/tweets/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
        label: LABEL,
      });
      if (res.ok || res.status === 404) continue;
      throw httpError(res, await readBody(res), LABEL, classify);
    }
  },
};
