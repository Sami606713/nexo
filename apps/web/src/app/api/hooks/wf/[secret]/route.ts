import { NextResponse } from "next/server";
import { prisma } from "@postline/db";
import { enqueueWorkflowRun } from "@/lib/queue";

type Ctx = { params: Promise<{ secret: string }> };

const WINDOW_MS = 60_000;
const LIMIT = 60;
const g = globalThis as unknown as { __wfHookHits?: Map<string, number[]> };

/** Naive in-memory sliding window: 60 requests / minute / secret (per server process). */
function rateLimited(secret: string): boolean {
  g.__wfHookHits ??= new Map();
  const now = Date.now();
  const hits = (g.__wfHookHits.get(secret) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  g.__wfHookHits.set(secret, hits);
  if (g.__wfHookHits.size > 5000) {
    for (const [k, v] of g.__wfHookHits) if (!v.some((t) => now - t < WINDOW_MS)) g.__wfHookHits.delete(k);
  }
  return hits.length > LIMIT;
}

const MAX_BODY = 256 * 1024;

async function handle(req: Request, { params }: Ctx) {
  const { secret } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(secret)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (rateLimited(secret)) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "retry-after": "60" } });

  const wf = await prisma.workflow.findUnique({ where: { webhookSecret: secret }, select: { id: true, active: true, trigger: true } });
  if (!wf || (wf.trigger as { type?: string } | null)?.type !== "webhook") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!wf.active) return NextResponse.json({ error: "This workflow is turned off" }, { status: 409 });

  const url = new URL(req.url);
  const input: Record<string, unknown> = Object.fromEntries(url.searchParams.entries());
  if (req.method === "POST") {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    if (raw.trim()) {
      const type = req.headers.get("content-type") ?? "";
      if (type.includes("application/x-www-form-urlencoded")) Object.assign(input, Object.fromEntries(new URLSearchParams(raw)));
      else {
        try {
          const body = JSON.parse(raw);
          if (body && typeof body === "object" && !Array.isArray(body)) Object.assign(input, body);
          else input.body = body;
        } catch {
          input.body = raw;
        }
      }
    }
  }
  try {
    await enqueueWorkflowRun({ workflowId: wf.id, input });
  } catch (err) {
    console.error("[hooks] enqueue failed", err);
    return NextResponse.json({ error: "Temporarily unavailable" }, { status: 503 });
  }
  return NextResponse.json({ queued: true });
}

export const GET = handle;
export const POST = handle;
