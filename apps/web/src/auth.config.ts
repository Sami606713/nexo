// OWNED BY: web-platform agent. Edge-safe Auth.js config (no Prisma / bcrypt) shared by middleware and auth.ts.
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    verifyRequest: "/login?check=1",
    error: "/login",
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub && session.user) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
