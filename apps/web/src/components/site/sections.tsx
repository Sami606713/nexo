"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Accordion,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Container,
  Group,
  List,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconArrowRight,
  IconCalendarEvent,
  IconChartBar,
  IconCheck,
  IconCircleCheck,
  IconInbox,
  IconLink,
  IconPalette,
  IconRocket,
  IconSparkles,
  IconTopologyStar3,
  IconUsers,
} from "@tabler/icons-react";
import { useState } from "react";
import { PLAN_LIMITS, type PlanId } from "@postline/core";
import { NetworkIcon } from "@/components/posts/NetworkIcon";
import { APP_NAME, FAQS, FEATURES, INTEGRATIONS, STEPS, type Feature, type FeatureIcon } from "./content";

const ICONS: Record<FeatureIcon, typeof IconSparkles> = {
  sparkles: IconSparkles,
  calendar: IconCalendarEvent,
  rocket: IconRocket,
  palette: IconPalette,
  inbox: IconInbox,
  flow: IconTopologyStar3,
  chart: IconChartBar,
  check: IconCircleCheck,
  link: IconLink,
  users: IconUsers,
};

const GRADIENT = { from: "indigo", to: "violet", deg: 135 } as const;
const glow =
  "radial-gradient(900px 420px at 15% 0%, var(--mantine-color-indigo-light), transparent 70%), radial-gradient(700px 380px at 90% 10%, var(--mantine-color-violet-light), transparent 70%)";

/* ───────────── building blocks ───────────── */

export function Section({ children, id, tinted }: { children: ReactNode; id?: string; tinted?: boolean }) {
  return (
    <Box id={id} py={{ base: 56, sm: 88 }} style={tinted ? { background: "var(--mantine-color-default-hover)" } : undefined}>
      <Container size="lg">{children}</Container>
    </Box>
  );
}

export function SectionTitle({ eyebrow, title, subtitle, align = "center" }: { eyebrow?: string; title: ReactNode; subtitle?: ReactNode; align?: "center" | "left" }) {
  return (
    <Stack gap="sm" align={align === "center" ? "center" : "flex-start"} ta={align} mb={{ base: 32, sm: 48 }} maw={align === "center" ? 720 : undefined} mx={align === "center" ? "auto" : undefined}>
      {eyebrow && (
        <Badge variant="light" color="indigo" radius="xl" size="lg">
          {eyebrow}
        </Badge>
      )}
      <Title order={2} fz={{ base: 28, sm: 38 }} lh={1.15} style={{ letterSpacing: -0.8 }}>
        {title}
      </Title>
      {subtitle && (
        <Text c="dimmed" fz={{ base: "md", sm: "lg" }}>
          {subtitle}
        </Text>
      )}
    </Stack>
  );
}

/** Header band for inner pages. */
export function PageHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <Box style={{ background: glow }} pt={{ base: 56, sm: 88 }} pb={{ base: 24, sm: 40 }}>
      <Container size="lg">
        <SectionTitle eyebrow={eyebrow} title={title} subtitle={subtitle} />
      </Container>
    </Box>
  );
}

/* ───────────── landing sections ───────────── */

export function Hero() {
  return (
    <Box style={{ background: glow }} pt={{ base: 56, sm: 96 }} pb={{ base: 48, sm: 80 }}>
      <Container size="lg">
        <Stack align="center" ta="center" gap="lg" maw={820} mx="auto">
          <Badge variant="light" color="violet" radius="xl" size="lg" leftSection={<IconSparkles size={14} />}>
            AI-powered social media management
          </Badge>
          <Title order={1} fz={{ base: 38, sm: 60 }} lh={1.05} style={{ letterSpacing: -1.5 }}>
            Create a month of social posts{" "}
            <Text span inherit variant="gradient" gradient={GRADIENT}>
              in an afternoon
            </Text>
          </Title>
          <Text c="dimmed" fz={{ base: "md", sm: "xl" }} maw={640}>
            {APP_NAME} writes, designs and schedules your posts for LinkedIn, Instagram, Facebook, Pinterest, Reddit and more — in your brand voice, from
            one calendar.
          </Text>
          <Group gap="sm" justify="center">
            <Button component={Link} href="/signup" size="lg" radius="xl" variant="gradient" gradient={GRADIENT} rightSection={<IconArrowRight size={18} />}>
              Get started free
            </Button>
            <Button component={Link} href="/features" size="lg" radius="xl" variant="default">
              See how it works
            </Button>
          </Group>
          <Text size="sm" c="dimmed">
            No credit card required · Connect your first channel in two clicks
          </Text>
        </Stack>
        <ProductPreview />
      </Container>
    </Box>
  );
}

