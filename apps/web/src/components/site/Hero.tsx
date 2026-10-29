"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Avatar, Badge, Group, Text } from "@mantine/core";
import { IconArrowRight, IconCalendarCheck, IconSparkles } from "@tabler/icons-react";
import { NetworkIcon } from "@/components/posts/NetworkIcon";
import { APP_NAME, SIGNUP_LABEL } from "./content";
import { EASE, useReducedMotionSafe } from "./motion";
import s from "./site.module.css";

const PROMPT = "Announce our new iced oat latte for summer, friendly tone";
const CAPTION = ["Summer just got smoother.", "Our new iced oat latte is slow-steeped, naturally sweet and ready when you are.", "Which size are you ordering first?"];
const TAGS = "#icedlatte #oatmilk #summerdrinks";

type Phase = "typing" | "thinking" | "post" | "scheduled";

/** Timeline of the demo loop: type prompt, think, reveal post, confirm schedule, restart. */
function useDemoTimeline(reduce: boolean | null) {
  const [phase, setPhase] = useState<Phase>(reduce ? "scheduled" : "typing");
  const [typed, setTyped] = useState(reduce ? PROMPT.length : 0);

  useEffect(() => {
    if (reduce) {
      // Reduced motion: show the finished post, no loop.
      setPhase("scheduled");
      setTyped(PROMPT.length);
      return;
    }
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(() => !cancelled && fn(), ms));

    const run = () => {
      setPhase("typing");
      setTyped(0);
      for (let i = 1; i <= PROMPT.length; i++) at(400 + i * 38, () => setTyped(i));
      const typedAt = 400 + PROMPT.length * 38;
      at(typedAt + 500, () => setPhase("thinking"));
      at(typedAt + 2100, () => setPhase("post"));
      at(typedAt + 4300, () => setPhase("scheduled"));
      at(typedAt + 9000, run);
    };
    run();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [reduce]);

  return { phase, typed };
}

