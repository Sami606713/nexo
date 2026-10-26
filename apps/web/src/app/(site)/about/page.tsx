import type { Metadata } from "next";
import { AboutContent } from "@/components/site/pages";

export const metadata: Metadata = {
  title: "About",
  description: "We're building the simplest way for small teams to create and publish great social content.",
};

export default function AboutPage() {
  return <AboutContent />;
}
