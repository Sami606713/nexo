import type { Metadata } from "next";
import { CtaBand, Faq, IntegrationTiles, PageHeader, Section, SectionHead } from "@/components/site/sections";

export const metadata: Metadata = {
  title: "Integrations",
  description: "Publish to LinkedIn, Instagram, Facebook, Pinterest, Reddit, Slack and Notion. Connect in a couple of clicks.",
};

const FAQ = [
  {
    q: "How do I connect an account?",
    a: "Open Channels, choose a network and sign in. You approve access on the network's own page, then come back with the account connected.",
  },
  { q: "Is my password stored?", a: "No. You sign in directly with the network. We only receive the permissions you approve, and you can disconnect any time." },
  { q: "Which Instagram accounts work?", a: "Instagram Business and Creator accounts that are linked to a Facebook Page." },
  { q: "Will you add more networks?", a: "Yes. TikTok, Threads and X are next. Tell us what you need on the contact page." },
];

export default function IntegrationsPage() {
  return (
    <>
      <PageHeader title="Publish everywhere from one place" lead="Connect your accounts by signing in. No API keys, no developer setup." />
      <Section>
        <IntegrationTiles />
      </Section>
      <Section surface>
        <SectionHead title="Connecting accounts" center />
        <Faq items={FAQ} />
      </Section>
      <CtaBand />
    </>
  );
}
