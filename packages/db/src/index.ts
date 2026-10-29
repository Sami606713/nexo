import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * On Vercel every function instance has its own pool. Cap it so many concurrent instances can't exhaust the
 * database's connections, and wait a little longer for a free one. Values already in the URL win, so the
 * defaults can be overridden from the env var.
 */
export function withPoolDefaults(url: string | undefined, serverless = !!process.env.VERCEL): string | undefined {
  if (!url || !serverless) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "5");
    if (!u.searchParams.has("pool_timeout")) u.searchParams.set("pool_timeout", "20");
    return u.toString();
  } catch {
    return url;
  }
}

const datasourceUrl = withPoolDefaults(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    ...(datasourceUrl ? { datasourceUrl } : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export * from "@prisma/client";
