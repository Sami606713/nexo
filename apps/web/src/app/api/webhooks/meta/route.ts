// OWNED BY: inbox agent. Meta (Facebook Page / Instagram) webhooks → queue an inbox sync for the channel.
// GET: subscription verification (hub.verify_token = META_VERIFY_TOKEN).
// POST: X-Hub-Signature-256 = sha256 HMAC of the raw body with META_APP_SECRET.
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@postline/db";
import { enqueueSync } from "@/lib/queue";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const expected = process.env.META_VERIFY_TOKEN;
  if (expected && sp.get("hub.mode") === "subscribe" && sp.get("hub.verify_token") === expected) {
    return new Response(sp.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

function verifyMetaSignature(raw: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(raw, "utf8").digest("hex"), "utf8");
  const got = Buffer.from(header.slice(7), "utf8");
  return want.length === got.length && timingSafeEqual(want, got);
}

export async function POST(req: Request) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return NextResponse.json({ error: "Meta webhooks are not configured" }, { status: 503 });
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let body: { object?: string; entry?: Array<{ id?: string }> };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const network = body.object === "instagram" ? "INSTAGRAM" : body.object === "page" ? "FACEBOOK" : null;
  const ids = [...new Set((body.entry ?? []).map((e) => e.id).filter((x): x is string => typeof x === "string" && !!x))];
  if (network && ids.length) {
    const channels = await prisma.channel.findMany({
      where: { network, externalId: { in: ids }, inboxEnabled: true },
      select: { id: true },
    });
    for (const c of channels) await enqueueSync({ kind: "inbox", channelId: c.id });
  }
  // Always 200 for valid deliveries, or Meta retries and eventually disables the subscription.
  return new Response("EVENT_RECEIVED", { status: 200 });
}
