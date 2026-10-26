// Minimal Composio REST (v3/v3.1) client over fetch — no SDK. Server-only.
// Docs: https://docs.composio.dev/reference/api-reference
import { AdapterError } from "@postline/core";

const baseUrl = () => (process.env.COMPOSIO_BASE_URL || "https://backend.composio.dev").replace(/\/+$/, "");

export const composioConfigured = (): boolean => !!process.env.COMPOSIO_API_KEY;

export class ComposioError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ComposioError";
  }
}

function messageOf(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const b = body as { error?: unknown; message?: unknown };
    if (typeof b.error === "string") return b.error;
    if (b.error && typeof b.error === "object" && typeof (b.error as { message?: unknown }).message === "string")
      return (b.error as { message: string }).message;
    if (typeof b.message === "string") return b.message;
  }
  return fallback;
}

async function call<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown, timeoutMs = 60_000): Promise<T> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) throw new ComposioError("Composio isn't configured: set COMPOSIO_API_KEY");
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: { "x-api-key": apiKey, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new ComposioError(`Couldn't reach Composio: ${err instanceof Error ? err.message : String(err)}`);
  }
  const text = await res.text();
  let json: unknown = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  if (!res.ok) throw new ComposioError(messageOf(json, `Composio request failed (${res.status})`), res.status, json);
  return json as T;
}

/* ───────────── auth configs ───────────── */

interface AuthConfigItem {
  id: string;
  status?: string;
  is_composio_managed?: boolean;
  toolkit?: { slug?: string };
}

const authConfigCache = new Map<string, string>();

/**
 * Auth config to use for a toolkit: COMPOSIO_AUTH_CONFIG_<TOOLKIT> env override, else an existing ENABLED
 * config (Composio-managed preferred), else — for toolkits with Composio-managed OAuth — a newly created one.
 */
export async function resolveAuthConfig(toolkit: string, managedAvailable: boolean): Promise<string> {
  const override = process.env[`COMPOSIO_AUTH_CONFIG_${toolkit.toUpperCase()}`];
  if (override) return override;
  const cached = authConfigCache.get(toolkit);
  if (cached) return cached;

  const list = await call<{ items?: AuthConfigItem[] }>("GET", `/api/v3/auth_configs?toolkit_slug=${encodeURIComponent(toolkit)}&limit=50`);
  const enabled = (list.items ?? []).filter((c) => c.toolkit?.slug === toolkit && (c.status ?? "ENABLED") === "ENABLED");
  let id = (enabled.find((c) => c.is_composio_managed) ?? (managedAvailable ? undefined : enabled[0]))?.id;

  if (!id) {
    if (!managedAvailable)
      throw new ComposioError(
        `${toolkit} needs your own developer app: create an auth config for it in the Composio dashboard, then set COMPOSIO_AUTH_CONFIG_${toolkit.toUpperCase()}`,
      );
    const created = await call<{ auth_config?: { id?: string } }>("POST", "/api/v3.1/auth_configs", {
      toolkit: { slug: toolkit },
      auth_config: { type: "use_composio_managed_auth" },
    });
    id = created.auth_config?.id;
    if (!id) throw new ComposioError(`Composio didn't return an auth config id for ${toolkit}`);
  }
  authConfigCache.set(toolkit, id);
  return id;
}

/* ───────────── connected accounts ───────────── */

export interface ConnectLink {
  redirectUrl: string;
  connectedAccountId: string;
  expiresAt?: string;
}

export async function createConnectLink(params: { authConfigId: string; userId: string; callbackUrl: string }): Promise<ConnectLink> {
  const res = await call<{ redirect_url?: string; connected_account_id?: string; expires_at?: string }>(
    "POST",
    "/api/v3.1/connected_accounts/link",
    { auth_config_id: params.authConfigId, user_id: params.userId, callback_url: params.callbackUrl },
  );
  if (!res.redirect_url || !res.connected_account_id) throw new ComposioError("Composio didn't return a connect link");
  return { redirectUrl: res.redirect_url, connectedAccountId: res.connected_account_id, expiresAt: res.expires_at };
}

export interface ConnectedAccount {
  id: string;
  status: string;
  userId?: string;
  toolkit?: string;
}

