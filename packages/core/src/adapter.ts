import type { Network, NetworkLimits } from "./networks";

/**
 * Secrets for one connected channel. Stored encrypted in `Channel.credentialsEnc`
 * (see `@postline/core/crypto`). Shape beyond these fields is adapter-specific.
 */
export interface Credentials {
  accessToken?: string;
  refreshToken?: string;
  /** Epoch ms. */
  expiresAt?: number;
  /** e.g. Mastodon instance URL, Bluesky PDS/handle, Discord/Slack webhook URL, Telegram chat id, custom endpoint config. */
  [key: string]: unknown;
}

/** A connectable account discovered after auth (FB page, IG business account, LinkedIn org, Pinterest board...). */
export interface ConnectTarget {
  externalId: string;
  name: string;
  username?: string;
  avatarUrl?: string;
  network: Network;
  credentials: Credentials;
  scopes?: string[];
  extras?: Record<string, unknown>;
}

export interface MediaItem {
  url: string;
  mime: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  durationSec?: number;
  alt?: string;
}

/** Fully resolved content for ONE channel, produced by the worker from PostGroup + Post. */
export interface ComposedPost {
  postId: string;
  caption: string;
  media: MediaItem[];
  /** PostGroup.options[network] — network-specific options. */
  options: Record<string, unknown>;
  /** Channel.extras. */
  channelExtras: Record<string, unknown>;
}

export interface PublishResult {
  externalId: string;
  url: string;
  /** For threads: ids of every part, first = root. */
  partIds?: string[];
}

export type IssueLevel = "error" | "warning";
export interface ValidationIssue {
  level: IssueLevel;
  code:
    | "caption_too_long"
    | "will_thread"
    | "too_many_hashtags"
    | "too_many_images"
    | "too_many_videos"
    | "media_too_large"
    | "media_required"
    | "mixed_media"
    | "empty"
    | "unsupported_media"
    | "option_invalid";
  message: string;
}

export type AdapterErrorKind =
  /** Token expired/revoked — mark channel NEEDS_RECONNECT, do not retry. */
  | "auth"
  /** Retry later with backoff. */
  | "rate_limit"
  /** Network-side transient (5xx, timeout before request was accepted) — safe to retry. */
  | "transient"
  /** Content rejected — do not retry. */
  | "rejected"
  /** Outcome unknown (timeout after send) — do NOT blindly retry; may have published. */
  | "unknown";

export class AdapterError extends Error {
  constructor(
    public readonly kind: AdapterErrorKind,
    message: string,
    public readonly details?: { status?: number; body?: unknown; retryAfterSec?: number },
  ) {
    super(message);
    this.name = "AdapterError";
  }
}

export type ConnectKind = "oauth2" | "credentials" | "webhook";

export interface CredentialField {
  name: string;
  label: string;
  type: "text" | "password" | "url";
  placeholder?: string;
  help?: string;
  required?: boolean;
}

export interface NetworkAdapter {
  network: Network;
  limits: NetworkLimits;
  connectKind: ConnectKind;
  /** For `credentials`/`webhook` connect kinds: the form the UI must render. */
  credentialFields?: CredentialField[];

  /** oauth2: build the authorize URL. `redirectUri` = `${APP_URL}/api/channels/oauth/${network}/callback`. */
  getAuthorizeUrl?(params: { state: string; redirectUri: string; codeVerifier?: string }): string;
  /** oauth2: exchange code → one or more connectable targets. */
  exchangeCode?(params: { code: string; redirectUri: string; codeVerifier?: string }): Promise<ConnectTarget[]>;
  /** credentials/webhook: verify the submitted fields → targets. */
  connectWithCredentials?(fields: Record<string, string>): Promise<ConnectTarget[]>;
  /** Refresh if the network supports it. Return null if not refreshable. */
  refresh?(credentials: Credentials): Promise<Credentials | null>;

  /** Pure, synchronous. Used by the editor (client side) and before publish. */
  validate(post: Pick<ComposedPost, "caption" | "media" | "options">): ValidationIssue[];
  publish(post: ComposedPost, credentials: Credentials): Promise<PublishResult>;
  /**
   * Delete on the network. Throw AdapterError("rejected") if the network can't delete.
   * `partIds` = PublishResult.partIds persisted on the Post (thread parts, root first); delete all of them.
   */
  delete?(
    externalId: string,
    credentials: Credentials,
    channelExtras: Record<string, unknown>,
    partIds?: string[],
  ): Promise<void>;
}
