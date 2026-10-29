"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useMotionTemplate, useMotionValue, useScroll, useSpring, useTransform } from "motion/react";
import { Accordion, Text } from "@mantine/core";
import {
  IconArrowRight,
  IconCalendarEvent,
  IconChartBar,
  IconCircleCheck,
  IconGift,
  IconInbox,
  IconLink,
  IconLockOpen,
  IconPalette,
  IconRocket,
  IconSparkles,
  IconTopologyStar3,
  IconUsersGroup,
} from "@tabler/icons-react";
import { NetworkIcon } from "@/components/posts/NetworkIcon";
import { FAQS, FEATURES, INTEGRATIONS, SIGNUP_LABEL, STEPS, type Feature, type FeatureIcon } from "./content";
import { EASE, Reveal, Stagger, StaggerItem, useReducedMotionSafe } from "./motion";
import s from "./site.module.css";

export const ICONS: Record<FeatureIcon, typeof IconSparkles> = {
  sparkles: IconSparkles,
  calendar: IconCalendarEvent,
  rocket: IconRocket,
  palette: IconPalette,
  inbox: IconInbox,
  flow: IconTopologyStar3,
  chart: IconChartBar,
  check: IconCircleCheck,
  link: IconLink,
};

/* ───────────── building blocks ───────────── */

export function Section({ children, surface, id }: { children: ReactNode; surface?: boolean; id?: string }) {
  return (
    <section id={id} className={`${s.section} ${surface ? s.surface : ""}`}>
      <div className={s.container}>{children}</div>
    </section>
  );
}

export function SectionHead({ eyebrow, title, lead, center }: { eyebrow?: string; title: ReactNode; lead?: ReactNode; center?: boolean }) {
  return (
    <Reveal style={{ marginBottom: 56, textAlign: center ? "center" : "left", ...(center ? { display: "flex", flexDirection: "column", alignItems: "center" } : {}) }}>
      {eyebrow && <p className={s.eyebrow}>{eyebrow}</p>}
      <h2 className={s.heading} style={{ maxWidth: center ? "20ch" : "22ch" }}>
        {title}
      </h2>
      {lead && (
        <p className={s.lead} style={{ marginTop: 16 }}>
          {lead}
        </p>
      )}
    </Reveal>
  );
}

export function PageHeader({ title, lead, eyebrow }: { title: string; lead?: string; eyebrow?: string }) {
  const reduce = useReducedMotionSafe();
  return (
    <header className={s.pageHeader}>
      <div className={s.container}>
        {eyebrow && <p className={s.eyebrow}>{eyebrow}</p>}
        <motion.h1
          className={s.pageTitle}
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE }}
        >
          {title}
        </motion.h1>
        {lead && (
          <motion.p
            className={s.lead}
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.12, ease: EASE }}
          >
            {lead}
          </motion.p>
        )}
      </div>
    </header>
  );
}

/* ───────────── logo marquee (the page's only marquee) ───────────── */

export function LogoMarquee() {
  const logos = [...INTEGRATIONS, ...INTEGRATIONS];
  return (
    <div className={s.marquee} aria-label="Networks you can publish to">
      <div className={s.marqueeTrack}>
        {logos.map((i, idx) => (
          <span key={`${i.network}-${idx}`} className={s.marqueeLogo} aria-hidden={idx >= INTEGRATIONS.length} title={i.name}>
            <NetworkIcon network={i.network} size={34} />
          </span>
        ))}
      </div>
    </div>
  );
}

/* ───────────── bento ───────────── */

/** Card whose border glow follows the pointer (motion values, no React re-renders). */
function SpotlightCell({ className, children }: { className?: string; children: ReactNode }) {
  const x = useMotionValue(-400);
  const y = useMotionValue(-400);
  const style = { "--x": useMotionTemplate`${x}px`, "--y": useMotionTemplate`${y}px` } as unknown as React.CSSProperties;
  return (
    <StaggerItem
      className={`${s.cell} ${s.spotlight} ${className ?? ""}`}
      style={style}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set(e.clientX - r.left);
        y.set(e.clientY - r.top);
      }}
    >
      {children}
    </StaggerItem>
  );
}

