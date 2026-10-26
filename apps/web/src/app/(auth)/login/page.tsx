import type { Metadata } from "next";
import { AuthLayout } from "@/components/ui/AuthLayout";
import { LoginForm } from "@/components/ui/LoginForm";
import { googleEnabled } from "@/auth";
import { safeCallback } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Log in" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  return (
    <AuthLayout title="Welcome back" subtitle="Log in to plan, write and publish your social posts.">
      <LoginForm
        callbackUrl={safeCallback(sp.callbackUrl)}
        googleEnabled={googleEnabled()}
        initialError={one("error")}
        checkEmail={one("check") === "1"}
        defaultEmail={one("email")}
      />
    </AuthLayout>
  );
}
