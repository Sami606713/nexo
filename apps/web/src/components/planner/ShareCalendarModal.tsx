"use client";

import { useState } from "react";
import useSWR from "swr";
import { ActionIcon, Button, CopyButton, Group, Modal, Paper, Skeleton, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import { IconCheck, IconCopy, IconLink, IconTrash } from "@tabler/icons-react";
import { api } from "@/lib/fetcher";
import { notifyError } from "@/components/posts/utils";
import { dayjs } from "@/components/posts/tz";

interface ShareDTO {
  id: string;
  token: string;
  url: string;
  createdAt: string;
}

export function ShareCalendarModal({ brandId, opened, onClose }: { brandId: string; opened: boolean; onClose: () => void }) {
  const key = opened ? `/api/brands/${brandId}/calendar-share` : null;
  const { data, isLoading, mutate } = useSWR<ShareDTO[]>(key);
  const [creating, setCreating] = useState(false);

  async function create() {
    setCreating(true);
    try {
      const s = await api<ShareDTO>(`/api/brands/${brandId}/calendar-share`, "POST");
      await mutate([s, ...(data ?? [])], { revalidate: false });
    } catch (err) {
      notifyError(err, brandId);
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    try {
      await api(`/api/brands/${brandId}/calendar-share?id=${encodeURIComponent(id)}`, "DELETE");
      await mutate((data ?? []).filter((s) => s.id !== id), { revalidate: false });
    } catch (err) {
      notifyError(err, brandId);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Share calendar" size="lg">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Anyone with a link can view scheduled and published posts (read-only). Drafts and posts awaiting approval are never shown.
        </Text>
        {isLoading && <Skeleton h={48} />}
        {data?.map((s) => (
          <Paper key={s.id} withBorder p="xs" radius="md">
            <Group gap="xs" wrap="nowrap">
              <TextInput value={s.url} readOnly style={{ flex: 1 }} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
              <CopyButton value={s.url}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? "Copied" : "Copy link"}>
                    <ActionIcon variant="light" color={copied ? "green" : undefined} onClick={copy} aria-label="Copy link" size="lg">
                      {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
              <Tooltip label="Revoke link">
                <ActionIcon variant="light" color="red" onClick={() => revoke(s.id)} aria-label="Revoke link" size="lg">
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
            <Text size="xs" c="dimmed" mt={4}>
              Created {dayjs(s.createdAt).fromNow()}
            </Text>
          </Paper>
        ))}
        <Group justify="flex-end">
          <Button leftSection={<IconLink size={16} />} onClick={create} loading={creating}>
            Create link
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
