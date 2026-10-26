/**
 * Workflow template rendering: `{{trigger.title}}`, `{{steps.<stepId>.text}}`, `{{brand.name}}`.
 * Unknown paths render as "". Objects/arrays render as JSON. Pure, no I/O.
 */

export interface TemplateContext {
  trigger: Record<string, unknown>;
  steps: Record<string, Record<string, unknown> | undefined>;
  brand?: Record<string, unknown>;
  [key: string]: unknown;
}

const TOKEN = /\{\{\s*([a-zA-Z0-9_$.\-[\]]+)\s*\}\}/g;

/** Resolve "a.b.0.c" / "a.b[0].c" against an object. */
export function resolvePath(root: unknown, path: string): unknown {
  const parts = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let cur: unknown = root;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== "object") return undefined;
    // Guard prototype access.
    if (p === "__proto__" || p === "constructor" || p === "prototype") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
  if (v instanceof Date) return v.toISOString();
  try {
    return JSON.stringify(v);
  } catch {
    return "";
  }
}

export function renderTemplate(template: string | null | undefined, ctx: TemplateContext): string {
  if (!template) return "";
  return template.replace(TOKEN, (_m, path: string) => stringifyValue(resolvePath(ctx, path)));
}

/** Variable paths referenced by a template (for validation / UI). */
export function templateVariables(template: string | null | undefined): string[] {
  if (!template) return [];
  return [...template.matchAll(TOKEN)].map((m) => m[1]!);
}

export type FilterOp = "contains" | "not_contains";

/** Case-insensitive contains / does-not-contain. Empty `value` → "contains" passes, "not_contains" passes. */
export function evaluateFilter(subject: string, op: FilterOp, value: string): boolean {
  const s = (subject ?? "").toLocaleLowerCase();
  const terms = (value ?? "")
    .split(",")
    .map((t) => t.trim().toLocaleLowerCase())
    .filter(Boolean);
  if (terms.length === 0) return true;
  const hit = terms.some((t) => s.includes(t));
  return op === "not_contains" ? !hit : hit;
}

/** Strip HTML tags + decode the common entities; collapse whitespace. */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return decodeEntities(
    String(html)
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_m, n: string) => safeChar(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => safeChar(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&hellip;/g, "…")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&rdquo;|&ldquo;/g, '"')
    .replace(/&amp;/g, "&");
}

function safeChar(code: number): string {
  try {
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
  } catch {
    return "";
  }
}
