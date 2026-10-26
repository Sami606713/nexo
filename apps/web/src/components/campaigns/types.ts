// Browser-safe DTOs for the campaigns API.
import type { CampaignGoal, Length, Tone } from "@postline/core";
import type { ChannelDTO, PostGroupDTO } from "@/lib/posts/types";

export type CampaignStatus = "GENERATING" | "READY" | "ERROR";

export interface CampaignProgress {
  stage: "writing" | "images";
  done: number;
  total: number;
}

export interface CampaignDTO {
  id: string;
  prompt: string;
  goal: CampaignGoal;
  audience: string | null;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD (inclusive) */
  endDate: string;
  durationDays: number;
  postsPerDay: number | null;
  count: number;
  status: CampaignStatus;
  channelIds: string[];
  createdAt: string;
  progress: CampaignProgress | null;
  error: string | null;
  imagesError: string | null;
  offline: boolean;
  settings: { tone: Tone | null; length: Length | null; includeHashtags: boolean; imagesPerPost: number };
  postsCount: number;
  scheduledCount: number;
  thumbs: string[];
}

export interface CampaignDetailDTO extends CampaignDTO {
  posts: PostGroupDTO[];
  channels: ChannelDTO[];
}
