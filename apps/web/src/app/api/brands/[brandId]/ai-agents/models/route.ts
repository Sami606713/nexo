import { hasApiKey, textModel } from "@postline/ai";
import { route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { CLAUDE_AGENT_MODELS } from "@/lib/workflows/server";

type Ctx = { params: Promise<{ brandId: string }> };

/** Model choices for the agent editor. "default" = the server's configured text model. */
export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId);
  const compat = Boolean(process.env.LLM_API_KEY);
  const options = [{ value: "default", label: `Default model (${textModel()})` }];
  if (!compat) options.push(...CLAUDE_AGENT_MODELS);
  return { defaultModel: textModel(), configured: hasApiKey(), options };
});