function HeroDemo() {
  const reduce = useReducedMotionSafe();
  const { phase, typed } = useDemoTimeline(reduce);
  const showPost = phase === "post" || phase === "scheduled";

  return (
    <motion.div
      className={s.demo}
      initial={reduce ? false : { opacity: 0, y: 40, rotate: 1.5 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: 1, delay: 0.25, ease: EASE }}
      aria-label={`${APP_NAME} turning a one-line idea into a scheduled Instagram post`}
      role="img"
    >
      <div className={s.demoField}>
        <IconSparkles size={18} color="var(--mantine-color-indigo-6)" style={{ flexShrink: 0 }} />
        <Text size="sm" style={{ minWidth: 0 }}>
          {PROMPT.slice(0, typed)}
          {phase === "typing" && <span className={s.caret} />}
        </Text>
      </div>

      <div style={{ marginTop: 16, minHeight: 420 }}>
        <AnimatePresence mode="wait">
          {phase === "typing" && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
              <Group gap={8} mb={14}>
                {(["INSTAGRAM", "FACEBOOK", "LINKEDIN"] as const).map((n) => (
                  <Badge key={n} variant="light" color="gray" radius="xl" size="lg" leftSection={<NetworkIcon network={n} size={14} />} style={{ textTransform: "none" }}>
                    {n === "INSTAGRAM" ? "Instagram" : n === "FACEBOOK" ? "Facebook" : "LinkedIn"}
                  </Badge>
                ))}
              </Group>
              <Group gap={8} mb={18}>
                <Badge variant="outline" color="gray" radius="xl" style={{ textTransform: "none" }}>
                  Tone: Friendly
                </Badge>
                <Badge variant="outline" color="gray" radius="xl" style={{ textTransform: "none" }}>
                  Image: On
                </Badge>
                <Badge variant="outline" color="gray" radius="xl" style={{ textTransform: "none" }}>
                  Hashtags: On
                </Badge>
              </Group>
              <div
                style={{
                  height: 300,
                  borderRadius: 12,
                  border: "1px dashed var(--mantine-color-default-border)",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--mantine-color-dimmed)",
                  fontSize: 14,
                }}
              >
                Your post will appear here
              </div>
            </motion.div>
          )}
          {phase === "thinking" && (
            <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
              <Group gap={8} mb={14}>
                <IconSparkles size={16} color="var(--mantine-color-indigo-6)" />
                <Text size="sm" c="dimmed">
                  Writing in your brand voice
                </Text>
              </Group>
              <div className={s.shimmer} style={{ width: "92%", marginBottom: 10 }} />
              <div className={s.shimmer} style={{ width: "78%", marginBottom: 10 }} />
              <div className={s.shimmer} style={{ width: "64%", marginBottom: 22 }} />
              <div className={s.shimmer} style={{ width: "100%", height: 260, borderRadius: 12 }} />
            </motion.div>
          )}

          {showPost && (
            <motion.div key="post" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: EASE }}>
              <Group gap={10} mb={12} wrap="nowrap">
                <Avatar radius="xl" size={34} color="indigo">
                  CB
                </Avatar>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" fw={600}>
                    Corner Bean Coffee
                  </Text>
                  <Text size="xs" c="dimmed">
                    Instagram post
                  </Text>
                </div>
                <NetworkIcon network="INSTAGRAM" size={20} />
              </Group>
              <motion.img
                src="/site/hero-latte.jpg"
                alt="AI-generated photo of an iced oat latte and a croissant on a cafe counter"
                className={s.demoImage}
                initial={{ opacity: 0, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.7, ease: EASE }}
              />
              <div style={{ marginTop: 12 }}>
                {CAPTION.map((line, i) => (
                  <motion.p
                    key={line}
                    style={{ margin: "0 0 4px", fontSize: 14, lineHeight: 1.5 }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.25 + i * 0.25 }}
                  >
                    {line}
                  </motion.p>
                ))}
                <motion.p
                  style={{ margin: 0, fontSize: 14, color: "var(--mantine-color-indigo-6)" }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.1 }}
                >
                  {TAGS}
                </motion.p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {phase === "scheduled" && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            style={{ position: "absolute", right: -14, top: 132 }}
          >
            <Badge size="xl" radius="xl" color="teal" variant="filled" leftSection={<IconCalendarCheck size={16} />} style={{ textTransform: "none", boxShadow: "var(--mantine-shadow-md)" }}>
              Scheduled for Thursday, 9:00
            </Badge>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const headline = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } };
const word = { hidden: { opacity: 0, y: "0.4em" }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } } };

export function Hero() {
  const reduce = useReducedMotionSafe();
  const lead = ["A", "month", "of", "posts", "in"];
  const accent = ["one", "afternoon."];
  return (
    <section className={s.hero}>
      <div className={s.heroBg} />
      <div className={s.container}>
        <div className={s.heroGrid}>
          <div>
            <motion.h1 className={s.heroTitle} variants={headline} initial={reduce ? "show" : "hidden"} animate="show">
              {lead.map((w) => (
                <motion.span key={w} variants={word} style={{ display: "inline-block", marginRight: "0.24em" }}>
                  {w}
                </motion.span>
              ))}
              {accent.map((w) => (
                <motion.span key={w} variants={word} className={s.heroAccent} style={{ display: "inline-block", marginRight: "0.24em" }}>
                  {w}
                </motion.span>
              ))}
            </motion.h1>
            <motion.p
              className={s.lead}
              style={{ marginTop: 24, fontSize: 19 }}
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.45, ease: EASE }}
            >
              {APP_NAME} writes in your brand voice, designs the visuals and publishes to every channel. Free for everyone.
            </motion.p>
            <motion.div
              style={{ display: "flex", gap: 12, marginTop: 36, flexWrap: "wrap" }}
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.6, ease: EASE }}
            >
              <Link href="/signup" className={s.btnPrimary}>
                {SIGNUP_LABEL} <IconArrowRight size={18} />
              </Link>
              <Link href="/features" className={s.btnGhost}>
                Explore features
              </Link>
            </motion.div>
          </div>
          <HeroDemo />
        </div>
      </div>
    </section>
  );
}
