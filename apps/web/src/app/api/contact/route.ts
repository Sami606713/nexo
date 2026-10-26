import { z } from "zod";
import { HttpError, parseBody, route } from "@/lib/http";
import { sendMail } from "@/lib/mail";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  topic: z.string().trim().max(60).default("General question"),
  message: z.string().trim().min(10).max(5000),
});

// Naive per-process limit: 5 messages per IP per 10 minutes.
const hits = new Map<string, number[]>();
const WINDOW_MS = 10 * 60_000;

/** Public contact form → email to SUPPORT_EMAIL (logged to the console in dev when no mailer is configured). */
export const POST = route(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= 5) throw new HttpError(429, "Too many messages — please try again in a few minutes.");
  hits.set(ip, [...recent, now]);

  const m = await parseBody(req, schema);
  await sendMail({
    to: process.env.SUPPORT_EMAIL || process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@example.com",
    subject: `[Contact] ${m.topic} — ${m.name}`,
    text: `From: ${m.name} <${m.email}>\nTopic: ${m.topic}\n\n${m.message}`,
  });
  return { ok: true };
});