/** Mini week view: a post moves from Tuesday to Thursday and back, showing drag-to-reschedule. */
function WeekDemo() {
  const reduce = useReducedMotionSafe();
  const [day, setDay] = useState(1);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setDay((d) => (d === 1 ? 3 : 1)), 2600);
    return () => clearInterval(t);
  }, [reduce]);
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const fixed: Record<number, { network: "LINKEDIN" | "FACEBOOK" | "PINTEREST"; time: string }> = {
    0: { network: "LINKEDIN", time: "9:00" },
    2: { network: "FACEBOOK", time: "12:30" },
    4: { network: "PINTEREST", time: "17:00" },
  };
  const chipStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "6px 7px",
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  };
  return (
    <div aria-hidden style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6, marginBottom: 8 }}>
      {days.map((d, i) => (
        <div key={d} style={{ display: "flex", flexDirection: "column", gap: 6, minHeight: 150, padding: 6, borderRadius: 10, background: "var(--mantine-color-default-hover)", minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--mantine-color-dimmed)" }}>{d}</span>
          {fixed[i] && (
            <div style={{ ...chipStyle, background: "var(--mantine-color-body)", border: "1px solid var(--mantine-color-default-border)" }}>
              <NetworkIcon network={fixed[i]!.network} size={12} />
              {fixed[i]!.time}
            </div>
          )}
          {day === i && (
            <motion.div
              layoutId="week-demo-post"
              transition={{ type: "spring", stiffness: 140, damping: 20 }}
              style={{ ...chipStyle, background: "var(--mantine-color-indigo-6)", color: "white", boxShadow: "var(--mantine-shadow-md)" }}
            >
              Launch
            </motion.div>
          )}
        </div>
      ))}
    </div>
  );
}

function CellText({ f }: { f: Feature }) {
  const Icon = ICONS[f.icon];
  return (
    <>
      <span className={s.cellIcon}>
        <Icon size={22} stroke={1.75} />
      </span>
      <h3 className={s.cellTitle}>{f.title}</h3>
      <p className={s.cellBody}>{f.body}</p>
    </>
  );
}

export function FeatureBento() {
  return (
    <Stagger className={s.bento}>
      <StaggerItem className={`${s.cell} ${s.cellPhoto} ${s.cellWide}`}>
        <img src="/site/creator-desk.jpg" alt="A creator editing content at a desk with a phone on a tripod" loading="lazy" />
        <CellText f={FEATURES.writer} />
      </StaggerItem>
      <SpotlightCell className={s.cellTall}>
        <WeekDemo />
        <CellText f={FEATURES.calendar} />
      </SpotlightCell>
      <StaggerItem className={`${s.cell} ${s.cellAccent} ${s.cellThird}`}>
        <CellText f={FEATURES.campaigns} />
      </StaggerItem>
      <SpotlightCell className={s.cellThird}>
        <CellText f={FEATURES.studio} />
      </SpotlightCell>
      <SpotlightCell className={s.cellThird}>
        <CellText f={FEATURES.inbox} />
      </SpotlightCell>
      <SpotlightCell className={`${s.cellHalf}`}>
        <CellText f={FEATURES.automations} />
      </SpotlightCell>
      <SpotlightCell className={`${s.cellHalf}`}>
        <CellText f={FEATURES.analytics} />
      </SpotlightCell>
    </Stagger>
  );
}

/* ───────────── how it works (scroll-linked progress rail) ───────────── */

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionSafe();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 70%", "end 60%"] });
  const fill = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  return (
    <div className={s.how}>
      <div className={s.howSticky}>
        <p className={s.eyebrow}>How it works</p>
        <h2 className={s.heading}>From idea to published in three steps</h2>
        <p className={s.lead} style={{ marginTop: 16 }}>
          No setup calls, no developer accounts. Most people publish their first post within minutes of signing up.
        </p>
      </div>
      <div ref={ref} className={s.howSteps}>
        <div className={s.howRail}>
          <motion.div className={s.howRailFill} style={{ scaleY: reduce ? 1 : fill }} />
        </div>
        {STEPS.map((step, i) => (
          <Step key={step.title} index={i} title={step.title} body={step.body} />
        ))}
      </div>
    </div>
  );
}

