// Browser-safe DTO types shared by the posts API (server) and the editor/planner (client).
import type { Network, PostStatus } from "@postline/core";

export type ChannelHealth = "OK" | "NEEDS_RECONNECT" | "ERROR";

export interface ChannelDTO {
  id: string;
  network: Network;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  health: ChannelHealth;
}

export interface PostDTO {
  id: string;
  channelId: string;
  channel: ChannelDTO;
  captionOverride: string | null;
  status: PostStatus;
  url: string | null;
  /** Adapter error payload, usually `{ message, kind }`. */
  error: { message?: string; kind?: string } | null;
  publishedAt: string | null;
}

export interface MediaDTO {
  id: string;
  url: string;
  mime: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  sizeBytes: number;
  alt: string | null;
  createdAt?: string;
}

export interface LabelDTO {
  id: string;
  name: string;
  color: string;
}

export interface ApprovalDTO {
  id: string;
  requestedBy: string;
  approverIds: string[];
  decision: "approved" | "rejected" | null;
  decidedBy: string | null;
  decidedAt: string | null;
  comment: string | null;
  createdAt: string;
}

export interface UserLiteDTO {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface PostGroupDTO {
  id: string;
  brandId: string;
  authorId: string;
  author: UserLiteDTO | null;
  caption: string;
  status: PostStatus;
  scheduledAt: string | null;
  timezone: string | null;
  options: Record<string, Record<string, unknown>>;
  notes: string | null;
  score: number | null;
  lockedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  posts: PostDTO[];
  media: MediaDTO[];
  labels: LabelDTO[];
  approval: ApprovalDTO | null;
}

/** Returned by GET /posts/[groupId]: what the caller may do with this group. */
export interface ViewerDTO {
  canWrite: boolean;
  isApprover: boolean;
  canDecide: boolean;
  locked: boolean;
}

export interface PostGroupDetailDTO extends PostGroupDTO {
  viewer: ViewerDTO;
}

export interface CommentDTO {
  id: string;
  body: string;
  createdAt: string;
  author: UserLiteDTO | null;
}

export interface ChannelIssuesDTO {
  channelId: string;
  network: Network;
  name: string;
  issues: { level: "error" | "warning"; code: string; message: string }[];
}

export interface SharedCalendarPostDTO {
  id: string;
  scheduledAt: string;
  status: PostStatus;
  caption: string;
  channels: { network: Network; name: string; avatarUrl: string | null; url: string | null }[];
  thumbUrl: string | null;
}

export interface SharedCalendarDTO {
  brand: { name: string; timezone: string; weekStart: number };
  posts: SharedCalendarPostDTO[];
}

/** Network option keys stored in PostGroup.options[network]. */
export interface InstagramOptions {
  placement?: "feed" | "reel" | "story";
}
export interface TikTokOptions {
  privacy?: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY";
  allowComments?: boolean;
  allowDuet?: boolean;
  allowStitch?: boolean;
}
export interface PinterestOptions {
  boardId?: string;
  link?: string;
}
