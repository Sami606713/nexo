import { NextResponse } from "next/server";
import { getAdapter } from "@postline/integrations";
import { badRequest, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { OAUTH_COOKIE, OAUTH_TTL_SEC, encodeState, oauthRedirectUri, parseNetwork, randomToken } from "@/lib/channels-oauth";

type Ctx = { params: Promise<{ network: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const { network: seg } = await params;
  const brandId = new URL(req.url).searchParams.get("brandId");
  if (!brandId) throw badRequest("brandId is required");
  const { user } = await requireBrand(brandId, "channels.connect");
  const network = parseNetwork(seg);
  const adapter = network ? getAdapter(network) : undefined;
  if (!network || !adapter?.getAuthorizeUrl || adapter.connectKind !== "oauth2") throw badRequest("This network doesn't support OAuth connect");

  const state = randomToken(24);
  const codeVerifier = randomToken(48);
  const url = adapter.getAuthorizeUrl({ state, redirectUri: oauthRedirectUri(network), codeVerifier });

  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, encodeState({ state, codeVerifier, brandId, network, userId: user.id, exp: Date.now() + OAUTH_TTL_SEC * 1000 }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/channels/oauth",
    maxAge: OAUTH_TTL_SEC,
  });
  return res;
});
