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
import { composioAvailableNetworks, createComposioAdapter, isComposioNetwork } from "./composio";

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

/** Env vars a native OAuth adapter needs before it can be offered in the Connect UI. */
const REQUIRED_ENV: Partial<Record<Network, string[]>> = {
  LINKEDIN: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
  X: ["X_CLIENT_ID"],
  FACEBOOK: ["META_APP_ID"],
  INSTAGRAM: ["META_APP_ID"],
};

export type ConnectVia = "native" | "composio";

/**
 * New connections go through Composio only. Set ENABLE_NATIVE_CHANNELS=1 to also offer the built-in adapters
 * (Bluesky, Mastodon, Telegram, Discord, Slack, webhook, and your own LinkedIn/X/Meta apps).
 * Existing native channels keep publishing either way.
 */
const nativeEnabled = () => process.env.ENABLE_NATIVE_CHANNELS === "1";

const nativeReady = (network: Network) =>
  nativeEnabled() && !!ADAPTERS[network] && (REQUIRED_ENV[network] ?? []).every((k) => !!process.env[k]);

/** How a NEW connection for `network` is made: your own app when configured, else Composio's managed app. */
export function connectVia(network: Network): ConnectVia | undefined {
  if (nativeReady(network)) return "native";
  if (composioAvailableNetworks().includes(network)) return "composio";
  return undefined;
}

/** Which adapter implementation serves an existing channel (Composio channels are tagged at connect time). */
export function channelVia(channel: { extras?: unknown }): ConnectVia {
  const extras = channel.extras as { via?: unknown } | null | undefined;
  return extras?.via === "composio" ? "composio" : "native";
}

/**
 * Server-side registry.
 * - With a channel: the adapter that channel was connected through.
 * - Without one (connect UI / metadata): the adapter new connections would use.
 * Native adapters are returned even when their env is missing so existing channels can still be deleted/validated.
 */
export function getAdapter(network: Network, channel?: { extras?: unknown }): NetworkAdapter | undefined {
  const via = channel ? channelVia(channel) : connectVia(network);
  if (via === "composio" && isComposioNetwork(network)) return createComposioAdapter(network);
  return ADAPTERS[network];
}

/** Networks that can be connected right now (native or through Composio). */
export function availableNetworks(): Network[] {
  const native = (Object.keys(ADAPTERS) as Network[]).filter(nativeReady);
  return [...new Set([...native, ...composioAvailableNetworks()])];
}

export { validateForNetwork, hasBlockingIssues } from "./rules";
export * from "./inbox";
export {
  composioConfigured,
  resolveAuthConfig,
  createConnectLink,
  discoverTargets,
  COMPOSIO_NETWORKS,
  ComposioError,
  type ComposioCredentials,
} from "./composio";
