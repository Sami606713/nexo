// OWNED BY: ai agent. Claude-backed AiService implementation (server-only).
import { NETWORKS, NETWORK_LIMITS } from "@postline/core";
import type {
  AiService,
  BrandContext,
  BrandFetchResult,
  CampaignPlanItem,
  CampaignRequest,
  GeneratedPost,
  GeneratePostRequest,
  Network,
  PostScore,
  PostScoreCheck,
  RewriteRequest,
  ScoreInput,
} from "@postline/core";
import { z } from "zod";
import { extractBrandSignals, fetchPage, type Resolver } from "./fetch-brand";
import {
  AiOutputError,
  callStructured,
  callText,
  createDefaultClient,
  fastModel,
  hasApiKey,
  mapLimit,
  textModel,
  type LlmClient,
} from "./llm";
import {
  BRAND_FETCH_SYSTEM,
  SCORE_REFINE_SYSTEM,
  buildBrandSummaryPrompt,
  buildCampaignCaptionsPrompt,
  buildCampaignOutlinePrompt,
  buildFixPrompt,
  buildGeneratePostPrompt,
  buildHashtagPrompt,
  buildRewritePrompt,
  buildScoreRefinePrompt,
  buildSystemPrompt,
  buildVariantPrompt,
  chunk,
  cleanReplacement,
  dedupeAngles,
  distributeSchedule,
  hashtagTarget,
  mainCaptionBudget,
  networksNeedingVariant,
  normalizeHashtags,
  restrictToLibrary,
  truncateToLimit,
  variantBudget,
  type CaptionBatchItem,
} from "./prompts";
import { charCount, finalizeScore, makeCheck, scorePostHeuristic } from "./score";

// ---------------------------------------------------------------- schemas (JSON schema for the tool + zod to validate)

const strictObject = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const str = { type: "string" };
const strArray = { type: "array", items: { type: "string" } };

const GeneratedPostTool = strictObject({
  caption: str,
  hashtags: strArray,
  perNetwork: {
    type: "array",
    items: strictObject({ network: { type: "string", enum: [...NETWORKS] }, caption: str }),
  },
});
const GeneratedPostZ = z.object({
  caption: z.string().min(1),
  hashtags: z.array(z.string()),
  perNetwork: z.array(z.object({ network: z.enum(NETWORKS), caption: z.string() })),
});

const HashtagsTool = strictObject({ hashtags: strArray });
const HashtagsZ = z.object({ hashtags: z.array(z.string()) });

const OutlineTool = strictObject({ angles: strArray });
const OutlineZ = z.object({ angles: z.array(z.string()) });

const CaptionsTool = strictObject({
  posts: { type: "array", items: strictObject({ index: { type: "integer" }, caption: str, hashtags: strArray }) },
});
const CaptionsZ = z.object({
  posts: z.array(z.object({ index: z.number().int(), caption: z.string().min(1), hashtags: z.array(z.string()) })),
});

const CaptionTool = strictObject({ caption: str });
const CaptionZ = z.object({ caption: z.string().min(1) });

const RatingProps = strictObject({ score: { type: "number" }, suggestion: str });
const ScoreRefineTool = strictObject({ hook: RatingProps, takeaway: RatingProps });
const RatingZ = z.object({ score: z.number().min(0).max(1), suggestion: z.string() });
const ScoreRefineZ = z.object({ hook: RatingZ, takeaway: RatingZ });

const BrandSummaryTool = strictObject({ name: str, description: str, voice: str, audience: str });
const BrandSummaryZ = z.object({ name: z.string(), description: z.string(), voice: z.string(), audience: z.string() });

// ---------------------------------------------------------------- service

export interface AiServiceOptions {
  /** DNS resolver override for fetchBrand (tests). */
  resolve?: Resolver;
  /** fetch override for fetchBrand (tests). */
  fetchImpl?: typeof fetch;
}

/** Max posts per caption batch and the parallelism used when a campaign needs several batches. */
export const CAMPAIGN_BATCH_SIZE = 10;
export const CAMPAIGN_CONCURRENCY = 4;
export const MAX_CAMPAIGN_POSTS = 100;

/**
 * Create the AI service. Pass a client to inject a mock; otherwise the Anthropic client is created
 * lazily on first use (so importing never throws without a key).
 */
