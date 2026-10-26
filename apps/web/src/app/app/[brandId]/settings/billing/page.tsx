import type { Metadata } from "next";
import { Suspense } from "react";
import { requireBrand } from "@/lib/session";
import { BillingPage } from "@/components/billing/BillingPage";

export const metadata: Metadata = { title: "Billing" };

export default async function Page({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  await requireBrand(brandId, "billing.manage");
  return (
    <Suspense>
      <BillingPage />
    </Suspense>
  );
}
