// Inbox for channels connected through Composio. Composio holds the tokens: reads go through its proxy (the
// network's own API with the account's auth injected) or its tools where those handle extra auth (Facebook Page tokens).
//
// Verified live (Oct 2026): Instagram (comments + DMs, Instagram Login API) and YouTube (comment threads; the managed
// app has youtube.force-ssl, so replies work). Facebook, Reddit and Slack follow their documented APIs but weren't
// tested against a live account. LinkedIn is not offered: its API refuses comment reads for normal apps
// (socialActions / posts FINDER need partner access).
import { AdapterError, type Credentials, type Network } from "@postline/core";
import { findArray, findString, proxy, run, unwrap, type ComposioCredentials } from "../composio/adapter";
import { mapConversation, mapIgComments } from "./meta";
import { excerpt, htmlToText, type InboxItem, type InboxProvider } from "./types";

const cred = (c: Credentials) => c as ComposioCredentials;
const after = (since: Date | undefined, t: string | number | Date) => !since || new Date(t) >= since;
/** Only re-read posts/videos that can still get new comments cheaply. */
const POSTS_TO_SCAN = 10;

async function get<T>(c: Credentials, label: string, endpoint: string): Promise<T> {
  return (await proxy(c, label, { endpoint, method: "GET" })).data as T;
}

async function post<T>(c: Credentials, label: string, endpoint: string, body: unknown): Promise<T> {
  return (await proxy(c, label, { endpoint, method: "POST", body })).data as T;
}

interface Paged<T> {
  data?: T[];
}

/* ───────────── Instagram (Instagram API with Instagram Login: graph.instagram.com) ───────────── */

const IG = "https://graph.instagram.com/v21.0";

interface IgFrom {
  id: string;
  username?: string;
}
interface IgMessage {
  id: string;
  message?: string;
  from?: IgFrom;
  created_time: string;
}
interface IgConversation {
  id: string;
  updated_time?: string;
  participants?: Paged<IgFrom>;
  messages?: Paged<IgMessage>;
}

async function igSelf(c: Credentials) {
  const me = await get<{ id?: string; user_id?: string; username?: string }>(c, "Instagram account", `${IG}/me?fields=id,user_id,username`);
  // DMs and comments identify the account by its Instagram user id; /me returns an app-scoped id too.
  return { ids: new Set([me.id, me.user_id, cred(c).igUserId].filter(Boolean) as string[]), username: me.username ?? (cred(c).username as string | undefined) };
}

