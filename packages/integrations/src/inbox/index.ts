// OWNED BY: inbox agent. Inbox capability registry.
import type { Network } from "@postline/core";
import { blueskyInbox } from "./bluesky";
import { COMPOSIO_INBOX } from "./composio";
import { mastodonInbox } from "./mastodon";
import { facebookInbox, instagramInbox } from "./meta";
import type { InboxProvider } from "./types";

export * from "./types";

/** Networks the native (own-app) connections support. */
export const INBOX_NETWORKS: readonly Network[] = ["FACEBOOK", "INSTAGRAM", "BLUESKY", "MASTODON"];

const PROVIDERS: Partial<Record<Network, InboxProvider>> = {
  BLUESKY: blueskyInbox,
  MASTODON: mastodonInbox,
  FACEBOOK: facebookInbox,
  INSTAGRAM: instagramInbox,
};

const REQUIRED_ENV: Partial<Record<Network, string[]>> = {
  FACEBOOK: ["META_APP_ID"],
  INSTAGRAM: ["META_APP_ID"],
};

/** A channel, as far as the inbox needs it: Composio channels carry extras.via === "composio". */
type ChannelRef = { extras?: unknown };
const viaComposio = (channel?: ChannelRef) => (channel?.extras as { via?: unknown } | null | undefined)?.via === "composio";

/** Whether the inbox can work for this network (for a given channel, through the way it was connected). */
export function inboxSupported(network: Network, channel?: ChannelRef): boolean {
  if (viaComposio(channel)) return !!COMPOSIO_INBOX[network];
  if (channel) return INBOX_NETWORKS.includes(network);
  return INBOX_NETWORKS.includes(network) || !!COMPOSIO_INBOX[network];
}

/**
 * Working provider for a channel (or, without one, for a native connection of `network`).
 * Undefined when unsupported, or Meta native without META_APP_ID.
 */
export function getInboxProvider(network: Network, channel?: ChannelRef): InboxProvider | undefined {
  if (viaComposio(channel)) return COMPOSIO_INBOX[network];
  const p = PROVIDERS[network];
  if (!p) return undefined;
  if (!(REQUIRED_ENV[network] ?? []).every((k) => !!process.env[k])) return undefined;
  return p;
}
