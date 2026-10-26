import type { Metadata } from "next";
import { ContactContent } from "@/components/site/pages";

export const metadata: Metadata = {
  title: "Contact",
  description: "Questions, feedback or Enterprise plans — get in touch.",
};

export default function ContactPage() {
  return <ContactContent />;
}
