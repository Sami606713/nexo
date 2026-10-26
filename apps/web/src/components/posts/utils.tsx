"use client";

import Link from "next/link";
import useSWR from "swr";
import { Anchor, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import type { PostStatus } from "@postline/core";
import { ApiError } from "@/lib/fetcher";
import type { ChannelDTO, LabelDTO, MediaDTO } from "@/lib/posts/types";

export const STATUS_COLORS: Record<PostStatus, string> = {
  GENERATING: "violet",
  DRAFT: "gray",
  PENDING_APPROVAL: "yellow",
  SCHEDULED: "blue",
  PUBLISHING: "cyan",
  POSTED: "green",
  NEEDS_ATTENTION: "orange",
  ERROR: "red",
};

/** Show a server error. 402 → "Out of credits" with a billing link. */
export function notifyError(err: unknown, brandId?: string, fallback = "Something went wrong") {
  if (err instanceof ApiError && err.status === 402) {
    notifications.show({
      color: "orange",
      title: "Out of credits",
      message: (
        <Text size="sm">
          {err.message}{" "}
          {brandId && (
            <Anchor component={Link} href={`/app/${brandId}/settings/billing`} size="sm">
              View billing
            </Anchor>
          )}
        </Text>
      ),
      autoClose: 8000,
    });
    return;
  }
  const message = err instanceof Error ? err.message : fallback;
  notifications.show({ color: "red", title: "Couldn't complete that", message: message || fallback });
}

export function notifyOk(message: string, title?: string) {
  notifications.show({ color: "green", title, message });
}

/** Accept either a bare array or `{ <key>: [...] }` (resilient to sibling API shapes). */
export function asArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    for (const v of Object.values(data)) if (Array.isArray(v)) return v as T[];
  }
  return [];
}

export interface MemberLite {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
}

export function normalizeMember(m: unknown): MemberLite | null {
  if (!m || typeof m !== "object") return null;
  const r = m as Record<string, unknown>;
  const user = (r.user && typeof r.user === "object" ? r.user : {}) as Record<string, unknown>;
  const userId = (r.userId ?? user.id ?? r.id) as string | undefined;
  if (!userId) return null;
  const email = String(user.email ?? r.email ?? "");
  return {
    userId,
    email,
    name: String(user.name ?? r.name ?? email ?? "Member") || email,
    image: (user.image ?? r.image ?? null) as string | null,
    role: String(r.role ?? ""),
  };
}

export function useBrandChannels(brandId: string) {
  const { data, error, isLoading } = useSWR(`/api/brands/${brandId}/channels`);
  return { channels: asArray<ChannelDTO>(data), error, isLoading };
}

export function useLabels(brandId: string) {
  const { data, isLoading } = useSWR(`/api/brands/${brandId}/labels`);
  return { labels: asArray<LabelDTO>(data), isLoading };
}

export interface HashtagLibraryDTO {
  id: string;
  name: string;
  tags: string[];
}

export function useHashtagLibraries(brandId: string) {
  const { data, isLoading } = useSWR(`/api/brands/${brandId}/hashtag-libraries`);
  return { libraries: asArray<HashtagLibraryDTO>(data), isLoading };
}

export function useMembers(brandId: string) {
  const { data, isLoading } = useSWR(`/api/brands/${brandId}/members`);
  const members = asArray<unknown>(data)
    .map(normalizeMember)
    .filter((m): m is MemberLite => !!m);
  return { members, isLoading };
}

export async function uploadMedia(brandId: string, file: File): Promise<MediaDTO> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/brands/${brandId}/media`, { method: "POST", body: fd });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, body?.error ?? res.statusText, body);
  return body as MediaDTO;
}

export function excerpt(text: string, max = 120) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function isLockedStatus(status: PostStatus) {
  return status === "PUBLISHING" || status === "POSTED" || status === "NEEDS_ATTENTION";
}