export async function getConnectedAccount(id: string): Promise<ConnectedAccount> {
  const r = await call<{ id: string; status?: string; user_id?: string; toolkit?: { slug?: string } }>(
    "GET",
    `/api/v3/connected_accounts/${encodeURIComponent(id)}`,
  );
  return { id: r.id, status: r.status ?? "UNKNOWN", userId: r.user_id, toolkit: r.toolkit?.slug };
}

/** Poll until the account leaves INITIATED/INITIALIZING (OAuth just completed) or the timeout passes. */
export async function waitForActive(id: string, timeoutMs = 15_000): Promise<ConnectedAccount> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const acc = await getConnectedAccount(id);
    if (acc.status === "ACTIVE" || !["INITIATED", "INITIALIZING"].includes(acc.status) || Date.now() > deadline) return acc;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export async function deleteConnectedAccount(id: string): Promise<void> {
  await call("DELETE", `/api/v3/connected_accounts/${encodeURIComponent(id)}`);
}

/* ───────────── tool execution ───────────── */

/** Execute a Composio tool for a connected account and return its `data`; failures throw ComposioError. */
export async function executeTool<T = Record<string, unknown>>(
  slug: string,
  params: { connectedAccountId: string; userId?: string; arguments: Record<string, unknown> },
  timeoutMs = 120_000,
): Promise<T> {
  const res = await call<{ data?: unknown; error?: string | null; successful?: boolean }>(
    "POST",
    `/api/v3.1/tools/execute/${encodeURIComponent(slug)}`,
    { connected_account_id: params.connectedAccountId, user_id: params.userId, arguments: params.arguments },
    timeoutMs,
  );
  if (res.successful === false) throw new ComposioError(res.error || `${slug} failed`, undefined, res.data);
  return (res.data ?? {}) as T;
}

/* ───────────── proxy (raw provider API calls with the connected account's auth) ───────────── */

export interface ProxyResponse {
  status: number;
  data: unknown;
  headers: Record<string, string>;
}

/**
 * Call the provider's own API through Composio, which injects the connected account's credentials.
 * Used where Composio has no tool (e.g. LinkedIn image uploads). Non-2xx provider responses throw.
 */
export async function proxyRequest(params: {
  connectedAccountId: string;
  userId?: string;
  endpoint: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  binary?: { base64: string; contentType: string };
  headers?: Record<string, string>;
  query?: Record<string, string>;
}): Promise<ProxyResponse> {
  const parameters = [
    ...Object.entries(params.headers ?? {}).map(([name, value]) => ({ name, value, type: "header" })),
    ...Object.entries(params.query ?? {}).map(([name, value]) => ({ name, value, type: "query" })),
  ];
  const res = await call<{ status?: number; data?: unknown; headers?: Record<string, string> }>(
    "POST",
    "/api/v3.1/tools/execute/proxy",
    {
      endpoint: params.endpoint,
      method: params.method,
      connected_account_id: params.connectedAccountId,
      user_id: params.userId,
      ...(params.body !== undefined ? { body: params.body } : {}),
      ...(params.binary ? { binary_body: { base64: params.binary.base64, content_type: params.binary.contentType } } : {}),
      parameters,
    },
    120_000,
  );
  const status = res.status ?? 0;
  const headers = Object.fromEntries(Object.entries(res.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  if (status < 200 || status >= 300) throw new ComposioError(messageOf(res.data, `Provider returned ${status}`), status, res.data);
  return { status, data: res.data ?? null, headers };
}

/** Map a Composio failure to the adapter error taxonomy the publish worker understands. */
export function toAdapterError(err: unknown, action: string): AdapterError {
  if (err instanceof AdapterError) return err;
  if (!(err instanceof ComposioError)) return new AdapterError("transient", `${action}: ${err instanceof Error ? err.message : String(err)}`);
  const msg = `${action}: ${err.message}`;
  const lower = err.message.toLowerCase();
  if (err.status === 429 || lower.includes("rate limit")) return new AdapterError("rate_limit", msg, { status: err.status });
  if (
    err.status === 401 ||
    /expired|revoked|not active|inactive|reauth|re-auth|invalid token|access token|unauthori[sz]ed/.test(lower)
  )
    return new AdapterError("auth", msg, { status: err.status });
  if (err.status === undefined && lower.startsWith("couldn't reach composio")) return new AdapterError("transient", msg);
  if (err.status !== undefined && err.status >= 500) return new AdapterError("transient", msg, { status: err.status });
  return new AdapterError("rejected", msg, { status: err.status, body: err.body });
}
