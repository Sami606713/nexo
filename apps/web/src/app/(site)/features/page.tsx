import type { Metadata } from "next";
import { AiShowcase, CtaBand, FeatureGrid, PageHeader, Section, SectionTitle, Steps } from "@/components/site/sections";

export const metadata: Metadata = {
  title: "Features",
  description: "AI writer, planner, campaigns, design studio, social inbox, automations, analytics and approvals — in one workspace.",
};

export default function FeaturesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Features"
        title="Everything you need to run social media"
        subtitle="From the first idea to the analytics report — one workspace for creators, teams and agencies."
      />
      <Section>
        <FeatureGrid detailed />
      </Section>
      <Section tinted>
        <AiShowcase />
      </Section>
      <Section>
        <SectionTitle eyebrow="How it works" title="Three steps to a full calendar" />
        <Steps />
      </Section>
      <CtaBand />
    </>
  );
}
