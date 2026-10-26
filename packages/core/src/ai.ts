import type { Network } from "./networks";

/** Brand context injected into every AI prompt. Built from the Brand row. */
export interface BrandContext {
  name: string;
  website?: string | null;
  description?: string | null;
  voice?: string | null;
  audience?: string | null;
  avoid?: string | null;
}

export type Tone = "professional" | "friendly" | "witty" | "bold" | "inspirational" | "educational";
export type Length = "short" | "medium" | "long";

export interface GeneratePostRequest {
  prompt: string;
  networks: Network[];
  tone?: Tone;
  length?: Length;
  includeHashtags?: boolean;
  /** Hashtags the user wants used verbatim (from a library); AI must not invent others if provided. */
  hashtagLibrary?: string[];
  language?: string;
}

export interface GeneratedPost {
  caption: string;
  /** Optional per-network variants when the shared caption doesn't fit (e.g. short X version). */
  perNetwork?: Partial<Record<Network, string>>;
  hashtags: string[];
}

export type RewriteAction = "rewrite" | "shorten" | "expand" | "fix_grammar" | "change_tone" | "translate";

export interface RewriteRequest {
  text: string;
  /** Full caption for context when `text` is a selection. */
  context?: string;
  action: RewriteAction;
  tone?: Tone;
  targetLanguage?: string;
}

export type CampaignGoal = "awareness" | "leads" | "launch" | "offer" | "education" | "event";

export interface CampaignRequest {
  prompt: string;
  goal: CampaignGoal;
  audience?: string;
  /** YYYY-MM-DD in brand timezone. */
  startDate: string;
  durationDays: number;
  count: number;
  networks: Network[];
  tone?: Tone;
  length?: Length;
  includeHashtags?: boolean;
}

export interface CampaignPlanItem {
  /** 0-based day offset from startDate. */
  dayOffset: number;
  /** HH:mm local brand time suggestion. */
  time: string;
  angle: string;
  caption: string;
  hashtags: string[];
}

export interface PostScoreCheck {
  id:
    | "substance"
    | "hook"
    | "length_fit"
    | "takeaway"
    | "scannable"
    | "cta"
    | "media"
    | "hashtags"
    | "links"
    | "readability"
    | "spam";
  label: string;
  weight: number;
  earned: number;
  passed: boolean;
  suggestion?: string;
  /** Whether an AI "Fix" can address it (media/length_fit cannot). */
  fixable: boolean;
}

export interface PostScore {
  total: number;
  band: "High" | "Strong" | "Fair" | "Low";
  checks: PostScoreCheck[];
}

export interface ScoreInput {
  caption: string;
  networks: Network[];
  mediaCount: number;
}

export interface BrandFetchResult {
  name?: string;
  description?: string;
  voice?: string;
  audience?: string;
  colors: string[];
  logoUrls: string[];
}

/**
 * Implemented by @postline/ai. Every method that costs credits is wrapped by the caller
 * with `chargeCredits` (in @postline/ai) — the service itself is pure generation.
 */
export interface AiService {
  generatePost(brand: BrandContext, req: GeneratePostRequest): Promise<GeneratedPost>;
  rewrite(brand: BrandContext, req: RewriteRequest): Promise<string>;
  generateHashtags(brand: BrandContext, caption: string, networks: Network[], count?: number): Promise<string[]>;
  planCampaign(brand: BrandContext, req: CampaignRequest): Promise<CampaignPlanItem[]>;
  /** Heuristic + cheap LLM checks. Deterministic checks must work with no API key. */
  scorePost(input: ScoreInput, opts?: { useLlm?: boolean }): Promise<PostScore>;
  fixScoreCheck(brand: BrandContext, caption: string, checkId: PostScoreCheck["id"], networks: Network[]): Promise<string>;
  fetchBrand(websiteUrl: string): Promise<BrandFetchResult>;
}

// ───────────── Image generation (phase 4) ─────────────

export interface ImageGenRequest {
  prompt: string;
  width: number;
  height: number;
  /** 1–10 */
  count?: number;
  style?: "photo" | "illustration" | "3d" | "minimal" | "brand";
  /** Brand colours to steer the palette. */
  colors?: string[];
}

export interface GeneratedImage {
  /** PNG/JPEG/SVG bytes. */
  bytes: Uint8Array;
  mime: string;
  width: number;
  height: number;
  /** Which provider produced it ("openai" | "replicate" | "local-art"). */
  provider: string;
}

/**
 * Implemented by @postline/ai `images`. Uses OPENAI_API_KEY (gpt-image-1) or REPLICATE_API_TOKEN (flux)
 * when configured; otherwise renders deterministic local abstract artwork (SVG) so the product works offline.
 */
export interface ImageService {
  generate(req: ImageGenRequest): Promise<GeneratedImage[]>;
  provider(): string;
}
