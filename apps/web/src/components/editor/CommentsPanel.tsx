"use client";

import { useState } from "react";
import useSWR from "swr";
import { Avatar, Button, Group, Paper, Skeleton, Stack, Text, Textarea } from "@mantine/core";
import { getHotkeyHandler } from "@mantine/hooks";
import { api } from "@/lib/fetcher";
import type { CommentDTO } from "@/lib/posts/types";
import { notifyError } from "@/components/posts/utils";
import { dayjs } from "@/components/posts/tz";

export function CommentsPanel({ brandId, groupId }: { brandId: string; groupId: string | null }) {
  const key = groupId ? `/api/brands/${brandId}/posts/${groupId}/comments` : null;
  const { data, isLoading, mutate } = useSWR<CommentDTO[]>(key, { refreshInterval: 20_000 });
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  if (!groupId) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="xl">
        Save the post to start a discussion with your team.
      </Text>
    );
  }

  async function send() {
    if (!body.trim() || !key) return;
    setSending(true);
    try {
      const c = await api<CommentDTO>(key, "POST", { body });
      await mutate([...(data ?? []), c], { revalidate: false });
      setBody("");
    } catch (err) {
      notifyError(err, brandId);
    } finally {
      setSending(false);
    }
  }

  return (
    <Stack gap="sm">
      {isLoading && <Skeleton h={60} />}
      {!isLoading && !data?.length && (
        <Text size="sm" c="dimmed">
          No comments yet. Discuss this post with your team — comments are internal and never published.
        </Text>
      )}
      <Stack gap="xs" mah={420} style={{ overflowY: "auto" }}>
        {data?.map((c) => (
          <Paper key={c.id} withBorder radius="md" p="xs">
            <Group gap="xs" wrap="nowrap" align="flex-start">
              <Avatar src={c.author?.image} size={28} radius="xl">
                {(c.author?.name ?? c.author?.email ?? "?").slice(0, 1).toUpperCase()}
              </Avatar>
              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                <Group gap={6}>
                  <Text size="sm" fw={600}>
                    {c.author?.name ?? c.author?.email ?? "Former member"}
                  </Text>
                  <Text size="xs" c="dimmed" title={dayjs(c.createdAt).format("MMM D, YYYY h:mm A")}>
                    {dayjs(c.createdAt).fromNow()}
                  </Text>
                </Group>
                <Text size="sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {c.body}
                </Text>
              </Stack>
            </Group>
          </Paper>
        ))}
      </Stack>
      <Textarea
        aria-label="Write a comment"
        placeholder="Write a comment… (Ctrl/⌘+Enter to send)"
        autosize
        minRows={2}
        maxRows={6}
        value={body}
        onChange={(e) => setBody(e.currentTarget.value)}
        onKeyDown={getHotkeyHandler([["mod+Enter", send]])}
      />
      <Group justify="flex-end">
        <Button size="xs" onClick={send} loading={sending} disabled={!body.trim()}>
          Comment
        </Button>
      </Group>
    </Stack>
  );
}
