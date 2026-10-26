"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Alert, Select, SimpleGrid, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconBulb, IconCheck, IconHeartHandshake, IconMail, IconShieldLock } from "@tabler/icons-react";
import { api, ApiError } from "@/lib/fetcher";
import { APP_NAME, FEATURES, type Feature } from "./content";
import type { LegalDoc } from "./legal";
import { EASE, Reveal, Stagger, StaggerItem, useReducedMotionSafe } from "./motion";
import { CtaBand, ICONS, PageHeader, Section, SectionHead } from "./sections";
import s from "./site.module.css";

/* ───────────── Features ───────────── */

const CHAPTERS: Array<{ title: string; lead: string; image: string; alt: string; features: Feature[] }> = [
  {
    title: "Create",
    lead: "Go from a blank page to a finished post, with words and visuals that match your brand.",
    image: "/site/creator-desk.jpg",
    alt: "A creator writing and editing posts on a laptop",
    features: [FEATURES.writer, FEATURES.studio, FEATURES.campaigns],
  },
  {
    title: "Publish",
    lead: "Plan every channel together, get sign-off, and let posts go out on time.",
    image: "/site/team-planning.jpg",
    alt: "A small team planning content around a table",
    features: [FEATURES.calendar, FEATURES.approvals, FEATURES.automations],
  },
  {
    title: "Grow",
    lead: "Answer your audience and learn what works, so the next post does better.",
    image: "/site/community.jpg",
    alt: "People gathered at an outdoor community event",
    features: [FEATURES.inbox, FEATURES.analytics, FEATURES.bio],
  },
];

