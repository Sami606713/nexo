// OWNED BY: web-platform agent. Signatures are a contract used by the web-posts agent — keep them.
import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound as pageNotFound, redirect } from "next/navigation";
import { prisma, type Brand, type Membership, type User } from "@postline/db";
import { can, type Permission } from "@postline/core";
import { auth } from "@/auth";
import { forbidden, notFound, unauthorized } from "./http";

export interface BrandAccess {
  user: User;
  brand: Brand;
  membership: Membership;
}

/** True when serving a page / server action (not an /api route handler). Set by middleware. */
async function isPageRequest(): Promise<boolean> {
  try {
    const p = (await headers()).get("x-pathname");
    return !!p && !p.startsWith("/api/");
  } catch {
    return false;
  }
}

/** Current user or null. Server components & route handlers. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
});

/** Current user or throw HttpError 401 (route handlers) / redirect to /login (pages). */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (user) return user;
  if (await isPageRequest()) {
    const p = (await headers()).get("x-pathname") ?? "/app";
    redirect(`/login?callbackUrl=${encodeURIComponent(p)}`);
  }
  throw unauthorized();
}

const loadMembership = cache((userId: string, brandId: string) =>
  prisma.membership.findUnique({ where: { userId_brandId: { userId, brandId } }, include: { brand: true } }),
);

/**
 * Load brand + caller's membership; throw 404 if not a member, 403 if `permission` is given and the role lacks it.
 * Use in every /api/brands/[brandId]/... handler and every /app/[brandId]/... page.
 * Pages: not a member → Next notFound(); missing permission → redirect to the brand's planner.
 */
export async function requireBrand(brandId: string, permission?: Permission): Promise<BrandAccess> {
  const user = await requireUser();
  const m = await loadMembership(user.id, brandId);
  if (!m) {
    if (await isPageRequest()) pageNotFound();
    throw notFound("Brand not found");
  }
  if (permission && !can(m.role, permission)) {
    if (await isPageRequest()) redirect(`/app/${brandId}/planner`);
    throw forbidden();
  }
  const { brand, ...membership } = m;
  return { user, brand, membership };
}
