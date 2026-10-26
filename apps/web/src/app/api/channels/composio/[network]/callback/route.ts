import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AdapterError } from "@postline/core";
import { ComposioError, discoverTargets } from "@postline/integrations";
import { HttpError } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { saveTargets } from "@/lib/channels";
import { appUrl } from "@/lib/mail";
import { decodeState, parseNetwork } from "@/lib/channels-oauth";
import { COMPOSIO_COOKIE, COMPOSIO_COOKIE_PATH, composioUserId } from "@/lib/channels-composio";

type Ctx = { params: Promise<{ network: string }> };

/** Composio sends the user back here after OAuth. Always ends in a redirect to the channels page. */
export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  const { network: seg } = await params;
  const qs = new URL(req.url).searchParams;
  const jar = await cookies();
  const st = decodeState(jar.get(COMPOSIO_COOKIE)?.value);

  const back = (brandId: string | null, query: Record<string, string>) => {
    const path = brandId ? `/app/${brandId}/channels` : "/app";
    const res = NextResponse.redirect(appUrl(`${path}?${new URLSearchParams(query)}`));
    res.cookies.set(COMPOSIO_COOKIE, "", { path: COMPOSIO_COOKIE_PATH, maxAge: 0 });
    return res;
  };

  const network = parseNetwork(seg);
  if (!st?.composioAccountId || !network || st.network !== network)
    return back(st?.brandId ?? null, { error: "Connection expired or invalid. Please try again." });
  if (qs.get("state") !== st.state) return back(st.brandId, { error: "Security check failed (state mismatch). Please try again." });
  const providerError = qs.get("error_description") ?? qs.get("error");
  if (providerError || qs.get("status") === "failed")
    return back(st.brandId, { error: providerError === "access_denied" ? "Connection was cancelled." : providerError || "The connection failed." });

  try {
    const { user } = await requireBrand(st.brandId, "channels.connect");
    if (user.id !== st.userId) return back(st.brandId, { error: "Signed-in user changed during connection." });
    const targets = await discoverTargets(network, st.composioAccountId, composioUserId(st.brandId));
    if (!targets.length) return back(st.brandId, { error: "No connectable accounts were found." });
    const r = await saveTargets(st.brandId, targets);
    const q: Record<string, string> = { connected: String(r.connected) };
    if (r.skipped) q.skipped = String(r.skipped);
    return back(st.brandId, q);
  } catch (e) {
    const known = e instanceof AdapterError || e instanceof HttpError || e instanceof ComposioError;
    if (!known) console.error("[composio callback]", e);
    return back(st.brandId, { error: known ? e.message : "Something went wrong while connecting." });
  }
}
