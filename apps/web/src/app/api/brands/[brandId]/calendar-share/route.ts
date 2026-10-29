import { randomBytes } from "node:crypto";
import { prisma } from "@postline/db";
import { route } from "@/lib/http";
import { requireBrand } from "@/lib/session";

type Ctx = { params: Promise<{ brandId: string }> };

function shareUrl(token: string) {
  return `${(process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")).replace(/\/+$/, "")}/share/calendar/${token}`;
}

function dto(s: { id: string; token: string; createdAt: Date; createdBy: string }) {
  return { id: s.id, token: s.token, url: shareUrl(s.token), createdAt: s.createdAt.toISOString(), createdBy: s.createdBy };
}

/** Active (non-revoked) share links. */
export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  const rows = await prisma.calendarShare.findMany({
    where: { brandId: access.brand.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(dto);
});

/** Create a new public read-only link. */
export const POST = route<Ctx>(async (_req, { params }) => {
  const { brandId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  const row = await prisma.calendarShare.create({
    data: { brandId: access.brand.id, token: randomBytes(24).toString("base64url"), createdBy: access.user.id },
  });
  return dto(row);
});

/** Revoke one link (?id=) or all active links. */
export const DELETE = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  const id = new URL(req.url).searchParams.get("id");
  const res = await prisma.calendarShare.updateMany({
    where: { brandId: access.brand.id, revokedAt: null, ...(id ? { id } : {}) },
    data: { revokedAt: new Date() },
  });
  return { ok: true, revoked: res.count };
});
