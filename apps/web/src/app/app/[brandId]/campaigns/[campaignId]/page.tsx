import { requireBrand } from "@/lib/session";
import { CampaignReview } from "@/components/campaigns/CampaignReview";

export default async function CampaignReviewPage({ params }: { params: Promise<{ brandId: string; campaignId: string }> }) {
  const { brandId, campaignId } = await params;
  await requireBrand(brandId, "posts.viewDrafts");
  return <CampaignReview campaignId={campaignId} />;
}
