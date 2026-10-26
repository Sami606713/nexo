// OWNED BY: inbox agent. Bluesky inbox: mentions, quotes and replies via app.bsky.notification.listNotifications.
import { AdapterError, type Credentials } from "@postline/core";
import { fetchJson, type HttpOptions, type StatusClassifier } from "../http";
import { buildFacets } from "../adapters/bluesky";
import { credString, requireCred, trimSlash } from "../util";
import { excerpt, type InboxItem, type InboxProvider } from "./types";

const LABEL = "Bluesky";
const DEFAULT_SERVICE = "https://bsky.social";
const MAX_PAGES = 5;

interface Session {
  accessJwt: string;
  did: string;
  handle: string;
  pdsUrl: string;
}
interface SessionResponse {
  accessJwt: string;
  refreshJwt: string;
  did: string;
  handle: string;
  didDoc?: { service?: Array<{ id?: string; type?: string; serviceEndpoint?: unknown }> };
}
interface StrongRef {
  uri: string;
  cid: string;
}
interface PostRecord {
  text?: string;
  createdAt?: string;
  reply?: { root: StrongRef; parent: StrongRef };
}
export interface BskyNotification {
  uri: string;
  cid: string;
  author: { did: string; handle: string; displayName?: string; avatar?: string };
  reason: string;
  reasonSubject?: string;
  record: PostRecord;
  indexedAt: string;
}
interface BskyPostView {
  uri: string;
  cid: string;
  author?: { did: string; handle: string };
  record: PostRecord;
}

const classify: StatusClassifier = (status, body) => {
  const err = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
  if (err === "ExpiredToken" || err === "InvalidToken" || err === "AuthMissing" || status === 403) return "auth";
  return undefined;
};
const opts = (o: HttpOptions): HttpOptions => ({ label: LABEL, classify, ...o });

function pdsFromDidDoc(doc: SessionResponse["didDoc"]): string | undefined {
  const svc = doc?.service?.find((s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer");
  return typeof svc?.serviceEndpoint === "string" ? trimSlash(svc.serviceEndpoint) : undefined;
}

function jwtFresh(jwt: string | undefined, skewSec = 60): boolean {
  if (!jwt) return false;
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return false;
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number };
    return typeof exp === "number" && exp * 1000 > Date.now() + skewSec * 1000;
  } catch {
    return false;
  }
}

/** Stored access token when fresh, else refresh, else log in with the app password. */
async function session(c: Credentials): Promise<Session> {
  const access = credString(c, "accessJwt");
  const refresh = credString(c, "refreshJwt");
  const did = credString(c, "did");
  const handle = credString(c, "handle");
  const pds = credString(c, "pdsUrl") ?? credString(c, "service") ?? DEFAULT_SERVICE;
  if (access && did && handle && jwtFresh(access)) return { accessJwt: access, did, handle, pdsUrl: trimSlash(pds) };
  if (refresh && jwtFresh(refresh, 0)) {
    try {
      const r = await fetchJson<SessionResponse>(
        `${trimSlash(pds)}/xrpc/com.atproto.server.refreshSession`,
        opts({ method: "POST", headers: { authorization: `Bearer ${refresh}` }, idempotent: true }),
      );
      return { accessJwt: r.accessJwt, did: r.did, handle: r.handle, pdsUrl: pdsFromDidDoc(r.didDoc) ?? trimSlash(pds) };
    } catch (err) {
      if (!(err instanceof AdapterError) || err.kind !== "auth") throw err;
    }
  }
  const service = trimSlash(credString(c, "service") ?? DEFAULT_SERVICE);
  const r = await fetchJson<SessionResponse>(
    `${service}/xrpc/com.atproto.server.createSession`,
    opts({
      method: "POST",
      json: { identifier: requireCred(c, "identifier", "BLUESKY"), password: requireCred(c, "appPassword", "BLUESKY") },
      idempotent: true,
    }),
  );
  return { accessJwt: r.accessJwt, did: r.did, handle: r.handle, pdsUrl: pdsFromDidDoc(r.didDoc) ?? service };
}

const auth = (s: Session) => ({ authorization: `Bearer ${s.accessJwt}` });

function rkey(uri: string): string {
  return uri.split("/").pop() ?? "";
}

