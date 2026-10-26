import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AdapterError } from "@postline/core";
import { getAdapter } from "@postline/integrations";
import { HttpError } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { saveTargets } from "@/lib/channels";
import { appUrl } from "@/lib/mail";
import { OAUTH_COOKIE, decodeState, oauthRedirectUri, parseNetwork } from "@/lib/channels-oauth";

type Ctx = { params: Promise<{ network: string }> };

/** Not wrapped in route(): always ends in a redirect back to the channels page. */
export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  const { network: seg } = await params;
  const qs = new URL(req.url).searchParams;
  const jar = await cookies();
  const st = decodeState(jar.get(OAUTH_COOKIE)?.value);

  const back = (brandId: string | null, query: Record<string, string>) => {
    const path = brandId ? `/app/${brandId}/channels` : "/app";
    const res = NextResponse.redirect(appUrl(`${path}?${new URLSearchParams(query)}`));
    res.cookies.set(OAUTH_COOKIE, "", { path: "/api/channels/oauth", maxAge: 0 });
    return res;
  };

  const network = parseNetwork(seg);
  if (!st || !network || st.network !== network) return back(st?.brandId ?? null, { error: "Connection expired or invalid. Please try again." });
  if (qs.get("state") !== st.state) return back(st.brandId, { error: "Security check failed (state mismatch). Please try again." });
  const providerError = qs.get("error_description") ?? qs.get("error");
  if (providerError) return back(st.brandId, { error: providerError === "access_denied" ? "Connection was cancelled." : providerError });
  const code = qs.get("code");
  if (!code) return back(st.brandId, { error: "No authorization code returned." });

  try {
    const { user } = await requireBrand(st.brandId, "channels.connect");
    if (user.id !== st.userId) return back(st.brandId, { error: "Signed-in user changed during connection." });
    const adapter = getAdapter(network);
    if (!adapter?.exchangeCode) return back(st.brandId, { error: "This network isn't available." });
    const targets = await adapter.exchangeCode({ code, redirectUri: oauthRedirectUri(network), codeVerifier: st.codeVerifier });
    if (!targets.length) return back(st.brandId, { error: "No connectable accounts were found." });
    const r = await saveTargets(st.brandId, targets);
    const q: Record<string, string> = { connected: String(r.connected) };
    if (r.skipped) q.skipped = String(r.skipped);
    return back(st.brandId, q);
  } catch (e) {
    const msg = e instanceof AdapterError || e instanceof HttpError ? e.message : "Something went wrong while connecting.";
    if (!(e instanceof AdapterError || e instanceof HttpError)) console.error("[oauth callback]", e);
    return back(st.brandId, { error: msg });
  }
}
