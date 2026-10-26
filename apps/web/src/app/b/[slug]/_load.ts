import "server-only";
import { cache } from "react";
import { prisma } from "@postline/db";

export const loadPublicPage = cache((slug: string) =>
  prisma.bioPage.findFirst({
    where: { slug: slug.toLowerCase(), published: true },
    select: { id: true, slug: true, title: true, bio: true, avatarUrl: true, theme: true, blocks: true },
  }),
);

const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|curl|wget|python-requests|headless/i;
export const isBot = (ua: string | null) => !ua || BOT_RE.test(ua);

/** Referrer host only (no paths/query → no PII). */
export function refHost(ref: string | null, selfHost: string | null): string | null {
  if (!ref) return null;
  try {
    const h = new URL(ref).hostname.replace(/^www\./, "");
    return h && h !== selfHost?.split(":")[0] ? h.slice(0, 120) : null;
  } catch {
    return null;
  }
}