/** Lightweight, illustrative preview of the planner (pure UI, no data). */
function ProductPreview() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const posts: Array<{ day: number; network: (typeof INTEGRATIONS)[number]["network"]; text: string; time: string; status: string; color: string }> = [
    { day: 0, network: "LINKEDIN", text: "3 lessons from our first year", time: "09:00", status: "Posted", color: "teal" },
    { day: 1, network: "INSTAGRAM", text: "New autumn menu is here 🍂", time: "12:30", status: "Scheduled", color: "indigo" },
    { day: 2, network: "PINTEREST", text: "Cozy café corner ideas", time: "18:00", status: "Scheduled", color: "indigo" },
    { day: 3, network: "FACEBOOK", text: "Live music this Friday!", time: "17:00", status: "Pending approval", color: "yellow" },
    { day: 4, network: "REDDIT", text: "AMA: how we roast in small batches", time: "15:00", status: "Draft", color: "gray" },
  ];
  return (
    <Paper withBorder radius="xl" shadow="xl" mt={{ base: 40, sm: 64 }} p={{ base: "sm", sm: "lg" }} style={{ overflow: "hidden" }} aria-hidden>
      <Group justify="space-between" mb="md">
        <Group gap={6}>
          {["red", "yellow", "green"].map((c) => (
            <Box key={c} w={10} h={10} style={{ borderRadius: 99, background: `var(--mantine-color-${c}-5)` }} />
          ))}
        </Group>
        <Text size="xs" c="dimmed">
          Planner · This week
        </Text>
      </Group>
      <SimpleGrid cols={{ base: 1, xs: 5 }} spacing="sm">
        {days.map((d, i) => (
          <Stack key={d} gap={8}>
            <Text size="xs" fw={700} c="dimmed" tt="uppercase">
              {d}
            </Text>
            {posts
              .filter((p) => p.day === i)
              .map((p) => (
                <Card key={p.text} withBorder radius="md" p="xs">
                  <Group gap={6} mb={6} wrap="nowrap">
                    <NetworkIcon network={p.network} size={16} />
                    <Text size="xs" c="dimmed">
                      {p.time}
                    </Text>
                  </Group>
                  <Text size="sm" fw={500} lineClamp={2}>
                    {p.text}
                  </Text>
                  <Badge mt={8} size="xs" variant="light" color={p.color}>
                    {p.status}
                  </Badge>
                </Card>
              ))}
          </Stack>
        ))}
      </SimpleGrid>
    </Paper>
  );
}

export function NetworkStrip() {
  return (
    <Container size="lg" py={40}>
      <Text ta="center" size="sm" c="dimmed" mb="lg">
        Publish to the networks your audience uses
      </Text>
      <Group justify="center" gap={36}>
        {INTEGRATIONS.map((i) => (
          <Group key={i.network} gap={8} wrap="nowrap">
            <NetworkIcon network={i.network} size={24} />
            <Text fw={600} c="dimmed">
              {i.name}
            </Text>
          </Group>
        ))}
      </Group>
    </Container>
  );
}

export function FeatureCard({ f, detailed }: { f: Feature; detailed?: boolean }) {
  const Icon = ICONS[f.icon];
  return (
    <Card withBorder radius="lg" p="xl" h="100%">
      <ThemeIcon size={44} radius="md" variant="gradient" gradient={GRADIENT} mb="md">
        <Icon size={24} />
      </ThemeIcon>
      <Text fw={700} fz="lg" mb={6}>
        {f.title}
      </Text>
      <Text c="dimmed" size="sm">
        {f.body}
      </Text>
      {detailed && f.points && (
        <List mt="md" spacing={6} size="sm" icon={<IconCheck size={16} color="var(--mantine-color-teal-6)" />}>
          {f.points.map((p) => (
            <List.Item key={p}>{p}</List.Item>
          ))}
        </List>
      )}
    </Card>
  );
}

