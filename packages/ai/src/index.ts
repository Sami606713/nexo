// OWNED BY: ai agent. Server entry: AI service, credits, score. Browser code should import "@postline/ai/score".
import type { AiService, BrandContext } from "@postline/core";
import { createAiService } from "./service";

/** Default service. The Anthropic client is created lazily on first AI call, so importing never throws. */
export const ai: AiService = createAiService();

/** Build BrandContext from a Brand row. */
export function brandContext(brand: {
  name: string;
  website?: string | null;
  description?: string | null;
  voice?: string | null;
  audience?: string | null;
  avoid?: string | null;
}): BrandContext {
  return {
    name: brand.name,
    website: brand.website ?? null,
    description: brand.description ?? null,
    voice: brand.voice ?? null,
    audience: brand.audience ?? null,
    avoid: brand.avoid ?? null,
  };
}

export { createAiService, type AiServiceOptions } from "./service";
export { withCredits, remainingCredits, refillCreditsIfDue, chargeCredits, refundCredits, ensureSubscription } from "./credits";
export { scorePostHeuristic } from "./score";
export {
  AiRefusalError,
  AiOutputError,
  NOT_CONFIGURED_MESSAGE,
  hasApiKey,
  createDefaultClient,
  callText,
  callStructured,
  textModel,
  fastModel,
  type LlmClient,
} from "./llm";
export { UnsafeUrlError } from "./fetch-brand";
export { images } from "./images"; export { offlineCampaign, offlinePost } from "./offline";
