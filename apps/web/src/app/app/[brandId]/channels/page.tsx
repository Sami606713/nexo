import type { Metadata } from "next";
import { requireBrand } from "@/lib/session";
import { ChannelsView } from "@/components/channels/ChannelsView";

export const metadata: Metadata = { title: "Channels" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ChannelsPage({ params, searchParams }: { params: Promise<{ brandId: string }>; searchParams: SP }) {
  const { brandId } = await params;
  await requireBrand(brandId);
  const sp = await searchParams;
  return <ChannelsView flash={{ connected: one(sp.connected), skipped: one(sp.skipped), error: one(sp.error) }} />;
}
