import type { Metadata } from "next";
import { CtaBand, Faq, IntegrationGrid, PageHeader, Section, SectionTitle } from "@/components/site/sections";

export const metadata: Metadata = {
  title: "Integrations",
  description: "Publish to LinkedIn, Instagram, Facebook, Pinterest, Reddit, Slack and Notion — connect in a couple of clicks.",
};

const FAQ = [
  {
    q: "How do I connect an account?",
    a: "Open Channels, choose a network and sign in. You'll approve access on the network's own page, then you're returned to your workspace with the account connected.",
  },
  {
    q: "Is my password stored?",
    a: "No. You sign in directly with the network; we only receive the permissions you approve, and you can disconnect at any time.",
  },
  {
    q: "Which Instagram accounts are supported?",
    a: "Instagram Business and Creator accounts that are linked to a Facebook Page.",
  },
  {
    q: "More networks?",
    a: "TikTok, Threads and X are on the way. Tell us which networks you need on the contact page.",
  },
];

export default function IntegrationsPage() {
  return (
    <>
      <PageHeader eyebrow="Integrations" title="Publish everywhere from one place" subtitle="Connect your accounts by signing in — no API keys, no developer setup." />
      <Section>
        <IntegrationGrid />
      </Section>
      <Section tinted>
        <SectionTitle title="Connecting accounts" />
        <Faq items={FAQ} />
      </Section>
      <CtaBand />
    </>
  );
}
