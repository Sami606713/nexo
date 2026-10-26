"use client";

import useSWR from "swr";
import { Badge, Button, Card, Group, List, Progress, SimpleGrid, Skeleton, Stack, Table, Text, ThemeIcon, Title, Tooltip } from "@mantine/core";
import { IconCheck, IconReceipt } from "@tabler/icons-react";
import type { PlanId, PlanLimits } from "@postline/core";
import { useBrand } from "@/components/shell/BrandContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

interface BillingDto {
  plan: PlanId;
  limits: PlanLimits;
  plans: Record<PlanId, PlanLimits>;
  subscription: { status: string; periodStart: string; periodEnd: string | null; resetDay: number } | null;
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
  workflow_run: "Workflow",
  refill: "Monthly refill",
  refund: "Refund",
};

function Usage({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
  return (
    <div>
      <Group justify="space-between" mb={4}>
        <Text size="sm">{label}</Text>
        <Text size="sm" c="dimmed">
          {used.toLocaleString()} / {max.toLocaleString()}
        </Text>
      </Group>
      <Progress value={pct} color={pct >= 90 ? "red" : pct >= 70 ? "orange" : "indigo"} radius="xl" />
    </div>
  );
}

export function BillingSettings() {
  const b = useBrand();
  const { data, isLoading, error } = useSWR<BillingDto>(`/api/brands/${b.brandId}/billing`);

  return (
    <>
      <PageHeader title="Billing" description="Your plan, usage and AI credit history." />
      {error && <Text c="red">Couldn&apos;t load billing.</Text>}
      {isLoading || !data ? (
        <Stack>
          <Skeleton h={160} radius="lg" />
          <Skeleton h={220} radius="lg" />
        </Stack>
      ) : (
        <Stack gap="xl">
          <Card withBorder radius="lg" padding="lg">
            <Group justify="space-between" align="flex-start" mb="md">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Current plan
                </Text>
                <Group gap="xs">
                  <Title order={3}>{data.limits.label}</Title>
                  {data.subscription && (
                    <Badge variant="light" color={data.subscription.status === "active" ? "teal" : "yellow"}>
                      {data.subscription.status}
                    </Badge>
                  )}
                </Group>
              </div>
              {data.subscription && (
                <Text size="xs" c="dimmed">
                  Credits refill on day {data.subscription.resetDay} of each month
                </Text>
              )}
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg">
              <Usage label="AI credits used" used={Math.max(0, data.credits.monthly - data.credits.remaining)} max={data.credits.monthly} />
              <Usage label="Channels" used={data.usage.channels} max={data.limits.channels} />
              <Usage label="Team members" used={data.usage.users} max={data.limits.users} />
            </SimpleGrid>
          </Card>

          <div>
            <Title order={4} mb="sm">
              Plans
            </Title>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
              {(Object.entries(data.plans) as [PlanId, PlanLimits][])
                .filter(([id]) => id !== "TRIAL")
                .map(([id, p]) => {
                  const current = id === data.plan;
                  return (
                    <Card
                      key={id}
                      withBorder
                      radius="lg"
                      padding="lg"
                      style={current ? { borderColor: "var(--mantine-primary-color-filled)", borderWidth: 2 } : undefined}
                    >
                      <Stack gap="sm" h="100%">
                        <Group justify="space-between">
                          <Text fw={700}>{p.label}</Text>
                          {current && <Badge size="sm">Current</Badge>}
                        </Group>
                        <Text>
                          {p.priceMonthlyUsd === null ? (
                            <Text span fw={700} fz={24}>
                              Custom
                            </Text>
                          ) : (
                            <>
                              <Text span fw={700} fz={28}>
                                ${p.priceMonthlyUsd}
                              </Text>
                              <Text span c="dimmed" size="sm">
                                /mo
                              </Text>
                            </>
                          )}
                        </Text>
                        <List
                          size="sm"
                          spacing={4}
                          icon={
                            <ThemeIcon size={16} radius="xl" color="teal" variant="light">
                              <IconCheck size={11} />
                            </ThemeIcon>
                          }
                          style={{ flex: 1 }}
                        >
                          <List.Item>{p.creditsMonthly.toLocaleString()} AI credits / month</List.Item>
                          <List.Item>{p.channels.toLocaleString()} channels</List.Item>
                          <List.Item>
                            {p.users.toLocaleString()} user{p.users === 1 ? "" : "s"}
                          </List.Item>
                        </List>
                        <Tooltip label="Online upgrades are coming soon" disabled={current}>
                          <Button variant={current ? "light" : "filled"} disabled fullWidth>
                            {current ? "Current plan" : "Upgrade — coming soon"}
                          </Button>
                        </Tooltip>
                      </Stack>
                    </Card>
                  );
                })}
            </SimpleGrid>
          </div>

          <div>
            <Title order={4} mb="sm">
              Credit history
            </Title>
            {data.ledger.length === 0 ? (
              <EmptyState icon={<IconReceipt size={26} />} title="No credit activity yet" description="AI actions like writing posts or importing your brand will appear here." />
            ) : (
              <Card withBorder radius="lg" padding={0}>
                <Table.ScrollContainer minWidth={480}>
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
                      {data.ledger.map((l) => (
                        <Table.Tr key={l.id}>
                          <Table.Td>
                            <Text size="sm">{new Date(l.createdAt).toLocaleString()}</Text>
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
              </Card>
            )}
          </div>
        </Stack>
      )}
    </>
  );
}
