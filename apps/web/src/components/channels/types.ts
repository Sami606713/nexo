import type { ConnectKind, CredentialField, Network } from "@postline/core";

export interface ChannelDto {
  id: string;
  brandId: string;
  network: Network;
  externalId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  health: "OK" | "NEEDS_RECONNECT" | "ERROR";
  lastError: unknown;
  expiresAt: string | null;
  extras: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface NetworkOption {
  network: Network;
  label: string;
  connectKind: ConnectKind;
  credentialFields: CredentialField[];
}

export interface PendingTarget {
  externalId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
}

export type ConnectResponse =
  | { connected: number; skipped: number; channels: { id: string; name: string; network: Network }[] }
  | { pending: true; token: string; targets: PendingTarget[] };

export const oauthStartUrl = (network: Network, brandId: string) =>
  `/api/channels/oauth/${network.toLowerCase()}/start?brandId=${encodeURIComponent(brandId)}`;
