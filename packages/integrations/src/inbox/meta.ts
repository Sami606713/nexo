// OWNED BY: inbox agent. Facebook Page & Instagram inbox via the Graph API.
// Code-complete, but it only works once the Meta app passes review (pages_messaging, pages_read_engagement,
// pages_manage_engagement, instagram_manage_messages, instagram_manage_comments). Not registered without META_APP_ID.
import { AdapterError, type Credentials } from "@postline/core";
import { fetchJson, type HttpOptions, type StatusClassifier } from "../http";
import { requireCred } from "../util";
import { excerpt, type InboxChannelExtras, type InboxItem, type InboxProvider } from "./types";

export const GRAPH = "https://graph.facebook.com/v21.0";
const POSTS_TO_SCAN = 10;

/** Graph error codes 190 (token) / 10, 200-299 (permission) → reconnect. */
const classify: StatusClassifier = (_status, body) => {
  const code = (body as { error?: { code?: number } } | undefined)?.error?.code;
  if (code === 190 || code === 102) return "auth";
  if (code === 4 || code === 17 || code === 32 || code === 613) return "rate_limit";
  return undefined;
};

function graph(c: Credentials, label: string) {
  const token = requireCred(c, "accessToken", label === "Instagram" ? "INSTAGRAM" : "FACEBOOK");
  return <T>(path: string, params: Record<string, string> = {}, o: HttpOptions = {}) => {
    const qs = new URLSearchParams({ ...params, access_token: token });
    return fetchJson<T>(`${GRAPH}${path}?${qs}`, { label, classify, ...o });
  };
}

interface Paged<T> {
  data: T[];
}
interface GraphFrom {
  id: string;
  name?: string;
  username?: string;
  picture?: { data?: { url?: string } };
}
interface GraphMessage {
  id: string;
  message?: string;
  created_time: string;
  from?: GraphFrom;
}
interface GraphConversation {
  id: string;
  updated_time?: string;
  messages?: Paged<GraphMessage>;
}
interface FbComment {
  id: string;
  message?: string;
  created_time: string;
  from?: GraphFrom;
  parent?: { id: string };
}
interface IgComment {
  id: string;
  text?: string;
  timestamp: string;
  username?: string;
  from?: { id: string; username?: string };
  replies?: Paged<IgComment>;
}

function accountId(extras: InboxChannelExtras, keys: string[]): string {
  for (const k of keys) {
    const v = extras[k];
    if (typeof v === "string" && v) return v;
  }
  throw new AdapterError("auth", "Channel is missing its Meta account id; reconnect it");
}

const after = (since: Date | undefined, t: string) => !since || new Date(t) >= since;

/** Map one conversation's messages (exported for tests). */
export function mapConversation(conv: GraphConversation, selfId: string, since?: Date): InboxItem[] {
  const msgs = conv.messages?.data ?? [];
  const other = msgs.find((m) => m.from && m.from.id !== selfId)?.from;
  return msgs
    .filter((m) => after(since, m.created_time) && m.message)
    .map((m) => {
      const out = m.from?.id === selfId;
      return {
        kind: "DM" as const,
        conversationExternalId: conv.id,
        messageExternalId: m.id,
        text: m.message ?? "",
        authorName: (out ? m.from?.name : other?.name ?? other?.username) || "Instagram user",
        authorHandle: other?.username,
        authorAvatar: other?.picture?.data?.url,
        createdAt: new Date(m.created_time),
        direction: out ? ("OUT" as const) : ("IN" as const),
      };
    });
}

async function fetchFacebook(c: Credentials, extras: InboxChannelExtras, since?: Date): Promise<InboxItem[]> {
  const g = graph(c, "Facebook");
  const pageId = accountId(extras, ["pageId", "externalId"]);
  const sinceUnix = since ? String(Math.floor(since.getTime() / 1000)) : undefined;
  const items: InboxItem[] = [];

  const convs = await g<Paged<GraphConversation>>(`/${pageId}/conversations`, {
    fields: "id,updated_time,messages.limit(20){id,message,from,created_time}",
    limit: "25",
  });
  for (const conv of convs.data) {
    if (since && conv.updated_time && new Date(conv.updated_time) < since) continue;
    items.push(...mapConversation(conv, pageId, since));
  }

  const posts = await g<Paged<{ id: string; message?: string }>>(`/${pageId}/published_posts`, {
    fields: "id,message",
    limit: String(POSTS_TO_SCAN),
  });
  for (const post of posts.data) {
    const comments = await g<Paged<FbComment>>(`/${post.id}/comments`, {
      fields: "id,message,created_time,from{id,name,picture},parent{id}",
      filter: "stream",
      order: "reverse_chronological",
      limit: "50",
      ...(sinceUnix ? { since: sinceUnix } : {}),
    });
    for (const cm of comments.data) {
      if (!after(since, cm.created_time) || !cm.message) continue;
      const out = cm.from?.id === pageId;
      items.push({
        kind: "COMMENT",
        conversationExternalId: cm.parent?.id ?? cm.id,
        messageExternalId: cm.id,
        text: cm.message,
        authorName: cm.from?.name ?? "Facebook user",
        authorAvatar: cm.from?.picture?.data?.url,
        createdAt: new Date(cm.created_time),
        postExternalId: post.id,
        postExcerpt: excerpt(post.message),
        direction: out ? "OUT" : "IN",
      });
    }
  }

  const tagged = await g<Paged<{ id: string; message?: string; created_time: string; from?: GraphFrom; permalink_url?: string }>>(
    `/${pageId}/tagged`,
    { fields: "id,message,created_time,from,permalink_url", limit: "25", ...(sinceUnix ? { since: sinceUnix } : {}) },
  );
  for (const t of tagged.data) {
    if (!after(since, t.created_time)) continue;
    items.push({
      kind: "MENTION",
      conversationExternalId: t.id,
      messageExternalId: t.id,
      text: t.message ?? "",
      authorName: t.from?.name ?? "Facebook user",
      createdAt: new Date(t.created_time),
      postExternalId: t.id,
      url: t.permalink_url,
    });
  }
  return items;
}

