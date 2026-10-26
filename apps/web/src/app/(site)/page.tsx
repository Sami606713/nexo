import { AiShowcase, CtaBand, Faq, FeatureGrid, Hero, IntegrationGrid, NetworkStrip, PricingCards, Section, SectionTitle, Steps } from "@/components/site/sections";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <NetworkStrip />
      <Section id="features">
        <SectionTitle
          eyebrow="Everything in one place"
          title="Plan, create, publish and grow"
          subtitle="Stop juggling a scheduler, a design tool, an inbox and a spreadsheet. Do it all in one workspace."
        />
        <FeatureGrid limit={6} />
      </Section>
      <Section tinted>
        <AiShowcase />
      </Section>
      <Section>
        <SectionTitle eyebrow="How it works" title="Up and running in minutes" />
        <Steps />
      </Section>
      <Section tinted>
        <SectionTitle eyebrow="Integrations" title="Connect the channels that matter" subtitle="Sign in once — no developer accounts or API keys needed." />
        <IntegrationGrid />
      </Section>
      <Section>
        <SectionTitle eyebrow="Pricing" title="Simple plans that grow with you" subtitle="Scheduling and publishing are always free. Pay for seats, channels and AI credits." />
        <PricingCards />
      </Section>
      <Section tinted>
        <SectionTitle eyebrow="FAQ" title="Questions, answered" />
        <Faq />
      </Section>
      <CtaBand />
    </>
  );
}
