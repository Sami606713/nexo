// OWNED BY: integrations agent.
// Pure and browser-safe.
import { NETWORK_LIMITS, type Network } from "./networks";
import { countCharacters, graphemes } from "./validation";

export interface SplitOptions {
  /** Append " i/n" to every part (default true when the caption is split). */
  numbering?: boolean;
  /** Override the per-part limit (defaults to NETWORK_LIMITS[network].caption). */
  limit?: number;
}

type Counter = (s: string) => number;

/** Levels from coarsest to finest. Each returns pieces plus the joiner used to glue them back. */
const LEVELS: Array<{ split: (s: string) => string[]; joiner: string }> = [
  { split: (s) => s.split(/\n[ \t]*\n+/), joiner: "\n\n" }, // paragraphs
  { split: (s) => s.split(/(?<=[.!?…]["'”’)\]]?)\s+/u), joiner: " " }, // sentences
  { split: (s) => s.split(/\s+/), joiner: " " }, // words
];

/** Hard-cut a single over-long token into chunks that each fit `limit`. */
function hardCut(text: string, limit: number, count: Counter): string[] {
  const out: string[] = [];
  let cur = "";
  for (const g of graphemes(text)) {
    const cand = cur + g;
    if (cur && count(cand) > limit) {
      out.push(cur);
      cur = g;
    } else {
      cur = cand;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function splitText(text: string, limit: number, count: Counter, level: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (count(trimmed) <= limit) return [trimmed];
  const lvl = LEVELS[level];
  if (!lvl) return hardCut(trimmed, limit, count);

  const pieces = lvl.split(trimmed).map((p) => p.trim()).filter(Boolean);
  if (pieces.length <= 1) return splitText(trimmed, limit, count, level + 1);

  const chunks = pieces.flatMap((p) => (count(p) > limit ? splitText(p, limit, count, level + 1) : [p]));
  const out: string[] = [];
  let cur = "";
  for (const c of chunks) {
    const cand = cur ? cur + lvl.joiner + c : c;
    if (count(cand) <= limit) {
      cur = cand;
    } else {
      if (cur) out.push(cur);
      cur = c;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Split a caption into thread parts that each fit `NETWORK_LIMITS[network].caption`,
 * preferring paragraph, then sentence, then word boundaries (very long words are hard-cut).
 * Returns [caption] when it fits. Parts are numbered " 1/3" unless `opts.numbering === false`.
 */
export function splitIntoThread(network: Network, caption: string, opts: SplitOptions = {}): string[] {
  const limit = opts.limit ?? NETWORK_LIMITS[network].caption;
  const count: Counter = (s) => countCharacters(network, s);
  if (count(caption) <= limit) return [caption];

  if (opts.numbering === false) return splitText(caption, limit, count, 0);

  // Reserve room for the " i/n" suffix; grow the reservation if the part count needs more digits.
  let reserve = count(" 9/9");
  for (let attempt = 0; attempt < 6; attempt++) {
    const parts = splitText(caption, Math.max(1, limit - reserve), count, 0);
    const n = parts.length;
    const needed = count(` ${n}/${n}`);
    if (needed <= reserve) return parts.map((p, i) => `${p} ${i + 1}/${n}`);
    reserve = needed;
  }
  return splitText(caption, limit, count, 0);
}
