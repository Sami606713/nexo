import { RichText } from "@atproto/api";
import {
  AdapterError,
  NETWORK_LIMITS,
  mediaKind,
  type ComposedPost,
  type ConnectTarget,
  type Credentials,
  type NetworkAdapter,
  type PublishResult,
} from "@postline/core";
import { downloadMedia, fetchJson, type HttpOptions, type StatusClassifier } from "../http";
import { validateForNetwork } from "../rules";
import { assertPublicUrl } from "../ssrf";
import { assertValid, credString, deletionOrder, maxBytesFor, optionalField, requireCred, requireField, threadParts, trimSlash } from "../util";

const NETWORK = "BLUESKY" as const;
const LABEL = "Bluesky";
const DEFAULT_SERVICE = "https://bsky.social";
const PUBLIC_APPVIEW = "https://public.api.bsky.app";

interface Session {
  accessJwt: string;
  refreshJwt: string;
  did: string;
  handle: string;
  pdsUrl: string;
}

interface SessionResponse {
  accessJwt: string;
  refreshJwt: string;
  did: string;
  handle: string;
  didDoc?: { service?: Array<{ id?: string; type?: string; serviceEndpoint?: unknown }> };
}

interface BlobRef {
  $type: "blob";
  ref: { $link: string };
  mimeType: string;
  size: number;
}

interface StrongRef {
  uri: string;
  cid: string;
}

const AUTH_ERRORS = new Set([
  "ExpiredToken",
  "InvalidToken",
  "AuthMissing",
  "AuthenticationRequired",
  "AccountTakedown",
  "AccountDeactivated",
  "AuthFactorTokenRequired",
]);

const classify: StatusClassifier = (status, body) => {
  const err = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
  if (typeof err === "string" && AUTH_ERRORS.has(err)) return "auth";
  if (status === 403) return "auth";
  return undefined;
};

function pdsFromDidDoc(doc: SessionResponse["didDoc"]): string | undefined {
  const svc = doc?.service?.find((s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer");
  return typeof svc?.serviceEndpoint === "string" ? trimSlash(svc.serviceEndpoint) : undefined;
}

function toSession(r: SessionResponse, fallbackPds: string): Session {
  return {
    accessJwt: r.accessJwt,
    refreshJwt: r.refreshJwt,
    did: r.did,
    handle: r.handle,
    pdsUrl: pdsFromDidDoc(r.didDoc) ?? fallbackPds,
  };
}

function jwtExpiresSoon(jwt: string, skewSec = 60): boolean {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return true;
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number };
    return typeof exp !== "number" || exp * 1000 < Date.now() + skewSec * 1000;
  } catch {
    return true;
  }
}

function xrpcOpts(opts: HttpOptions): HttpOptions {
  return { label: LABEL, classify, ...opts };
}

async function login(service: string, identifier: string, password: string): Promise<Session> {
  const r = await fetchJson<SessionResponse>(
    `${trimSlash(service)}/xrpc/com.atproto.server.createSession`,
    xrpcOpts({ method: "POST", json: { identifier, password }, idempotent: true }),
  );
  return toSession(r, trimSlash(service));
}

async function refreshSession(pdsUrl: string, refreshJwt: string): Promise<Session> {
  const r = await fetchJson<SessionResponse>(
    `${pdsUrl}/xrpc/com.atproto.server.refreshSession`,
    xrpcOpts({ method: "POST", headers: { authorization: `Bearer ${refreshJwt}` }, idempotent: true }),
  );
  return toSession(r, pdsUrl);
}

function storedSession(c: Credentials): Session | undefined {
  const accessJwt = credString(c, "accessJwt");
  const refreshJwt = credString(c, "refreshJwt");
  const did = credString(c, "did");
  const handle = credString(c, "handle");
  const pdsUrl = credString(c, "pdsUrl") ?? credString(c, "service");
  if (!accessJwt || !refreshJwt || !did || !handle || !pdsUrl) return undefined;
  return { accessJwt, refreshJwt, did, handle, pdsUrl };
}

function sessionToCredentials(base: Credentials, s: Session): Credentials {
  return { ...base, accessJwt: s.accessJwt, refreshJwt: s.refreshJwt, did: s.did, handle: s.handle, pdsUrl: s.pdsUrl };
}

