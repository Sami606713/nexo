import {
  AdapterError,
  NETWORK_LIMITS,
  type ComposedPost,
  type ConnectTarget,
  type Credentials,
  type NetworkAdapter,
  type PublishResult,
} from "@postline/core";
import { DEFAULT_TIMEOUT_MS, httpError, readBody, request, type StatusClassifier } from "../http";
import { validateForNetwork } from "../rules";
import { assertPublicUrl, privateTargetsAllowed, type LookupFn } from "../ssrf";
import { assertValid, credString, optionalField, requireCred, requireField, shortHash } from "../util";

const NETWORK = "CUSTOM_WEBHOOK" as const;
const LABEL = "Webhook";
const MAX_REDIRECTS = 3;
const USER_AGENT = "Postline-Webhook/1.0";
const HEADER_NAME_RE = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
const FORBIDDEN_HEADERS = new Set(["host", "content-length", "content-type", "transfer-encoding", "connection", "idempotency-key"]);

const classify: StatusClassifier = (status) => (status === 401 || status === 403 ? "auth" : undefined);

export interface WebhookDeps {
  lookupFn?: LookupFn;
  timeoutMs?: number;
}

/**
 * POST JSON to a user-supplied URL with the SSRF guard applied to the initial URL and every redirect hop.
 * Redirects are followed manually (≤3) and always re-POST the same body.
 */
export async function postWebhook(
  url: string,
  payload: unknown,
  headers: Record<string, string>,
  deps: WebhookDeps = {},
): Promise<Response> {
  const body = JSON.stringify(payload);
  let current = url;
  for (let hop = 0; ; hop++) {
    await assertPublicUrl(current, { lookupFn: deps.lookupFn, requireHttps: !privateTargetsAllowed() });
    const res = await request(current, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": USER_AGENT, ...headers },
      body,
      redirect: "manual",
      timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      label: LABEL,
      idempotent: false,
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      if (hop >= MAX_REDIRECTS) {
        throw new AdapterError("rejected", `${LABEL}: too many redirects (>${MAX_REDIRECTS})`, { status: res.status });
      }
      await res.body?.cancel().catch(() => undefined);
      current = new URL(location, current).toString();
      continue;
    }
    return res;
  }
}

function authHeaders(c: Credentials): Record<string, string> {
  const name = credString(c, "headerName");
  const value = credString(c, "headerValue");
  return name && value ? { [name]: value } : {};
}

export interface WebhookPostPayload {
  event: "post.published";
  post: { id: string; caption: string; media: ComposedPost["media"]; options: Record<string, unknown> };
}

export function buildPublishPayload(post: ComposedPost): WebhookPostPayload {
  return {
    event: "post.published",
    post: {
      id: post.postId,
      caption: post.caption,
      media: post.media.map((m) => ({ ...m })),
      options: post.options,
    },
  };
}

export function createCustomWebhookAdapter(deps: WebhookDeps = {}): NetworkAdapter {
  return {
    network: NETWORK,
    limits: NETWORK_LIMITS.CUSTOM_WEBHOOK,
    connectKind: "webhook",
    credentialFields: [
      {
        name: "endpointUrl",
        label: "Endpoint URL",
        type: "url",
        placeholder: "https://example.com/hooks/postline",
        help: 'Receives POST {"event":"post.published","post":{…}} and must reply 2xx with JSON {"id","url"}.',
        required: true,
      },
      {
        name: "deleteUrl",
        label: "Delete URL (optional)",
        type: "url",
        help: 'Receives POST {"event":"post.deleted","id":…}. Defaults to the endpoint URL.',
        required: false,
      },
      { name: "headerName", label: "Secret header name (optional)", type: "text", placeholder: "X-Postline-Secret", required: false },
      { name: "headerValue", label: "Secret header value (optional)", type: "password", required: false },
    ],

    async connectWithCredentials(fields): Promise<ConnectTarget[]> {
      const endpointUrl = requireField(fields, "endpointUrl", "Endpoint URL");
      const deleteUrl = optionalField(fields, "deleteUrl");
      const headerName = optionalField(fields, "headerName");
      const headerValue = optionalField(fields, "headerValue");
      const requireHttps = !privateTargetsAllowed();
      const url = await assertPublicUrl(endpointUrl, { lookupFn: deps.lookupFn, requireHttps });
      if (deleteUrl) await assertPublicUrl(deleteUrl, { lookupFn: deps.lookupFn, requireHttps });
      if (headerName && (!HEADER_NAME_RE.test(headerName) || FORBIDDEN_HEADERS.has(headerName.toLowerCase()))) {
        throw new AdapterError("rejected", `Invalid header name: ${headerName}`);
      }
      if (!!headerName !== !!headerValue) throw new AdapterError("rejected", "Provide both the header name and value, or neither");
      return [
        {
          network: NETWORK,
          externalId: shortHash(`${endpointUrl}|${headerName ?? ""}`),
          name: url.host,
          credentials: {
            endpointUrl,
            ...(deleteUrl ? { deleteUrl } : {}),
            ...(headerName && headerValue ? { headerName, headerValue } : {}),
          },
          extras: { endpointHost: url.host },
        },
      ];
    },

    async refresh() {
      return null;
    },

    validate: (post) => validateForNetwork(NETWORK, post),

    async publish(post, credentials): Promise<PublishResult> {
      assertValid(NETWORK, post);
      const endpointUrl = requireCred(credentials, "endpointUrl", NETWORK);
      const res = await postWebhook(
        endpointUrl,
        buildPublishPayload(post),
        { ...authHeaders(credentials), "idempotency-key": post.postId },
        deps,
      );
      const body = await readBody(res);
      if (!res.ok) throw httpError(res, body, LABEL, classify);
      const obj = body && typeof body === "object" ? (body as { id?: unknown; url?: unknown }) : undefined;
      const id = typeof obj?.id === "number" ? String(obj.id) : obj?.id;
      if (typeof id !== "string" || !id || typeof obj?.url !== "string") {
        throw new AdapterError("rejected", `${LABEL} ${res.status}: response must be JSON {"id": string, "url": string}`, {
          status: res.status,
          body,
        });
      }
      return { externalId: id, url: obj.url };
    },

    async delete(externalId, credentials) {
      const url = credString(credentials, "deleteUrl") ?? requireCred(credentials, "endpointUrl", NETWORK);
      const res = await postWebhook(
        url,
        { event: "post.deleted", id: externalId, post: { id: externalId } },
        { ...authHeaders(credentials), "idempotency-key": `delete:${externalId}` },
        deps,
      );
      const body = await readBody(res);
      if (res.ok || res.status === 404 || res.status === 410) return;
      throw httpError(res, body, LABEL, classify);
    },
  };
}

export const customWebhookAdapter = createCustomWebhookAdapter();
