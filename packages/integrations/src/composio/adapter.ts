// NetworkAdapter backed by Composio tool execution. Credentials hold only Composio ids — Composio owns the tokens.
import {
  AdapterError,
  NETWORK_LIMITS,
  mediaKind,
  type ComposedPost,
  type ConnectTarget,
  type Credentials,
  type MediaItem,
  type Network,
  type NetworkAdapter,
  type PublishResult,
  type ValidationIssue,
} from "@postline/core";
import { validateForNetwork } from "../rules";
import { threadParts } from "../util";
import { toLittleText } from "../adapters/linkedin";
import { executeTool, proxyRequest, toAdapterError, waitForActive } from "./api";
import { COMPOSIO_NETWORKS } from "./networks";

/** Shape of Channel credentials for Composio channels (encrypted like any other channel). */
export interface ComposioCredentials extends Credentials {
  composioAccountId: string;
  composioUserId: string;
  /** Network-specific publishing target. */
  pageId?: string;
  igUserId?: string;
  authorUrn?: string;
  boardId?: string;
  slackChannelId?: string;
  notionParentId?: string;
}

/* ───────────── helpers ───────────── */

type Json = Record<string, unknown>;

/** Composio wraps provider payloads differently per tool (`response_data`, `response_dict`, `data`, …). */
export function unwrap(data: unknown): Json {
  let cur: unknown = data;
  for (let i = 0; i < 3 && cur && typeof cur === "object"; i++) {
    const o = cur as Json;
    const inner = o.response_data ?? o.response_dict ?? (Object.keys(o).length === 1 ? o.data : undefined);
    // Stop at arrays: callers look the list up by key (`data`, `items`, …).
    if (!inner || typeof inner !== "object" || Array.isArray(inner)) break;
    cur = inner;
  }
  return (cur && typeof cur === "object" ? cur : {}) as Json;
}

