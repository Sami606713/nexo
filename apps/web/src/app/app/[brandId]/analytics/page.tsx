import type { Metadata } from "next";
import { requireBrand } from "@/lib/session";
import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  await requireBrand(brandId, "analytics.view");
  return <AnalyticsDashboard />;
}
