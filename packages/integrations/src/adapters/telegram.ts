import {
  AdapterError,
  NETWORK_LIMITS,
  TELEGRAM_MEDIA_CAPTION_LIMIT,
  countCharacters,
  mediaKind,
  type ComposedPost,
  type ConnectTarget,
  type Credentials,
  type NetworkAdapter,
  type PublishResult,
} from "@postline/core";
import { downloadMedia, fetchJson, toBlob, type HttpOptions, type StatusClassifier } from "../http";
import { validateForNetwork } from "../rules";
import { assertValid, credString, maxBytesFor, requireCred, requireField } from "../util";

const NETWORK = "TELEGRAM" as const;
const LABEL = "Telegram";
const API = "https://api.telegram.org";

interface TgResponse<T> {
  ok: boolean;
  result: T;
  description?: string;
}
interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
}
interface TgUser {
  id: number;
  username?: string;
  first_name: string;
}
interface TgMessage {
  message_id: number;
  chat: TgChat;
}

const AUTH_HINTS = ["chat not found", "not enough rights", "need administrator rights", "bot is not a member", "bot was kicked"];

export const classifyTelegram: StatusClassifier = (status, body) => {
  if (status === 401 || status === 403) return "auth";
  const desc = body && typeof body === "object" ? String((body as { description?: unknown }).description ?? "") : "";
  if (status === 400 && AUTH_HINTS.some((h) => desc.toLowerCase().includes(h))) return "auth";
  return undefined;
};

function tg(botToken: string) {
  return async <T>(method: string, opts: HttpOptions): Promise<T> => {
    const r = await fetchJson<TgResponse<T>>(`${API}/bot${botToken}/${method}`, {
      method: "POST",
      label: LABEL,
      classify: classifyTelegram,
      ...opts,
    });
    if (!r?.ok) throw new AdapterError("rejected", `${LABEL}: ${r?.description ?? "request failed"}`, { body: r });
    return r.result;
  };
}

/** externalId = "chatId:msgId[,msgId…]" so delete can remove every message we sent. */
export function encodeTelegramId(chatId: string | number, messageIds: number[]): string {
  return `${chatId}:${messageIds.join(",")}`;
}

export function decodeTelegramId(externalId: string): { chatId: string; messageIds: number[] } {
  const idx = externalId.lastIndexOf(":");
  const chatId = externalId.slice(0, idx);
  const messageIds = externalId
    .slice(idx + 1)
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  if (idx <= 0 || !chatId || messageIds.length === 0) throw new AdapterError("rejected", `Invalid Telegram post id: ${externalId}`);
  return { chatId, messageIds };
}

export function telegramMessageUrl(chatId: string, username: string | undefined, messageId: number): string {
  if (username) return `https://t.me/${username}/${messageId}`;
  if (chatId.startsWith("-100")) return `https://t.me/c/${chatId.slice(4)}/${messageId}`;
  return "";
}

async function publish(post: ComposedPost, credentials: Credentials): Promise<PublishResult> {
  assertValid(NETWORK, post);
  const call = tg(requireCred(credentials, "botToken", NETWORK));
  const chatId = requireCred(credentials, "chatId", NETWORK);
  const caption = post.caption.trim();
  const captionFits = countCharacters(NETWORK, caption) <= TELEGRAM_MEDIA_CAPTION_LIMIT;
  const silent = post.options.silent === true;
  const ids: number[] = [];
  let chat: TgChat | undefined;

  const send = async (method: string, form: FormData): Promise<TgMessage[]> => {
    form.append("chat_id", chatId);
    if (silent) form.append("disable_notification", "true");
    const r = await call<TgMessage | TgMessage[]>(method, { body: form, timeoutMs: 120_000 });
    return Array.isArray(r) ? r : [r];
  };
  const record = (msgs: TgMessage[]) => {
    for (const m of msgs) {
      ids.push(m.message_id);
      chat ??= m.chat;
    }
  };

  if (post.media.length > 0) {
    const files = [];
    for (const [i, m] of post.media.entries()) {
      files.push({ item: m, dl: await downloadMedia(m.url, { maxBytes: maxBytesFor(NETWORK, m), mimeHint: m.mime, index: i }) });
    }
    const withCaption = captionFits && caption ? caption : undefined;
    const form = new FormData();
    const only = files.length === 1 ? files[0] : undefined;
    if (only) {
      const isVideo = mediaKind(only.item) === "video";
      form.append(isVideo ? "video" : "photo", toBlob(only.dl), only.dl.filename);
      if (isVideo) form.append("supports_streaming", "true");
      if (withCaption) form.append("caption", withCaption);
      record(await send(isVideo ? "sendVideo" : "sendPhoto", form));
    } else {
      const media = files.map((f, i) => {
        form.append(`file${i}`, toBlob(f.dl), f.dl.filename);
        return {
          type: mediaKind(f.item) === "video" ? "video" : "photo",
          media: `attach://file${i}`,
          ...(i === 0 && withCaption ? { caption: withCaption } : {}),
        };
      });
      form.append("media", JSON.stringify(media));
      record(await send("sendMediaGroup", form));
    }
  }

  if (caption && (post.media.length === 0 || !captionFits)) {
    const form = new FormData();
    form.append("text", caption);
    if (post.options.disableLinkPreview === true) form.append("link_preview_options", JSON.stringify({ is_disabled: true }));
    record(await send("sendMessage", form));
  }

  const first = ids[0];
  if (first === undefined) throw new AdapterError("rejected", "Nothing to publish");
  const username = chat?.username ?? credString(credentials, "chatUsername");
  const resolvedChatId = chat ? String(chat.id) : chatId;
  return {
    externalId: encodeTelegramId(resolvedChatId, ids),
    url: telegramMessageUrl(resolvedChatId, username, first),
    partIds: ids.map(String),
  };
}

