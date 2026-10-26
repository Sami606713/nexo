// OWNED BY: inbox agent. DTOs shared by the inbox API routes and UI (types only — safe for both).
import type { Network } from "@postline/core";

export type ConversationKind = "DM" | "COMMENT" | "MENTION";
export type ConversationStatus = "OPEN" | "RESOLVED" | "ARCHIVED";

export interface InboxChannelDto {
  id: string;
  network: Network;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  health: "OK" | "NEEDS_RECONNECT" | "ERROR";
  inboxEnabled: boolean;
  /** Network has inbox support at all (FB/IG/Bluesky/Mastodon). */
  supported: boolean;
  /** Replies are actually delivered (provider configured, not a demo channel). */
  live: boolean;
  demo: boolean;
  syncedAt: string | null;
  openCount: number;
  unreadCount: number;
}

export interface PersonDto {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface ConversationDto {
  id: string;
  kind: ConversationKind;
  status: ConversationStatus;
  channel: { id: string; network: Network; name: string; avatarUrl: string | null; demo: boolean };
  participantName: string;
  participantHandle: string | null;
  participantAvatar: string | null;
  assignee: PersonDto | null;
  labels: string[];
  unread: boolean;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  postExternalId: string | null;
  postId: string | null;
}

export interface ConversationListResponse {
  conversations: ConversationDto[];
  nextCursor: string | null;
  /** Per tab, with the current status/assignee/channel/search filters applied. */
  counts: Record<ConversationKind, number>;
  /** Unread open conversations across the brand (nav badge). */
  unread: number;
}

export interface MessageDto {
  id: string;
  direction: "IN" | "OUT";
  authorName: string | null;
  text: string | null;
  createdAt: string;
  sentBy: PersonDto | null;
  /** OUT messages saved but not sent to the network (demo channel / provider not available). */
  undelivered: boolean;
}

export interface ConversationDetailDto extends ConversationDto {
  post: { excerpt: string | null; url: string | null } | null;
}

export interface ReplySnippetDto {
  id: string;
  title: string;
  body: string;
}
