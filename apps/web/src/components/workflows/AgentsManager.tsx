"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ActionIcon, Badge, Button, Card, Group, SimpleGrid, Skeleton, Stack, Text, ThemeIcon, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconArrowLeft, IconPencil, IconPhoto, IconPlus, IconRobot, IconTrash, IconWorldSearch } from "@tabler/icons-react";
import { api } from "@/lib/fetcher";
import type { AIAgentDTO } from "@/lib/workflows/types";
import { useBrand } from "@/components/shell/BrandContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { notifyError, notifySuccess } from "@/components/ui/notify";
import { AgentModal, agentModelLabel, type AgentModelsResponse } from "./AgentModal";

export function AgentsManager() {
  const b = useBrand();
  const key = `/api/brands/${b.brandId}/ai-agents`;
  const { data, isLoading, mutate } = useSWR<AIAgentDTO[]>(key);
  const { data: models } = useSWR<AgentModelsResponse>(`${key}/models`);
  const [editing, setEditing] = useState<AIAgentDTO | "new" | null>(null);
  const editable = b.can("posts.write");

  const remove = (a: AIAgentDTO) =>
    modals.openConfirmModal({
      title: `Delete “${a.name}”?`,
      centered: true,
      children: <Text size="sm">Workflows that use this agent will stop until you pick another one.</Text>,
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await api(`${key}/${a.id}`, "DELETE");
          await mutate();
          notifySuccess("Agent deleted");
        } catch (e) {
          notifyError(e);
        }
      },
    });

  return (
    <>
      <Button component={Link} href={`/app/${b.brandId}/workflows`} variant="subtle" color="gray" size="xs" leftSection={<IconArrowLeft size={14} />} mb="xs" px={6}>
        Workflows
      </Button>
      <PageHeader
        title="AI agents"
        description="Reusable writers with their own standing instructions. Use them inside workflows to summarize, rewrite or reply."
        actions={
          editable && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing("new")}>
              New agent
            </Button>
          )
        }
      />
      {isLoading ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h={150} radius="lg" />
          ))}
        </SimpleGrid>
      ) : !data?.length ? (
        <EmptyState
          icon={<IconRobot size={26} />}
          title="No agents yet"
          description="Create an agent like “Blog summarizer” or “Friendly support replier”, then drop it into any workflow."
          action={
            editable && (
              <Button mt="xs" leftSection={<IconPlus size={16} />} onClick={() => setEditing("new")}>
                Create an agent
              </Button>
            )
          }
        />
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {data.map((a) => (
            <Card key={a.id} withBorder radius="lg" padding="md">
              <Stack gap="sm" h="100%">
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                    <ThemeIcon size={36} radius="md" variant="light" color="violet">
                      <IconRobot size={18} />
                    </ThemeIcon>
                    <div style={{ minWidth: 0 }}>
                      <Text fw={600} truncate>
                        {a.name}
                      </Text>
                      <Text size="xs" c="dimmed" truncate>
                        {agentModelLabel(a.model, models)}
                      </Text>
                    </div>
                  </Group>
                  {editable && (
                    <Group gap={2} wrap="nowrap">
                      <Tooltip label="Edit & test">
                        <ActionIcon variant="subtle" color="gray" onClick={() => setEditing(a)} aria-label="Edit">
                          <IconPencil size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <ActionIcon variant="subtle" color="red" onClick={() => remove(a)} aria-label="Delete">
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  )}
                </Group>
                <Text size="sm" c="dimmed" lineClamp={4} style={{ flex: 1 }}>
                  {a.prompt}
                </Text>
                <Group gap={6}>
                  {a.imageGen && (
                    <Badge size="xs" variant="light" leftSection={<IconPhoto size={10} />}>
                      Images
                    </Badge>
                  )}
                  {a.webSearch && (
                    <Badge size="xs" variant="light" color="cyan" leftSection={<IconWorldSearch size={10} />}>
                      Web search
                    </Badge>
                  )}
                  {editable && (
                    <Button size="compact-xs" variant="light" ml="auto" onClick={() => setEditing(a)}>
                      Test
                    </Button>
                  )}
                </Group>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      )}
      <AgentModal opened={editing !== null} agent={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => mutate()} />
    </>
  );
}
