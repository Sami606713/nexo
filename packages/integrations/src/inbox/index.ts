// OWNED BY: inbox agent. Inbox capability registry.
import type { Network } from "@postline/core";
import { blueskyInbox } from "./bluesky";
import { mastodonInbox } from "./mastodon";
import { facebookInbox, instagramInbox } from "./meta";
import type { InboxProvider } from "./types";

export * from "./types";

/** Networks the inbox supports at all (UI lists the rest as "not supported"). */
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

export function inboxSupported(network: Network): boolean {
  return INBOX_NETWORKS.includes(network);
}

/** Working provider for a network, or undefined (unsupported, or Meta without META_APP_ID). */
export function getInboxProvider(network: Network): InboxProvider | undefined {
  const p = PROVIDERS[network];
  if (!p) return undefined;
  if (!(REQUIRED_ENV[network] ?? []).every((k) => !!process.env[k])) return undefined;
  return p;
}
