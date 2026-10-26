// Client-safe gallery of starter workflows. Server fills in agent ids (creating the starter agent if needed).
import type { WorkflowStep, WorkflowTrigger } from "./types";

export interface StarterAgent {
  name: string;
  prompt: string;
}

export interface WorkflowTemplate {
  key: string;
  title: string;
  description: string;
  trigger: WorkflowTrigger;
  /** Steps; an ai_agent step with agentId "@starter" gets the template's starter agent. */
  steps: WorkflowStep[];
  agent?: StarterAgent;
  tags: string[];
}

const WRITER: StarterAgent = {
  name: "Social writer",
  prompt:
    "Turn the input into one ready-to-post social media caption in our brand voice. Open with a scroll-stopping first line, keep it under 600 characters, end with a clear call to action, and add two relevant hashtags. Plain text only.",
};

const TIPSTER: StarterAgent = {
  name: "Daily tip writer",
  prompt:
    "Write one practical, specific tip our audience can use today. Lead with a short hook, give the tip in 2–3 sentences, finish with a question that invites replies, then two hashtags. Never repeat generic advice.",
};

const PROMO: StarterAgent = {
  name: "Product promoter",
  prompt:
    "Write an upbeat launch post for the product described in the input. Mention the name and price, highlight the single most appealing benefit, include the product link, and close with a call to shop. Add two hashtags.",
};

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    key: "blank",
    title: "Start from scratch",
    description: "An empty workflow with a webhook trigger. Swap the trigger and add any actions you like.",
    trigger: { type: "webhook", config: {} },
    steps: [],
    tags: ["Blank"],
  },
  {
    key: "rss_ai_post",
    title: "Blog feed → AI caption → post",
    description: "Watch an RSS or Atom feed. Each new article gets an AI-written caption and lands in your queue at the next free slot.",
    trigger: { type: "rss", config: { url: "", intervalMinutes: 60 } },
    agent: WRITER,
    steps: [
      { id: "write", type: "ai_agent", config: { agentId: "@starter", input: "Article: {{trigger.title}}\n\n{{trigger.summary}}\n\nLink: {{trigger.link}}", generateImage: false } },
      { id: "post", type: "create_post", config: { caption: "{{steps.write.text}}", channelIds: [], behavior: "schedule_next_slot", mediaUrls: "{{trigger.image}}", useStepImage: true } },
    ],
    tags: ["RSS", "AI", "Publishing"],
  },
  {
    key: "daily_tip",
    title: "Morning tip, every day at 9:00",
    description: "Every morning an AI agent drafts a fresh, useful tip for your audience and saves it to drafts for a quick review.",
    trigger: { type: "schedule", config: { mode: "daily", time: "09:00", every: 1, unit: "days" } },
    agent: TIPSTER,
    steps: [
      { id: "tip", type: "ai_agent", config: { agentId: "@starter", input: "Today is {{trigger.weekday}}, {{trigger.date}}. Write today's tip.", generateImage: false } },
      { id: "post", type: "create_post", config: { caption: "{{steps.tip.text}}", channelIds: [], behavior: "add_to_drafts", mediaUrls: "", useStepImage: true } },
    ],
    tags: ["Schedule", "AI"],
  },
  {
    key: "woo_promo",
    title: "New store product → launch post",
    description: "When a product is published in your WooCommerce store, write a launch post with its photo and schedule it.",
    trigger: { type: "woo_product", config: { storeId: "" } },
    agent: PROMO,
    steps: [
      {
        id: "promo",
        type: "ai_agent",
        config: { agentId: "@starter", input: "Product: {{trigger.name}}\nPrice: {{trigger.price}}\n{{trigger.short_description}}\nLink: {{trigger.permalink}}", generateImage: false },
      },
      { id: "post", type: "create_post", config: { caption: "{{steps.promo.text}}", channelIds: [], behavior: "schedule_next_slot", mediaUrls: "{{trigger.image}}", useStepImage: true } },
    ],
    tags: ["WooCommerce", "AI", "E-commerce"],
  },
  {
    key: "comment_keyword_reply",
    title: "Comment keyword → instant answer",
    description: "When someone comments a keyword like “price” on your post, reply right away with the details they asked for.",
    trigger: { type: "new_comment", config: { channelId: "", postExternalId: "" } },
    steps: [
      { id: "keyword", type: "filter", config: { subject: "{{trigger.text}}", op: "contains", value: "price, cost" } },
      { id: "reply", type: "reply_comment", config: { text: "Hi {{trigger.authorName}}! Our full price list is on the website — tap the link in our bio. 💬" } },
    ],
    tags: ["Inbox", "Engagement"],
  },
  {
    key: "dm_keyword_reply",
    title: "DM keyword → auto reply",
    description: "Answer common direct-message questions automatically, e.g. shipping or opening hours, then let the team follow up.",
    trigger: { type: "new_dm", config: { channelId: "" } },
    steps: [
      { id: "keyword", type: "filter", config: { subject: "{{trigger.text}}", op: "contains", value: "shipping, deliver" } },
      { id: "dm", type: "send_dm", config: { text: "Hi {{trigger.authorName}}! We ship worldwide in 3–7 days. A teammate will jump in shortly if you need more help." } },
    ],
    tags: ["Inbox", "Support"],
  },
  {
    key: "thank_mentions",
    title: "Say thanks for every mention",
    description: "Wait a few minutes after someone mentions you, then reply with a friendly thank-you so nobody goes unnoticed.",
    trigger: { type: "new_mention", config: { channelId: "" } },
    steps: [
      { id: "wait", type: "delay", config: { amount: 5, unit: "minutes" } },
      { id: "thanks", type: "reply_comment", config: { text: "Thank you for the shout-out, {{trigger.authorName}}! 💜" } },
    ],
    tags: ["Inbox", "Community"],
  },
  {
    key: "webhook_draft",
    title: "Webhook → draft post",
    description: "Send JSON from Zapier, your CMS or a script to a private URL and get a ready-to-edit draft in the planner.",
    trigger: { type: "webhook", config: {} },
    steps: [{ id: "draft", type: "create_post", config: { caption: "{{trigger.title}}\n\n{{trigger.message}}\n{{trigger.url}}", channelIds: [], behavior: "add_to_drafts", mediaUrls: "", useStepImage: true } }],
    tags: ["Webhook", "Integrations"],
  },
];

export function findTemplate(key: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.key === key);
}