/** Map IG comments (with nested replies) on one media (exported for tests). */
export function mapIgComments(media: { id: string; caption?: string }, comments: IgComment[], selfId: string, since?: Date): InboxItem[] {
  const out: InboxItem[] = [];
  const push = (cm: IgComment, threadId: string) => {
    if (!after(since, cm.timestamp) || !cm.text) return;
    const handle = cm.username ?? cm.from?.username;
    out.push({
      kind: "COMMENT",
      conversationExternalId: threadId,
      messageExternalId: cm.id,
      text: cm.text,
      authorName: handle ?? "Instagram user",
      authorHandle: handle,
      createdAt: new Date(cm.timestamp),
      postExternalId: media.id,
      postExcerpt: excerpt(media.caption),
      direction: cm.from?.id === selfId ? "OUT" : "IN",
    });
  };
  for (const cm of comments) {
    push(cm, cm.id);
    for (const r of cm.replies?.data ?? []) push(r, cm.id);
  }
  return out;
}

async function fetchInstagram(c: Credentials, extras: InboxChannelExtras, since?: Date): Promise<InboxItem[]> {
  const g = graph(c, "Instagram");
  const igId = accountId(extras, ["igUserId", "externalId"]);
  const items: InboxItem[] = [];

  const convs = await g<Paged<GraphConversation>>(`/${igId}/conversations`, {
    platform: "instagram",
    fields: "id,updated_time,messages.limit(20){id,message,from,created_time}",
    limit: "25",
  });
  for (const conv of convs.data) {
    if (since && conv.updated_time && new Date(conv.updated_time) < since) continue;
    items.push(...mapConversation(conv, igId, since));
  }

  const media = await g<Paged<{ id: string; caption?: string }>>(`/${igId}/media`, { fields: "id,caption,timestamp", limit: String(POSTS_TO_SCAN) });
  for (const m of media.data) {
    const comments = await g<Paged<IgComment>>(`/${m.id}/comments`, {
      fields: "id,text,username,timestamp,from{id,username},replies{id,text,username,timestamp,from{id,username}}",
      limit: "50",
    });
    items.push(...mapIgComments(m, comments.data, igId, since));
  }

  const tags = await g<Paged<{ id: string; caption?: string; username?: string; timestamp: string; permalink?: string }>>(`/${igId}/tags`, {
    fields: "id,caption,username,timestamp,permalink",
    limit: "25",
  });
  for (const t of tags.data) {
    if (!after(since, t.timestamp)) continue;
    items.push({
      kind: "MENTION",
      conversationExternalId: t.id,
      messageExternalId: t.id,
      text: t.caption ?? "",
      authorName: t.username ?? "Instagram user",
      authorHandle: t.username,
      createdAt: new Date(t.timestamp),
      postExternalId: t.id,
      url: t.permalink,
    });
  }
  return items;
}

async function sendDm(c: Credentials, label: "Facebook" | "Instagram", selfId: string, conversationId: string, text: string) {
  const g = graph(c, label);
  const conv = await g<{ participants?: Paged<{ id: string }> }>(`/${conversationId}`, {
    fields: "participants",
    ...(label === "Instagram" ? { platform: "instagram" } : {}),
  });
  const recipient = conv.participants?.data.find((p) => p.id !== selfId)?.id;
  if (!recipient) throw new AdapterError("rejected", "Couldn't find who to reply to in this conversation");
  const r = await g<{ message_id: string }>(`/${selfId}/messages`, {}, {
    method: "POST",
    json: { recipient: { id: recipient }, messaging_type: "RESPONSE", message: { text } },
  });
  return { externalId: r.message_id };
}

export const facebookInbox: InboxProvider = {
  network: "FACEBOOK",
  fetch: fetchFacebook,
  async reply(c, extras, target, text) {
    const pageId = accountId(extras, ["pageId", "externalId"]);
    if (target.kind === "DM") return sendDm(c, "Facebook", pageId, target.conversationExternalId, text);
    // Comments: reply under the top-level comment. Mentions: comment on the post that tagged us.
    const on = target.kind === "COMMENT" ? target.conversationExternalId : (target.postExternalId ?? target.externalId);
    const r = await graph(c, "Facebook")<{ id: string }>(`/${on}/comments`, {}, { method: "POST", json: { message: text } });
    return { externalId: r.id };
  },
};

export const instagramInbox: InboxProvider = {
  network: "INSTAGRAM",
  fetch: fetchInstagram,
  async reply(c, extras, target, text) {
    const igId = accountId(extras, ["igUserId", "externalId"]);
    if (target.kind === "DM") return sendDm(c, "Instagram", igId, target.conversationExternalId, text);
    const g = graph(c, "Instagram");
    if (target.kind === "COMMENT") {
      const r = await g<{ id: string }>(`/${target.conversationExternalId}/replies`, {}, { method: "POST", json: { message: text } });
      return { externalId: r.id };
    }
    const r = await g<{ id: string }>(`/${igId}/mentions`, {}, {
      method: "POST",
      json: { media_id: target.postExternalId ?? target.externalId, message: text },
    });
    return { externalId: r.id };
  },
};
