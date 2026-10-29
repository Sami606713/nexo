import { z } from "zod";
import { parseBody, route } from "@/lib/http";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { sendMail } from "@/lib/mail";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  topic: z.string().trim().max(60).default("General question"),
  message: z.string().trim().min(10).max(5000),
});

/** Public contact form → email to SUPPORT_EMAIL (logged to the console in dev when no mailer is configured). */
export const POST = route(async (req) => {
  await enforceRateLimit("contact", clientIp(req.headers));

  const m = await parseBody(req, schema);
  await sendMail({
    to: process.env.SUPPORT_EMAIL || process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@example.com",
    subject: `[Contact] ${m.topic} — ${m.name}`,
    text: `From: ${m.name} <${m.email}>\nTopic: ${m.topic}\n\n${m.message}`,
  });
  return { ok: true };
});
