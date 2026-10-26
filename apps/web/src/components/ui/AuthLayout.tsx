"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Anchor, Box, Group, List, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconArrowLeft, IconCalendarEvent, IconSparkles, IconTopologyStar3 } from "@tabler/icons-react";
import { NetworkIcon } from "@/components/posts/NetworkIcon";
import { Logo } from "./Logo";

const POINTS = [
  { icon: IconSparkles, text: "Write captions, hashtags and images in your brand voice" },
  { icon: IconCalendarEvent, text: "Plan every channel in one calendar" },
  { icon: IconTopologyStar3, text: "Automate posting and replies" },
];

/** Split-screen auth shell: brand panel (desktop) + form card. Used by login, signup, onboarding and invites. */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing={0} mih="100vh">
      <Box
        visibleFrom="md"
        p={56}
        style={{
          background: "linear-gradient(150deg, var(--mantine-color-indigo-8), var(--mantine-color-violet-7))",
          color: "white",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <Anchor component={Link} href="/" underline="never" c="white" w="fit-content">
          <Group gap={8}>
            <ThemeIcon size={36} radius="md" color="white" c="indigo.8">
              <Text fw={900}>N</Text>
            </ThemeIcon>
            <Text fw={800} fz={22} style={{ letterSpacing: -0.5 }}>
              {process.env.NEXT_PUBLIC_APP_NAME ?? "Nexo"}
            </Text>
          </Group>
        </Anchor>
        <Stack gap="xl" maw={460}>
          <Title order={2} c="white" fz={36} lh={1.15} style={{ letterSpacing: -1 }}>
            Your social media, on autopilot — in your own voice.
          </Title>
          <List spacing="md" center>
            {POINTS.map((p) => (
              <List.Item
                key={p.text}
                icon={
                  <ThemeIcon size={30} radius="xl" color="rgba(255,255,255,0.15)">
                    <p.icon size={16} color="white" />
                  </ThemeIcon>
                }
              >
                <Text c="rgba(255,255,255,0.9)">{p.text}</Text>
              </List.Item>
            ))}
          </List>
        </Stack>
        <Group gap="md">
          {(["LINKEDIN", "INSTAGRAM", "FACEBOOK", "PINTEREST", "REDDIT", "SLACK", "NOTION"] as const).map((n) => (
            <Box key={n} style={{ filter: "brightness(0) invert(1)", opacity: 0.85 }}>
              <NetworkIcon network={n} size={22} />
            </Box>
          ))}
        </Group>
      </Box>

      <Box
        p="md"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(900px 500px at 100% 0%, var(--mantine-color-indigo-light), transparent)",
        }}
      >
        <Stack w="100%" maw={420} gap="lg">
          <Group justify="space-between">
            <Box hiddenFrom="md">
              <Anchor component={Link} href="/" underline="never" c="inherit">
                <Logo />
              </Anchor>
            </Box>
            <Anchor component={Link} href="/" size="sm" c="dimmed" ml="auto">
              <Group gap={4}>
                <IconArrowLeft size={14} /> Back to site
              </Group>
            </Anchor>
          </Group>
          <Paper withBorder shadow="md" radius="lg" p={{ base: "lg", sm: "xl" }}>
            <Stack gap={4} mb="lg">
              <Title order={2} fz={26} style={{ letterSpacing: -0.5 }}>
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
      </Box>
    </SimpleGrid>
  );
}
