import type { Metadata } from "next";
import { FeaturesContent } from "@/components/site/pages";

export const metadata: Metadata = {
  title: "Features",
  description: "AI writer, planner, campaigns, design studio, social inbox, automations, analytics and approvals in one free workspace.",
};

export default function FeaturesPage() {
  return <FeaturesContent />;
}
