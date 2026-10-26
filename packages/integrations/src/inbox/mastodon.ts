// OWNED BY: inbox agent. Mastodon inbox: mentions (incl. replies and direct messages) via /api/v1/notifications.
import { randomUUID } from "node:crypto";
import type { Credentials } from "@postline/core";
import { fetchJson, type HttpOptions, type StatusClassifier } from "../http";
import { requireCred, trimSlash } from "../util";
import { excerpt, htmlToText, type InboxItem, type InboxProvider } from "./types";

const LABEL = "Mastodon";
const MAX_PAGES = 5;

interface Account {
  id: string;
  acct: string;
  username: string;
  display_name?: string;
  avatar?: string;
}
interface Status {
  id: string;
  content: string;
  created_at: string;
  url?: string | null;
  uri: string;
  visibility: string;
  in_reply_to_id?: string | null;
  in_reply_to_account_id?: string | null;
  account: Account;
}
export interface MastoNotification {
  id: string;
  type: string;
  created_at: string;
  account: Account;
  status?: Status;
}

const classify: StatusClassifier = (status) => (status === 403 ? "auth" : undefined);

function api(c: Credentials) {
  const base = trimSlash(requireCred(c, "instanceUrl", "MASTODON"));
  const token = requireCred(c, "accessToken", "MASTODON");
  return <T>(path: string, o: HttpOptions = {}) =>
    fetchJson<T>(`${base}${path}`, {
      label: LABEL,
      classify,
      ...o,
      headers: { authorization: `Bearer ${token}`, ...(o.headers as Record<string, string> | undefined) },
    });
}

/**
 * Pure mapping (exported for tests). `root` = first ancestor of the status' thread when it is a reply.
 *  - visibility "direct" → DM (one conversation per person)
 *  - reply in a thread started by us → COMMENT on that post
 *  - anything else → MENTION
 */
export function mapMastodon(n: MastoNotification, me: string, root?: Status): InboxItem | null {
  if (n.type !== "mention" || !n.status) return null;
  const s = n.status;
  const author = n.account;
  const base = {
    messageExternalId: s.id,
    text: htmlToText(s.content),
    authorName: author.display_name || author.username,
    authorHandle: author.acct,
    authorAvatar: author.avatar,
    createdAt: new Date(s.created_at),
    url: s.url ?? s.uri,
  };
  if (s.visibility === "direct") return { ...base, kind: "DM", conversationExternalId: `dm:${author.id}` };
  const onOurPost = (root && root.account.id === me) || (!root && s.in_reply_to_account_id === me);
  if (s.in_reply_to_id && onOurPost) {
    const postId = root?.id ?? s.in_reply_to_id;
    return {
      ...base,
      kind: "COMMENT",
      conversationExternalId: `${postId}:${author.id}`,
      postExternalId: postId,
      postExcerpt: root ? excerpt(htmlToText(root.content)) : undefined,
    };
  }
  return { ...base, kind: "MENTION", conversationExternalId: `${root?.id ?? s.id}:${author.id}` };
}

export const mastodonInbox: InboxProvider = {
  network: "MASTODON",

  async fetch(credentials, extras, since) {
    const call = api(credentials);
    const me = typeof extras.externalId === "string" && extras.externalId
      ? extras.externalId
      : (await call<Account>("/api/v1/accounts/verify_credentials")).id;
    const notes: MastoNotification[] = [];
    let maxId: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const qs = new URLSearchParams({ limit: "40" });
      qs.append("types[]", "mention");
      if (maxId) qs.set("max_id", maxId);
      const batch = await call<MastoNotification[]>(`/api/v1/notifications?${qs}`);
      let reachedOld = false;
      for (const n of batch) {
        if (since && new Date(n.created_at) < since) reachedOld = true;
        else notes.push(n);
      }
      maxId = batch[batch.length - 1]?.id;
      if (reachedOld || batch.length < 40 || !maxId) break;
    }
    const items: InboxItem[] = [];
    const rootCache = new Map<string, Status | undefined>();
    for (const n of notes) {
      let root: Status | undefined;
      const s = n.status;
      if (s?.in_reply_to_id && s.visibility !== "direct") {
        if (!rootCache.has(s.id)) {
          try {
            const ctx = await call<{ ancestors: Status[] }>(`/api/v1/statuses/${encodeURIComponent(s.id)}/context`);
            rootCache.set(s.id, ctx.ancestors[0]);
          } catch {
            rootCache.set(s.id, undefined);
          }
        }
        root = rootCache.get(s.id);
      }
      const item = mapMastodon(n, me, root);
      if (item) items.push(item);
    }
    return items;
  },

  async reply(credentials, _extras, target, text) {
    const call = api(credentials);
    const handle = target.authorHandle?.replace(/^@/, "");
    const mention = handle ? `@${handle}` : "";
    const status = mention && !text.includes(mention) ? `${mention} ${text}` : text;
    const created = await call<Status>("/api/v1/statuses", {
      method: "POST",
      headers: { "idempotency-key": randomUUID() },
      json: { status, in_reply_to_id: target.externalId, visibility: target.kind === "DM" ? "direct" : "public" },
    });
    return { externalId: created.id };
  },
};
