import { z } from "zod";
import { prisma } from "@postline/db";
import { encryptCredentials } from "@postline/core/crypto";
import { badRequest, parseBody, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { verifyWooStore } from "@/lib/workflows/fetch";
import type { WooStoreDTO } from "@/lib/workflows/types";

type Ctx = { params: Promise<{ brandId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId);
  const rows = await prisma.wooStore.findMany({ where: { brandId }, orderBy: { createdAt: "asc" }, select: { id: true, url: true, createdAt: true } });
  return rows.map((r): WooStoreDTO => ({ id: r.id, url: r.url, createdAt: r.createdAt.toISOString() }));
});

const schema = z.object({
  url: z.string().trim().url("Enter your store URL, e.g. https://shop.example.com"),
  consumerKey: z.string().trim().min(1, "Consumer key is required"),
  consumerSecret: z.string().trim().min(1, "Consumer secret is required"),
});

export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId, "posts.write");
  const body = await parseBody(req, schema);
  let url: string;
  try {
    url = await verifyWooStore(body.url, { consumerKey: body.consumerKey, consumerSecret: body.consumerSecret });
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : "Couldn't verify the store");
  }
  const existing = await prisma.wooStore.findFirst({ where: { brandId, url } });
  const credentialsEnc = encryptCredentials({ consumerKey: body.consumerKey, consumerSecret: body.consumerSecret });
  const row = existing
    ? await prisma.wooStore.update({ where: { id: existing.id }, data: { credentialsEnc } })
    : await prisma.wooStore.create({ data: { brandId, url, credentialsEnc } });
  return { id: row.id, url: row.url, createdAt: row.createdAt.toISOString() } satisfies WooStoreDTO;
});
