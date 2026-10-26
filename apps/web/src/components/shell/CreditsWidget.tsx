"use client";

import Link from "next/link";
import useSWR from "swr";
import { Anchor, Group, Paper, Progress, Skeleton, Text } from "@mantine/core";
import { IconSparkles } from "@tabler/icons-react";

export interface CreditsResponse {
  remaining: number;
  monthly: number;
  plan: string;
  planLabel: string;
}

export const creditsKey = (brandId: string) => `/api/brands/${brandId}/credits`;

export function CreditsWidget({ brandId, canBilling }: { brandId: string; canBilling: boolean }) {
  const { data, error } = useSWR<CreditsResponse>(creditsKey(brandId), { refreshInterval: 60_000 });
  const pct = data && data.monthly > 0 ? Math.max(0, Math.min(100, (data.remaining / data.monthly) * 100)) : 0;
  const color = pct < 10 ? "red" : pct < 30 ? "orange" : "indigo";
  return (
    <Paper withBorder radius="md" p="sm">
      <Group justify="space-between" mb={6} wrap="nowrap">
        <Group gap={6} wrap="nowrap">
          <IconSparkles size={16} color="var(--mantine-color-violet-6)" />
          <Text size="xs" fw={600}>
            AI credits
          </Text>
        </Group>
        {data ? (
          <Text size="xs" c="dimmed">
            {data.planLabel}
          </Text>
        ) : null}
      </Group>
      {data ? (
        <>
          <Text size="sm" fw={700}>
            {data.remaining.toLocaleString()}{" "}
            <Text span size="xs" c="dimmed" fw={400}>
              / {data.monthly.toLocaleString()} left
            </Text>
          </Text>
          <Progress value={pct} color={color} size="sm" mt={6} radius="xl" />
          {canBilling && (
            <Anchor component={Link} href={`/app/${brandId}/settings/billing`} size="xs" mt={6} display="inline-block">
              {pct < 30 ? "Get more credits" : "View usage"}
            </Anchor>
          )}
        </>
      ) : error ? (
        <Text size="xs" c="dimmed">
          Credits unavailable
        </Text>
      ) : (
        <>
          <Skeleton h={16} w="60%" />
          <Skeleton h={8} mt={8} radius="xl" />
        </>
      )}
    </Paper>
  );
}
