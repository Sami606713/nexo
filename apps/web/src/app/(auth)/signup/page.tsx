import type { Metadata } from "next";
import { AuthLayout } from "@/components/ui/AuthLayout";
import { SignupForm } from "@/components/ui/SignupForm";
import { googleEnabled } from "@/auth";
import { safeCallback } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Create your account" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function SignupPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const email = Array.isArray(sp.email) ? sp.email[0] : sp.email;
  return (
    <AuthLayout title="Create your account" subtitle="Start your free trial — 50 AI credits, 3 channels, no card required.">
      <SignupForm callbackUrl={safeCallback(sp.callbackUrl, "/onboarding")} googleEnabled={googleEnabled()} defaultEmail={email} />
    </AuthLayout>
  );
}
