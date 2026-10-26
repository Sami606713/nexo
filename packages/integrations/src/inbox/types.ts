// OWNED BY: inbox agent. Inbox capability: pull DMs / comments / mentions and reply to them.
import type { Credentials, Network } from "@postline/core";

export type InboxKind = "DM" | "COMMENT" | "MENTION";

/** One message pulled from a network. The worker groups items into Conversations by (kind, conversationExternalId). */
export interface InboxItem {
  kind: InboxKind;
  /** Stable id of the thread this message belongs to (DM thread, top-level comment, mention thread). */
  conversationExternalId: string;
  /** Network id of this message (used for dedupe and as the reply target). */
  messageExternalId: string;
  text: string;
  authorName: string;
  authorHandle?: string;
  authorAvatar?: string;
  createdAt: Date;
  /** COMMENT (and some MENTIONs): network id of the post the message is attached to. */
  postExternalId?: string;
  /** Short text of that post, when the network returns it cheaply. */
  postExcerpt?: string;
  /** Public URL of the message/post when known. */
  url?: string;
  /** "OUT" = sent by the channel itself (e.g. answered in the native app). Default "IN". */
  direction?: "IN" | "OUT";
}

export interface ReplyTarget {
  kind: InboxKind;
  /** The message being answered (latest inbound message id). */
  externalId: string;
  conversationExternalId: string;
  postExternalId?: string | null;
  /** Handle of the person being answered (Mastodon needs it to @-mention them). */
  authorHandle?: string | null;
}

/**
 * `channelExtras` is `Channel.extras` plus `externalId` (the channel's account id on the network:
 * Facebook page id, Instagram business account id, Bluesky DID, Mastodon account id).
 */
export type InboxChannelExtras = Record<string, unknown> & { externalId?: string };

export interface InboxProvider {
  network: Network;
  /** Newest-first or any order; the worker sorts. `since` = only items created after this time (best effort). */
  fetch(credentials: Credentials, channelExtras: InboxChannelExtras, since?: Date): Promise<InboxItem[]>;
  reply(credentials: Credentials, channelExtras: InboxChannelExtras, target: ReplyTarget, text: string): Promise<{ externalId: string }>;
}

/** Strip HTML (Mastodon status content) to plain text with line breaks. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

export function excerpt(text: string | undefined | null, max = 280): string | undefined {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
