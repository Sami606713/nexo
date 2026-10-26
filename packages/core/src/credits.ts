export type CreditReason =
  | "caption"
  | "image"
  | "rewrite"
  | "hashtags"
  | "reply_suggest"
  | "score_fix"
  | "campaign"
  | "brand_fetch"
  | "workflow_run";

export const CREDIT_COST: Record<CreditReason, number> = {
  caption: 1,
  image: 1,
  rewrite: 1,
  hashtags: 1,
  reply_suggest: 1,
  score_fix: 1,
  campaign: 1, // per post; images charged separately
  brand_fetch: 1,
  workflow_run: 1,
};

export type PlanId = "TRIAL" | "STARTER" | "TEAM" | "AGENCY" | "ENTERPRISE";

export interface PlanLimits {
  label: string;
  priceMonthlyUsd: number | null;
  users: number;
  channels: number;
  creditsMonthly: number;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  TRIAL: { label: "Trial", priceMonthlyUsd: 0, users: 1, channels: 3, creditsMonthly: 50 },
  STARTER: { label: "Starter", priceMonthlyUsd: 25, users: 1, channels: 5, creditsMonthly: 300 },
  TEAM: { label: "Team", priceMonthlyUsd: 69, users: 5, channels: 20, creditsMonthly: 1500 },
  AGENCY: { label: "Agency", priceMonthlyUsd: 179, users: 20, channels: 100, creditsMonthly: 5000 },
  ENTERPRISE: { label: "Enterprise", priceMonthlyUsd: null, users: 1000, channels: 1000, creditsMonthly: 50000 },
};

export class InsufficientCreditsError extends Error {
  constructor(public readonly needed: number, public readonly remaining: number) {
    super(`Not enough credits: need ${needed}, have ${remaining}`);
    this.name = "InsufficientCreditsError";
  }
}