export function FeatureGrid({ limit, detailed }: { limit?: number; detailed?: boolean }) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
      {FEATURES.slice(0, limit).map((f) => (
        <FeatureCard key={f.title} f={f} detailed={detailed} />
      ))}
    </SimpleGrid>
  );
}

export function Steps() {
  return (
    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xl">
      {STEPS.map((s, i) => (
        <Stack key={s.title} gap="sm">
          <ThemeIcon size={40} radius="xl" variant="light" color="indigo">
            <Text fw={800}>{i + 1}</Text>
          </ThemeIcon>
          <Text fw={700} fz="lg">
            {s.title}
          </Text>
          <Text c="dimmed" size="sm">
            {s.body}
          </Text>
        </Stack>
      ))}
    </SimpleGrid>
  );
}

export function AiShowcase() {
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing={48} style={{ alignItems: "center" }}>
      <Stack gap="md">
        <SectionTitle
          align="left"
          eyebrow="AI that knows your brand"
          title="From one sentence to a ready-to-post caption"
          subtitle="Tell it what you want to say. It writes in your voice, adds the right hashtags, generates an image, and adapts the length for every network."
        />
        <List spacing="sm" icon={<IconCheck size={18} color="var(--mantine-color-teal-6)" />}>
          <List.Item>Captions, hashtags and images in one click</List.Item>
          <List.Item>A short version for X and a long one for LinkedIn — automatically</List.Item>
          <List.Item>Post score with specific, one-click improvements</List.Item>
        </List>
      </Stack>
      <Paper withBorder radius="xl" p="lg" shadow="md" aria-hidden>
        <Stack gap="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Your idea
          </Text>
          <Paper radius="md" p="sm" bg="var(--mantine-color-default-hover)">
            <Text size="sm">Announce our new oat-milk cold brew for summer</Text>
          </Paper>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700} mt="xs">
            {APP_NAME} writes
          </Text>
          <Paper withBorder radius="md" p="sm">
            <Group gap={8} mb={8}>
              <Avatar size={28} radius="xl" color="indigo">
                N
              </Avatar>
              <Text size="sm" fw={600}>
                Your brand
              </Text>
              <NetworkIcon network="INSTAGRAM" size={16} />
            </Group>
            <Text size="sm">
              Summer just got smoother. ☀️ Our new oat-milk cold brew is slow-steeped for 18 hours, naturally sweet and ridiculously creamy.
              <br />
              <br />
              Which are you trying first — classic or vanilla? 👇
            </Text>
            <Text size="sm" c="indigo" mt={6}>
              #coldbrew #oatmilk #summerdrinks
            </Text>
          </Paper>
          <Group gap="xs">
            <Badge variant="light" color="teal">
              Post score 88 · High
            </Badge>
            <Badge variant="light" color="gray">
              1 credit
            </Badge>
          </Group>
        </Stack>
      </Paper>
    </SimpleGrid>
  );
}

export function IntegrationGrid() {
  return (
    <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="lg">
      {INTEGRATIONS.map((i) => (
        <Card key={i.network} withBorder radius="lg" p="lg">
          <Group gap="sm" mb="xs" wrap="nowrap">
            <NetworkIcon network={i.network} size={28} />
            <Text fw={700}>{i.name}</Text>
          </Group>
          <Text size="sm" c="dimmed">
            {i.what}
          </Text>
        </Card>
      ))}
    </SimpleGrid>
  );
}

const PAID: PlanId[] = ["STARTER", "TEAM", "AGENCY"];
const PLAN_BLURB: Record<string, string> = {
  STARTER: "For creators and solo marketers",
  TEAM: "For growing teams",
  AGENCY: "For agencies managing many brands",
};

