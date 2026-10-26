import type { Metadata } from "next";
import { requireBrand } from "@/lib/session";
import { InboxView } from "@/components/inbox/InboxView";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  await requireBrand(brandId);
  return <InboxView />;
}
