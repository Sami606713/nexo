"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import dayjs from "dayjs";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  List,
  Pagination,
  Progress,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { IconCheck, IconCreditCard, IconFileInvoice, IconFlask, IconReceipt, IconSparkles } from "@tabler/icons-react";
import type { PlanId, PlanLimits } from "@postline/core";
import { api } from "@/lib/fetcher";
import { useBrand } from "@/components/shell/BrandContext";
import { creditsKey } from "@/components/shell/CreditsWidget";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { notifyError, notifySuccess } from "@/components/ui/notify";

interface BillingDto {
  plan: PlanId;
  limits: PlanLimits;
  plans: Record<PlanId, PlanLimits>;
  subscription: {
    status: string;
    periodStart: string;
    periodEnd: string | null;
    resetDay: number;
    hasCustomer: boolean;
    hasStripeSubscription: boolean;
  } | null;
  billing: { stripe: boolean; demo: boolean };
  credits: { remaining: number; monthly: number };
  usage: { channels: number; users: number };
  ledger: { id: string; delta: number; reason: string; brandName: string | null; createdAt: string }[];
}

const REASONS: Record<string, string> = {
  caption: "AI post",
  image: "AI image",
  rewrite: "AI rewrite",
  hashtags: "Hashtags",
  reply_suggest: "Reply suggestion",
  score_fix: "Score fix",
  campaign: "Campaign",
  brand_fetch: "Brand import",
  workflow_run: "Workflow run",
  refill: "Monthly refill",
  refund: "Refund",
};

const PLAN_PITCH: Partial<Record<PlanId, { tagline: string; extras: string[] }>> = {
  STARTER: { tagline: "For solo creators finding their rhythm", extras: ["Planner & AI writing", "Bio page"] },
  TEAM: { tagline: "For small teams that ship content daily", extras: ["Approvals & client access", "Workflows & inbox"] },
  AGENCY: { tagline: "For agencies running many brands", extras: ["Unlimited brands", "Priority support"] },
};

const STATUS_COLOR: Record<string, string> = { active: "teal", trialing: "blue", past_due: "orange", canceled: "gray" };
const PAGE_SIZE = 12;

function Meter({ label, used, max, hint }: { label: string; used: number; max: number; hint?: string }) {
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
  return (
    <div>
      <Group justify="space-between" mb={6}>
        <Text size="sm" fw={500}>
          {label}
        </Text>
        <Text size="sm" c="dimmed">
          <Text span fw={600} c="var(--mantine-color-text)">
            {used.toLocaleString()}
          </Text>{" "}
          / {max.toLocaleString()}
        </Text>
      </Group>
      <Progress value={pct} color={pct >= 90 ? "red" : pct >= 70 ? "orange" : "indigo"} radius="xl" size="md" />
      {hint && (
        <Text size="xs" c="dimmed" mt={4}>
          {hint}
        </Text>
      )}
    </div>
  );
}