export const telegramAdapter: NetworkAdapter = {
  network: NETWORK,
  limits: NETWORK_LIMITS.TELEGRAM,
  connectKind: "credentials",
  credentialFields: [
    {
      name: "botToken",
      label: "Bot token",
      type: "password",
      placeholder: "123456789:AA…",
      help: "Create a bot with @BotFather and paste its token. Add the bot to your channel/group as an admin allowed to post.",
      required: true,
    },
    {
      name: "chatId",
      label: "Channel or chat",
      type: "text",
      placeholder: "@mychannel or -1001234567890",
      help: "Public channels: @username. Private chats: the numeric id (starts with -100).",
      required: true,
    },
  ],

  async connectWithCredentials(fields): Promise<ConnectTarget[]> {
    const botToken = requireField(fields, "botToken", "Bot token");
    let chatIdInput = requireField(fields, "chatId", "Chat id");
    const tme = /^(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]{4,})\/?$/.exec(chatIdInput);
    if (tme?.[1]) chatIdInput = `@${tme[1]}`;
    if (!/^-?\d+$/.test(chatIdInput) && !chatIdInput.startsWith("@")) chatIdInput = `@${chatIdInput}`;

    const call = tg(botToken);
    const me = await call<TgUser>("getMe", { json: {}, idempotent: true });
    const chat = await call<TgChat>("getChat", { json: { chat_id: chatIdInput }, idempotent: true });
    if (chat.type === "channel") {
      const member = await call<{ status: string; can_post_messages?: boolean }>("getChatMember", {
        json: { chat_id: chat.id, user_id: me.id },
        idempotent: true,
      });
      const ok = member.status === "creator" || (member.status === "administrator" && member.can_post_messages !== false);
      if (!ok) {
        throw new AdapterError("rejected", `@${me.username ?? me.first_name} must be an admin of this channel with permission to post messages`);
      }
    }
    const chatId = String(chat.id);
    return [
      {
        network: NETWORK,
        externalId: chatId,
        name: chat.title ?? chat.first_name ?? chat.username ?? chatId,
        username: chat.username,
        credentials: { botToken, chatId, ...(chat.username ? { chatUsername: chat.username } : {}) },
        extras: { chatType: chat.type, chatUsername: chat.username ?? null, botUsername: me.username ?? null },
      },
    ];
  },

  /** Bot tokens don't expire. */
  async refresh() {
    return null;
  },

  validate: (post) => validateForNetwork(NETWORK, post),
  publish,

  async delete(externalId, credentials, _channelExtras, partIds) {
    const decoded = decodeTelegramId(externalId);
    const chatId = decoded.chatId;
    const extra = (partIds ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    const messageIds = [...new Set([...decoded.messageIds, ...extra])];
    const call = tg(requireCred(credentials, "botToken", NETWORK));
    try {
      await call<boolean>("deleteMessages", { json: { chat_id: chatId, message_ids: messageIds }, idempotent: true });
    } catch (err) {
      const desc = err instanceof AdapterError ? err.message.toLowerCase() : "";
      if (desc.includes("message to delete not found")) return;
      if (desc.includes("message can't be deleted")) {
        throw new AdapterError("rejected", "Telegram only lets bots delete messages sent in the last 48 hours");
      }
      throw err;
    }
  },
};