/** Use the stored access token if fresh; otherwise refreshSession; otherwise log in again with the app password. */
async function obtainSession(c: Credentials, forceRelogin = false): Promise<Session> {
  const stored = storedSession(c);
  if (stored && !forceRelogin) {
    if (!jwtExpiresSoon(stored.accessJwt)) return stored;
    if (!jwtExpiresSoon(stored.refreshJwt, 0)) {
      try {
        return await refreshSession(stored.pdsUrl, stored.refreshJwt);
      } catch (err) {
        if (!(err instanceof AdapterError) || err.kind !== "auth") throw err;
      }
    }
  }
  const identifier = requireCred(c, "identifier", NETWORK);
  const password = requireCred(c, "appPassword", NETWORK);
  return login(credString(c, "service") ?? DEFAULT_SERVICE, identifier, password);
}

async function uploadBlob(s: Session, data: Uint8Array<ArrayBuffer>, mime: string): Promise<BlobRef> {
  const r = await fetchJson<{ blob: BlobRef }>(
    `${s.pdsUrl}/xrpc/com.atproto.repo.uploadBlob`,
    xrpcOpts({
      method: "POST",
      headers: { authorization: `Bearer ${s.accessJwt}`, "content-type": mime },
      body: new Blob([data], { type: mime }),
      idempotent: true, // blobs are content-addressed; re-uploading is harmless
      timeoutMs: 120_000,
    }),
  );
  return r.blob;
}

