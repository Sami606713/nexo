"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Anchor, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { IconArrowLeft, IconCalendarEvent, IconSparkles, IconTopologyStar3 } from "@tabler/icons-react";
import { Logo } from "./Logo";
import { useReducedMotionSafe } from "@/components/site/motion";

const POINTS = [
  { icon: IconSparkles, text: "Captions, hashtags and images in your brand voice" },
  { icon: IconCalendarEvent, text: "Every channel planned in one calendar" },
  { icon: IconTopologyStar3, text: "Posting and replies on autopilot" },
];

const EASE = [0.16, 1, 0.3, 1] as const;

/** Split-screen auth shell: photo panel (desktop) + form card. Used by login, signup, onboarding and invites. */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const reduce = useReducedMotionSafe();
  return (
    <div className="auth-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: "100dvh" }}>
      <div className="auth-panel" style={{ position: "relative", overflow: "hidden", color: "white", padding: 48, display: "flex", flexDirection: "column", justifyContent: "space-between", isolation: "isolate" }}>
        <motion.img
          src="/site/creator-desk.jpg"
          alt=""
          aria-hidden
          initial={reduce ? false : { scale: 1.08 }}
          animate={{ scale: 1 }}
          transition={{ duration: 2.4, ease: EASE }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: -2 }}
        />
        <div style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgb(12 12 18 / 0.55), rgb(12 12 18 / 0.88))" }} />
        <Anchor component={Link} href="/" underline="never" c="white" w="fit-content">
          <Group gap={10}>
            <IconArrowLeft size={16} />
            <Text fw={700} fz={20} style={{ letterSpacing: -0.5 }}>
              {process.env.NEXT_PUBLIC_APP_NAME ?? "Nexo"}
            </Text>
          </Group>
        </Anchor>
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.2, ease: EASE }}
          style={{ maxWidth: 460 }}
        >
          <Title order={2} c="white" fz={38} lh={1.1} style={{ letterSpacing: -1.2 }}>
            Your social media, written and scheduled in your own voice.
          </Title>
          <Stack gap="md" mt={32}>
            {POINTS.map((p, i) => (
              <motion.div
                key={p.text}
                initial={reduce ? false : { opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.45 + i * 0.1, ease: EASE }}
                style={{ display: "flex", alignItems: "center", gap: 12 }}
              >
                <p.icon size={20} stroke={1.75} />
                <Text c="rgba(255,255,255,0.88)">{p.text}</Text>
              </motion.div>
            ))}
          </Stack>
        </motion.div>
        <Text size="sm" c="rgba(255,255,255,0.7)">
          Free for creators, teams and communities.
        </Text>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
          style={{ width: "100%", maxWidth: 420 }}
        >
          <Stack gap="lg">
            <Group justify="space-between">
              <Anchor component={Link} href="/" underline="never" c="inherit" className="auth-mobile-logo">
                <Logo />
              </Anchor>
            </Group>
            <Paper withBorder radius="lg" p={{ base: "lg", sm: "xl" }}>
              <Stack gap={4} mb="lg">
                <Title order={2} fz={26} style={{ letterSpacing: -0.6 }}>
                  {title}
                </Title>
                {subtitle && (
                  <Text c="dimmed" size="sm">
                    {subtitle}
                  </Text>
                )}
              </Stack>
              {children}
            </Paper>
            {footer && (
              <Text ta="center" size="sm" c="dimmed">
                {footer}
              </Text>
            )}
            <Text ta="center" size="xs" c="dimmed">
              By continuing you agree to our{" "}
              <Anchor component={Link} href="/terms" size="xs">
                Terms
              </Anchor>{" "}
              and{" "}
              <Anchor component={Link} href="/privacy" size="xs">
                Privacy policy
              </Anchor>
              .
            </Text>
          </Stack>
        </motion.div>
      </div>
      <style>{`
        .auth-mobile-logo { display: none; }
        @media (max-width: 991px) {
          .auth-grid { grid-template-columns: 1fr !important; }
          .auth-panel { display: none !important; }
          .auth-mobile-logo { display: inline-flex; }
        }
      `}</style>
    </div>
  );
}
