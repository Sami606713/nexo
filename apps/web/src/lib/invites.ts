// OWNED BY: web-platform agent.
import "server-only";
import { randomBytes } from "node:crypto";
import { prisma, type Invite } from "@postline/db";
import { appUrl, sendMail, simpleHtml } from "./mail";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const newInviteToken = () => randomBytes(24).toString("base64url");

export async function sendInviteEmail(invite: Invite, brandName: string, inviterName: string) {
  const url = appUrl(`/invite/${invite.token}`);
  const how = await sendMail({
    to: invite.email,
    subject: `${inviterName} invited you to ${brandName} on ${process.env.APP_NAME ?? "Nexo"}`,
    text: `${inviterName} invited you to join ${brandName} as ${invite.role.toLowerCase()}.\n\nAccept the invitation: ${url}\n\nThis link expires in 7 days.`,
    html: simpleHtml(
      `Join ${brandName}`,
      `${inviterName} invited you to collaborate on ${brandName} as ${invite.role.toLowerCase()}. The link expires in 7 days.`,
      { label: "Accept invitation", url },
    ),
  });
  if (how === "console") console.log(`[invite] ${invite.email} → ${url}`);
}

/** Public projection of an invite (no token). */
export function inviteDto(i: Invite) {
  return {
    id: i.id,
    email: i.email,
    role: i.role,
    createdAt: i.createdAt,
    expiresAt: i.expiresAt,
    expired: i.expiresAt.getTime() < Date.now(),
  };
}

export async function findValidInvite(token: string) {
  const invite = await prisma.invite.findUnique({ where: { token }, include: { brand: { select: { id: true, name: true } } } });
  if (!invite) return { invite: null, reason: "This invitation link is invalid." } as const;
  if (invite.acceptedAt) return { invite, reason: "This invitation has already been accepted." } as const;
  if (invite.expiresAt.getTime() < Date.now()) return { invite, reason: "This invitation has expired. Ask for a new one." } as const;
  return { invite, reason: null } as const;
}
