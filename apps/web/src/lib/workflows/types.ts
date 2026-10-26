// Client-safe workflow types & metadata (shared by API routes and the builder UI).
// Mirrors apps/worker/src/workers/workflowLogic.ts — keep the shapes in sync.

export const TRIGGER_TYPES = ["schedule", "rss", "webhook", "woo_product", "new_comment", "new_mention", "new_dm"] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const STEP_TYPES = ["ai_agent", "create_post", "reply_comment", "send_dm", "filter", "delay"] as const;
export type StepType = (typeof STEP_TYPES)[number];

export interface ScheduleTriggerConfig {
  mode: "interval" | "daily";
  every?: number;
  unit?: "minutes" | "hours" | "days";
  time?: string;
}
export interface RssTriggerConfig {
  url: string;
  intervalMinutes?: number;
}
export interface WooTriggerConfig {
  storeId: string;
}
export interface InboxTriggerConfig {
  channelId?: string | null;
  postExternalId?: string | null;
}

export interface WorkflowTrigger {
  type: TriggerType;
  config: Record<string, unknown>;
}

export interface WorkflowStep {
  id: string;
  type: StepType;
  config: Record<string, unknown>;
}

export type PostBehavior = "publish_now" | "schedule_next_slot" | "add_to_drafts";

export type RunStatus = "RUNNING" | "SUCCESS" | "FILTERED" | "ERROR";

export interface RunLogEntry {
  stepId: string;
  type: string;
  status: "success" | "error" | "skipped" | "filtered" | "waiting";
  output?: Record<string, unknown> | null;
  error?: string | null;
  note?: string | null;
  offline?: boolean;
  startedAt: string;
  finishedAt?: string | null;
}

export interface WorkflowRunDTO {
  id: string;
  status: RunStatus;
  input: Record<string, unknown>;
  log: RunLogEntry[];
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface WorkflowListItemDTO {
  id: string;
  name: string;
  active: boolean;
  trigger: WorkflowTrigger;
  stepCount: number;
  stepTypes: StepType[];
  lastRunAt: string | null;
  lastRun: { status: RunStatus; startedAt: string } | null;
  runCount: number;
  createdAt: string;
}

export interface WorkflowDTO {
  id: string;
  name: string;
  active: boolean;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  layout: Record<string, unknown>;
  webhookUrl: string;
  state: { rss?: { lastPolledAt?: string; lastError?: string | null; initialized?: boolean }; woo?: { lastPolledAt?: string; lastError?: string | null; initialized?: boolean } };
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AIAgentDTO {
  id: string;
  name: string;
  prompt: string;
  model: string;
  imageGen: boolean;
  webSearch: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WooStoreDTO {
  id: string;
  url: string;
  createdAt: string;
}

/** Variables each trigger exposes as {{trigger.*}}. */
export const TRIGGER_VARIABLES: Record<TriggerType, Array<{ key: string; label: string }>> = {
  schedule: [
    { key: "date", label: "Date" },
    { key: "time", label: "Time" },
    { key: "weekday", label: "Weekday" },
  ],
  rss: [
    { key: "title", label: "Title" },
    { key: "summary", label: "Summary" },
    { key: "link", label: "Link" },
    { key: "image", label: "Image URL" },
    { key: "author", label: "Author" },
    { key: "feedTitle", label: "Feed name" },
  ],
  webhook: [
    { key: "title", label: "title" },
    { key: "message", label: "message" },
    { key: "url", label: "url" },
  ],
  woo_product: [
    { key: "name", label: "Product name" },
    { key: "price", label: "Price" },
    { key: "short_description", label: "Description" },
    { key: "permalink", label: "Product link" },
    { key: "image", label: "Image URL" },
  ],
  new_comment: [
    { key: "text", label: "Comment text" },
    { key: "authorName", label: "Author name" },
    { key: "authorHandle", label: "Author handle" },
  ],
  new_mention: [
    { key: "text", label: "Mention text" },
    { key: "authorName", label: "Author name" },
    { key: "authorHandle", label: "Author handle" },
  ],
  new_dm: [
    { key: "text", label: "Message text" },
    { key: "authorName", label: "Sender name" },
    { key: "authorHandle", label: "Sender handle" },
  ],
};

/** Variables each step exposes as {{steps.<id>.*}}. */
export const STEP_OUTPUTS: Partial<Record<StepType, Array<{ key: string; label: string }>>> = {
  ai_agent: [
    { key: "text", label: "Generated text" },
    { key: "imageUrl", label: "Generated image" },
  ],
  create_post: [{ key: "caption", label: "Post caption" }],
  filter: [{ key: "text", label: "Checked text" }],
};

export const INBOX_TRIGGERS: TriggerType[] = ["new_comment", "new_mention", "new_dm"];

export function newStepId(): string {
  return `s${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultStepConfig(type: StepType): Record<string, unknown> {
  switch (type) {
    case "ai_agent":
      return { agentId: "", input: "{{trigger.title}}\n\n{{trigger.summary}}", generateImage: false };
    case "create_post":
      return { caption: "", channelIds: [], behavior: "add_to_drafts", mediaUrls: "", useStepImage: true };
    case "reply_comment":
      return { text: "Thanks {{trigger.authorName}}! 🙌" };
    case "send_dm":
      return { text: "Hi {{trigger.authorName}}, thanks for reaching out!" };
    case "filter":
      return { subject: "{{trigger.text}}", op: "contains", value: "" };
    case "delay":
      return { amount: 30, unit: "minutes" };
  }
}

export function defaultTriggerConfig(type: TriggerType): Record<string, unknown> {
  switch (type) {
    case "schedule":
      return { mode: "daily", time: "09:00", every: 1, unit: "days" };
    case "rss":
      return { url: "", intervalMinutes: 60 };
    case "woo_product":
      return { storeId: "" };
    case "new_comment":
      return { channelId: "", postExternalId: "" };
    default:
      return { channelId: "" };
  }
}