function Step({ index, title, body }: { index: number; title: string; body: string }) {
  return (
    <Reveal className={s.howStep} delay={index * 0.05}>
      <span className={s.howDot}>{index + 1}</span>
      <h3 style={{ fontSize: 24, fontWeight: 650, letterSpacing: "-0.02em", margin: "0 0 10px" }}>{title}</h3>
      <p className={s.lead} style={{ fontSize: 17 }}>
        {body}
      </p>
    </Reveal>
  );
}

/* ───────────── integrations ───────────── */

export function IntegrationTiles() {
  return (
    <Stagger className={s.tiles}>
      {INTEGRATIONS.map((i) => (
        <StaggerItem key={i.network} className={s.tile}>
          <NetworkIcon network={i.network} size={32} />
          <h3 style={{ fontSize: 18, fontWeight: 650, margin: "18px 0 6px" }}>{i.name}</h3>
          <p className={s.cellBody} style={{ fontSize: 14 }}>
            {i.what}
          </p>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

/* ───────────── free statement (parallax photo) ───────────── */

export function FreeStatement() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionSafe();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["-8%", "8%"]);
  const points = [
    { icon: IconGift, label: "Free for everyone" },
    { icon: IconLockOpen, label: "No paywall, no card" },
    { icon: IconUsersGroup, label: "Built with the community" },
  ];
  return (
    <div ref={ref} className={s.free}>
      <motion.img src="/site/community.jpg" alt="People gathered at an outdoor community event at golden hour" loading="lazy" style={{ y: reduce ? 0 : y }} />
      <div className={s.freeInner}>
        <Reveal>
          <h2 className={s.heading} style={{ color: "white", fontSize: "clamp(32px, 4.4vw, 54px)" }}>
            Free for creators, small teams and communities.
          </h2>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: "rgb(255 255 255 / 0.82)", margin: "18px 0 0", maxWidth: "52ch" }}>
            Good tools shouldn&apos;t depend on budget. Every feature is included for every account, from the first post.
          </p>
          <div className={s.freePoints}>
            {points.map((p) => (
              <span key={p.label} style={{ display: "inline-flex", alignItems: "center", gap: 10, fontWeight: 600 }}>
                <p.icon size={22} stroke={1.75} /> {p.label}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </div>
  );
}

/* ───────────── FAQ & CTA ───────────── */

export function Faq({ items = FAQS }: { items?: Array<{ q: string; a: string }> }) {
  return (
    <Reveal>
      <Accordion variant="separated" radius="lg" maw={780} mx="auto" chevronPosition="right">
        {items.map((f) => (
          <Accordion.Item key={f.q} value={f.q}>
            <Accordion.Control>
              <Text fw={600} fz="md">
                {f.q}
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Text c="dimmed" fz="md" lh={1.6}>
                {f.a}
              </Text>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Reveal>
  );
}

export function CtaBand() {
  return (
    <div className={s.container} style={{ marginTop: 24, marginBottom: 24 }}>
      <Reveal>
        <div
          style={{
            borderRadius: 24,
            padding: "clamp(40px, 6vw, 72px)",
            background: "var(--mantine-color-indigo-7)",
            color: "white",
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 32,
            alignItems: "center",
          }}
          className="cta-band"
        >
          <div>
            <h2 className={s.heading} style={{ color: "white", maxWidth: "20ch" }}>
              Your next month of content starts today.
            </h2>
            <p style={{ margin: "14px 0 0", fontSize: 18, color: "rgb(255 255 255 / 0.82)" }}>Create your account and publish your first post in minutes.</p>
          </div>
          <Link href="/signup" className={`${s.btnPrimary} ${s.btnLight}`}>
            {SIGNUP_LABEL} <IconArrowRight size={18} />
          </Link>
        </div>
      </Reveal>
      <style>{`@media (max-width: 767px) { .cta-band { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
