import "server-only";
import { prisma, type Prisma } from "@postline/db";

export type NotificationKind = "approval_requested" | "approval_decided";

/** Best-effort in-app notifications (never fails the request). */
export async function notifyUsers(
  userIds: string[],
  brandId: string,
  kind: NotificationKind,
  payload: Record<string, unknown>,
) {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (!unique.length) return;
  try {
    await prisma.notification.createMany({
      data: unique.map((userId) => ({ userId, brandId, kind, payload: payload as Prisma.InputJsonValue })),
    });
  } catch (err) {
    console.error("[posts] failed to create notifications", err);
  }
}

export function excerpt(text: string, max = 120): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
