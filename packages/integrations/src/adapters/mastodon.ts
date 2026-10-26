import {
  AdapterError,
  NETWORK_LIMITS,
  type ComposedPost,
  type ConnectTarget,
  type Credentials,
  type MediaItem,
  type NetworkAdapter,
} from "@postline/core";
import { downloadMedia, fetchJson, sleep, toBlob, type HttpOptions, type StatusClassifier } from "../http";
import { validateForNetwork } from "../rules";
import { assertPublicUrl } from "../ssrf";
import { assertValid, deletionOrder, maxBytesFor, requireCred, requireField, threadParts, trimSlash } from "../util";

const NETWORK = "MASTODON" as const;
const LABEL = "Mastodon";
const VISIBILITIES = new Set(["public", "unlisted", "private", "direct"]);

interface Account {
  id: string;
  username: string;
  acct: string;
  display_name?: string;
  avatar?: string;
  url?: string;
}
interface Attachment {
  id: string;
  url: string | null;
}
interface Status {
  id: string;
  url: string | null;
  uri: string;
}

const classify: StatusClassifier = (status) => (status === 403 ? "auth" : undefined);

function api(credentials: Credentials) {
  const base = trimSlash(requireCred(credentials, "instanceUrl", NETWORK));
  const token = requireCred(credentials, "accessToken", NETWORK);
  const call = <T>(path: string, opts: HttpOptions = {}) =>
    fetchJson<T>(`${base}${path}`, {
      label: LABEL,
      classify,
      ...opts,
      headers: { authorization: `Bearer ${token}`, ...(opts.headers as Record<string, string> | undefined) },
    });
  return { base, call };
}

async function uploadMedia(
  call: ReturnType<typeof api>["call"],
  m: MediaItem,
  index: number,
): Promise<string> {
  const dl = await downloadMedia(m.url, { maxBytes: maxBytesFor(NETWORK, m), mimeHint: m.mime, index });
  const form = new FormData();
  form.append("file", toBlob(dl), dl.filename);
  if (m.alt) form.append("description", m.alt.slice(0, 1500));
  // Media attachments aren't visible until attached to a status, so retrying an upload is harmless.
  const att = await call<Attachment>("/api/v2/media", { method: "POST", body: form, idempotent: true, timeoutMs: 120_000 });
  // 202 → still processing: poll until `url` is set (GET returns 206 while processing).
  if (!att.url) {
    const deadline = Date.now() + 120_000;
    for (let delay = 1000; ; delay = Math.min(delay * 1.5, 5000)) {
      if (Date.now() > deadline) throw new AdapterError("transient", "Mastodon media processing timed out");
      await sleep(delay);
      const cur = await call<Attachment>(`/api/v1/media/${encodeURIComponent(att.id)}`);
      if (cur.url) break;
    }
  }
  return att.id;
}

async function publish(post: ComposedPost, credentials: Credentials) {
  assertValid(NETWORK, post);
  const { call } = api(credentials);
  const mediaIds: string[] = [];
  for (const [i, m] of post.media.entries()) mediaIds.push(await uploadMedia(call, m, i));

  const visibility =
    typeof post.options.visibility === "string" && VISIBILITIES.has(post.options.visibility)
      ? post.options.visibility
      : "public";
  const spoiler = typeof post.options.spoilerText === "string" ? post.options.spoilerText : undefined;
  const sensitive = post.options.sensitive === true;

  const parts = threadParts(NETWORK, post);
  const statuses: Status[] = [];
  for (const [i, text] of parts.entries()) {
    const parent = statuses[statuses.length - 1];
    const status = await call<Status>("/api/v1/statuses", {
      method: "POST",
      // Mastodon dedupes on Idempotency-Key for 1h → safe against retries after an ambiguous failure.
      headers: { "idempotency-key": `${post.postId}:${i}` },
      json: {
        status: text,
        visibility: i === 0 ? visibility : visibility === "public" ? "unlisted" : visibility,
        ...(i === 0 && mediaIds.length ? { media_ids: mediaIds } : {}),
        ...(parent ? { in_reply_to_id: parent.id } : {}),
        ...(spoiler ? { spoiler_text: spoiler } : {}),
        ...(sensitive ? { sensitive: true } : {}),
        ...(typeof post.options.lang === "string" ? { language: post.options.lang } : {}),
      },
    });
    statuses.push(status);
  }
  const first = statuses[0];
  if (!first) throw new AdapterError("rejected", "Nothing to publish");
  return { externalId: first.id, url: first.url ?? first.uri, partIds: statuses.map((s) => s.id) };
}

export const mastodonAdapter: NetworkAdapter = {
  network: NETWORK,
  limits: NETWORK_LIMITS.MASTODON,
  connectKind: "credentials",
  credentialFields: [
    { name: "instanceUrl", label: "Instance URL", type: "url", placeholder: "https://mastodon.social", required: true },
    {
      name: "accessToken",
      label: "Access token",
      type: "password",
      help: "On your instance: Preferences → Development → New application with scopes read:accounts, write:statuses, write:media. Copy “Your access token”.",
      required: true,
    },
  ],

  async connectWithCredentials(fields): Promise<ConnectTarget[]> {
    let raw = requireField(fields, "instanceUrl", "Instance URL");
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    const url = await assertPublicUrl(raw);
    const instanceUrl = `${url.protocol}//${url.host}`;
    const accessToken = requireField(fields, "accessToken", "Access token");
    const credentials: Credentials = { instanceUrl, accessToken };
    const me = await api(credentials).call<Account>("/api/v1/accounts/verify_credentials");
    return [
      {
        network: NETWORK,
        externalId: me.id,
        name: me.display_name || me.username,
        username: `${me.username}@${url.host}`,
        avatarUrl: me.avatar,
        credentials,
        extras: { instanceUrl, profileUrl: me.url },
      },
    ];
  },

  /** Mastodon personal access tokens don't expire. */
  async refresh() {
    return null;
  },

  validate: (post) => validateForNetwork(NETWORK, post),
  publish,

  async delete(externalId, credentials, _channelExtras, partIds) {
    const { call } = api(credentials);
    for (const id of deletionOrder(externalId, partIds)) {
      try {
        await call(`/api/v1/statuses/${encodeURIComponent(id)}`, { method: "DELETE" });
      } catch (err) {
        if (err instanceof AdapterError && err.details?.status === 404) continue; // already gone
        throw err;
      }
    }
  },
};