const instagram: InboxProvider = {
  network: "INSTAGRAM",
  async fetch(c, _extras, since) {
    const self = await igSelf(c);
    const isSelf = (f?: IgFrom) => !!f && (self.ids.has(f.id) || (!!self.username && f.username === self.username));
    const items: InboxItem[] = [];

    const convs = await get<Paged<IgConversation>>(
      c,
      "Instagram messages",
      `${IG}/me/conversations?platform=instagram&fields=id,updated_time,participants,messages.limit(20){id,message,from,created_time}&limit=25`,
    );
    for (const conv of convs.data ?? []) {
      if (since && conv.updated_time && new Date(conv.updated_time) < since) continue;
      const other = conv.participants?.data?.find((p) => !isSelf(p)) ?? conv.messages?.data?.find((m) => !isSelf(m.from))?.from;
      for (const m of conv.messages?.data ?? []) {
        if (!m.message || !after(since, m.created_time)) continue;
        const out = isSelf(m.from);
        items.push({
          kind: "DM",
          conversationExternalId: conv.id,
          messageExternalId: m.id,
          text: m.message,
          authorName: (out ? self.username : other?.username) ?? "Instagram user",
          authorHandle: other?.username,
          createdAt: new Date(m.created_time),
          direction: out ? "OUT" : "IN",
        });
      }
    }

    const media = await get<Paged<{ id: string; caption?: string; comments_count?: number; permalink?: string }>>(
      c,
      "Instagram posts",
      `${IG}/me/media?fields=id,caption,comments_count,permalink&limit=${POSTS_TO_SCAN}`,
    );
    for (const m of media.data ?? []) {
      if (!m.comments_count) continue;
      const comments = await get<Paged<Parameters<typeof mapIgComments>[1][number]>>(
        c,
        "Instagram comments",
        `${IG}/${m.id}/comments?fields=id,text,username,timestamp,from{id,username},replies{id,text,username,timestamp,from{id,username}}&limit=50`,
      );
      for (const item of mapIgComments(m, comments.data ?? [], [...self.ids][0] ?? "", since)) {
        if (self.username && item.authorHandle === self.username) item.direction = "OUT";
        items.push({ ...item, url: m.permalink });
      }
    }
    return items;
  },

  async reply(c, _extras, target, text) {
    if (target.kind === "DM") {
      const self = await igSelf(c);
      const conv = await get<IgConversation>(c, "Instagram conversation", `${IG}/${target.conversationExternalId}?fields=participants`);
      const recipient = conv.participants?.data?.find((p) => !self.ids.has(p.id) && p.username !== self.username)?.id;
      if (!recipient) throw new AdapterError("rejected", "Couldn't find who to reply to in this conversation");
      const r = await post<{ message_id?: string }>(c, "Instagram reply", `${IG}/me/messages`, { recipient: { id: recipient }, message: { text } });
      return { externalId: r.message_id ?? `sent:${Date.now()}` };
    }
    // Comments: reply under the top-level comment of the thread.
    const r = await post<{ id: string }>(c, "Instagram reply", `${IG}/${target.conversationExternalId}/replies`, { message: text });
    return { externalId: r.id };
  },
};

/* ───────────── YouTube (Data API v3) ───────────── */

const YT = "https://www.googleapis.com/youtube/v3";

interface YtComment {
  id: string;
  snippet: {
    videoId?: string;
    textOriginal?: string;
    textDisplay?: string;
    authorDisplayName?: string;
    authorProfileImageUrl?: string;
    authorChannelUrl?: string;
    authorChannelId?: { value?: string };
    publishedAt: string;
  };
}
interface YtThread {
  id: string;
  snippet: { videoId?: string; topLevelComment: YtComment };
  replies?: { comments?: YtComment[] };
}

const ytChannelIds = new Map<string, string>();
async function ytChannelId(c: Credentials): Promise<string> {
  const key = cred(c).composioAccountId;
  const cached = ytChannelIds.get(key);
  if (cached) return cached;
  const r = await get<{ items?: { id: string }[] }>(c, "YouTube channel", `${YT}/channels?part=id&mine=true`);
  const id = r.items?.[0]?.id;
  if (!id) throw new AdapterError("rejected", "This Google account has no YouTube channel");
  ytChannelIds.set(key, id);
  return id;
}

/** Map comment threads to inbox items (exported for tests). */
export function mapYtThreads(threads: YtThread[], channelId: string, titles: Map<string, string>, since?: Date): InboxItem[] {
  const out: InboxItem[] = [];
  for (const t of threads) {
    const videoId = t.snippet.videoId ?? t.snippet.topLevelComment.snippet.videoId;
    for (const cm of [t.snippet.topLevelComment, ...(t.replies?.comments ?? [])]) {
      const s = cm.snippet;
      if (!after(since, s.publishedAt)) continue;
      const text = s.textOriginal ?? htmlToText(s.textDisplay ?? "");
      if (!text) continue;
      const handle = s.authorChannelUrl?.split("/").pop();
      out.push({
        kind: "COMMENT",
        conversationExternalId: t.id,
        messageExternalId: cm.id,
        text,
        authorName: s.authorDisplayName ?? "YouTube user",
        authorHandle: handle?.startsWith("@") ? handle.slice(1) : undefined,
        authorAvatar: s.authorProfileImageUrl,
        createdAt: new Date(s.publishedAt),
        postExternalId: videoId,
        postExcerpt: videoId ? titles.get(videoId) : undefined,
        url: videoId ? `https://www.youtube.com/watch?v=${videoId}&lc=${cm.id}` : undefined,
        direction: s.authorChannelId?.value === channelId ? "OUT" : "IN",
      });
    }
  }
  return out;
}

