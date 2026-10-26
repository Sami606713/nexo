"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  Modal,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconArrowRight, IconDots, IconPlayerPlay, IconPlus, IconRobot, IconTrash, IconTopologyStar3 } from "@tabler/icons-react";
import { api } from "@/lib/fetcher";
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "@/lib/workflows/templates";
import type { WorkflowListItemDTO } from "@/lib/workflows/types";
import { useBrand } from "@/components/shell/BrandContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { notifyError, notifySuccess } from "@/components/ui/notify";
import { dayjs } from "@/components/posts/tz";
import classes from "./workflows.module.css";
import { RunStatusBadge, STEP_META, TRIGGER_META, TriggerFallbackIcon, triggerSummary } from "./meta";

export function WorkflowsList() {
  const b = useBrand();
  const key = `/api/brands/${b.brandId}/workflows`;
  const { data, isLoading, mutate } = useSWR<WorkflowListItemDTO[]>(key, { refreshInterval: 15_000 });
  const [gallery, setGallery] = useState(false);
  const editable = b.can("posts.write");

  const toggle = async (w: WorkflowListItemDTO, active: boolean) => {
    mutate((list) => list?.map((x) => (x.id === w.id ? { ...x, active } : x)), { revalidate: false });
    try {
      await api(`${key}/${w.id}/toggle`, "POST", { active });
      notifySuccess(active ? `“${w.name}” is live` : `“${w.name}” paused`);
    } catch (e) {
      notifyError(e);
    } finally {
      mutate();
    }
  };

  const runNow = async (w: WorkflowListItemDTO) => {
    try {
      await api(`${key}/${w.id}/run`, "POST", {});
      notifySuccess("Test run queued — check the Runs tab in a few seconds");
      setTimeout(() => mutate(), 3000);
    } catch (e) {
      notifyError(e);
    }
  };

  const remove = (w: WorkflowListItemDTO) =>
    modals.openConfirmModal({
      title: `Delete “${w.name}”?`,
      centered: true,
      children: <Text size="sm">The workflow and its run history will be removed. Posts it already created stay in the planner.</Text>,
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await api(`${key}/${w.id}`, "DELETE");
          await mutate();
          notifySuccess("Workflow deleted");
        } catch (e) {
          notifyError(e);
        }
      },
    });

  return (
    <>
      <PageHeader
        title="Workflows"
        description="Put repetitive work on autopilot: pick a trigger, chain actions, and let them run in the background."
        actions={
          <>
            <Button component={Link} href={`/app/${b.brandId}/workflows/agents`} variant="default" leftSection={<IconRobot size={16} />}>
              AI agents
            </Button>
            {editable && (
              <Button leftSection={<IconPlus size={16} />} onClick={() => setGallery(true)}>
                Create workflow
              </Button>
            )}
          </>
        }
      />

      {isLoading ? (
        <Stack>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h={76} radius="lg" />
          ))}
        </Stack>
      ) : !data?.length ? (
        <EmptyState
          icon={<IconTopologyStar3 size={26} />}
          title="No workflows yet"
          description="Start from a ready-made recipe — turn blog posts into captions, post a daily tip, or answer common questions in your inbox automatically."
          action={
            editable && (
              <Button mt="xs" leftSection={<IconPlus size={16} />} onClick={() => setGallery(true)}>
                Browse templates
              </Button>
            )
          }
        />
      ) : (
        <Card withBorder radius="lg" padding={0}>
          {data.map((w, i) => {
            const tm = TRIGGER_META[w.trigger?.type] ?? null;
            const TIcon = tm?.icon ?? TriggerFallbackIcon;
            return (
              <Group
                key={w.id}
                justify="space-between"
                wrap="nowrap"
                px="md"
                py="sm"
                gap="md"
                style={i ? { borderTop: "1px solid var(--mantine-color-default-border)" } : undefined}
              >
                <UnstyledButton component={Link} href={`/app/${b.brandId}/workflows/${w.id}`} style={{ flex: 1, minWidth: 0 }}>
                  <Group gap="md" wrap="nowrap">
                    <ThemeIcon size={40} radius="md" variant="light" color={tm?.color ?? "gray"}>
                      <TIcon size={20} />
                    </ThemeIcon>
                    <Stack gap={2} style={{ minWidth: 0 }}>
                      <Text fw={600} truncate>
                        {w.name}
                      </Text>
                      <Group gap={6} wrap="nowrap">
                        <Text size="xs" c="dimmed" truncate>
                          {triggerSummary(w.trigger)}
                        </Text>
                        {w.stepTypes.length > 0 && (
                          <Group gap={2} wrap="nowrap">
                            {w.stepTypes.slice(0, 5).map((t, idx) => {
                              const SIcon = STEP_META[t]?.icon;
                              return SIcon ? (
                                <Group key={idx} gap={2} wrap="nowrap">
                                  <IconArrowRight size={10} color="var(--mantine-color-dimmed)" />
                                  <Tooltip label={STEP_META[t].label}>
                                    <ThemeIcon size={18} radius="sm" variant="light" color={STEP_META[t].color}>
                                      <SIcon size={11} />
                                    </ThemeIcon>
                                  </Tooltip>
                                </Group>
                              ) : null;
                            })}
                          </Group>
                        )}
                      </Group>
                    </Stack>
                  </Group>
                </UnstyledButton>

                <Group gap="lg" wrap="nowrap">
                  <Stack gap={2} align="flex-end" visibleFrom="sm" miw={120}>
                    {w.lastRun ? (
                      <>
                        <RunStatusBadge status={w.lastRun.status} size="xs" />
                        <Text size="xs" c="dimmed">
                          {dayjs(w.lastRun.startedAt).fromNow()}
                        </Text>
                      </>
                    ) : (
                      <Text size="xs" c="dimmed">
                        Never run
                      </Text>
                    )}
                  </Stack>
                  <Text size="xs" c="dimmed" visibleFrom="md" miw={64} ta="right">
                    {w.runCount} run{w.runCount === 1 ? "" : "s"}
                  </Text>
                  <Tooltip label={w.active ? "Active — click to pause" : "Paused — click to activate"}>
                    <div>
                      <Switch checked={w.active} disabled={!editable} onChange={(e) => toggle(w, e.currentTarget.checked)} aria-label="Active" />
                    </div>
                  </Tooltip>
                  {editable && (
                    <Menu position="bottom-end" shadow="md">
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray" aria-label="More">
                          <IconDots size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item leftSection={<IconPlayerPlay size={14} />} onClick={() => runNow(w)}>
                          Run now with test data
                        </Menu.Item>
                        <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => remove(w)}>
                          Delete
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  )}
                </Group>
              </Group>
            );
          })}
        </Card>
      )}

      <TemplateGallery opened={gallery} onClose={() => setGallery(false)} />
    </>
  );
}

