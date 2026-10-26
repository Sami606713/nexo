import type { ReactNode } from "react";
import { auth } from "@/auth";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";

/** Public marketing pages: shared header/footer. Signed-in visitors see "Open app" instead of log in/sign up. */
export default async function SiteLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  return (
    <>
      <SiteHeader signedIn={!!session?.user} />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
