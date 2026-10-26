import type { Metadata } from "next";
import { LegalContent } from "@/components/site/pages";
import { TERMS } from "@/components/site/legal";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return <LegalContent doc={TERMS} />;
}