function TemplateGallery({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const b = useBrand();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const create = async (t: WorkflowTemplate) => {
    setBusy(t.key);
    try {
      const { id } = await api<{ id: string }>(`/api/brands/${b.brandId}/workflows`, "POST", { template: t.key });
      router.push(`/app/${b.brandId}/workflows/${id}`);
    } catch (e) {
      notifyError(e);
      setBusy(null);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} size="xl" centered title={<Text fw={600}>Start a new workflow</Text>}>
      <Text size="sm" c="dimmed" mb="md">
        Pick a recipe to start from. Every part can be changed in the builder, and nothing runs until you switch it on.
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        {WORKFLOW_TEMPLATES.map((t) => {
          const tm = TRIGGER_META[t.trigger.type];
          const TIcon = tm.icon;
          return (
            <UnstyledButton key={t.key} onClick={() => !busy && create(t)} disabled={!!busy}>
              <Card withBorder radius="md" padding="md" h="100%" className={classes.templateCard} style={{ opacity: busy && busy !== t.key ? 0.5 : 1 }}>
                <Stack gap="sm" h="100%">
                  <Group gap={6} wrap="nowrap">
                    <ThemeIcon size={30} radius="md" variant="light" color={tm.color}>
                      <TIcon size={16} />
                    </ThemeIcon>
                    {t.steps.map((s) => {
                      const m = STEP_META[s.type];
                      const SIcon = m.icon;
                      return (
                        <Group key={s.id} gap={6} wrap="nowrap">
                          <IconArrowRight size={12} color="var(--mantine-color-dimmed)" />
                          <ThemeIcon size={30} radius="md" variant="light" color={m.color}>
                            <SIcon size={16} />
                          </ThemeIcon>
                        </Group>
                      );
                    })}
                  </Group>
                  <div>
                    <Text fw={600} size="sm">
                      {t.title}
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      {t.description}
                    </Text>
                  </div>
                  <Group gap={4} mt="auto">
                    {t.tags.map((tag) => (
                      <Badge key={tag} size="xs" variant="default">
                        {tag}
                      </Badge>
                    ))}
                    {busy === t.key && (
                      <Text size="xs" c="dimmed" ml="auto">
                        Creating…
                      </Text>
                    )}
                  </Group>
                </Stack>
              </Card>
            </UnstyledButton>
          );
        })}
      </SimpleGrid>
    </Modal>
  );
}
