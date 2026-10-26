import { z } from "zod";
import { HttpError, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { enqueueWorkflowRun } from "@/lib/queue";
import { loadWorkflow } from "@/lib/workflows/server";

type Ctx = { params: Promise<{ brandId: string; id: string }> };

const schema = z.object({ input: z.record(z.unknown()).optional() });

/** Manual "Run now" (works while inactive). No input → the worker uses the latest feed item / product or a sample. */
export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId, id } = await params;
  await requireBrand(brandId, "posts.write");
  await loadWorkflow(brandId, id);
  let body: z.infer<typeof schema> = {};
  try {
    body = schema.parse(await req.json());
  } catch {
    body = {};
  }
  const input = body.input && Object.keys(body.input).length ? body.input : { __sample: true };
  try {
    await enqueueWorkflowRun({ workflowId: id, input, manual: true });
  } catch (err) {
    console.error("[workflows] enqueue failed", err);
    throw new HttpError(503, "Workflows are temporarily unavailable. Please try again.");
  }
  return { queued: true };
});