async function resolveHandle(s: Session, handle: string): Promise<string | undefined> {
  try {
    const r = await fetchJson<{ did: string }>(
      `${s.pdsUrl}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
      xrpcOpts({ timeoutMs: 10_000 }),
    );
    return r.did;
  } catch {
    return undefined;
  }
}

type Facet = NonNullable<RichText["facets"]>[number];

/** Links, hashtags and mentions as facets (mentions resolved to DIDs; unresolvable ones dropped). */
export async function buildFacets(text: string, resolve: (handle: string) => Promise<string | undefined>): Promise<Facet[]> {
  const rt = new RichText({ text });
  rt.detectFacetsWithoutResolution();
  const out: Facet[] = [];
  for (const facet of rt.facets ?? []) {
    const features: Facet["features"] = [];
    for (const f of facet.features) {
      if (f.$type === "app.bsky.richtext.facet#mention") {
        const did = await resolve(String((f as { did: string }).did));
        if (did) features.push({ ...f, did } as Facet["features"][number]);
      } else {
        features.push(f);
      }
    }
    if (features.length) out.push({ ...facet, features });
  }
  return out;
}

async function buildEmbed(s: Session, post: ComposedPost): Promise<Record<string, unknown> | undefined> {
  if (post.media.length === 0) return undefined;
  const video = post.media.find((m) => mediaKind(m) === "video");
  if (video) {
    // Best effort: direct PDS blob upload + app.bsky.embed.video (the video.bsky.app job service is not used yet).
    const dl = await downloadMedia(video.url, { maxBytes: maxBytesFor(NETWORK, video), mimeHint: video.mime });
    const blob = await uploadBlob(s, dl.data, dl.mime);
    return {
      $type: "app.bsky.embed.video",
      video: blob,
      ...(video.alt ? { alt: video.alt } : {}),
      ...(video.width && video.height ? { aspectRatio: { width: video.width, height: video.height } } : {}),
    };
  }
  const images = [];
  for (const [i, m] of post.media.slice(0, NETWORK_LIMITS.BLUESKY.images).entries()) {
    const dl = await downloadMedia(m.url, { maxBytes: maxBytesFor(NETWORK, m), mimeHint: m.mime, index: i });
    const blob = await uploadBlob(s, dl.data, dl.mime);
    images.push({
      image: blob,
      alt: m.alt ?? "",
      ...(m.width && m.height ? { aspectRatio: { width: m.width, height: m.height } } : {}),
    });
  }
  return { $type: "app.bsky.embed.images", images };
}

async function createPost(s: Session, record: Record<string, unknown>): Promise<StrongRef> {
  return fetchJson<StrongRef>(
    `${s.pdsUrl}/xrpc/com.atproto.repo.createRecord`,
    xrpcOpts({
      method: "POST",
      headers: { authorization: `Bearer ${s.accessJwt}` },
      json: { repo: s.did, collection: "app.bsky.feed.post", record },
    }),
  );
}

export function parseAtUri(uri: string): { repo: string; collection: string; rkey: string } {
  const m = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(uri);
  if (!m?.[1] || !m[2] || !m[3]) throw new AdapterError("rejected", `Invalid Bluesky post id: ${uri}`);
  return { repo: m[1], collection: m[2], rkey: m[3] };
}

const postUrl = (handle: string, uri: string) => `https://bsky.app/profile/${handle}/post/${parseAtUri(uri).rkey}`;

async function publishWith(s: Session, post: ComposedPost, onCreated: () => void): Promise<PublishResult> {
  const parts = threadParts(NETWORK, post);
  const embed = await buildEmbed(s, post);
  const langs = typeof post.options.lang === "string" ? [post.options.lang] : undefined;
  const refs: StrongRef[] = [];
  for (const [i, text] of parts.entries()) {
    const facets = await buildFacets(text, (h) => resolveHandle(s, h));
    const root = refs[0];
    const parent = refs[refs.length - 1];
    const record: Record<string, unknown> = {
      $type: "app.bsky.feed.post",
      text,
      createdAt: new Date().toISOString(),
      ...(facets.length ? { facets } : {}),
      ...(i === 0 && embed ? { embed } : {}),
      ...(langs ? { langs } : {}),
      ...(root && parent ? { reply: { root, parent } } : {}),
    };
    refs.push(await createPost(s, record));
    onCreated();
  }
  const first = refs[0];
  if (!first) throw new AdapterError("rejected", "Nothing to publish");
  return { externalId: first.uri, url: postUrl(s.handle, first.uri), partIds: refs.map((r) => r.uri) };
}

export const blueskyAdapter: NetworkAdapter = {
  network: NETWORK,
  limits: NETWORK_LIMITS.BLUESKY,
  connectKind: "credentials",
  credentialFields: [
    { name: "identifier", label: "Handle or email", type: "text", placeholder: "you.bsky.social", required: true },
    {
      name: "appPassword",
      label: "App password",
      type: "password",
      placeholder: "xxxx-xxxx-xxxx-xxxx",
      help: "Create one in Bluesky → Settings → Privacy and security → App passwords. Never use your main password.",
      required: true,
    },
    { name: "service", label: "Hosting provider (optional)", type: "url", placeholder: DEFAULT_SERVICE, required: false },
  ],

  async connectWithCredentials(fields): Promise<ConnectTarget[]> {
    const identifier = requireField(fields, "identifier", "Handle").replace(/^@/, "");
    const appPassword = requireField(fields, "appPassword", "App password");
    let service = trimSlash(optionalField(fields, "service") ?? DEFAULT_SERVICE);
    if (service !== DEFAULT_SERVICE) service = trimSlash((await assertPublicUrl(service)).toString());
    const s = await login(service, identifier, appPassword);

    let name = s.handle;
    let avatarUrl: string | undefined;
    try {
      const p = await fetchJson<{ displayName?: string; avatar?: string }>(
        `${PUBLIC_APPVIEW}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(s.did)}`,
        { label: LABEL, timeoutMs: 10_000 },
      );
      name = p.displayName || s.handle;
      avatarUrl = p.avatar;
    } catch {
      /* profile is cosmetic */
    }
    return [
      {
        network: NETWORK,
        externalId: s.did,
        name,
        username: s.handle,
        avatarUrl,
        credentials: sessionToCredentials({ identifier, appPassword, service }, s),
        extras: { handle: s.handle },
      },
    ];
  },

  async refresh(credentials): Promise<Credentials | null> {
    const s = await obtainSession(credentials);
    return sessionToCredentials(credentials, s);
  },

  validate: (post) => validateForNetwork(NETWORK, post),

  async publish(post, credentials) {
    assertValid(NETWORK, post);
    let created = 0;
    const s = await obtainSession(credentials);
    try {
      return await publishWith(s, post, () => created++);
    } catch (err) {
      // Stale stored session: log in again, but only if nothing was posted yet (never duplicate parts).
      if (err instanceof AdapterError && err.kind === "auth" && created === 0 && credString(credentials, "appPassword")) {
        const fresh = await obtainSession(credentials, true);
        return publishWith(fresh, post, () => created++);
      }
      throw err;
    }
  },

  async delete(externalId, credentials, _channelExtras, partIds) {
    const records = deletionOrder(externalId, partIds).map(parseAtUri);
    const run = async (s: Session) => {
      for (const { repo, collection, rkey } of records) {
        await fetchJson(
          `${s.pdsUrl}/xrpc/com.atproto.repo.deleteRecord`,
          xrpcOpts({
            method: "POST",
            headers: { authorization: `Bearer ${s.accessJwt}` },
            json: { repo, collection, rkey },
            idempotent: true, // deleting an already-deleted record succeeds
          }),
        );
      }
    };
    try {
      await run(await obtainSession(credentials));
    } catch (err) {
      if (err instanceof AdapterError && err.kind === "auth" && credString(credentials, "appPassword")) {
        await run(await obtainSession(credentials, true));
        return;
      }
      throw err;
    }
  },
};
