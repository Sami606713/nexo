// Server-only OAuth2 token endpoint helper.
import { AdapterError, type Credentials } from "@postline/core";
import { fetchJson } from "./http";
import { expiresAtFrom } from "./util";

export interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  id_token?: string;
}

/** POST an application/x-www-form-urlencoded token request. invalid_grant & co. → "auth". */
export async function tokenRequest(
  url: string,
  params: Record<string, string>,
  opts: { label: string; basicAuth?: { id: string; secret: string } },
): Promise<TokenResponse> {
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (opts.basicAuth) {
    headers.authorization = `Basic ${Buffer.from(`${opts.basicAuth.id}:${opts.basicAuth.secret}`).toString("base64")}`;
  }
  const r = await fetchJson<TokenResponse>(url, {
    method: "POST",
    headers,
    body: new URLSearchParams(params).toString(),
    label: `${opts.label} OAuth`,
    idempotent: true,
    classify: (status) => (status === 400 || status === 401 || status === 403 ? "auth" : undefined),
  });
  if (!r?.access_token) throw new AdapterError("auth", `${opts.label} OAuth: token response had no access_token`, { body: r });
  return r;
}

export function tokenToCredentials(t: TokenResponse, previous: Credentials = {}): Credentials {
  return {
    ...previous,
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? previous.refreshToken,
    expiresAt: expiresAtFrom(t.expires_in),
    ...(t.refresh_token_expires_in ? { refreshExpiresAt: expiresAtFrom(t.refresh_token_expires_in) } : {}),
  };
}
