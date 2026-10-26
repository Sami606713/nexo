import "server-only";
// Copy of apps/worker/src/lib/agentLlm.ts (web can't import worker code) — keep in sync.
/**
 * Runs an AI agent (standing instructions + one input) through @postline/ai's LLM client
 * (OpenAI-compatible LLM_BASE_URL/LLM_API_KEY, or Anthropic).
 * Without any AI key it returns a deterministic offline caption so demos still work.
 */
import { callText, createDefaultClient, hasApiKey, textModel } from "@postline/ai";

export interface AgentSpec {
  name: string;
  prompt: string;
  model?: string | null;
  webSearch?: boolean;
}

export interface BrandSpec {
  name: string;
  voice?: string | null;
  audience?: string | null;
  avoid?: string | null;
  description?: string | null;
  website?: string | null;
}

export interface AgentResult {
  text: string;
  offline: boolean;
  model: string;
}

export function agentConfigured(): boolean {
  return hasApiKey();
}

/**
 * A Claude model chosen on the agent is honoured only when talking to Anthropic directly; otherwise
 * ("default", or an OpenAI-compatible provider such as Agnes) the configured text model is used.
 */
export function agentModel(agent: Pick<AgentSpec, "model">): string {
  return agent.model?.startsWith("claude") && !process.env.LLM_API_KEY ? agent.model : textModel();
}

export function buildAgentSystem(agent: AgentSpec, brand: BrandSpec): string {
  const lines = [
    `You are "${agent.name}", an automation agent working for the brand "${brand.name}".`,
    brand.description ? `About the brand: ${brand.description}` : "",
    brand.website ? `Website: ${brand.website}` : "",
    brand.voice ? `Voice and tone: ${brand.voice}` : "",
    brand.audience ? `Audience: ${brand.audience}` : "",
    brand.avoid ? `Never mention or use: ${brand.avoid}` : "",
    "",
    "Standing instructions:",
    agent.prompt.trim() || "Turn the input into an engaging social media post.",
    "",
    "Reply with the final text only — no preamble, no quotes, no explanations.",
  ];
  return lines.filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
}

const STOP = new Set(
  "the a an and or but of to in on for with at by from is are was were be been this that these those it its as your our you we they their into about how what why when new more most just than then over under via not can will article link product price today write http https without".split(
    " ",
  ),
);

function hashtagsFor(text: string, brandName: string): string[] {
  const counts = new Map<string, number>();
  for (const w of text.toLowerCase().match(/[a-z][a-z0-9]{3,}/g) ?? []) {
    if (STOP.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const words = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([w]) => w);
  const tags = words.slice(0, 2).map((w) => `#${w[0]!.toUpperCase()}${w.slice(1)}`);
  const brandTag = `#${brandName.replace(/[^a-zA-Z0-9]/g, "")}`;
  while (tags.length < 2) tags.push(tags.length === 0 && brandTag.length > 1 ? brandTag : "#TodayILearned");
  return tags;
}

function firstSentences(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [clean];
  let out = "";
  for (const s of sentences) {
    if ((out + s).length > maxChars) break;
    out += s;
  }
  if (!out) out = clean.slice(0, maxChars - 1).replace(/\s+\S*$/, "") + "…";
  return out.trim();
}

const HOOKS = ["Quick read worth your time:", "Here's something we think you'll like:", "Fresh on our radar:", "Worth sharing today:"];
const CTAS = ["What's your take? Tell us below.", "Save this for later and share it with a friend.", "Tap the link to dive in.", "Follow along for more like this."];

/** Deterministic "summarize/rewrite into a social caption" with hook + CTA + 2 hashtags. */
export function offlineCaption(input: string, brandName: string): string {
  // Drop "Label:" prefixes that templates commonly add (Article:, Link:, Price: …).
  const text =
    input
      .split("\n")
      .map((l) => l.replace(/^\s*[A-Za-z][A-Za-z ]{0,18}:\s*(?!\/\/)/, "").trim())
      .filter(Boolean)
      .map((l) => (/^https?:\/\//.test(l) || /[.!?…:]$/.test(l) ? l : `${l}.`))
      .join("\n") || `A quick update from ${brandName}.`;
  const seed = [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const hook = HOOKS[seed % HOOKS.length]!;
  const cta = CTAS[(seed >>> 3) % CTAS.length]!;
  const url = /(https?:\/\/\S+)/.exec(text)?.[1];
  const body = firstSentences(text.replace(/https?:\/\/\S+/g, "").trim(), 220);
  const tags = hashtagsFor(text, brandName);
  return [hook, "", body, url ? `\n${url}` : "", "", cta, "", tags.join(" ")].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
}

export async function runAgent(agent: AgentSpec, brand: BrandSpec, input: string): Promise<AgentResult> {
  if (!agentConfigured()) return { text: offlineCaption(input, brand.name), offline: true, model: "offline" };
  const model = agentModel(agent);
  const text = await callText(createDefaultClient(), {
    model,
    system: buildAgentSystem(agent, brand),
    user: input.trim() || "(no input provided)",
    maxTokens: 2000,
  });
  return { text, offline: false, model };
}
