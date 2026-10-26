"use client";

import { ApiError } from "@/lib/fetcher";
import { googleFontsHref, nearestWeight } from "./fonts";
import type { Scene } from "./scene";

// ───────────── Fonts ─────────────

let linkPromise: Promise<void> | null = null;

/** Inject the Google Fonts stylesheet once; resolves when the CSS is loaded. */
export function loadFontStylesheet(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (linkPromise) return linkPromise;
  linkPromise = new Promise((resolve) => {
    const existing = document.getElementById("studio-fonts") as HTMLLinkElement | null;
    if (existing) return resolve();
    const pre = document.createElement("link");
    pre.rel = "preconnect";
    pre.href = "https://fonts.gstatic.com";
    pre.crossOrigin = "anonymous";
    document.head.appendChild(pre);
    const link = document.createElement("link");
    link.id = "studio-fonts";
    link.rel = "stylesheet";
    link.href = googleFontsHref();
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
    setTimeout(resolve, 4000);
  });
  return linkPromise;
}

const loaded = new Set<string>();

/** Make sure every font face a scene uses is downloaded. Returns true when something new loaded. */
export async function ensureSceneFonts(scenes: Scene[]): Promise<boolean> {
  await loadFontStylesheet();
  const wanted = new Set<string>();
  for (const s of scenes)
    for (const l of s.layers)
      if (l.type === "text") wanted.add(`${l.italic ? "italic " : ""}${nearestWeight(l.fontFamily, l.fontWeight)} 40px "${l.fontFamily}"`);
  const todo = [...wanted].filter((f) => !loaded.has(f));
  if (!todo.length) return false;
  await Promise.all(todo.map((f) => document.fonts.load(f).catch(() => undefined)));
  todo.forEach((f) => loaded.add(f));
  return true;
}

export async function ensureFont(family: string, weight = 400, italic = false) {
  await loadFontStylesheet();
  const f = `${italic ? "italic " : ""}${nearestWeight(family, weight)} 40px "${family}"`;
  if (loaded.has(f)) return;
  await document.fonts.load(f).catch(() => undefined);
  loaded.add(f);
}

// ───────────── URLs ─────────────

/**
 * Make our own uploads same-origin (`/uploads/...`) so the canvas isn't tainted when APP_URL's host
 * differs from the one in the address bar (localhost vs 127.0.0.1).
 */
export function canvasSrc(url: string): string {
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  try {
    const u = new URL(url, window.location.origin);
    if (u.pathname.startsWith("/uploads/")) return u.pathname + u.search;
    return u.toString();
  } catch {
    return url;
  }
}

export function aiErrorMessage(err: unknown, what = "AI"): string {
  if (err instanceof ApiError) {
    if (err.status === 404) return `${what} isn't available on this server yet.`;
    if (err.status === 503) return `${what} isn't configured on this server yet.`;
    if (err.status === 402) return "You've run out of AI credits. Upgrade to get more.";
    return err.message;
  }
  return err instanceof Error ? err.message : "Something went wrong";
}

export async function uploadMedia(brandId: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/brands/${brandId}/media`, { method: "POST", body: fd });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.error ?? "Upload failed", body);
  return body as MediaItem;
}

export interface MediaItem {
  id: string;
  url: string;
  mime: string;
  width: number | null;
  height: number | null;
}

/** Natural size of an image URL (for sizing new layers). */
export function imageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 1000, height: 1000 });
    img.src = src;
  });
}