const youtube: InboxProvider = {
  network: "YOUTUBE",
  async fetch(c, _extras, since) {
    const channelId = await ytChannelId(c);
    const r = await get<{ items?: YtThread[] }>(
      c,
      "YouTube comments",
      `${YT}/commentThreads?part=snippet,replies&allThreadsRelatedToChannelId=${channelId}&order=time&maxResults=50&textFormat=plainText`,
    );
    const threads = r.items ?? [];
    const videoIds = [...new Set(threads.map((t) => t.snippet.videoId).filter(Boolean) as string[])].slice(0, 50);
    const titles = new Map<string, string>();
    if (videoIds.length) {
      const v = await get<{ items?: { id: string; snippet?: { title?: string } }[] }>(c, "YouTube videos", `${YT}/videos?part=snippet&id=${videoIds.join(",")}`);
      for (const it of v.items ?? []) if (it.snippet?.title) titles.set(it.id, it.snippet.title);
    }
    return mapYtThreads(threads, channelId, titles, since);
  },

  async reply(c, _extras, target, text) {
    // A thread's id is its top-level comment's id, which is the parent for replies.
    const r = await post<{ id: string }>(c, "YouTube reply", `${YT}/comments?part=snippet`, {
      snippet: { parentId: target.conversationExternalId, textOriginal: text },
    });
    return { externalId: r.id };
  },
};

/* ───────────── Facebook Page (Composio tools; they handle the Page access token) ───────────── */

function pageIdOf(c: Credentials): string {
  const id = cred(c).pageId;
  if (!id) throw new AdapterError("auth", "Facebook Page is unknown — reconnect this channel");
  return id;
}

const facebook: InboxProvider = {
  network: "FACEBOOK",
  async fetch(c, _extras, since) {
    const pageId = pageIdOf(c);
    const items: InboxItem[] = [];

    const convs = findArray(
      await run(c, "FACEBOOK_GET_PAGE_CONVERSATIONS", { page_id: pageId, fields: "id,updated_time,messages.limit(20){id,message,from,created_time}", limit: 25 }, "Facebook messages"),
      ["data", "conversations"],
    ) as unknown as Parameters<typeof mapConversation>[0][];
    for (const conv of convs) {
      if (since && conv.updated_time && new Date(conv.updated_time) < since) continue;
      items.push(...mapConversation(conv, pageId, since));
    }

    const posts = findArray(await run(c, "FACEBOOK_GET_PAGE_POSTS", { page_id: pageId, fields: "id,message", limit: POSTS_TO_SCAN }, "Facebook posts"), ["data", "posts"]);
    for (const p of posts) {
      const postId = String(p.id);
      const comments = findArray(
        await run(
          c,
          "FACEBOOK_GET_COMMENTS",
          { object_id: postId, fields: "id,message,created_time,from{id,name,picture},parent{id}", filter: "stream", order: "reverse_chronological", limit: 50 },
          "Facebook comments",
        ),
        ["data", "comments"],
      );
      for (const cm of comments) {
        const created = String(cm.created_time ?? "");
        if (!cm.message || !created || !after(since, created)) continue;
        const from = (cm.from ?? {}) as { id?: string; name?: string; picture?: { data?: { url?: string } } };
        items.push({
          kind: "COMMENT",
          conversationExternalId: (cm.parent as { id?: string } | undefined)?.id ?? String(cm.id),
          messageExternalId: String(cm.id),
          text: String(cm.message),
          authorName: from.name ?? "Facebook user",
          authorAvatar: from.picture?.data?.url,
          createdAt: new Date(created),
          postExternalId: postId,
          postExcerpt: excerpt(typeof p.message === "string" ? p.message : undefined),
          direction: from.id === pageId ? "OUT" : "IN",
        });
      }
    }
    return items;
  },

  async reply(c, _extras, target, text) {
    const pageId = pageIdOf(c);
    if (target.kind === "DM") {
      const msgs = findArray(
        await run(c, "FACEBOOK_GET_CONVERSATION_MESSAGES", { conversation_id: target.conversationExternalId, fields: "id,from", limit: 25 }, "Facebook conversation"),
        ["data", "messages"],
      );
      const recipient = msgs.map((m) => (m.from as { id?: string } | undefined)?.id).find((id) => id && id !== pageId);
      if (!recipient) throw new AdapterError("rejected", "Couldn't find who to reply to in this conversation");
      const r = await run(c, "FACEBOOK_SEND_MESSAGE", { page_id: pageId, recipient_id: recipient, message_text: text, messaging_type: "RESPONSE" }, "Facebook reply");
      return { externalId: findString(unwrap(r), ["message_id", "id"]) ?? `sent:${Date.now()}` };
    }
    const on = target.kind === "COMMENT" ? target.conversationExternalId : (target.postExternalId ?? target.externalId);
    const r = await run(c, "FACEBOOK_CREATE_COMMENT", { object_id: on, message: text }, "Facebook reply");
    return { externalId: findString(unwrap(r), ["id"]) ?? `sent:${Date.now()}` };
  },
};

