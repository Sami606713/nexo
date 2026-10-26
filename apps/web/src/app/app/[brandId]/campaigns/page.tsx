import { requireBrand } from "@/lib/session";
import { CampaignsList } from "@/components/campaigns/CampaignsList";

export default async function CampaignsPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  await requireBrand(brandId, "posts.viewDrafts");
  return <CampaignsList />;
}
