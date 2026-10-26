import { Hero } from "@/components/site/Hero";
import { CtaBand, Faq, FeatureBento, FreeStatement, HowItWorks, IntegrationTiles, LogoMarquee, Section, SectionHead } from "@/components/site/sections";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <LogoMarquee />
      <Section>
        <SectionHead
          title="Everything your social media needs, in one workspace"
          lead="Stop juggling a scheduler, a design tool, an inbox and a spreadsheet."
        />
        <FeatureBento />
      </Section>
      <Section surface>
        <HowItWorks />
      </Section>
      <Section>
        <SectionHead title="Connect the channels that matter" lead="Sign in once. No developer accounts or API keys needed." />
        <IntegrationTiles />
      </Section>
      <div style={{ width: "100%", maxWidth: 1200, margin: "0 auto", padding: "0 16px" }}>
        <FreeStatement />
      </div>
      <Section>
        <SectionHead eyebrow="Questions" title="Answers before you sign up" center />
        <Faq />
      </Section>
      <CtaBand />
    </>
  );
}
