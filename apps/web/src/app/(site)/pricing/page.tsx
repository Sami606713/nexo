import type { Metadata } from "next";
import { CtaBand, Faq, PageHeader, PricingCards, Section, SectionTitle } from "@/components/site/sections";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple plans for creators, teams and agencies. Scheduling and publishing are always free.",
};

const FAQ = [
  {
    q: "Is there a free trial?",
    a: "Yes. Every new account starts on a free trial with AI credits so you can try the whole product. No credit card required.",
  },
  {
    q: "What is an AI credit?",
    a: "One AI action: writing a caption, generating an image, rewriting text, suggesting a reply or running an automation. Scheduling and publishing never use credits.",
  },
  {
    q: "Do unused credits roll over?",
    a: "No — credits refill to your plan's allowance every month.",
  },
  {
    q: "Are credits shared across brands?",
    a: "Yes. All brands you own draw from one balance, so you can spend them where you need them.",
  },
  {
    q: "Can I change plans later?",
    a: "Any time, from Settings → Billing in your workspace.",
  },
];

export default function PricingPage() {
  return (
    <>
      <PageHeader eyebrow="Pricing" title="Simple, transparent pricing" subtitle="Pay for seats, channels and AI credits. Scheduling and publishing are always free." />
      <Section>
        <PricingCards />
      </Section>
      <Section tinted>
        <SectionTitle eyebrow="FAQ" title="Billing questions" />
        <Faq items={FAQ} />
      </Section>
      <CtaBand />
    </>
  );
}
