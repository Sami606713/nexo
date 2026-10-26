"use client";

import {
  IconAt,
  IconBolt,
  IconBuildingStore,
  IconClock,
  IconFilter,
  IconHourglass,
  IconMessageCircle,
  IconMessageReply,
  IconMessages,
  IconRobot,
  IconRss,
  IconSend,
  IconSquarePlus,
  IconWebhook,
  type Icon,
} from "@tabler/icons-react";
import { Badge } from "@mantine/core";
import type { RunStatus, StepType, TriggerType, WorkflowStep, WorkflowTrigger } from "@/lib/workflows/types";

export interface NodeMeta {
  label: string;
  description: string;
  icon: Icon;
  color: string;
}

export const TRIGGER_META: Record<TriggerType, NodeMeta> = {
  schedule: { label: "On a schedule", description: "Run at a fixed time or interval", icon: IconClock, color: "indigo" },
  rss: { label: "New feed item", description: "A new article appears in an RSS/Atom feed", icon: IconRss, color: "orange" },
  webhook: { label: "Webhook received", description: "Another app calls your private URL", icon: IconWebhook, color: "grape" },
  woo_product: { label: "New store product", description: "A product is published in WooCommerce", icon: IconBuildingStore, color: "violet" },
  new_comment: { label: "New comment", description: "Someone comments on a post", icon: IconMessageCircle, color: "teal" },
  new_mention: { label: "New mention", description: "Someone mentions your account", icon: IconAt, color: "cyan" },
  new_dm: { label: "New direct message", description: "A DM arrives in your inbox", icon: IconMessages, color: "blue" },
};

export const STEP_META: Record<StepType, NodeMeta> = {
  ai_agent: { label: "AI agent", description: "Generate text (and an image) with an agent", icon: IconRobot, color: "violet" },
  create_post: { label: "Create post", description: "Publish, schedule or draft a post", icon: IconSquarePlus, color: "blue" },
  reply_comment: { label: "Reply to comment", description: "Answer the comment or mention", icon: IconMessageReply, color: "teal" },
  send_dm: { label: "Send DM", description: "Reply in the direct-message thread", icon: IconSend, color: "cyan" },
  filter: { label: "Filter", description: "Continue only when text matches", icon: IconFilter, color: "yellow" },
  delay: { label: "Delay", description: "Wait before the next action", icon: IconHourglass, color: "gray" },
};

export const TriggerFallbackIcon = IconBolt;

const s = (v: unknown) => (typeof v === "string" ? v : "");

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function triggerSummary(t: WorkflowTrigger | null | undefined, lookup?: { channelName?: (id: string) => string | undefined; storeUrl?: (id: string) => string | undefined }): string {
  if (!t) return "No trigger";
  const c = t.config ?? {};
  switch (t.type) {
    case "schedule":
      if (c.mode === "daily") return `Every day at ${s(c.time) || "09:00"}`;
      return `Every ${Number(c.every) || 1} ${s(c.unit) || "hours"}`;
    case "rss":
      return s(c.url) ? `Feed: ${host(s(c.url))}` : "Feed not set";
    case "webhook":
      return "When the webhook URL is called";
    case "woo_product":
      return s(c.storeId) ? `Store: ${host(lookup?.storeUrl?.(s(c.storeId)) ?? "connected store")}` : "Store not selected";
    case "new_comment":
      return s(c.channelId) ? `Comments on ${lookup?.channelName?.(s(c.channelId)) ?? "a channel"}${s(c.postExternalId) ? " (one post)" : ""}` : "Channel not selected";
    case "new_mention":
      return s(c.channelId) ? `Mentions on ${lookup?.channelName?.(s(c.channelId)) ?? "a channel"}` : "Mentions on any channel";
    case "new_dm":
      return s(c.channelId) ? `DMs on ${lookup?.channelName?.(s(c.channelId)) ?? "a channel"}` : "DMs on any channel";
  }
}

const BEHAVIOR: Record<string, string> = { publish_now: "Publish right away", schedule_next_slot: "Queue at next free slot", add_to_drafts: "Save as draft" };

export function stepSummary(step: WorkflowStep, lookup?: { agentName?: (id: string) => string | undefined }): string {
  const c = step.config ?? {};
  switch (step.type) {
    case "ai_agent":
      return s(c.agentId) ? (lookup?.agentName?.(s(c.agentId)) ?? "Agent") : "Choose an agent";
    case "create_post": {
      const n = Array.isArray(c.channelIds) ? c.channelIds.length : 0;
      return `${BEHAVIOR[s(c.behavior)] ?? "Save as draft"} · ${n} channel${n === 1 ? "" : "s"}`;
    }
    case "reply_comment":
    case "send_dm":
      return s(c.text) ? s(c.text).slice(0, 60) : "Write the message";
    case "filter":
      return s(c.value) ? `${c.op === "not_contains" ? "Doesn't contain" : "Contains"} “${s(c.value)}”` : "Set a condition";
    case "delay":
      return `Wait ${Number(c.amount) || 1} ${s(c.unit) || "minutes"}`;
  }
}

export const RUN_STATUS: Record<RunStatus, { label: string; color: string }> = {
  RUNNING: { label: "Running", color: "blue" },
  SUCCESS: { label: "Success", color: "teal" },
  FILTERED: { label: "Filtered", color: "yellow" },
  ERROR: { label: "Error", color: "red" },
};

export function RunStatusBadge({ status, size = "sm" }: { status: RunStatus; size?: "xs" | "sm" | "md" }) {
  const m = RUN_STATUS[status] ?? { label: status, color: "gray" };
  return (
    <Badge size={size} variant="light" color={m.color}>
      {m.label}
    </Badge>
  );
}
