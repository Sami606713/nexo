import type { Metadata } from "next";
import { ContactContent } from "@/components/site/pages";

export const metadata: Metadata = {
  title: "Contact",
  description: "Questions, feedback or partnerships. Get in touch with the Nexo team.",
};

export default function ContactPage() {
  return <ContactContent />;
}
