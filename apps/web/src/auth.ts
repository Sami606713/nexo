// OWNED BY: web-platform agent.
import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Nodemailer from "next-auth/providers/nodemailer";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@postline/db";
import { authConfig } from "./auth.config";
import { sendMail, simpleHtml } from "./lib/mail";
import { ensureSubscription } from "./lib/billing";
import { clientIp, rateLimit } from "./lib/rate-limit";

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

const providers: Provider[] = [
  Credentials({
    credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
    async authorize(raw, request) {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;
      // Slow down password guessing: counts every attempt per IP + email.
      const attempt = await rateLimit("login", `${clientIp(request.headers)}:${parsed.data.email.toLowerCase()}`);
      if (!attempt.ok) return null;
      const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
      if (!user?.passwordHash) return null;
      const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
      if (!ok) return null;
      return { id: user.id, email: user.email, name: user.name, image: user.image };
    },
  }),
  Nodemailer({
    // Required by the provider; unused because sendVerificationRequest is overridden (see lib/mail.ts).
    server: process.env.SMTP_URL ?? process.env.EMAIL_SERVER ?? "smtp://localhost:25",
    from: process.env.EMAIL_FROM ?? "Postline <no-reply@localhost>",
    async sendVerificationRequest({ identifier, url }) {
      const how = await sendMail({
        to: identifier,
        subject: `Sign in to ${process.env.APP_NAME ?? "Nexo"}`,
        text: `Sign in to ${process.env.APP_NAME ?? "Nexo"}:\n\n${url}\n\nIf you did not request this, ignore this email.`,
        html: simpleHtml("Sign in", "Click the button below to sign in. The link expires in 24 hours.", { label: "Sign in", url }),
      });
      if (how === "console") console.log(`[auth] Magic link for ${identifier}: ${url}`);
    },
  }),
];

if (process.env.AUTH_GOOGLE_ID) {
  providers.push(Google({ allowDangerousEmailAccountLinking: true }));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers,
  events: {
    // Users created by the adapter (magic link / Google) get a trial subscription too.
    async createUser({ user }) {
      if (user.id) await ensureSubscription(user.id);
    },
  },
});

export const googleEnabled = () => !!process.env.AUTH_GOOGLE_ID;
