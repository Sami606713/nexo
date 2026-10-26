import { requireBrand } from "@/lib/session";
import { CampaignComposer } from "@/components/campaigns/CampaignComposer";

export default async function NewCampaignPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  await requireBrand(brandId, "posts.write");
  return <CampaignComposer />;
}
