import {
  AdapterError,
  NETWORK_LIMITS,
  type ComposedPost,
  type ConnectTarget,
  type Credentials,
  type NetworkAdapter,
  type PublishResult,
} from "@postline/core";
import { downloadMedia, fetchJson, toBlob, type StatusClassifier } from "../http";
import { validateForNetwork } from "../rules";
import { assertValid, maxBytesFor, requireCred, requireField } from "../util";

const NETWORK = "DISCORD" as const;
const LABEL = "Discord";
const WEBHOOK_RE =
  /^https:\/\/(?:(?:canary|ptb)\.)?(?:discord\.com|discordapp\.com)\/api(?:\/v\d+)?\/webhooks\/(\d+)\/([\w-]+)\/?$/;

interface Webhook {
  id: string;
  name?: string;
  avatar?: string | null;
  channel_id: string;
  guild_id?: string;
}
interface Message {
  id: string;
  channel_id: string;
}

/** Unknown Webhook (10015) / invalid token mean the webhook was deleted → reconnect. */
const classify: StatusClassifier = (status, body) => {
  if (status === 401 || status === 403) return "auth";
  const code = body && typeof body === "object" ? (body as { code?: unknown }).code : undefined;
  if (status === 404 && (code === 10015 || code === 50027)) return "auth";
  return undefined;
};

export function parseDiscordWebhook(url: string): { id: string; token: string; url: string } {
  const m = WEBHOOK_RE.exec(url.trim());
  if (!m?.[1] || !m[2]) throw new AdapterError("rejected", "That doesn't look like a Discord webhook URL (https://discord.com/api/webhooks/…)");
  return { id: m[1], token: m[2], url: `https://discord.com/api/webhooks/${m[1]}/${m[2]}` };
}

async function publish(post: ComposedPost, credentials: Credentials): Promise<PublishResult> {
  assertValid(NETWORK, post); // >2000 chars is an error for Discord: we never split.
  const hook = parseDiscordWebhook(requireCred(credentials, "webhookUrl", NETWORK));
  const allowMentions = post.options.allowMentions === true;
  const payload: Record<string, unknown> = {
    content: post.caption,
    allowed_mentions: allowMentions ? { parse: ["users", "roles", "everyone"] } : { parse: [] },
  };
  if (typeof post.options.username === "string" && post.options.username) payload.username = post.options.username;

  const form = new FormData();
  const attachments = [];
  for (const [i, m] of post.media.entries()) {
    const dl = await downloadMedia(m.url, { maxBytes: maxBytesFor(NETWORK, m), mimeHint: m.mime, index: i });
    form.append(`files[${i}]`, toBlob(dl), dl.filename);
    attachments.push({ id: i, filename: dl.filename, ...(m.alt ? { description: m.alt.slice(0, 1024) } : {}) });
  }
  if (attachments.length) payload.attachments = attachments;
  form.append("payload_json", JSON.stringify(payload));

  const msg = await fetchJson<Message>(`${hook.url}?wait=true`, {
    method: "POST",
    body: form,
    label: LABEL,
    classify,
    timeoutMs: 120_000,
  });
  const guildId = typeof credentials.guildId === "string" ? credentials.guildId : undefined;
  return {
    externalId: msg.id,
    url: guildId ? `https://discord.com/channels/${guildId}/${msg.channel_id}/${msg.id}` : "",
  };
}

export const discordAdapter: NetworkAdapter = {
  network: NETWORK,
  limits: NETWORK_LIMITS.DISCORD,
  connectKind: "webhook",
  credentialFields: [
    {
      name: "webhookUrl",
      label: "Webhook URL",
      type: "url",
      placeholder: "https://discord.com/api/webhooks/…",
      help: "Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.",
      required: true,
    },
  ],

  async connectWithCredentials(fields): Promise<ConnectTarget[]> {
    const hook = parseDiscordWebhook(requireField(fields, "webhookUrl", "Webhook URL"));
    const info = await fetchJson<Webhook>(hook.url, { label: LABEL, classify });
    return [
      {
        network: NETWORK,
        externalId: info.id,
        name: info.name ?? "Discord webhook",
        avatarUrl: info.avatar ? `https://cdn.discordapp.com/avatars/${info.id}/${info.avatar}.png` : undefined,
        credentials: { webhookUrl: hook.url, guildId: info.guild_id ?? null, channelId: info.channel_id },
        extras: { guildId: info.guild_id ?? null, channelId: info.channel_id },
      },
    ];
  },

  async refresh() {
    return null;
  },

  validate: (post) => validateForNetwork(NETWORK, post),
  publish,

  async delete(externalId, credentials) {
    const hook = parseDiscordWebhook(requireCred(credentials, "webhookUrl", NETWORK));
    try {
      await fetchJson(`${hook.url}/messages/${encodeURIComponent(externalId)}`, { method: "DELETE", label: LABEL, classify });
    } catch (err) {
      // Unknown Message (10008) → already deleted.
      const code = err instanceof AdapterError ? (err.details?.body as { code?: unknown } | undefined)?.code : undefined;
      if (code === 10008) return;
      throw err;
    }
  },
};
