import "server-only";

export interface StockPhoto {
  provider: "unsplash" | "pexels";
  id: string;
  thumb: string;
  full: string;
  width: number;
  height: number;
  author: string;
  authorUrl: string;
  /** Unsplash requires pinging this when a photo is used. */
  downloadLocation?: string;
}

export const stockProviders = () => ({
  unsplash: !!process.env.UNSPLASH_ACCESS_KEY,
  pexels: !!process.env.PEXELS_API_KEY,
});

/** Hosts a stock import may fetch from (prevents SSRF through the import route). */
export const STOCK_HOSTS = ["images.unsplash.com", "images.pexels.com"];

export async function searchStock(provider: "unsplash" | "pexels", q: string, page: number): Promise<StockPhoto[]> {
  if (provider === "unsplash") {
    const url = q
      ? `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=24&page=${page}&content_filter=high`
      : `https://api.unsplash.com/photos?per_page=24&page=${page}&order_by=popular`;
    const res = await fetch(url, { headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`, "Accept-Version": "v1" }, cache: "no-store" });
    if (!res.ok) throw new Error(`Unsplash ${res.status}`);
    const body = (await res.json()) as unknown;
    const list = (Array.isArray(body) ? body : (body as { results: unknown[] }).results) as {
      id: string;
      width: number;
      height: number;
      urls: { small: string; regular: string };
      user: { name: string; links: { html: string } };
      links: { download_location: string };
    }[];
    return list.map((p) => ({
      provider: "unsplash",
      id: p.id,
      thumb: p.urls.small,
      full: p.urls.regular,
      width: p.width,
      height: p.height,
      author: p.user.name,
      authorUrl: `${p.user.links.html}?utm_source=ocoya_clone&utm_medium=referral`,
      downloadLocation: p.links.download_location,
    }));
  }
  const url = q
    ? `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=24&page=${page}`
    : `https://api.pexels.com/v1/curated?per_page=24&page=${page}`;
  const res = await fetch(url, { headers: { Authorization: process.env.PEXELS_API_KEY ?? "" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Pexels ${res.status}`);
  const body = (await res.json()) as {
    photos: { id: number; width: number; height: number; photographer: string; photographer_url: string; src: { medium: string; large2x: string } }[];
  };
  return body.photos.map((p) => ({
    provider: "pexels",
    id: String(p.id),
    thumb: p.src.medium,
    full: p.src.large2x,
    width: p.width,
    height: p.height,
    author: p.photographer,
    authorUrl: p.photographer_url,
  }));
}
