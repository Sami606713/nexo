// OpenAI-compatible chat-completions provider (e.g. Agnes AI, OpenRouter, vLLM) behind the same
// LlmClient surface as the Anthropic SDK: requests arrive Anthropic-shaped and responses are mapped back.
import type { LlmClient } from "./llm";

interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

interface ChatToolCall {
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface ChatResponse {
  choices?: Array<{
    finish_reason?: string | null;
    message?: { content?: string | null; tool_calls?: ChatToolCall[] | null; refusal?: string | null };
  }>;
}

function systemText(system: unknown): string {
  if (typeof system === "string") return system;
  if (Array.isArray(system)) return system.map((b) => (b as { text?: string }).text ?? "").join("\n\n");
  return "";
}

function stopReason(finish: string | null | undefined): string {
  if (finish === "length") return "max_tokens";
  if (finish === "content_filter") return "refusal";
  if (finish === "tool_calls") return "tool_use";
  return "end_turn";
}

export function toChatBody(body: Record<string, unknown>): Record<string, unknown> {
  const messages: Array<Record<string, unknown>> = [];
  const system = systemText(body.system);
  if (system) messages.push({ role: "system", content: system });
  for (const m of (body.messages as Array<{ role: string; content: unknown }>) ?? []) {
    messages.push({ role: m.role, content: typeof m.content === "string" ? m.content : systemText(m.content) });
  }

  const chat: Record<string, unknown> = { model: body.model, messages, max_tokens: body.max_tokens };
  const tools = body.tools as AnthropicTool[] | undefined;
  if (tools?.length) {
    chat.tools = tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description ?? "", parameters: t.input_schema },
    }));
    // A single tool means structured output: force it — compatible APIs handle this reliably.
    chat.tool_choice = tools.length === 1 ? { type: "function", function: { name: tools[0]!.name } } : "auto";
  }
  return chat;
}

export function fromChatResponse(res: ChatResponse): { content: Array<Record<string, unknown>>; stop_reason: string } {
  const choice = res.choices?.[0];
  const msg = choice?.message ?? {};
  const content: Array<Record<string, unknown>> = [];
  if (msg.content) content.push({ type: "text", text: msg.content });
  for (const call of msg.tool_calls ?? []) {
    let input: unknown;
    try {
      input = JSON.parse(call.function?.arguments ?? "");
    } catch {
      input = undefined;
    }
    if (input !== undefined) content.push({ type: "tool_use", name: call.function?.name, input });
  }
  return { content, stop_reason: msg.refusal ? "refusal" : stopReason(choice?.finish_reason) };
}

export function createOpenAiCompatClient(opts: { baseUrl: string; apiKey: string; timeoutMs?: number }): LlmClient {
  const url = `${opts.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  return {
    messages: {
      async create(body) {
        let lastErr: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
          const res = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${opts.apiKey}` },
            body: JSON.stringify(toChatBody(body)),
            signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
          });
          if (res.ok) return fromChatResponse((await res.json()) as ChatResponse);
          const text = await res.text().catch(() => "");
          lastErr = new Error(`AI provider error ${res.status}: ${text.slice(0, 300)}`);
          if (res.status !== 429 && res.status < 500) break;
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        }
        throw lastErr;
      },
    },
  };
}
