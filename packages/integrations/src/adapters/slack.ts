import { isIP } from "node:net";
import {
  AdapterError,
  NETWORK_LIMITS,
  mediaKind,
  splitIntoThread,
  type ComposedPost,
  type ConnectTarget,
  type Credentials,
  type NetworkAdapter,
  type PublishResult,
} from "@postline/core";
import { fetchJson, readBody, request, httpError, type StatusClassifier } from "../http";
import { validateForNetwork } from "../rules";
import { isPrivateAddress } from "../ssrf";
import { assertValid, requireCred, requireField, shortHash } from "../util";

const NETWORK = "SLACK" as const;
const LABEL = "Slack";
const WEBHOOK_RE = /^https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+\/?$/;
const SECTION_LIMIT = 2800; // Slack caps section text at 3000 after escaping
const MAX_BLOCKS = 50;

/** invalid_token / no_service / channel_not_found / channel_is_archived → the webhook is dead. */
export const classifySlack: StatusClassifier = (status) => {
  if (status === 401 || status === 403 || status === 404 || status === 410) return "auth";
  return undefined;
};

export function escapeMrkdwn(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Slack fetches image blocks itself, so the URL must be publicly reachable. */
function isPubliclyReachable(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    if (isIP(host)) return !isPrivateAddress(host);
    return true;
  } catch {
    return false;
  }
}

export function buildSlackPayload(post: Pick<ComposedPost, "caption" | "media">): Record<string, unknown> {
  const blocks: Array<Record<string, unknown>> = [];
  const caption = post.caption.trim();
  if (caption) {
    for (const chunk of splitIntoThread(NETWORK, caption, { numbering: false, limit: SECTION_LIMIT })) {
      blocks.push({ type: "section", text: { type: "mrkdwn", text: escapeMrkdwn(chunk) } });
    }
  }
  const links: string[] = [];
  for (const m of post.media) {
    if (mediaKind(m) === "image" && isPubliclyReachable(m.url)) {
      blocks.push({ type: "image", image_url: m.url, alt_text: (m.alt || "Image").slice(0, 2000) });
    } else {
      links.push(`<${m.url}|${escapeMrkdwn(m.alt || (mediaKind(m) === "video" ? "Video" : "Attachment"))}>`);
    }
  }
  if (links.length) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: links.join("  ·  ") }] });
  return {
    text: escapeMrkdwn(caption || "New post"),
    ...(blocks.length ? { blocks: blocks.slice(0, MAX_BLOCKS) } : {}),
    unfurl_links: true,
  };
}

async function publish(post: ComposedPost, credentials: Credentials): Promise<PublishResult> {
  assertValid(NETWORK, post);
  const webhookUrl = requireCred(credentials, "webhookUrl", NETWORK);
  await fetchJson(webhookUrl, { method: "POST", json: buildSlackPayload(post), label: LABEL, classify: classifySlack });
  // Incoming webhooks return plain "ok" with no message id or permalink.
  return { externalId: `slack:${post.postId}`, url: "" };
}

export const slackAdapter: NetworkAdapter = {
  network: NETWORK,
  limits: NETWORK_LIMITS.SLACK,
  connectKind: "webhook",
  credentialFields: [
    {
      name: "webhookUrl",
      label: "Incoming webhook URL",
      type: "url",
      placeholder: "https://hooks.slack.com/services/T…/B…/…",
      help: "Create a Slack app → Incoming Webhooks → Add New Webhook to Workspace → pick a channel → copy the URL.",
      required: true,
    },
    { name: "channelName", label: "Channel name (for display)", type: "text", placeholder: "#announcements", required: false },
  ],

  async connectWithCredentials(fields): Promise<ConnectTarget[]> {
    const webhookUrl = requireField(fields, "webhookUrl", "Webhook URL").replace(/\/$/, "");
    if (!WEBHOOK_RE.test(webhookUrl)) {
      throw new AdapterError("rejected", "That doesn't look like a Slack incoming webhook URL (https://hooks.slack.com/services/…)");
    }
    // Verify without posting: an empty payload on a live webhook returns 400 "no_text"/"invalid_payload".
    const res = await request(webhookUrl, { method: "POST", json: {}, label: LABEL, idempotent: true });
    const body = await readBody(res);
    const live = res.status === 400 && typeof body === "string" && /no_text|invalid_payload|missing_text/.test(body);
    if (!live && !res.ok) throw httpError(res, body, LABEL, classifySlack);

    const channelName = fields.channelName?.trim();
    return [
      {
        network: NETWORK,
        externalId: shortHash(webhookUrl),
        name: channelName || "Slack channel",
        credentials: { webhookUrl },
        extras: { channelName: channelName ?? null },
      },
    ];
  },

  async refresh() {
    return null;
  },

  validate: (post) => validateForNetwork(NETWORK, post),
  publish,

  async delete() {
    throw new AdapterError("rejected", "Slack incoming webhooks can't delete messages; remove it in Slack manually");
  },
};
