// OWNED BY: web-platform agent.
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

const PROTECTED = [/^\/app(\/|$)/, /^\/onboarding(\/|$)/];
const AUTH_PAGES = ["/login", "/signup"];

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const signedIn = !!req.auth?.user;

  if (!signedIn && PROTECTED.some((re) => re.test(pathname))) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(url);
  }
  if (signedIn && AUTH_PAGES.includes(pathname) && !req.nextUrl.searchParams.has("check")) {
    const cb = req.nextUrl.searchParams.get("callbackUrl");
    return NextResponse.redirect(new URL(cb && cb.startsWith("/") ? cb : "/app", req.nextUrl.origin));
  }

  // Expose the pathname to server code (session.ts uses it to choose 401 vs redirect).
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|mp4)$).*)"],
};
