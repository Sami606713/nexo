import type { Metadata } from "next";
import { prisma } from "@postline/db";
import { requireUser } from "@/lib/session";
import { AuthLayout } from "@/components/ui/AuthLayout";
import { OnboardingForm } from "@/components/brand/OnboardingForm";

export const metadata: Metadata = { title: "Create a brand" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const count = await prisma.membership.count({ where: { userId: user.id } });
  return (
    <AuthLayout
      title={count ? "Create a new brand" : `Welcome${user.name ? `, ${user.name.split(" ")[0]}` : ""}!`}
      subtitle="A brand groups your social channels, posts, team and AI voice. You can add more brands later."
    >
      <OnboardingForm hasBrands={count > 0} />
    </AuthLayout>
  );
}
