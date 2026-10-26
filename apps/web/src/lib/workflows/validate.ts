// Client-safe workflow validation (builder error badges + /toggle).
import type { WorkflowStep, WorkflowTrigger } from "./types";

export interface WorkflowRefs {
  agentIds?: Set<string>;
  channelIds?: Set<string>;
  storeIds?: Set<string>;
}

export interface WorkflowErrors {
  ok: boolean;
  trigger: string[];
  steps: Record<string, string[]>;
  /** Workflow-level problems (e.g. no actions). */
  general: string[];
}

const TOKEN = /\{\{\s*([a-zA-Z0-9_$.\-[\]]+)\s*\}\}/g;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function templateErrors(value: unknown, earlier: Set<string>, all: Set<string>): string[] {
  const out: string[] = [];
  for (const m of str(value).matchAll(TOKEN)) {
    const path = m[1]!;
    const [root, id] = path.split(".");
    if (root === "steps") {
      if (!id || !all.has(id)) out.push(`{{${path}}} refers to a step that no longer exists`);
      else if (!earlier.has(id)) out.push(`{{${path}}} refers to a later step`);
    } else if (root !== "trigger" && root !== "brand") out.push(`Unknown variable {{${path}}}`);
  }
  return out;
}

export function validateWorkflow(trigger: WorkflowTrigger | null | undefined, steps: WorkflowStep[], refs: WorkflowRefs = {}): WorkflowErrors {
  const t: string[] = [];
  const general: string[] = [];
  const cfg = trigger?.config ?? {};
  switch (trigger?.type) {
    case "schedule": {
      if (cfg.mode === "daily") {
        if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(str(cfg.time))) t.push("Pick a time of day");
      } else {
        const every = Number(cfg.every);
        if (!Number.isFinite(every) || every < 1) t.push("Set how often it should run");
        else if (cfg.unit === "minutes" && every < 5) t.push("The shortest interval is 5 minutes");
      }
      break;
    }
    case "rss":
      if (!isHttpUrl(str(cfg.url))) t.push("Enter a valid feed URL (https://…)");
      break;
    case "woo_product":
      if (!str(cfg.storeId)) t.push("Connect and select a WooCommerce store");
      else if (refs.storeIds && !refs.storeIds.has(str(cfg.storeId))) t.push("The selected store is no longer connected");
      break;
    case "new_comment":
      if (!str(cfg.channelId)) t.push("Choose the channel to watch");
      else if (refs.channelIds && !refs.channelIds.has(str(cfg.channelId))) t.push("The selected channel no longer exists");
      break;
    case "new_mention":
    case "new_dm":
      if (str(cfg.channelId) && refs.channelIds && !refs.channelIds.has(str(cfg.channelId))) t.push("The selected channel no longer exists");
      break;
    case "webhook":
      break;
    default:
      t.push("Choose a trigger");
  }

  if (steps.length === 0) general.push("Add at least one action");
  const all = new Set(steps.map((s) => s.id));
  const earlier = new Set<string>();
  const stepErrors: Record<string, string[]> = {};
  for (const s of steps) {
    const e: string[] = [];
    const c = s.config ?? {};
    switch (s.type) {
      case "ai_agent":
        if (!str(c.agentId)) e.push("Choose an AI agent");
        else if (refs.agentIds && !refs.agentIds.has(str(c.agentId))) e.push("The selected agent was deleted");
        if (!str(c.input)) e.push("Tell the agent what to work with");
        e.push(...templateErrors(c.input, earlier, all));
        break;
      case "create_post": {
        const channels = Array.isArray(c.channelIds) ? (c.channelIds as string[]) : [];
        if (!str(c.caption) && !str(c.mediaUrls)) e.push("Write a caption (you can use variables)");
        if (c.behavior !== "add_to_drafts" && channels.length === 0) e.push("Pick at least one channel to publish or schedule to");
        if (refs.channelIds && channels.some((id) => !refs.channelIds!.has(id))) e.push("A selected channel no longer exists");
        e.push(...templateErrors(c.caption, earlier, all), ...templateErrors(c.mediaUrls, earlier, all));
        break;
      }
      case "reply_comment":
        if (trigger && trigger.type !== "new_comment" && trigger.type !== "new_mention") e.push("Replies need a “New comment” or “New mention” trigger");
        if (!str(c.text)) e.push("Write the reply");
        e.push(...templateErrors(c.text, earlier, all));
        break;
      case "send_dm":
        if (trigger && trigger.type !== "new_dm") e.push("Direct replies need a “New direct message” trigger");
        if (!str(c.text)) e.push("Write the message");
        e.push(...templateErrors(c.text, earlier, all));
        break;
      case "filter":
        if (!str(c.subject)) e.push("Choose what text to check");
        if (!str(c.value)) e.push("Enter the word or phrase to look for");
        e.push(...templateErrors(c.subject, earlier, all));
        break;
      case "delay": {
        const n = Number(c.amount);
        if (!Number.isFinite(n) || n < 1) e.push("Set a delay of at least 1");
        break;
      }
      default:
        e.push("Unknown action");
    }
    if (e.length) stepErrors[s.id] = e;
    earlier.add(s.id);
  }
  return { ok: t.length === 0 && general.length === 0 && Object.keys(stepErrors).length === 0, trigger: t, steps: stepErrors, general };
}
