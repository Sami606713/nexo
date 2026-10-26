import { NextResponse } from "next/server";
import { COMPOSIO_NETWORKS, ComposioError, connectVia, createConnectLink, resolveAuthConfig } from "@postline/integrations";
import { HttpError } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { appUrl } from "@/lib/mail";
import { OAUTH_TTL_SEC, encodeState, parseNetwork, randomToken } from "@/lib/channels-oauth";
import { COMPOSIO_COOKIE, COMPOSIO_COOKIE_PATH, composioUserId } from "@/lib/channels-composio";

type Ctx = { params: Promise<{ network: string }> };

/**
 * Start a Composio-managed OAuth connection: create a connect link and send the user to it.
 * Not wrapped in route(): this is a browser navigation, so failures redirect back with an error.
 */
export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  const { network: seg } = await params;
  const brandId = new URL(req.url).searchParams.get("brandId");
  const back = (error: string) =>
    NextResponse.redirect(appUrl(`${brandId ? `/app/${brandId}/channels` : "/app"}?${new URLSearchParams({ error })}`));
  if (!brandId) return back("brandId is required");

  try {
    const { user } = await requireBrand(brandId, "channels.connect");
    const network = parseNetwork(seg);
    const cfg = network ? COMPOSIO_NETWORKS[network] : undefined;
    if (!network || !cfg || connectVia(network) !== "composio") return back("This network can't be connected through Composio.");

    const state = randomToken(24);
    const authConfigId = await resolveAuthConfig(cfg.toolkit, cfg.managed);
    const link = await createConnectLink({
      authConfigId,
      userId: composioUserId(brandId),
      callbackUrl: appUrl(`/api/channels/composio/${network.toLowerCase()}/callback?state=${state}`),
    });

    const res = NextResponse.redirect(link.redirectUrl);
    res.cookies.set(
      COMPOSIO_COOKIE,
      encodeState({
        state,
        codeVerifier: "",
        brandId,
        network,
        userId: user.id,
        composioAccountId: link.connectedAccountId,
        exp: Date.now() + OAUTH_TTL_SEC * 1000,
      }),
      { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: COMPOSIO_COOKIE_PATH, maxAge: OAUTH_TTL_SEC },
    );
    return res;
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) return NextResponse.redirect(appUrl("/login"));
    const known = e instanceof ComposioError || e instanceof HttpError;
    if (!known) console.error("[composio start]", e);
    return back(known ? `Couldn't start the connection: ${e.message}` : "Couldn't start the connection. Please try again.");
  }
}
