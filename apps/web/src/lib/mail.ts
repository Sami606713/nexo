// OWNED BY: web-platform agent.
import "server-only";
import nodemailer from "nodemailer";

export interface MailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

const from = () => process.env.EMAIL_FROM ?? "Postline <no-reply@localhost>";

/**
 * Send an email. Order: Resend (RESEND_API_KEY) → SMTP (SMTP_URL / EMAIL_SERVER) → dev console log.
 * Returns how it was delivered.
 */
export async function sendMail(input: MailInput): Promise<"resend" | "smtp" | "console"> {
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${resendKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: from(), to: input.to, subject: input.subject, text: input.text, html: input.html }),
    });
    if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
    return "resend";
  }
  const smtp = process.env.SMTP_URL ?? process.env.EMAIL_SERVER;
  if (smtp) {
    await nodemailer.createTransport(smtp).sendMail({ from: from(), ...input });
    return "smtp";
  }
  console.log(
    `\n──────── [mail:dev] ────────\nTo: ${input.to}\nSubject: ${input.subject}\n\n${input.text}\n────────────────────────────\n`,
  );
  return "console";
}

export function appUrl(path = ""): string {
  const base = (process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

export function simpleHtml(title: string, body: string, cta?: { label: string; url: string }): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return `<!doctype html><html><body style="font-family:Inter,system-ui,sans-serif;background:#f6f7fb;padding:32px">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
<h2 style="margin:0 0 16px;color:#1f2937">${esc(title)}</h2>
<p style="color:#4b5563;line-height:1.5">${esc(body)}</p>
${cta ? `<p style="margin:24px 0"><a href="${esc(cta.url)}" style="background:#4c6ef5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${esc(cta.label)}</a></p><p style="color:#9ca3af;font-size:12px;word-break:break-all">${esc(cta.url)}</p>` : ""}
</div></body></html>`;
}