export function createAiService(client?: LlmClient, options: AiServiceOptions = {}): AiService {
  let lazy: LlmClient | undefined = client;
  const llm = (): LlmClient => {
    if (!lazy) lazy = createDefaultClient(); // throws "AI is not configured" without a key
    return lazy;
  };
  const configured = () => Boolean(client) || hasApiKey();

  async function makeVariant(brand: BrandContext, caption: string, network: Network, hashtags: string[]): Promise<string> {
    const budget = variantBudget(network, hashtags);
    let out = cleanReplacement(
      await callText(llm(), {
        model: fastModel(),
        system: buildSystemPrompt(brand),
        user: buildVariantPrompt(caption, network, budget),
        effort: "low",
        maxTokens: 4000,
      }),
    );
    if (charCount(out) > budget) out = truncateToLimit(out, budget);
    return out;
  }

  const service: AiService = {
    async generatePost(brand, req): Promise<GeneratedPost> {
      const c = llm();
      const out = await callStructured(c, {
        model: textModel(),
        system: buildSystemPrompt(brand),
        user: buildGeneratePostPrompt(req),
        effort: "medium",
        maxTokens: 8000,
        toolName: "submit_post",
        toolDescription: "Submit the finished social media post.",
        inputSchema: GeneratedPostTool,
        schema: GeneratedPostZ,
      });

      let hashtags: string[] = [];
      if (req.includeHashtags !== false) {
        const max = hashtagTarget(req.networks).max;
        hashtags = req.hashtagLibrary?.length
          ? restrictToLibrary(out.hashtags, req.hashtagLibrary).slice(0, max)
          : normalizeHashtags(out.hashtags, max);
      }
      const caption = out.caption.trim();

      const need = networksNeedingVariant(caption, hashtags, req.networks);
      const perNetwork: Partial<Record<Network, string>> = {};
      await Promise.all(
        need.map(async (n) => {
          const proposed = out.perNetwork.find((v) => v.network === n)?.caption.trim();
          const budget = variantBudget(n, hashtags);
          perNetwork[n] =
            proposed && charCount(proposed) <= budget ? proposed : await makeVariant(brand, proposed || caption, n, hashtags);
        }),
      );
      const result: GeneratedPost = { caption, hashtags };
      if (Object.keys(perNetwork).length) result.perNetwork = perNetwork;
      return result;
    },

    async rewrite(brand, req: RewriteRequest): Promise<string> {
      if (!req.text.trim()) return req.text;
      const out = await callText(llm(), {
        model: fastModel(),
        system: buildSystemPrompt(brand),
        user: buildRewritePrompt(req),
        effort: "low",
        maxTokens: 8000,
      });
      const cleaned = cleanReplacement(out);
      // Preserve the selection's surrounding whitespace so splicing it back is seamless.
      const lead = req.text.match(/^\s*/)?.[0] ?? "";
      const trail = req.text.match(/\s*$/)?.[0] ?? "";
      return `${lead}${cleaned}${trail}`;
    },

    async generateHashtags(brand, caption, networks, count = 10): Promise<string[]> {
      const n = Math.max(1, Math.min(30, Math.floor(count)));
      const out = await callStructured(llm(), {
        model: fastModel(),
        system: buildSystemPrompt(brand),
        user: buildHashtagPrompt(caption, networks, n),
        effort: "low",
        maxTokens: 2000,
        toolName: "submit_hashtags",
        toolDescription: "Submit the suggested hashtags (without '#').",
        inputSchema: HashtagsTool,
        schema: HashtagsZ,
      });
      return normalizeHashtags(out.hashtags, n);
    },

    async planCampaign(brand, req: CampaignRequest): Promise<CampaignPlanItem[]> {
      const count = Math.floor(req.count);
      if (!(count >= 1)) throw new Error("Campaign count must be at least 1");
      if (count > MAX_CAMPAIGN_POSTS) throw new Error(`Campaign count must be at most ${MAX_CAMPAIGN_POSTS}`);
      if (!(req.durationDays >= 1)) throw new Error("Campaign duration must be at least 1 day");
      const c = llm();
      const system = buildSystemPrompt(brand);
      const slots = distributeSchedule(count, req.durationDays);

      // (a) outline — one distinct angle per slot
      const outlineCall = async (extra = "") =>
        (
          await callStructured(c, {
            model: textModel(),
            system,
            user: buildCampaignOutlinePrompt(req, slots) + extra,
            effort: "medium",
            maxTokens: 8000,
            toolName: "submit_outline",
            toolDescription: "Submit the campaign outline: one angle per post, in schedule order.",
            inputSchema: OutlineTool,
            schema: OutlineZ,
          })
        ).angles;
      let angles = dedupeAngles(await outlineCall());
      if (angles.length < count) {
        const more = await outlineCall(
          `\n\nAngles already planned (do NOT repeat these):\n${angles.map((a) => `- ${a}`).join("\n")}\nReturn ${count - angles.length} NEW, different angles only.`,
        );
        angles = dedupeAngles([...angles, ...more]);
      }
      if (angles.length < count) throw new AiOutputError(`The AI planned only ${angles.length} of ${count} distinct posts`);
      angles = angles.slice(0, count);

      const items: CaptionBatchItem[] = slots.map((s, i) => ({ index: i, angle: angles[i] as string, ...s }));

      // (b) captions — one call for ≤10, else parallel chunks (concurrency 4)
      const writeBatch = async (batch: CaptionBatchItem[]) => {
        const res = await callStructured(c, {
          model: textModel(),
          system,
          user: buildCampaignCaptionsPrompt(req, batch),
          effort: "medium",
          maxTokens: 16000,
          toolName: "submit_captions",
          toolDescription: "Submit the caption for each campaign post, keyed by index.",
          inputSchema: CaptionsTool,
          schema: CaptionsZ,
        });
        const wanted = new Set(batch.map((b) => b.index));
        return res.posts.filter((p) => wanted.has(p.index));
      };
      const batches = count <= CAMPAIGN_BATCH_SIZE ? [items] : chunk(items, CAMPAIGN_BATCH_SIZE);
      const results = (await mapLimit(batches, CAMPAIGN_CONCURRENCY, writeBatch)).flat();
      const byIndex = new Map(results.map((r) => [r.index, r]));
      const missing = items.filter((it) => !byIndex.has(it.index));
      if (missing.length) {
        const retry = (await mapLimit(chunk(missing, CAMPAIGN_BATCH_SIZE), CAMPAIGN_CONCURRENCY, writeBatch)).flat();
        for (const r of retry) byIndex.set(r.index, r);
      }

      const maxTags = hashtagTarget(req.networks).max;
      // Hard ceiling: tightest single-post limit among networks that cannot thread (threadable ones split).
      const limit = Math.min(
        mainCaptionBudget(req.networks),
        ...req.networks.map((n) => NETWORK_LIMITS[n].captionHard ?? NETWORK_LIMITS[n].caption),
      );
      return items.map((it) => {
        const r = byIndex.get(it.index);
        if (!r) throw new AiOutputError(`The AI did not write a caption for post ${it.index + 1}`);
        const caption = r.caption.trim();
        return {
          dayOffset: it.dayOffset,
          time: it.time,
          angle: it.angle,
          caption: charCount(caption) > limit ? truncateToLimit(caption, limit) : caption,
          hashtags: req.includeHashtags === false ? [] : normalizeHashtags(r.hashtags, maxTags),
        };
      });
    },

    async scorePost(input: ScoreInput, opts?: { useLlm?: boolean }): Promise<PostScore> {
      const base = scorePostHeuristic(input);
      if (!opts?.useLlm || !configured() || !input.caption.trim()) return base;
      try {
        const r = await callStructured(llm(), {
          model: fastModel(),
          system: SCORE_REFINE_SYSTEM,
          user: buildScoreRefinePrompt(input.caption, input.networks),
          effort: "low",
          maxTokens: 2000,
          attempts: 1,
          toolName: "submit_ratings",
          toolDescription: "Submit the hook and takeaway ratings.",
          inputSchema: ScoreRefineTool,
          schema: ScoreRefineZ,
        });
        const checks = base.checks.map((ch) => {
          if (ch.id !== "hook" && ch.id !== "takeaway") return ch;
          const rating = r[ch.id];
          return makeCheck(ch.id, rating.score * ch.weight, rating.suggestion.trim() || ch.suggestion || "");
        });
        return finalizeScore(checks);
      } catch {
        return base;
      }
    },

    async fixScoreCheck(brand, caption, checkId: PostScoreCheck["id"], networks): Promise<string> {
      if (checkId === "media" || checkId === "length_fit") {
        throw new Error(`The "${checkId}" check can't be fixed automatically`);
      }
      const suggestion = scorePostHeuristic({ caption, networks, mediaCount: 1 }).checks.find((c) => c.id === checkId)?.suggestion;
      const out = await callStructured(llm(), {
        model: textModel(),
        system: buildSystemPrompt(brand),
        user: buildFixPrompt(caption, checkId, networks, suggestion),
        effort: "low",
        maxTokens: 8000,
        toolName: "submit_caption",
        toolDescription: "Submit the full caption with only the one issue fixed.",
        inputSchema: CaptionTool,
        schema: CaptionZ,
      });
      return out.caption;
    },

    async fetchBrand(websiteUrl: string): Promise<BrandFetchResult> {
      const c = llm(); // fail fast before touching the network when AI is not configured
      const page = await fetchPage(websiteUrl, { resolve: options.resolve, fetchImpl: options.fetchImpl });
      const sig = extractBrandSignals(page.html, page.url);
      const logoUrls = [...sig.logoUrls];
      if (sig.ogImage && !logoUrls.includes(sig.ogImage)) logoUrls.push(sig.ogImage);
      const result: BrandFetchResult = { colors: sig.colors, logoUrls };
      if (sig.siteName || sig.title) result.name = sig.siteName ?? sig.title;
      if (sig.description) result.description = sig.description;

      if (!sig.text && !sig.title && !sig.description) return result;
      const summary = await callStructured(c, {
        model: fastModel(),
        system: BRAND_FETCH_SYSTEM,
        user: buildBrandSummaryPrompt({ url: page.url, title: sig.title, description: sig.description, text: sig.text }),
        effort: "low",
        maxTokens: 4000,
        toolName: "submit_brand",
        toolDescription: "Submit the brand summary.",
        inputSchema: BrandSummaryTool,
        schema: BrandSummaryZ,
      });
      if (summary.name.trim()) result.name = summary.name.trim();
      if (summary.description.trim()) result.description = summary.description.trim();
      if (summary.voice.trim()) result.voice = summary.voice.trim();
      if (summary.audience.trim()) result.audience = summary.audience.trim();
      return result;
    },
  };
  return service;
}
