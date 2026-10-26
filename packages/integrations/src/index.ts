// OWNED BY: integrations agent. Server-side entry (adapters use node APIs). Browser code imports "./client".
import type { Network, NetworkAdapter } from "@postline/core";
import { blueskyAdapter } from "./adapters/bluesky";
import { customWebhookAdapter } from "./adapters/custom-webhook";
import { discordAdapter } from "./adapters/discord";
import { linkedinAdapter } from "./adapters/linkedin";
import { mastodonAdapter } from "./adapters/mastodon";
import { facebookAdapter, instagramAdapter } from "./adapters/meta";
import { slackAdapter } from "./adapters/slack";
import { telegramAdapter } from "./adapters/telegram";
import { xAdapter } from "./adapters/x";

const ADAPTERS: Partial<Record<Network, NetworkAdapter>> = {
  BLUESKY: blueskyAdapter,
  MASTODON: mastodonAdapter,
  TELEGRAM: telegramAdapter,
  DISCORD: discordAdapter,
  SLACK: slackAdapter,
  CUSTOM_WEBHOOK: customWebhookAdapter,
  LINKEDIN: linkedinAdapter,
  X: xAdapter,
  FACEBOOK: facebookAdapter,
  INSTAGRAM: instagramAdapter,
};

/** Env vars an OAuth network needs before it can be offered in the Connect UI. */
const REQUIRED_ENV: Partial<Record<Network, string[]>> = {
  LINKEDIN: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
  X: ["X_CLIENT_ID"],
  FACEBOOK: ["META_APP_ID"],
  INSTAGRAM: ["META_APP_ID"],
};

/**
 * Server-side registry. Returns undefined for networks not yet implemented.
 * Returns adapters even when their env is missing so existing channels can still be deleted/validated.
 */
export function getAdapter(network: Network): NetworkAdapter | undefined {
  return ADAPTERS[network];
}

/** Networks that have a working adapter (for the "Connect channel" UI). */
export function availableNetworks(): Network[] {
  return (Object.keys(ADAPTERS) as Network[]).filter((n) => (REQUIRED_ENV[n] ?? []).every((k) => !!process.env[k]));
}

export { validateForNetwork, hasBlockingIssues } from "./rules";
export * from "./inbox";
