import type { Network } from "@postline/core";
import { composioConfigured } from "./api";

export interface ComposioNetwork {
  toolkit: string;
  /** Composio provides its own approved OAuth app (no developer app or app review needed). */
  managed: boolean;
}

/** Networks connected through Composio. Verified against the Composio toolkit catalog (Oct 2026). */
export const COMPOSIO_NETWORKS: Partial<Record<Network, ComposioNetwork>> = {
  LINKEDIN: { toolkit: "linkedin", managed: true },
  FACEBOOK: { toolkit: "facebook", managed: true },
  INSTAGRAM: { toolkit: "instagram", managed: true },
  YOUTUBE: { toolkit: "youtube", managed: true },
  PINTEREST: { toolkit: "pinterest", managed: true },
  REDDIT: { toolkit: "reddit", managed: true },
  SLACK: { toolkit: "slack", managed: true },
  NOTION: { toolkit: "notion", managed: true },
  // No Composio-managed app: needs your own app as a Composio auth config (COMPOSIO_AUTH_CONFIG_TWITTER).
  // TikTok and Threads are in the same situation and aren't wired up yet.
  X: { toolkit: "twitter", managed: false },
};

/** Composio networks that can be offered for new connections right now. */
export function composioAvailableNetworks(): Network[] {
  if (!composioConfigured()) return [];
  return (Object.entries(COMPOSIO_NETWORKS) as [Network, ComposioNetwork][])
    .filter(([, n]) => n.managed || !!process.env[`COMPOSIO_AUTH_CONFIG_${n.toolkit.toUpperCase()}`])
    .map(([network]) => network);
}

export const isComposioNetwork = (network: Network): boolean => network in COMPOSIO_NETWORKS;