/* ───────────── Reddit (inbox: replies to your posts/comments, mentions, private messages) ───────────── */

interface RedditThing {
  kind: string;
  data: {
    name: string;
    author?: string;
    body?: string;
    subject?: string;
    created_utc: number;
    was_comment?: boolean;
    context?: string;
    link_title?: string;
    first_message_name?: string | null;
  };
}

/** Map /message/inbox children to inbox items (exported for tests). */
export function mapRedditInbox(children: RedditThing[], since?: Date): InboxItem[] {
  const out: InboxItem[] = [];
  for (const { kind, data: d } of children) {
    const createdAt = new Date(d.created_utc * 1000);
    if (!d.body || !after(since, createdAt)) continue;
    const author = d.author ?? "[deleted]";
    if (kind === "t1" && d.was_comment) {
      const postId = d.context?.match(/\/comments\/([a-z0-9]+)\//i)?.[1];
      out.push({
        // Each reply is answered on its own, so it is its own thread.
        kind: d.subject?.toLowerCase().includes("mention") ? "MENTION" : "COMMENT",
        conversationExternalId: d.name,
        messageExternalId: d.name,
        text: d.body,
        authorName: author,
        authorHandle: author,
        createdAt,
        postExternalId: postId ? `t3_${postId}` : undefined,
        postExcerpt: excerpt(d.link_title),
        url: d.context ? `https://www.reddit.com${d.context}` : undefined,
      });
    } else if (kind === "t4") {
      out.push({
        kind: "DM",
        conversationExternalId: d.first_message_name ?? d.name,
        messageExternalId: d.name,
        text: d.body,
        authorName: author,
        authorHandle: author,
        createdAt,
      });
    }
  }
  return out;
}

const reddit: InboxProvider = {
  network: "REDDIT",
  async fetch(c, _extras, since) {
    const r = await get<{ data?: { children?: RedditThing[] } }>(c, "Reddit inbox", "https://oauth.reddit.com/message/inbox?limit=50&raw_json=1");
    return mapRedditInbox(r.data?.children ?? [], since);
  },
  async reply(c, _extras, target, text) {
    // /api/comment answers comments (t1_) and private messages (t4_) alike.
    const r = await run(c, "REDDIT_POST_REDDIT_COMMENT", { thing_id: target.externalId, text }, "Reddit reply");
    return { externalId: findString(unwrap(r), ["name", "id"]) ?? `sent:${Date.now()}` };
  },
};

/* ───────────── Slack (messages in the connected channel, grouped by thread) ───────────── */

interface SlackMessage {
  ts: string;
  text?: string;
  user?: string;
  username?: string;
  bot_id?: string;
  subtype?: string;
  thread_ts?: string;
  reply_count?: number;
  user_profile?: { real_name?: string; display_name?: string; image_72?: string };
}

const slackSelf = new Map<string, string>();
async function slackUserId(c: Credentials): Promise<string | undefined> {
  const key = cred(c).composioAccountId;
  if (slackSelf.has(key)) return slackSelf.get(key);
  try {
    const r = await get<{ user_id?: string }>(c, "Slack identity", "https://slack.com/api/auth.test");
    if (r.user_id) slackSelf.set(key, r.user_id);
    return r.user_id;
  } catch {
    return undefined;
  }
}

/** Map Slack messages (exported for tests). Thread root ts is the conversation id. */
export function mapSlackMessages(messages: SlackMessage[], channel: string, selfId: string | undefined, since?: Date): InboxItem[] {
  const out: InboxItem[] = [];
  for (const m of messages) {
    if (m.subtype && m.subtype !== "thread_broadcast" && m.subtype !== "bot_message") continue;
    const createdAt = new Date(Number(m.ts) * 1000);
    if (!m.text || !after(since, createdAt)) continue;
    const name = m.user_profile?.display_name || m.user_profile?.real_name || m.username || m.user || "Slack user";
    out.push({
      kind: "COMMENT",
      conversationExternalId: m.thread_ts ?? m.ts,
      messageExternalId: m.ts,
      text: m.text,
      authorName: name,
      authorHandle: m.user,
      authorAvatar: m.user_profile?.image_72,
      createdAt,
      postExternalId: `${channel}:${m.thread_ts ?? m.ts}`,
      direction: (selfId && m.user === selfId) || (!!m.bot_id && !m.user) ? "OUT" : "IN",
    });
  }
  return out;
}

const slack: InboxProvider = {
  network: "SLACK",
  async fetch(c, _extras, since) {
    const channel = cred(c).slackChannelId;
    if (!channel) throw new AdapterError("auth", "Slack channel is unknown — reconnect this channel");
    const oldest = since ? String(since.getTime() / 1000) : undefined;
    const selfId = await slackUserId(c);
    const history = findArray(
      await run(c, "SLACK_FETCH_CONVERSATION_HISTORY", { channel, limit: 50, ...(oldest ? { oldest } : {}) }, "Slack messages"),
      ["messages"],
    ) as unknown as SlackMessage[];
    const all = [...history];
    // Recent threads: pull their replies too (history only returns the thread roots).
    for (const root of history.filter((m) => (m.reply_count ?? 0) > 0).slice(0, 10)) {
      const replies = findArray(
        await run(c, "SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION", { channel, ts: root.ts, limit: 50, ...(oldest ? { oldest } : {}) }, "Slack thread"),
        ["messages"],
      ) as unknown as SlackMessage[];
      all.push(...replies.filter((r) => r.ts !== root.ts));
    }
    return mapSlackMessages(all, channel, selfId, since);
  },
  async reply(c, _extras, target, text) {
    const channel = cred(c).slackChannelId;
    if (!channel) throw new AdapterError("auth", "Slack channel is unknown — reconnect this channel");
    const r = await run(c, "SLACK_CHAT_POST_MESSAGE", { channel, markdown_text: text, thread_ts: target.conversationExternalId }, "Slack reply");
    return { externalId: findString(r, ["ts"]) ?? `sent:${Date.now()}` };
  },
};

/** Inbox providers for Composio channels, by network. */
export const COMPOSIO_INBOX: Partial<Record<Network, InboxProvider>> = {
  INSTAGRAM: instagram,
  YOUTUBE: youtube,
  FACEBOOK: facebook,
  REDDIT: reddit,
  SLACK: slack,
};