/** Depth-first search for the first string value under any of `keys` (case-insensitive). */
export function findString(obj: unknown, keys: string[], depth = 0): string | undefined {
  if (!obj || typeof obj !== "object" || depth > 5) return undefined;
  const o = obj as Json;
  const byLower = new Map(Object.keys(o).map((k) => [k.toLowerCase(), k]));
  for (const k of keys) {
    const actual = byLower.get(k.toLowerCase());
    const v = actual === undefined ? undefined : o[actual];
    if (typeof v === "string" && v) return v;
    if (typeof v === "number") return String(v);
  }
  for (const v of Object.values(o)) {
    const found = findString(v, keys, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/** First string anywhere in `obj` (keys or values, including JSON text) matching `re`. */
function findMatch(obj: unknown, re: RegExp): string | undefined {
  const m = JSON.stringify(obj ?? null).match(re);
  return m?.[0];
}

/** Bounded copy of a provider response for diagnostics on the post. */
const snippet = (data: unknown) => JSON.stringify(data ?? null).slice(0, 1500);

export function findArray(obj: unknown, keys: string[]): Json[] {
  const o = unwrap(obj);
  for (const k of keys) if (Array.isArray(o[k])) return o[k] as Json[];
  if (Array.isArray(obj)) return obj as Json[];
  return [];
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[?::1\]?)/i;
const isPublicUrl = (url: string) => {
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && !PRIVATE_HOST.test(u.hostname);
  } catch {
    return false;
  }
};

/**
 * Networks that download media themselves (Instagram, Facebook) need a public URL. With PUBLIC_MEDIA_BASE_URL
 * set (a tunnel/CDN serving the web app's public/ folder), local media URLs are rewritten onto it.
 */
export function publicMediaUrl(url: string): string {
  const base = process.env.PUBLIC_MEDIA_BASE_URL?.replace(/\/+$/, "");
  if (!base || isPublicUrl(url)) return url;
  try {
    const u = new URL(url);
    return `${base}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

const cred = (c: Credentials) => c as ComposioCredentials;

export async function run<T = Json>(c: Credentials, slug: string, args: Json, action: string): Promise<T> {
  try {
    return await executeTool<T>(slug, { connectedAccountId: cred(c).composioAccountId, userId: cred(c).composioUserId, arguments: args });
  } catch (err) {
    throw toAdapterError(err, action);
  }
}

/* ───────────── validation ───────────── */

function composioRules(network: Network, post: Pick<ComposedPost, "caption" | "media" | "options">): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const images = post.media.filter((m) => mediaKind(m) === "image");
  const videos = post.media.filter((m) => mediaKind(m) === "video");
  const err = (message: string, code: ValidationIssue["code"] = "unsupported_media") => issues.push({ level: "error", code, message });

  switch (network) {
    case "X":
      if (post.media.length) err("X posts through Composio are text-only — remove the media or customize this channel's post");
      break;
    case "YOUTUBE":
      err("Publishing videos to YouTube through Composio isn't supported yet (connect works; upload needs a file transfer Composio's REST API doesn't expose)");
      break;
    case "FACEBOOK":
      if (videos.length) err("Facebook video posts through Composio aren't supported yet — use an image");
      else if (images.length > 1) issues.push({ level: "warning", code: "too_many_images", message: "Only the first image will be posted to Facebook" });
      break;
    case "PINTEREST":
      if (images.length !== 1 || videos.length) err("Pinterest pins need exactly one image");
      break;
    // Reddit's subreddit/title rules live in ../rules (shared with the editor).
    case "SLACK":
      if (videos.length) issues.push({ level: "warning", code: "unsupported_media", message: "Slack messages will link to videos instead of embedding them" });
      break;
  }

  // Instagram and Facebook fetch media themselves, so it must be reachable from the internet.
  if ((network === "INSTAGRAM" || network === "FACEBOOK") && post.media.some((m) => m.url && !isPublicUrl(publicMediaUrl(m.url))))
    err(
      `${network === "INSTAGRAM" ? "Instagram" : "Facebook"} must download your media from a public URL — set PUBLIC_MEDIA_BASE_URL (e.g. a Cloudflare tunnel to the app's public/ folder) or configure S3 storage`,
    );
  return issues;
}

/* ───────────── publishing per network ───────────── */

const firstLine = (s: string) => s.split("\n").find((l) => l.trim())?.trim() ?? "";
/** Text after the first non-empty line. */
const afterFirstLine = (s: string) => {
  const lines = s.split("\n");
  const i = lines.findIndex((l) => l.trim());
  return i < 0 ? "" : lines.slice(i + 1).join("\n").trim();
};

/** Plain-text title of a Notion page object (`properties.title.title[].plain_text`, or any title property). */
function notionTitle(page: Json): string {
  const props = (page.properties ?? {}) as Record<string, Json>;
  for (const p of Object.values(props)) {
    if (p && p.type === "title" && Array.isArray(p.title)) {
      const text = (p.title as Json[]).map((r) => String(r.plain_text ?? "")).join("");
      if (text) return text;
    }
  }
  return findString(page, ["plain_text", "title"]) ?? "Untitled";
}

/** Reddit title: explicit option, else the caption's first line (Reddit caps titles at 300 chars). */
function redditTitle(post: Pick<ComposedPost, "caption" | "options">): string {
  const opt = typeof post.options.title === "string" ? post.options.title.trim() : "";
  return (opt || firstLine(post.caption)).slice(0, 300);
}

async function publishReddit(post: ComposedPost, c: Credentials): Promise<PublishResult> {
  const subreddit = String(post.options.subreddit ?? "").replace(/^\/?r\//i, "").trim();
  const title = redditTitle(post);
  const link = typeof post.options.link === "string" && post.options.link.trim() ? post.options.link.trim() : undefined;
  // With an explicit title the whole caption is the body; otherwise the first line was used as the title.
  const body = typeof post.options.title === "string" && post.options.title.trim() ? post.caption : afterFirstLine(post.caption);
  const data = await run(
    c,
    "REDDIT_CREATE_REDDIT_POST",
    {
      subreddit,
      title,
      kind: link ? "link" : "self",
      ...(link ? { url: link } : { text: body }),
      flair_id: typeof post.options.flairId === "string" ? post.options.flairId : "",
    },
    "Reddit post",
  );
  const fullname = findMatch(data, /t3_[a-z0-9]+/i) ?? findString(data, ["name", "id"]);
  if (!fullname) throw new AdapterError("unknown", "Reddit accepted the post but returned no id — check Reddit before retrying", { body: snippet(data) });
  const id = fullname.startsWith("t3_") ? fullname : `t3_${fullname}`;
  const url = findString(data, ["url", "permalink"]);
  return { externalId: id, url: url ? (url.startsWith("http") ? url : `https://www.reddit.com${url}`) : `https://www.reddit.com/r/${subreddit}/comments/${id.slice(3)}/` };
}

async function publishSlack(post: ComposedPost, c: Credentials): Promise<PublishResult> {
  const channel = cred(c).slackChannelId;
  if (!channel) throw new AdapterError("auth", "Slack channel is unknown — reconnect this channel");
  const mediaLinks = post.media.map((m) => m.url).filter(Boolean);
  const text = [post.caption, ...mediaLinks].filter(Boolean).join("\n\n");
  const data = await run(c, "SLACK_CHAT_POST_MESSAGE", { channel, markdown_text: text }, "Slack message");
  const ts = findString(data, ["ts"]);
  if (!ts) throw new AdapterError("unknown", "Slack accepted the message but returned no timestamp — check Slack before retrying", { body: snippet(data) });
  return { externalId: `${channel}:${ts}`, url: `https://slack.com/app_redirect?channel=${channel}` };
}

async function publishNotion(post: ComposedPost, c: Credentials): Promise<PublishResult> {
  const parentId = (typeof post.options.parentPageId === "string" && post.options.parentPageId) || cred(c).notionParentId;
  if (!parentId) throw new AdapterError("rejected", "Notion needs a parent page — share a page with the integration, then reconnect");
  const title = (typeof post.options.title === "string" && post.options.title.trim()) || firstLine(post.caption).slice(0, 200) || "Untitled post";
  const cover = post.media.find((m) => mediaKind(m) === "image" && isPublicUrl(m.url))?.url;
  const page = await run(c, "NOTION_CREATE_NOTION_PAGE", { parent_id: parentId, title, ...(cover ? { cover } : {}) }, "Notion page");
  const id = findString(page, ["id"]);
  if (!id) throw new AdapterError("unknown", "Notion created the page but returned no id — check Notion before retrying", { body: snippet(page) });
  const body = typeof post.options.title === "string" && post.options.title.trim() ? post.caption : afterFirstLine(post.caption);
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length)
    await run(
      c,
      "NOTION_ADD_MULTIPLE_PAGE_CONTENT",
      { parent_block_id: id, content_blocks: paragraphs.map((content) => ({ content_block: { content, block_property: "paragraph" } })) },
      "Notion page content",
    );
  const url = findString(page, ["url", "public_url"]) ?? `https://www.notion.so/${id.replace(/-/g, "")}`;
  return { externalId: id, url };
}

const LINKEDIN_API = "https://api.linkedin.com";
const linkedinHeaders = () => ({ "LinkedIn-Version": process.env.LINKEDIN_API_VERSION || "202601", "X-Restli-Protocol-Version": "2.0.0" });

export async function proxy(c: Credentials, action: string, req: Omit<Parameters<typeof proxyRequest>[0], "connectedAccountId" | "userId">) {
  try {
    return await proxyRequest({ ...req, connectedAccountId: cred(c).composioAccountId, userId: cred(c).composioUserId });
  } catch (err) {
    throw toAdapterError(err, action);
  }
}

/** Download our own media (works for localhost URLs — the worker runs next to the app). */
async function mediaBytes(m: MediaItem, maxBytes: number): Promise<{ base64: string; contentType: string }> {
  let res: Response;
  try {
    res = await fetch(m.url, { signal: AbortSignal.timeout(60_000) });
  } catch (err) {
    throw new AdapterError("transient", `Couldn't read media ${m.url}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) throw new AdapterError("rejected", `Couldn't read media ${m.url} (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) throw new AdapterError("rejected", `Media is too large (${Math.round(buf.byteLength / 1e6)} MB)`);
  return { base64: buf.toString("base64"), contentType: (res.headers.get("content-type") ?? m.mime).split(";")[0]! };
}

/** LinkedIn Images API via the Composio proxy: register an upload, PUT the bytes, return the image URN. */
async function linkedinUploadImage(c: Credentials, owner: string, m: MediaItem): Promise<string> {
  const init = await proxy(c, "LinkedIn image upload", {
    endpoint: `${LINKEDIN_API}/rest/images?action=initializeUpload`,
    method: "POST",
    headers: linkedinHeaders(),
    body: { initializeUploadRequest: { owner } },
  });
  const value = (init.data as { value?: { uploadUrl?: string; image?: string } } | null)?.value;
  if (!value?.uploadUrl || !value.image) throw new AdapterError("rejected", "LinkedIn didn't return an upload URL", { body: snippet(init.data) });
  const bytes = await mediaBytes(m, NETWORK_LIMITS.LINKEDIN.imageMaxBytes ?? 10e6);
  await proxy(c, "LinkedIn image upload", { endpoint: value.uploadUrl, method: "PUT", binary: bytes });
  return value.image;
}

/** Posts API through the Composio proxy (text, one image, or a multi-image post). */
async function publishLinkedIn(post: ComposedPost, c: Credentials): Promise<PublishResult> {
  const author = cred(c).authorUrn;
  if (!author) throw new AdapterError("auth", "LinkedIn author is unknown — reconnect this channel");
  const images: Array<{ id: string; altText?: string }> = [];
  for (const m of post.media) images.push({ id: await linkedinUploadImage(c, author, m), ...(m.alt ? { altText: m.alt.slice(0, 4086) } : {}) });

  const body: Json = {
    author,
    commentary: toLittleText(post.caption),
    visibility: post.options.visibility === "CONNECTIONS" ? "CONNECTIONS" : "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (images.length === 1) body.content = { media: images[0] };
  else if (images.length > 1) body.content = { multiImage: { images } };

  const res = await proxy(c, "LinkedIn post", { endpoint: `${LINKEDIN_API}/rest/posts`, method: "POST", headers: linkedinHeaders(), body });
  const id = res.headers["x-restli-id"] ?? res.headers["x-linkedin-id"] ?? findMatch(res.data, /urn:li:(?:share|ugcPost):\d+/);
  if (!id)
    throw new AdapterError("unknown", "LinkedIn accepted the post but returned no id — check LinkedIn before retrying", {
      body: snippet({ headers: res.headers, data: res.data }),
    });
  return { externalId: id, url: `https://www.linkedin.com/feed/update/${id}/` };
}

async function publishFacebook(post: ComposedPost, c: Credentials): Promise<PublishResult> {
  const pageId = cred(c).pageId;
  if (!pageId) throw new AdapterError("auth", "Facebook Page is unknown — reconnect this channel");
  const image = post.media.find((m) => mediaKind(m) === "image");
  const data = image
    ? await run(c, "FACEBOOK_CREATE_PHOTO_POST", { page_id: pageId, url: publicMediaUrl(image.url), message: post.caption, published: true }, "Facebook photo post")
    : await run(c, "FACEBOOK_CREATE_POST", { page_id: pageId, message: post.caption, published: true }, "Facebook post");
  const id = findString(data, ["post_id", "id"]);
  if (!id) throw new AdapterError("unknown", "Facebook accepted the request but returned no post id — check the Page before retrying");
  return { externalId: id, url: `https://www.facebook.com/${id}` };
}

async function instagramContainer(c: Credentials, args: Json): Promise<string> {
  const data = await run(c, "INSTAGRAM_CREATE_MEDIA_CONTAINER", { ig_user_id: cred(c).igUserId, ...args }, "Instagram media upload");
  const id = findString(data, ["id", "creation_id"]);
  if (!id) throw new AdapterError("rejected", "Instagram didn't return a media container id");
  return id;
}

/** Videos are processed asynchronously; wait until the container is ready before publishing. */
async function waitForContainer(c: Credentials, creationId: string): Promise<void> {
  const deadline = Date.now() + 5 * 60_000;
  for (;;) {
    const data = await run(c, "INSTAGRAM_GET_POST_STATUS", { creation_id: creationId }, "Instagram processing status");
    const status = (findString(data, ["status_code", "status"]) ?? "").toUpperCase();
    if (status === "FINISHED" || status === "PUBLISHED" || status === "") return;
    if (status === "ERROR" || status === "EXPIRED") throw new AdapterError("rejected", `Instagram couldn't process the media (${status})`);
    if (Date.now() > deadline) throw new AdapterError("transient", "Instagram is still processing the video — will retry");
    await new Promise((r) => setTimeout(r, 5000));
  }
}

function igItemArgs(m: MediaItem, carouselItem: boolean): Json {
  const video = mediaKind(m) === "video";
  return {
    ...(video
      ? { video_url: publicMediaUrl(m.url), content_type: carouselItem ? "carousel_item" : "reel" }
      : { image_url: publicMediaUrl(m.url), content_type: carouselItem ? "carousel_item" : "photo" }),
    ...(carouselItem ? { is_carousel_item: true } : {}),
  };
}

async function publishInstagram(post: ComposedPost, c: Credentials): Promise<PublishResult> {
  if (!cred(c).igUserId) throw new AdapterError("auth", "Instagram account is unknown — reconnect this channel");
  let creationId: string;
  if (post.media.length > 1) {
    const children: string[] = [];
    for (const m of post.media) {
      const id = await instagramContainer(c, igItemArgs(m, true));
      if (mediaKind(m) === "video") await waitForContainer(c, id);
      children.push(id);
    }
    const data = await run(c, "INSTAGRAM_CREATE_CAROUSEL_CONTAINER", { ig_user_id: cred(c).igUserId, children, caption: post.caption }, "Instagram carousel");
    creationId = findString(data, ["id", "creation_id"]) ?? "";
    if (!creationId) throw new AdapterError("rejected", "Instagram didn't return a carousel id");
  } else {
    const m = post.media[0]!;
    creationId = await instagramContainer(c, { ...igItemArgs(m, false), caption: post.caption });
    if (mediaKind(m) === "video") await waitForContainer(c, creationId);
  }
  const data = await run(c, "INSTAGRAM_CREATE_POST", { ig_user_id: cred(c).igUserId, creation_id: creationId }, "Instagram publish");
  const id = findString(data, ["id"]);
  if (!id) throw new AdapterError("unknown", "Instagram accepted the post but returned no media id — check Instagram before retrying");
  const username = typeof c.username === "string" ? c.username : undefined;
  return { externalId: id, url: username ? `https://www.instagram.com/${username}/` : "https://www.instagram.com/" };
}

async function publishPinterest(post: ComposedPost, c: Credentials): Promise<PublishResult> {
  const boardId = (typeof post.options.boardId === "string" && post.options.boardId) || cred(c).boardId;
  if (!boardId) throw new AdapterError("rejected", "Pinterest needs a board — create one on Pinterest, then reconnect");
  const image = post.media[0]!;
  // Send bytes (base64) so pins work even when media URLs aren't public.
  let media_source: Json = { source_type: "image_url", url: image.url };
  try {
    const res = await fetch(image.url, { signal: AbortSignal.timeout(30_000) });
    const mime = (res.headers.get("content-type") ?? image.mime).split(";")[0];
    if (res.ok && (mime === "image/jpeg" || mime === "image/png"))
      media_source = { source_type: "image_base64", content_type: mime, data: Buffer.from(await res.arrayBuffer()).toString("base64") };
  } catch {
    /* fall back to the URL */
  }
  const firstLine = post.caption.split("\n").find((l) => l.trim())?.trim() ?? "";
  const data = await run(
    c,
    "PINTEREST_CREATE_PIN",
    {
      board_id: boardId,
      media_source,
      title: firstLine.slice(0, 100) || undefined,
      description: post.caption.slice(0, 800) || undefined,
      link: typeof post.options.link === "string" && post.options.link ? post.options.link : undefined,
      alt_text: image.alt?.slice(0, 500) || undefined,
    },
    "Pinterest pin",
  );
  const id = findString(data, ["id"]);
  if (!id) throw new AdapterError("unknown", "Pinterest accepted the pin but returned no id — check Pinterest before retrying");
  return { externalId: id, url: `https://www.pinterest.com/pin/${id}/` };
}

async function publishX(post: ComposedPost, c: Credentials): Promise<PublishResult> {
  const parts = threadParts("X", post);
  const ids: string[] = [];
  for (const text of parts) {
    const data = await run(
      c,
      "TWITTER_CREATION_OF_A_POST",
      { text, ...(ids.length ? { reply__in__reply__to__tweet__id: ids[ids.length - 1] } : {}) },
      "X post",
    );
    const id = findString(data, ["id"]);
    if (!id) throw new AdapterError("unknown", "X accepted the post but returned no id — check X before retrying");
    ids.push(id);
  }
  const username = typeof c.username === "string" ? c.username : "i";
  return { externalId: ids[0]!, url: `https://x.com/${username}/status/${ids[0]}`, partIds: ids };
}

/* ───────────── connect: discover publishable targets ───────────── */

export async function discoverTargets(network: Network, accountId: string, userId: string): Promise<ConnectTarget[]> {
  const acc = await waitForActive(accountId);
  if (acc.status !== "ACTIVE") throw new AdapterError("auth", `The connection isn't active (status: ${acc.status}). Please try again.`);
  const base: ComposioCredentials = { composioAccountId: accountId, composioUserId: userId };
  const extras = { via: "composio", composioAccountId: accountId };
  const t = (externalId: string, name: string, more: Partial<ConnectTarget> & { credentials?: Partial<ComposioCredentials> } = {}): ConnectTarget => ({
    network,
    externalId,
    name,
    username: more.username,
    avatarUrl: more.avatarUrl,
    credentials: { ...base, ...more.credentials },
    extras: { ...extras, ...more.extras },
  });

  switch (network) {
    case "LINKEDIN": {
      // Shape varies: OpenID `/userinfo` (sub, name, picture) or `/v2/me` (id, localizedFirstName, profilePicture).
      const me = unwrap(await run(base, "LINKEDIN_GET_MY_INFO", {}, "LinkedIn profile"));
      const sub = findString(me, ["author_id", "sub", "id"]);
      if (!sub) throw new AdapterError("rejected", "LinkedIn didn't return your member id");
      const authorUrn = sub.startsWith("urn:li:") ? sub : `urn:li:person:${sub}`;
      const name =
        findString(me, ["name"]) ??
        ([findString(me, ["localizedFirstName", "given_name"]), findString(me, ["localizedLastName", "family_name"])].filter(Boolean).join(" ") ||
          undefined);
      const username = findString(me, ["vanityName"]);
      return [
        t(authorUrn, name || "LinkedIn profile", {
          username,
          avatarUrl: findString(me, ["picture", "displayImage"]),
          credentials: { authorUrn },
        }),
      ];
    }
    case "FACEBOOK": {
      const pages = findArray(await run(base, "FACEBOOK_GET_USER_PAGES", { fields: "id,name,picture" }, "Facebook Pages"), ["data", "pages"]);
      if (!pages.length) throw new AdapterError("rejected", "No Facebook Pages found — you need to manage at least one Page");
      return pages.map((p) =>
        t(String(p.id), String(p.name ?? "Facebook Page"), {
          avatarUrl: findString(p.picture, ["url"]),
          credentials: { pageId: String(p.id) },
        }),
      );
    }
    case "INSTAGRAM": {
      const me = unwrap(await run(base, "INSTAGRAM_GET_USER_INFO", {}, "Instagram account"));
      const id = findString(me, ["id"]);
      if (!id) throw new AdapterError("rejected", "No Instagram professional (Business/Creator) account found");
      const username = findString(me, ["username"]);
      return [
        t(id, username ? `@${username}` : "Instagram", {
          username,
          avatarUrl: findString(me, ["profile_picture_url"]),
          credentials: { igUserId: id, username },
        }),
      ];
    }
    case "PINTEREST": {
      const profile = unwrap(await run(base, "PINTEREST_GET_PROFILE", {}, "Pinterest profile"));
      const boards = findArray(await run(base, "PINTEREST_LIST_BOARDS", { page_size: 100 }, "Pinterest boards"), ["items", "boards", "data"]);
      const username = findString(profile, ["username"]);
      const boardList = boards.map((b) => ({ id: String(b.id), name: String(b.name ?? b.id) }));
      return [
        t(findString(profile, ["id"]) ?? username ?? accountId, username ? `@${username}` : "Pinterest", {
          username,
          avatarUrl: findString(profile, ["profile_image"]),
          credentials: { boardId: boardList[0]?.id, username },
          extras: { boards: boardList },
        }),
      ];
    }
    case "X": {
      const me = unwrap(await run(base, "TWITTER_USER_LOOKUP_ME", { user__fields: ["profile_image_url", "username", "name"] }, "X profile"));
      const id = findString(me, ["id"]);
      if (!id) throw new AdapterError("rejected", "X didn't return your account id");
      const username = findString(me, ["username"]);
      return [t(id, findString(me, ["name"]) ?? `@${username}`, { username, avatarUrl: findString(me, ["profile_image_url"]), credentials: { username } })];
    }
    case "YOUTUBE":
      // Composio has no "my channel" tool; identify the channel by its connected account.
      return [t(accountId, "YouTube channel")];
    case "REDDIT":
      // No identity tool on Composio's Reddit toolkit; the subreddit is chosen per post.
      return [t(accountId, "Reddit account")];
    case "SLACK": {
      const list = findArray(
        await run(base, "SLACK_LIST_CONVERSATIONS", { types: "public_channel,private_channel", exclude_archived: true, limit: 200 }, "Slack channels"),
        ["channels"],
      );
      // Only channels the connected user belongs to can be posted to.
      const member = list.filter((ch) => ch.is_member !== false);
      if (!member.length) throw new AdapterError("rejected", "No Slack channels found — join a channel, then reconnect");
      return member.slice(0, 25).map((ch) =>
        t(String(ch.id), `#${String(ch.name ?? ch.id)}`, { credentials: { slackChannelId: String(ch.id) }, extras: { team: ch.context_team_id ?? null } }),
      );
    }
    case "NOTION": {
      const pages = findArray(
        await run(base, "NOTION_SEARCH_NOTION_PAGE", { query: "", filter_value: "page", filter_property: "object", page_size: 50 }, "Notion pages"),
        ["results", "pages"],
      );
      const list = pages
        .map((p) => ({ id: String(p.id ?? ""), name: notionTitle(p) }))
        .filter((p) => p.id);
      if (!list.length) throw new AdapterError("rejected", "No Notion pages are shared with the integration — share a page during sign-in, then reconnect");
      // One channel for the workspace; posts become sub-pages of the chosen parent page (default: the first one).
      return [t(accountId, "Notion workspace", { credentials: { notionParentId: list[0]!.id }, extras: { pages: list.slice(0, 50) } })];
    }
    default:
      throw new AdapterError("rejected", `${network} isn't available through Composio`);
  }
}

/* ───────────── adapter ───────────── */

export function createComposioAdapter(network: Network): NetworkAdapter {
  if (!COMPOSIO_NETWORKS[network]) throw new Error(`${network} isn't a Composio network`);
  return {
    network,
    limits: NETWORK_LIMITS[network],
    connectKind: "oauth2",

    validate(post) {
      return [...validateForNetwork(network, post), ...composioRules(network, post)];
    },

    async publish(post, credentials) {
      if (!cred(credentials).composioAccountId) throw new AdapterError("auth", "This channel isn't linked to Composio — reconnect it");
      switch (network) {
        case "LINKEDIN":
          return publishLinkedIn(post, credentials);
        case "FACEBOOK":
          return publishFacebook(post, credentials);
        case "INSTAGRAM":
          return publishInstagram(post, credentials);
        case "PINTEREST":
          return publishPinterest(post, credentials);
        case "X":
          return publishX(post, credentials);
        case "REDDIT":
          return publishReddit(post, credentials);
        case "SLACK":
          return publishSlack(post, credentials);
        case "NOTION":
          return publishNotion(post, credentials);
        default:
          throw new AdapterError("rejected", `Publishing to ${network} through Composio isn't supported yet`);
      }
    },

    async delete(externalId, credentials, _extras, partIds) {
      switch (network) {
        case "LINKEDIN":
          await proxy(credentials, "LinkedIn delete", {
            endpoint: `${LINKEDIN_API}/rest/posts/${encodeURIComponent(externalId)}`,
            method: "DELETE",
            headers: linkedinHeaders(),
          });
          return;
        case "FACEBOOK":
          await run(credentials, "FACEBOOK_DELETE_POST", { post_id: externalId }, "Facebook delete");
          return;
        case "PINTEREST":
          await run(credentials, "PINTEREST_DELETE_PIN", { pin_id: externalId }, "Pinterest delete");
          return;
        case "X":
          for (const id of [...(partIds?.length ? partIds : [externalId])].reverse())
            await run(credentials, "TWITTER_POST_DELETE_BY_POST_ID", { id }, "X delete");
          return;
        case "REDDIT":
          await run(credentials, "REDDIT_DELETE_REDDIT_POST", { id: externalId.startsWith("t3_") ? externalId : `t3_${externalId}` }, "Reddit delete");
          return;
        case "SLACK": {
          const sep = externalId.lastIndexOf(":");
          await run(credentials, "SLACK_DELETES_A_MESSAGE_FROM_A_CHAT", { channel: externalId.slice(0, sep), ts: externalId.slice(sep + 1) }, "Slack delete");
          return;
        }
        case "NOTION":
          await run(credentials, "NOTION_ARCHIVE_NOTION_PAGE", { page_id: externalId, archive: true }, "Notion delete");
          return;
        default:
          throw new AdapterError("rejected", `${network} doesn't allow deleting posts through Composio`);
      }
    },
  };
}