export function PricingCards() {
  const [yearly, setYearly] = useState(true);
  return (
    <Stack gap="xl">
      <Group justify="center">
        <SegmentedControl
          radius="xl"
          value={yearly ? "year" : "month"}
          onChange={(v) => setYearly(v === "year")}
          data={[
            { value: "month", label: "Monthly" },
            { value: "year", label: "Yearly · 2 months free" },
          ]}
        />
      </Group>
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
        {PAID.map((id) => {
          const p = PLAN_LIMITS[id];
          const featured = id === "TEAM";
          const monthly = p.priceMonthlyUsd ?? 0;
          const price = yearly ? Math.round((monthly * 10) / 12) : monthly;
          return (
            <Card
              key={id}
              withBorder
              radius="lg"
              p="xl"
              style={featured ? { borderColor: "var(--mantine-color-indigo-5)", borderWidth: 2, boxShadow: "var(--mantine-shadow-lg)" } : undefined}
            >
              <Group justify="space-between" mb="xs">
                <Text fw={700} fz="lg">
                  {p.label}
                </Text>
                {featured && (
                  <Badge variant="gradient" gradient={GRADIENT}>
                    Most popular
                  </Badge>
                )}
              </Group>
              <Text size="sm" c="dimmed" mb="lg">
                {PLAN_BLURB[id]}
              </Text>
              <Group gap={4} align="baseline" mb={4}>
                <Text fz={40} fw={800} lh={1}>
                  ${price}
                </Text>
                <Text c="dimmed">/month</Text>
              </Group>
              <Text size="xs" c="dimmed" mb="lg">
                {yearly ? `Billed $${monthly * 10} yearly` : "Billed monthly"}
              </Text>
              <Button component={Link} href="/signup" radius="xl" variant={featured ? "gradient" : "default"} gradient={GRADIENT} fullWidth mb="lg">
                Start free trial
              </Button>
              <List spacing={8} size="sm" icon={<IconCheck size={16} color="var(--mantine-color-teal-6)" />}>
                <List.Item>{p.users === 1 ? "1 user" : `${p.users} users`}</List.Item>
                <List.Item>{p.channels} social channels</List.Item>
                <List.Item>{p.creditsMonthly.toLocaleString()} AI credits / month</List.Item>
                <List.Item>Unlimited brands, posts and scheduling</List.Item>
                <List.Item>AI writer, studio and campaigns</List.Item>
                <List.Item>Approvals, inbox and automations</List.Item>
              </List>
            </Card>
          );
        })}
      </SimpleGrid>
      <Text ta="center" size="sm" c="dimmed">
        Need more seats or channels?{" "}
        <Text component={Link} href="/contact" c="indigo" inherit>
          Talk to us about Enterprise
        </Text>
        .
      </Text>
    </Stack>
  );
}

export function Faq({ items = FAQS }: { items?: Array<{ q: string; a: string }> }) {
  return (
    <Accordion variant="separated" radius="lg" maw={760} mx="auto">
      {items.map((f) => (
        <Accordion.Item key={f.q} value={f.q}>
          <Accordion.Control>
            <Text fw={600}>{f.q}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Text c="dimmed" size="sm">
              {f.a}
            </Text>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}

export function CtaBand() {
  return (
    <Container size="lg" mt={{ base: 56, sm: 88 }}>
      <Paper radius="xl" p={{ base: "xl", sm: 56 }} style={{ background: "linear-gradient(135deg, var(--mantine-color-indigo-7), var(--mantine-color-violet-7))" }}>
        <Stack align="center" ta="center" gap="md">
          <Title order={2} c="white" fz={{ base: 28, sm: 38 }} style={{ letterSpacing: -0.8 }}>
            Your next month of content starts today
          </Title>
          <Text c="rgba(255,255,255,0.85)" maw={560}>
            Connect a channel, describe your first post, and publish it in minutes.
          </Text>
          <Button component={Link} href="/signup" size="lg" radius="xl" color="white" c="indigo.8" rightSection={<IconArrowRight size={18} />}>
            Get started free
          </Button>
        </Stack>
      </Paper>
    </Container>
  );
}
