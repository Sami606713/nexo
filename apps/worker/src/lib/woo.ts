import { safeFetchText } from "./rss";
import { stripHtml } from "./template";

export interface WooCredentials {
  consumerKey: string;
  consumerSecret: string;
}

export interface WooProductPayload {
  id: string;
  name: string;
  permalink: string;
  price: string;
  short_description: string;
  images: string[];
  image: string;
}

interface RawProduct {
  id?: number | string;
  name?: string;
  permalink?: string;
  price?: string | number;
  short_description?: string;
  images?: Array<{ src?: string }>;
}

export function wooProductsUrl(storeUrl: string, creds: WooCredentials, perPage = 20): { url: string; headers: Record<string, string> } {
  const base = storeUrl.replace(/\/+$/, "");
  const u = new URL(`${base}/wp-json/wc/v3/products`);
  u.searchParams.set("status", "publish");
  u.searchParams.set("orderby", "date");
  u.searchParams.set("order", "desc");
  u.searchParams.set("per_page", String(perPage));
  const headers: Record<string, string> = { accept: "application/json" };
  if (u.protocol === "https:") {
    headers.authorization = `Basic ${Buffer.from(`${creds.consumerKey}:${creds.consumerSecret}`).toString("base64")}`;
  } else {
    // Plain-http stores (local dev) — WooCommerce also accepts query-string keys.
    u.searchParams.set("consumer_key", creds.consumerKey);
    u.searchParams.set("consumer_secret", creds.consumerSecret);
  }
  return { url: u.toString(), headers };
}

export function toProductPayload(p: RawProduct): WooProductPayload {
  const images = (p.images ?? []).map((i) => i?.src).filter((s): s is string => typeof s === "string" && !!s);
  return {
    id: String(p.id ?? ""),
    name: stripHtml(p.name ?? ""),
    permalink: p.permalink ?? "",
    price: p.price === undefined || p.price === null ? "" : String(p.price),
    short_description: stripHtml(p.short_description ?? "").slice(0, 1500),
    images,
    image: images[0] ?? "",
  };
}

/** Newest published products first. Throws with a readable message on auth / network errors. */
export async function fetchWooProducts(storeUrl: string, creds: WooCredentials, perPage = 20): Promise<WooProductPayload[]> {
  const { url, headers } = wooProductsUrl(storeUrl, creds, perPage);
  const res = await safeFetchText(url, { headers });
  if (res.status === 401 || res.status === 403) throw new Error("WooCommerce rejected the API keys");
  if (res.status >= 400) throw new Error(`WooCommerce returned HTTP ${res.status}`);
  let data: unknown;
  try {
    data = JSON.parse(res.text);
  } catch {
    throw new Error("WooCommerce returned an invalid response");
  }
  if (!Array.isArray(data)) throw new Error("WooCommerce returned an unexpected response");
  return (data as RawProduct[]).map(toProductPayload).filter((p) => p.id);
}
