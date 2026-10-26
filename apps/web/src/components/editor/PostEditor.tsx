"use client";

import useSWR from "swr";
import { Alert, Box, Center, Grid, Loader, Skeleton, Stack, Text } from "@mantine/core";
import { IconAlertCircle, IconSparkles } from "@tabler/icons-react";
import type { MediaDTO, PostGroupDetailDTO } from "@/lib/posts/types";
import { useBrand } from "@/components/shell/BrandContext";
import { ApiError } from "@/lib/fetcher";
import { pickerToIso } from "@/components/posts/tz";
import { EditorForm } from "./EditorForm";
import { draftFromGroup, emptyDraft } from "./draft";

export function EditorSkeleton() {
  return (
    <Box p="md" maw={1400} mx="auto">
      <Skeleton h={28} w={200} mb="md" />
      <Grid>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack>
            <Skeleton h={80} radius="md" />
            <Skeleton h={260} radius="md" />
            <Skeleton h={140} radius="md" />
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Skeleton h={420} radius="md" />
        </Grid.Col>
      </Grid>
    </Box>
  );
}

/** New post (no groupId) or edit an existing one. `initialDate` (YYYY-MM-DD) pre-fills the schedule at 09:00 brand time. */
export function PostEditor({
  groupId,
  initialDate,
  initialChannelId,
  initialMedia,
}: {
  groupId?: string;
  initialDate?: string;
  initialChannelId?: string;
  initialMedia?: MediaDTO[];
}) {
  const brand = useBrand();
  const key = groupId ? `/api/brands/${brand.brandId}/posts/${groupId}` : null;
  const { data, error, mutate } = useSWR<PostGroupDetailDTO>(key, {
    refreshInterval: (d) => (d && (d.status === "GENERATING" || d.status === "PUBLISHING") ? 2500 : 0),
  });

  if (!groupId) {
    let scheduledAt: string | null = null;
    if (initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)) {
      const iso = pickerToIso(`${initialDate} 09:00:00`, brand.timezone);
      if (iso && new Date(iso).getTime() > Date.now() + 5 * 60_000) scheduledAt = iso;
    }
    return (
      <EditorForm
        group={null}
        initialDraft={emptyDraft({ scheduledAt, channelIds: initialChannelId ? [initialChannelId] : [], media: initialMedia ?? [] })}
        onSaved={() => undefined}
      />
    );
  }

  if (error) {
    return (
      <Center p="xl">
        <Alert color="red" icon={<IconAlertCircle size={18} />} title={error instanceof ApiError && error.status === 404 ? "Post not found" : "Couldn't load this post"} maw={480}>
          {error instanceof Error ? error.message : "Please try again."}
        </Alert>
      </Center>
    );
  }
  if (!data) return <EditorSkeleton />;

  if (data.status === "GENERATING") {
    return (
      <Center p="xl" mih={360}>
        <Stack align="center" gap="sm">
          <IconSparkles size={32} color="var(--mantine-color-violet-filled)" />
          <Loader type="dots" />
          <Text c="dimmed">AI is writing your post…</Text>
        </Stack>
      </Center>
    );
  }

  return (
    <EditorForm
      key={data.id}
      group={data}
      initialDraft={draftFromGroup(data)}
      onSaved={(g) => mutate(g, { revalidate: false })}
    />
  );
}
