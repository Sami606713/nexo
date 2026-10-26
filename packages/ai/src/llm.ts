// OWNED BY: ai agent. Thin wrapper over the Anthropic Messages API: structured (tool-use) and plain-text calls.
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { createOpenAiCompatClient } from "./openai-compat";

/** Minimal surface of the Anthropic client we use — lets tests inject a mock. */
export interface LlmClient {
  messages: { create(body: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown> };
  beta?: { messages: { create(body: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown> } };
}

interface LlmContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
}
interface LlmResponse {
  content: LlmContentBlock[];
  stop_reason?: string | null;
}

export const NOT_CONFIGURED_MESSAGE = "AI is not configured: set LLM_API_KEY (OpenAI-compatible) or ANTHROPIC_API_KEY";

export class AiRefusalError extends Error {
  constructor(message = "The AI declined to generate this content. Try rephrasing the request.") {
    super(message);
    this.name = "AiRefusalError";
  }
}

export class AiOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiOutputError";
  }
}

export function textModel(): string {
  return process.env.AI_TEXT_MODEL || "claude-sonnet-5-5";
}
export function fastModel(): string {
  return process.env.AI_FAST_MODEL || "claude-haiku-5-5";
}

/** OpenAI-compatible provider (LLM_BASE_URL + LLM_API_KEY) takes precedence over Anthropic when configured. */
function openAiCompatConfig(): { baseUrl: string; apiKey: string } | null {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL;
  return apiKey && baseUrl ? { apiKey, baseUrl } : null;
}

export function hasApiKey(): boolean {
  return Boolean(openAiCompatConfig() || process.env.ANTHROPIC_API_KEY);
}

export function createDefaultClient(): LlmClient {
  const compat = openAiCompatConfig();
  if (compat) return createOpenAiCompatClient(compat);
  if (!process.env.ANTHROPIC_API_KEY) throw new Error(NOT_CONFIGURED_MESSAGE);
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 }) as unknown as LlmClient;
}

/** Models that accept `output_config.effort`. */
export function supportsEffort(model: string): boolean {
  return /^claude-(fable-5|mythos-5|opus-5|sonnet-5|haiku-5|opus-4-[5-9]|sonnet-4-6)/.test(model);
}

/** Models where the server-side refusal fallback (`fallbacks: "default"`) is available on the Claude API. */
export function supportsServerFallback(model: string): boolean {
  return /^claude-(fable-5-1|opus-5-5|opus-5|sonnet-5-5)$/.test(model);
}

export type Effort = "low" | "medium" | "high";

export interface CallOptions {
  model: string;
  /** Stable, cacheable system prompt (brand block). Gets a cache breakpoint. */
  system: string;
  user: string;
  maxTokens?: number;
  effort?: Effort;
}

function buildBody(opts: CallOptions, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 8000,
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: opts.user }],
    ...extra,
  };
  if (opts.effort && supportsEffort(opts.model)) body.output_config = { effort: opts.effort };
  return body;
}

async function send(client: LlmClient, body: Record<string, unknown>): Promise<LlmResponse> {
  const model = String(body.model);
  const useFallback =
    client.beta !== undefined && supportsServerFallback(model) && process.env.AI_DISABLE_FALLBACKS !== "1";
  const raw = useFallback
    ? await client.beta!.messages.create({ ...body, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
    : await client.messages.create(body);
  const res = raw as LlmResponse;
  if (!res || !Array.isArray(res.content)) throw new AiOutputError("Unexpected response from the AI provider");
  if (res.stop_reason === "refusal") throw new AiRefusalError();
  return res;
}

/** Plain-text call; returns the concatenated text blocks (thinking blocks are ignored). */
export async function callText(client: LlmClient, opts: CallOptions): Promise<string> {
  const res = await send(client, buildBody(opts));
  const text = res.content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new AiOutputError("The AI returned an empty response");
  return text;
}

export interface StructuredOptions<T> extends CallOptions {
  toolName: string;
  toolDescription: string;
  /** JSON Schema for the tool input (strict: every property required, additionalProperties false). */
  inputSchema: Record<string, unknown>;
  schema: z.ZodType<T>;
  /** Total attempts when the output is missing or fails validation. Default 2. */
  attempts?: number;
}

/** Pull a JSON object out of free text (fallback when the model answers in text instead of calling the tool). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/**
 * Structured output via strict tool use. Forced tool_choice is rejected by current models, so we use
 * `auto` + an explicit instruction, then validate the tool input with zod (retrying once on failure).
 */
export async function callStructured<T>(client: LlmClient, opts: StructuredOptions<T>): Promise<T> {
  const tools = [
    { name: opts.toolName, description: opts.toolDescription, input_schema: opts.inputSchema, strict: true },
  ];
  const user = `${opts.user}\n\nRespond by calling the \`${opts.toolName}\` tool exactly once. Do not reply with plain text.`;
  const attempts = Math.max(1, opts.attempts ?? 2);
  let lastError = "no tool call";
  for (let i = 0; i < attempts; i++) {
    const res = await send(client, buildBody({ ...opts, user }, { tools, tool_choice: { type: "auto" } }));
    const toolUse = res.content.find((b) => b.type === "tool_use" && b.name === opts.toolName);
    let input: unknown = toolUse?.input;
    if (input === undefined) {
      const text = res.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
      input = extractJson(text);
    }
    if (input === undefined) {
      lastError = res.stop_reason === "max_tokens" ? "response was cut off" : "no tool call";
      continue;
    }
    const parsed = opts.schema.safeParse(input);
    if (parsed.success) return parsed.data;
    lastError = parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ");
  }
  throw new AiOutputError(`The AI returned an invalid response (${lastError})`);
}

/** Run async tasks with a concurrency limit, preserving order. */
export async function mapLimit<I, O>(items: I[], limit: number, fn: (item: I, index: number) => Promise<O>): Promise<O[]> {
  const out = new Array<O>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as I, i);
    }
  });
  await Promise.all(workers);
  return out;
}