export function bskyPostUrl(handleOrDid: string, uri: string): string {
  return `https://bsky.app/profile/${handleOrDid}/post/${rkey(uri)}`;
}

async function getPosts(s: Session, uris: string[]): Promise<BskyPostView[]> {
  const out: BskyPostView[] = [];
  for (let i = 0; i < uris.length; i += 25) {
    const qs = uris.slice(i, i + 25).map((u) => `uris=${encodeURIComponent(u)}`).join("&");
    const r = await fetchJson<{ posts: BskyPostView[] }>(`${s.pdsUrl}/xrpc/app.bsky.feed.getPosts?${qs}`, opts({ headers: auth(s) }));
    out.push(...(r.posts ?? []));
  }
  return out;
}

/** Pure mapping: notification → inbox item (exported for tests). `null` for reasons we don't surface. */
export function mapNotification(n: BskyNotification): InboxItem | null {
  if (n.reason !== "mention" && n.reason !== "reply" && n.reason !== "quote") return null;
  const rootUri = n.record.reply?.root.uri;
  const isReply = n.reason === "reply";
  const threadRoot = rootUri ?? n.uri;
  return {
    kind: isReply ? "COMMENT" : "MENTION",
    conversationExternalId: `${threadRoot}|${n.author.did}`,
    messageExternalId: n.uri,
    text: n.record.text ?? "",
    authorName: n.author.displayName || n.author.handle,
    authorHandle: n.author.handle,
    authorAvatar: n.author.avatar,
    createdAt: new Date(n.record.createdAt ?? n.indexedAt),
    postExternalId: isReply ? rootUri : n.reason === "quote" ? n.reasonSubject : undefined,
    url: bskyPostUrl(n.author.handle, n.uri),
  };
}

export const blueskyInbox: InboxProvider = {
  network: "BLUESKY",

  async fetch(credentials, _extras, since) {
    const s = await session(credentials);
    const items: InboxItem[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const qs = new URLSearchParams({ limit: "50" });
      if (cursor) qs.set("cursor", cursor);
      const r = await fetchJson<{ notifications: BskyNotification[]; cursor?: string }>(
        `${s.pdsUrl}/xrpc/app.bsky.notification.listNotifications?${qs}`,
        opts({ headers: auth(s) }),
      );
      let reachedOld = false;
      for (const n of r.notifications ?? []) {
        if (since && new Date(n.indexedAt) < since) {
          reachedOld = true;
          continue;
        }
        if (n.author.did === s.did) continue;
        const item = mapNotification(n);
        if (item) items.push(item);
      }
      cursor = r.cursor;
      if (reachedOld || !cursor || (r.notifications ?? []).length === 0) break;
    }
    // Excerpts of the posts people replied to (one batched call).
    const roots = [...new Set(items.map((i) => i.postExternalId).filter((u): u is string => !!u))];
    if (roots.length) {
      try {
        const posts = new Map((await getPosts(s, roots)).map((p) => [p.uri, p.record.text]));
        for (const i of items) if (i.postExternalId) i.postExcerpt = excerpt(posts.get(i.postExternalId));
      } catch {
        /* cosmetic */
      }
    }
    return items;
  },

  async reply(credentials, _extras, target, text) {
    const s = await session(credentials);
    const [parent] = await getPosts(s, [target.externalId]);
    if (!parent) throw new AdapterError("rejected", "The post you're replying to no longer exists on Bluesky");
    const parentRef = { uri: parent.uri, cid: parent.cid };
    const root = parent.record.reply?.root ?? parentRef;
    const facets = await buildFacets(text, async (handle) => {
      try {
        const r = await fetchJson<{ did: string }>(
          `${s.pdsUrl}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
          opts({ timeoutMs: 10_000 }),
        );
        return r.did;
      } catch {
        return undefined;
      }
    });
    const created = await fetchJson<StrongRef>(
      `${s.pdsUrl}/xrpc/com.atproto.repo.createRecord`,
      opts({
        method: "POST",
        headers: auth(s),
        json: {
          repo: s.did,
          collection: "app.bsky.feed.post",
          record: {
            $type: "app.bsky.feed.post",
            text,
            createdAt: new Date().toISOString(),
            reply: { root, parent: parentRef },
            ...(facets.length ? { facets } : {}),
          },
        },
      }),
    );
    return { externalId: created.uri };
  },
};
