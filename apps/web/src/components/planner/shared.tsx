"use client";

import { useCallback } from "react";
import { useSWRConfig } from "swr";
import type { PostGroupDTO } from "@/lib/posts/types";
import { api } from "@/lib/fetcher";
import { notifyError, notifyOk } from "@/components/posts/utils";

export interface PlannerFilters {
  status: string | null;
  channelId: string | null;
  labelId: string | null;
  q: string;
}

export function hasFilters(f: PlannerFilters) {
  return !!(f.status || f.channelId || f.labelId || f.q.trim());
}

/** Build a posts list URL from filters + extra params. */
export function postsKey(brandId: string, f: PlannerFilters, extra: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  if (f.status) sp.set("status", f.status);
  if (f.channelId) sp.set("channelId", f.channelId);
  if (f.labelId) sp.set("labelId", f.labelId);
  if (f.q.trim()) sp.set("q", f.q.trim());
  for (const [k, v] of Object.entries(extra)) if (v) sp.set(k, v);
  return `/api/brands/${brandId}/posts?${sp.toString()}`;
}

/** Revalidate every cached posts list for the brand. */
export function useRefreshPosts(brandId: string) {
  const { mutate } = useSWRConfig();
  return useCallback(
    () => mutate((key) => typeof key === "string" && key.startsWith(`/api/brands/${brandId}/posts`)),
    [mutate, brandId],
  );
}

export function useRetry(brandId: string) {
  const refresh = useRefreshPosts(brandId);
  return useCallback(
    async (g: PostGroupDTO) => {
      try {
        await api(`/api/brands/${brandId}/posts/${g.id}/retry`, "POST");
        notifyOk("Retrying failed channels now");
        await refresh();
      } catch (err) {
        notifyError(err, brandId);
      }
    },
    [brandId, refresh],
  );
}

export function canRetry(g: PostGroupDTO) {
  return (g.status === "ERROR" || g.status === "NEEDS_ATTENTION") && g.posts.some((p) => p.status === "ERROR");
}
