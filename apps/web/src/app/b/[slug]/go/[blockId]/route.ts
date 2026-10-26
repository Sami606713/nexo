import { NextResponse } from "next/server";
import { after } from "next/server";
import { prisma } from "@postline/db";
import { normalizeBlocks } from "@/components/bio/types";
import { isBot, loadPublicPage, refHost } from "../../_load";

type Ctx = { params: Promise<{ slug: string; blockId: string }> };

const SAFE = /^(https?:|mailto:|tel:)/i;

/** Click tracker: record a click for the block, then 302 to its target. */
export async function GET(req: Request, { params }: Ctx) {
  const { slug, blockId } = await params;
  const page = await loadPublicPage(slug);
  const origin = new URL(req.url).origin;
  if (!page) return NextResponse.redirect(new URL("/", origin));
  const block = normalizeBlocks(page.blocks).find((b) => b.id === decodeURIComponent(blockId) && !b.hidden);
  const i = new URL(req.url).searchParams.get("i");
  const target = block ? (i !== null ? block.links?.[Number(i)]?.url : block.url) : undefined;
  if (!block || !target || !(SAFE.test(target) || (target.startsWith("/") && !target.startsWith("//")))) {
    return NextResponse.redirect(new URL(`/b/${page.slug}`, origin));
  }
  if (!isBot(req.headers.get("user-agent"))) {
    const referrer = refHost(req.headers.get("referer"), req.headers.get("host"));
    after(() =>
      prisma.bioPageEvent.create({ data: { pageId: page.id, kind: "click", blockId: block.id, referrer } }).catch(() => undefined),
    );
  }
  const res = NextResponse.redirect(target.startsWith("/") ? new URL(target, origin) : target, 302);
  res.headers.set("cache-control", "no-store");
  res.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  return res;
}