export function FeaturesContent() {
  return (
    <>
      <PageHeader title="Everything you need to run social media" lead="From the first idea to the results. One workspace for creators, teams and agencies, free for all of them." />
      {CHAPTERS.map((c, i) => (
        <Section key={c.title} surface={i % 2 === 1}>
          <div className="chapter" style={{ display: "grid", gridTemplateColumns: i % 2 ? "1fr 1.05fr" : "1.05fr 1fr", gap: 64, alignItems: "center" }}>
            <Reveal style={{ order: i % 2 ? 2 : 1 }}>
              <img src={c.image} alt={c.alt} className={s.rounded} style={{ aspectRatio: "4 / 3" }} loading="lazy" />
            </Reveal>
            <div style={{ order: i % 2 ? 1 : 2 }}>
              <Reveal>
                <h2 className={s.heading}>{c.title}</h2>
                <p className={s.lead} style={{ marginTop: 14 }}>
                  {c.lead}
                </p>
              </Reveal>
              <Stagger style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 28 }}>
                {c.features.map((f) => {
                  const Icon = ICONS[f.icon];
                  return (
                    <StaggerItem key={f.title} style={{ display: "grid", gridTemplateColumns: "40px 1fr", gap: 16 }}>
                      <span className={s.cellIcon} style={{ margin: 0 }}>
                        <Icon size={22} stroke={1.75} />
                      </span>
                      <div>
                        <h3 style={{ fontSize: 18, fontWeight: 650, margin: "0 0 4px", letterSpacing: "-0.01em" }}>{f.title}</h3>
                        <p className={s.cellBody}>{f.body}</p>
                        {f.points && (
                          <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                            {f.points.map((p) => (
                              <li key={p} style={{ display: "flex", gap: 8, fontSize: 14, color: "var(--mantine-color-dimmed)" }}>
                                <IconCheck size={16} color="var(--mantine-color-indigo-6)" style={{ flexShrink: 0, marginTop: 2 }} /> {p}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </StaggerItem>
                  );
                })}
              </Stagger>
            </div>
          </div>
        </Section>
      ))}
      <style>{`@media (max-width: 991px) { .chapter { grid-template-columns: 1fr !important; gap: 32px !important; } .chapter > * { order: initial !important; } }`}</style>
      <CtaBand />
    </>
  );
}

/* ───────────── About ───────────── */

const VALUES = [
  { icon: IconBulb, title: "Simple beats clever", body: "Social media is noisy enough. The tool you use for it shouldn't add to the noise." },
  { icon: IconHeartHandshake, title: "Your voice, not ours", body: "AI should sound like you. Everything we generate starts from your brand profile." },
  { icon: IconShieldLock, title: "Your accounts, your data", body: "You sign in to each network yourself, approve exactly what we can do, and can disconnect any time." },
];

export function AboutContent() {
  return (
    <>
      <PageHeader title={`Why we're building ${APP_NAME}`} lead="Great social media shouldn't need a big budget or a big team. So we're giving the tools away." />
      <Section>
        <div className="about-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
          <Reveal>
            <img src="/site/team-planning.jpg" alt="A small team planning content together" className={s.rounded} style={{ aspectRatio: "4 / 3" }} />
          </Reveal>
          <Reveal delay={0.1}>
            <Stack gap="lg">
              <Text fz={19} lh={1.65}>
                Small teams spend hours every week writing captions, resizing images and copying the same post into five different apps. Community groups and
                non-profits often can&apos;t afford the tools that make this easier.
              </Text>
              <Text fz={19} lh={1.65} c="dimmed">
                {APP_NAME} puts it all in one place: an AI writer that knows your brand, a calendar for every channel, a design studio, an inbox and
                automations. And it&apos;s free, for everyone.
              </Text>
            </Stack>
          </Reveal>
        </div>
        <style>{`@media (max-width: 991px) { .about-grid { grid-template-columns: 1fr !important; gap: 32px !important; } }`}</style>
      </Section>
      <Section surface>
        <SectionHead title="What we believe" />
        <Stagger style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 40 }}>
          {VALUES.map((v) => (
            <StaggerItem key={v.title}>
              <v.icon size={30} stroke={1.5} color="var(--mantine-color-indigo-6)" />
              <h3 style={{ fontSize: 21, fontWeight: 650, margin: "16px 0 8px", letterSpacing: "-0.015em" }}>{v.title}</h3>
              <p className={s.cellBody} style={{ fontSize: 16 }}>
                {v.body}
              </p>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>
      <CtaBand />
    </>
  );
}

/* ───────────── Contact ───────────── */

export function ContactContent() {
  const reduce = useReducedMotionSafe();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@example.com";
  const form = useForm({
    initialValues: { name: "", email: "", topic: "General question", message: "" },
    validate: {
      name: (v) => (v.trim() ? null : "Please enter your name"),
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : "Enter a valid email"),
      message: (v) => (v.trim().length >= 10 ? null : "Tell us a little more (at least 10 characters)"),
    },
  });

  const submit = form.onSubmit(async (values) => {
    setLoading(true);
    setError(null);
    try {
      await api("/api/contact", "POST", values);
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't send your message. Please try again.");
    } finally {
      setLoading(false);
    }
  });

  return (
    <>
      <PageHeader title="Get in touch" lead="Questions, feedback, partnerships or a feature you need. We read every message." />
      <div className={s.container}>
        <div className="contact-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 64, alignItems: "start", paddingTop: 24 }}>
          <Reveal>
            <Stack gap="xl">
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 650, margin: "0 0 6px" }}>Email us</h3>
                <a href={`mailto:${supportEmail}`} style={{ color: "var(--mantine-color-indigo-6)", fontWeight: 500, display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <IconMail size={18} /> {supportEmail}
                </a>
              </div>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 650, margin: "0 0 6px" }}>Community first</h3>
                <p className={s.cellBody}>
                  {APP_NAME} is shaped by the people who use it. Tell us what would help your team and we&apos;ll take it seriously.
                </p>
              </div>
            </Stack>
          </Reveal>
          <Reveal delay={0.1}>
            <div style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 16, padding: "clamp(20px, 4vw, 36px)", background: "var(--mantine-color-body)" }}>
              <AnimatePresence mode="wait">
                {sent ? (
                  <motion.div key="sent" initial={reduce ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: EASE }}>
                    <Stack align="center" ta="center" py="xl" gap="sm">
                      <IconCheck size={44} color="var(--mantine-color-teal-6)" />
                      <h3 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Thanks, message received</h3>
                      <Text c="dimmed">We&apos;ll reply to {form.values.email}.</Text>
                    </Stack>
                  </motion.div>
                ) : (
                  <motion.form key="form" onSubmit={submit} exit={{ opacity: 0 }}>
                    <Stack gap="md">
                      {error && <Alert color="red">{error}</Alert>}
                      <SimpleGrid cols={{ base: 1, sm: 2 }}>
                        <TextInput label="Name" autoComplete="name" {...form.getInputProps("name")} />
                        <TextInput label="Email" type="email" autoComplete="email" {...form.getInputProps("email")} />
                      </SimpleGrid>
                      <Select label="Topic" allowDeselect={false} data={["General question", "Partnerships", "Support", "Feature request", "Feedback"]} {...form.getInputProps("topic")} />
                      <Textarea label="Message" autosize minRows={5} maxLength={5000} {...form.getInputProps("message")} />
                      <button type="submit" className={s.btnPrimary} disabled={loading} style={{ border: "none", cursor: "pointer", justifyContent: "center", opacity: loading ? 0.7 : 1 }}>
                        {loading ? "Sending" : "Send message"}
                      </button>
                    </Stack>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          </Reveal>
        </div>
        <style>{`@media (max-width: 991px) { .contact-grid { grid-template-columns: 1fr !important; gap: 32px !important; } }`}</style>
      </div>
    </>
  );
}

/* ───────────── Legal ───────────── */

export function LegalContent({ doc }: { doc: LegalDoc }) {
  return (
    <>
      <PageHeader title={doc.title} lead={`Last updated ${doc.updated}`} />
      <div className={s.container}>
        <Stagger style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 36, paddingTop: 16 }}>
          {doc.intro && (
            <StaggerItem>
              <Text fz={18} lh={1.7}>
                {doc.intro}
              </Text>
            </StaggerItem>
          )}
          {doc.sections.map((sec) => (
            <StaggerItem key={sec.heading}>
              <h2 style={{ fontSize: 22, fontWeight: 650, letterSpacing: "-0.015em", margin: "0 0 10px" }}>{sec.heading}</h2>
              {sec.body.map((p, i) => (
                <Text key={i} c="dimmed" fz={16} lh={1.7} mb={8}>
                  {p}
                </Text>
              ))}
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </>
  );
}
