"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ActionIcon, Anchor, Badge, Card, Code, Group, Pagination, Skeleton, Stack, Table, Text, ThemeIcon, Timeline } from "@mantine/core";
import { IconCheck, IconChevronDown, IconChevronRight, IconClock, IconFilter, IconHistory, IconPlayerSkipForward, IconX } from "@tabler/icons-react";
import type { RunLogEntry, WorkflowRunDTO, WorkflowStep } from "@/lib/workflows/types";
import { useBrand } from "@/components/shell/BrandContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { dayjs } from "@/components/posts/tz";
import { RunStatusBadge, STEP_META, TRIGGER_META } from "./meta";

interface RunsPage {
  items: WorkflowRunDTO[];
  total: number;
  page: number;
  pageSize: number;
}

const ENTRY_ICON: Record<RunLogEntry["status"], { icon: typeof IconCheck; color: string; label: string }> = {
  success: { icon: IconCheck, color: "teal", label: "Done" },
  error: { icon: IconX, color: "red", label: "Failed" },
  skipped: { icon: IconPlayerSkipForward, color: "gray", label: "Skipped" },
  filtered: { icon: IconFilter, color: "yellow", label: "Filtered" },
  waiting: { icon: IconClock, color: "blue", label: "Waiting" },
};

function duration(a: string, b?: string | null) {
  if (!b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60_000)} min`;
}

function OutputView({ entry }: { entry: RunLogEntry }) {
  const b = useBrand();
  const o = entry.output ?? {};
  if (entry.stepId === "trigger") {
    return (
      <Code block style={{ fontSize: 11, maxHeight: 180, overflow: "auto" }}>
        {JSON.stringify(o, null, 2)}
      </Code>
    );
  }
  const text = typeof o.text === "string" ? o.text : null;
  return (
    <Stack gap={4}>
      {text && (
        <Text size="xs" style={{ whiteSpace: "pre-wrap" }} lineClamp={10}>
          {text}
        </Text>
      )}
      {typeof o.imageUrl === "string" && (
        <Anchor href={o.imageUrl} target="_blank" size="xs">
          View generated image
        </Anchor>
      )}
      {typeof o.postGroupId === "string" && (
        <Group gap={6}>
          <Badge size="xs" variant="light">
            {String(o.status)}
          </Badge>
          {typeof o.scheduledAt === "string" && (
            <Text size="xs" c="dimmed">
              for {dayjs(o.scheduledAt).tz(b.timezone).format("ddd D MMM, HH:mm")}
            </Text>
          )}
          <Anchor component={Link} href={`/app/${b.brandId}/posts/${o.postGroupId}`} size="xs">
            Open post
          </Anchor>
        </Group>
      )}
      {typeof o.resumeAt === "string" && entry.status === "waiting" && (
        <Text size="xs" c="dimmed">
          Continues {dayjs(o.resumeAt).fromNow()}
        </Text>
      )}
    </Stack>
  );
}

function RunLog({ run, steps }: { run: WorkflowRunDTO; steps: WorkflowStep[] }) {
  const index = new Map(steps.map((s, i) => [s.id, i]));
  return (
    <Timeline bulletSize={22} lineWidth={2} py="xs">
      {run.log.map((e, i) => {
        const st = ENTRY_ICON[e.status] ?? ENTRY_ICON.success;
        const isTrigger = e.stepId === "trigger";
        const meta = isTrigger ? TRIGGER_META[e.type as keyof typeof TRIGGER_META] : STEP_META[e.type as keyof typeof STEP_META];
        const pos = index.get(e.stepId);
        const title = isTrigger ? `Trigger · ${meta?.label ?? e.type}` : `${pos !== undefined ? `${pos + 1}. ` : ""}${meta?.label ?? e.type}`;
        const Icon = st.icon;
        return (
          <Timeline.Item
            key={`${e.stepId}-${i}`}
            bullet={
              <ThemeIcon size={22} radius="xl" color={st.color} variant="light">
                <Icon size={12} />
              </ThemeIcon>
            }
            title={
              <Group gap={6}>
                <Text size="sm" fw={600}>
                  {title}
                </Text>
                <Badge size="xs" variant="light" color={st.color}>
                  {st.label}
                </Badge>
                {e.offline && (
                  <Badge size="xs" variant="outline" color="gray">
                    offline
                  </Badge>
                )}
                <Text size="xs" c="dimmed">
                  {dayjs(e.startedAt).format("HH:mm:ss")}
                  {duration(e.startedAt, e.finishedAt) ? ` · ${duration(e.startedAt, e.finishedAt)}` : ""}
                </Text>
              </Group>
            }
          >
            <Stack gap={4} mt={4}>
              {e.note && (
                <Text size="xs" c="dimmed">
                  {e.note}
                </Text>
              )}
              {e.error && (
                <Text size="xs" c="red">
                  {e.error}
                </Text>
              )}
              <OutputView entry={e} />
            </Stack>
          </Timeline.Item>
        );
      })}
    </Timeline>
  );
}

export function RunsPanel({ workflowId, steps }: { workflowId: string; steps: WorkflowStep[] }) {
  const b = useBrand();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading } = useSWR<RunsPage>(`/api/brands/${b.brandId}/workflows/${workflowId}/runs?page=${page}&pageSize=20`, {
    refreshInterval: (d) => (d?.items.some((r) => r.status === "RUNNING") ? 2000 : 8000),
  });

  if (isLoading) return <Skeleton h={240} radius="lg" />;
  if (!data?.items.length)
    return (
      <EmptyState
        icon={<IconHistory size={26} />}
        title="No runs yet"
        description="Runs appear here as soon as the trigger fires — or click “Run now” to try the workflow with test data."
      />
    );

  return (
    <Stack>
      <Card withBorder radius="lg" padding={0}>
        <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={36} />
              <Table.Th>Status</Table.Th>
              <Table.Th>Started</Table.Th>
              <Table.Th visibleFrom="sm">Duration</Table.Th>
              <Table.Th>Details</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.items.map((r) => {
              const expanded = open === r.id;
              const manual = r.log[0]?.note === "Manual run";
              const steps_ = r.log.filter((e) => e.stepId !== "trigger");
              return (
                <Fragment key={r.id}>
                  <Table.Tr style={{ cursor: "pointer" }} onClick={() => setOpen(expanded ? null : r.id)}>
                    <Table.Td>
                      <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Expand">
                        {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                      </ActionIcon>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={6}>
                        <RunStatusBadge status={r.status} />
                        {manual && (
                          <Badge size="xs" variant="default">
                            Test
                          </Badge>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{dayjs(r.startedAt).tz(b.timezone).format("D MMM, HH:mm:ss")}</Text>
                      <Text size="xs" c="dimmed">
                        {dayjs(r.startedAt).fromNow()}
                      </Text>
                    </Table.Td>
                    <Table.Td visibleFrom="sm">
                      <Text size="sm" c="dimmed">
                        {duration(r.startedAt, r.finishedAt) ?? "—"}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c={r.error ? "red" : "dimmed"} lineClamp={1}>
                        {r.error ?? `${steps_.length} step${steps_.length === 1 ? "" : "s"} ran`}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                  {expanded && (
                    <Table.Tr>
                      <Table.Td colSpan={5} bg="var(--mantine-color-default-hover)">
                        <RunLog run={r} steps={steps} />
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Fragment>
              );
            })}
          </Table.Tbody>
        </Table>
      </Card>
      {data.total > data.pageSize && (
        <Group justify="center">
          <Pagination total={Math.ceil(data.total / data.pageSize)} value={page} onChange={setPage} size="sm" />
        </Group>
      )}
    </Stack>
  );
}
