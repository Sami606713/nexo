import type { Metadata } from "next";
import { LegalContent } from "@/components/site/pages";
import { PRIVACY } from "@/components/site/legal";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return <LegalContent doc={PRIVACY} />;
}