export function BillingPage() {
  const b = useBrand();
  const router = useRouter();
  const params = useSearchParams();
  const key = `/api/brands/${b.brandId}/billing`;
  const { data, error, isLoading, mutate } = useSWR<BillingDto>(key);
  const { mutate: globalMutate } = useSWRConfig();
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [busy, setBusy] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const c = params.get("checkout");
    if (c === "success") notifySuccess("Your subscription is set up — welcome aboard!", "Payment complete");
    if (c) router.replace(`/app/${b.brandId}/settings/billing`);
  }, [params, router, b.brandId]);

  const choose = async (plan: PlanId) => {
    setBusy(plan);
    try {
      const res = await api<{ url?: string; demo?: boolean }>("/api/billing/checkout", "POST", { plan, interval, brandId: b.brandId });
      if (res.url) {
        window.location.href = res.url;
        return;
      }
      if (res.demo) {
        notifySuccess(`Switched to ${data?.plans[plan].label}. No payment was taken (demo mode).`, "Plan updated");
        await Promise.all([mutate(), globalMutate(creditsKey(b.brandId))]);
      }
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(null);
    }
  };

  const portal = async () => {
    setBusy("portal");
    try {
      const res = await api<{ url: string | null; demo?: boolean }>("/api/billing/portal", "POST", { brandId: b.brandId });
      if (res.url) window.location.href = res.url;
      else if (res.demo) notifySuccess("Invoices live in the Stripe customer portal. Connect Stripe to turn it on.", "Demo mode");
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Billing"
        description="Your plan, usage and AI credit history."
        actions={
          data && (
            <Group gap="sm">
              {data.billing.demo && (
                <Badge size="lg" variant="light" color="yellow" leftSection={<IconFlask size={14} />}>
                  Demo mode — no payment
                </Badge>
              )}
              <Button variant="default" leftSection={<IconFileInvoice size={16} />} onClick={portal} loading={busy === "portal"}>
                Invoices & payment
              </Button>
            </Group>
          )
        }
      />
      {error && <Text c="red">Couldn&apos;t load billing.</Text>}
      {isLoading || !data ? (
        <Stack>
          <Skeleton h={180} radius="lg" />
          <Skeleton h={320} radius="lg" />
        </Stack>
      ) : (
        <Stack gap="xl">
          {data.subscription?.status === "past_due" && (
            <Alert color="orange" title="Payment failed">
              We couldn&apos;t charge your card. Update your payment method to keep publishing without interruption.
            </Alert>
          )}

          <Card withBorder radius="lg" padding="lg">
            <Group justify="space-between" align="flex-start" mb="lg" wrap="wrap">
              <Group gap="md" wrap="nowrap">
                <ThemeIcon size={48} radius="md" variant="gradient" gradient={{ from: "indigo", to: "violet", deg: 135 }}>
                  <IconCreditCard size={26} />
                </ThemeIcon>
                <div>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                    Current plan
                  </Text>
                  <Group gap="xs">
                    <Title order={3}>{data.limits.label}</Title>
                    {data.subscription && (
                      <Badge variant="light" color={STATUS_COLOR[data.subscription.status] ?? "gray"}>
                        {data.subscription.status.replace("_", " ")}
                      </Badge>
                    )}
                  </Group>
                  <Text size="sm" c="dimmed">
                    {data.limits.priceMonthlyUsd ? `$${data.limits.priceMonthlyUsd}/month` : data.plan === "TRIAL" ? "Free trial" : "Custom pricing"}
                    {data.subscription?.periodEnd ? ` · renews ${dayjs(data.subscription.periodEnd).format("MMM D, YYYY")}` : ""}
                  </Text>
                </div>
              </Group>
              {data.subscription && (
                <Text size="xs" c="dimmed">
                  Credits refill on day {data.subscription.resetDay} of each month
                </Text>
              )}
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xl">
              <Meter
                label="AI credits used"
                used={Math.max(0, data.credits.monthly - data.credits.remaining)}
                max={data.credits.monthly}
                hint={`${data.credits.remaining.toLocaleString()} left this period`}
              />
              <Meter label="Channels" used={data.usage.channels} max={data.limits.channels} hint="Across all your brands" />
              <Meter label="Team members" used={data.usage.users} max={data.limits.users} hint="Including pending invites" />
            </SimpleGrid>
          </Card>

          <div>
            <Group justify="space-between" mb="md" wrap="wrap">
              <Title order={4}>Plans</Title>
              <Group gap="xs">
                <SegmentedControl
                  value={interval}
                  onChange={(v) => setInterval(v as "month" | "year")}
                  data={[
                    { value: "month", label: "Monthly" },
                    { value: "year", label: "Yearly" },
                  ]}
                />
                <Badge variant="light" color="teal">
                  2 months free on yearly
                </Badge>
              </Group>
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg">
              {(["STARTER", "TEAM", "AGENCY"] as PlanId[]).map((id) => {
                const p = data.plans[id];
                const current = id === data.plan;
                const popular = id === "TEAM";
                const price = p.priceMonthlyUsd ?? 0;
                const shown = interval === "year" ? Math.round((price * 10) / 12) : price;
                const order = ["TRIAL", "STARTER", "TEAM", "AGENCY", "ENTERPRISE"];
                const upgrade = order.indexOf(id) > order.indexOf(data.plan);
                return (
                  <Card
                    key={id}
                    withBorder
                    radius="lg"
                    padding="lg"
                    style={
                      current
                        ? { borderColor: "var(--mantine-primary-color-filled)", borderWidth: 2 }
                        : popular
                          ? { borderColor: "var(--mantine-color-violet-4)" }
                          : undefined
                    }
                  >
                    <Stack gap="sm" h="100%">
                      <Group justify="space-between">
                        <Text fw={700} fz="lg">
                          {p.label}
                        </Text>
                        {current ? <Badge>Current</Badge> : popular ? <Badge color="violet" variant="light">Most popular</Badge> : null}
                      </Group>
                      <Text size="sm" c="dimmed" mih={40}>
                        {PLAN_PITCH[id]?.tagline}
                      </Text>
                      <div>
                        <Text span fw={800} fz={34} lh={1}>
                          ${shown}
                        </Text>
                        <Text span c="dimmed" size="sm">
                          {" "}
                          /month
                        </Text>
                        <Text size="xs" c="dimmed" mt={2}>
                          {interval === "year" ? `$${price * 10} billed yearly` : "billed monthly · 7-day free trial"}
                        </Text>
                      </div>
                      <List
                        size="sm"
                        spacing={6}
                        icon={
                          <ThemeIcon size={18} radius="xl" color="teal" variant="light">
                            <IconCheck size={12} />
                          </ThemeIcon>
                        }
                        style={{ flex: 1 }}
                      >
                        <List.Item>{p.creditsMonthly.toLocaleString()} AI credits / month</List.Item>
                        <List.Item>{p.channels.toLocaleString()} social channels</List.Item>
                        <List.Item>
                          {p.users.toLocaleString()} team member{p.users === 1 ? "" : "s"}
                        </List.Item>
                        {PLAN_PITCH[id]?.extras.map((x) => <List.Item key={x}>{x}</List.Item>)}
                      </List>
                      <Button
                        fullWidth
                        variant={current ? "light" : upgrade ? "filled" : "default"}
                        disabled={current}
                        loading={busy === id}
                        onClick={() => void choose(id)}
                        leftSection={!current && upgrade ? <IconSparkles size={16} /> : undefined}
                      >
                        {current ? "Current plan" : upgrade ? `Upgrade to ${p.label}` : `Switch to ${p.label}`}
                      </Button>
                    </Stack>
                  </Card>
                );
              })}
            </SimpleGrid>
            <Text size="xs" c="dimmed" mt="sm">
              Need more than {data.plans.AGENCY.channels} channels or SSO? Enterprise plans are available on request.
            </Text>
          </div>

          <div>
            <Title order={4} mb="sm">
              Credit history
            </Title>
            {data.ledger.length === 0 ? (
              <EmptyState icon={<IconReceipt size={26} />} title="No credit activity yet" description="AI actions like writing posts or importing your brand will appear here." />
            ) : (
              <Card withBorder radius="lg" padding={0}>
                <Table.ScrollContainer minWidth={520}>
                  <Table verticalSpacing="xs" horizontalSpacing="md" striped>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Date</Table.Th>
                        <Table.Th>Action</Table.Th>
                        <Table.Th>Brand</Table.Th>
                        <Table.Th ta="right">Credits</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {data.ledger.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((l) => (
                        <Table.Tr key={l.id}>
                          <Table.Td>
                            <Text size="sm">{dayjs(l.createdAt).format("MMM D, YYYY · h:mm A")}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">{REASONS[l.reason] ?? l.reason}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" c="dimmed">
                              {l.brandName ?? "—"}
                            </Text>
                          </Table.Td>
                          <Table.Td ta="right">
                            <Text size="sm" fw={600} c={l.delta < 0 ? undefined : "teal"}>
                              {l.delta > 0 ? `+${l.delta}` : l.delta}
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
                {data.ledger.length > PAGE_SIZE && (
                  <Group justify="center" p="sm">
                    <Pagination size="sm" total={Math.ceil(data.ledger.length / PAGE_SIZE)} value={page} onChange={setPage} />
                  </Group>
                )}
              </Card>
            )}
          </div>
        </Stack>
      )}
    </>
  );
}
