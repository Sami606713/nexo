"use client";

import { useState } from "react";
import { Badge, Button, Group, Paper, Stack, Switch, Tabs, Text, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconArrowBackUp, IconHash, IconPencil } from "@tabler/icons-react";
import type { PostScore, PostScoreCheck } from "@postline/core";
import type { ChannelDTO } from "@/lib/posts/types";
import { api } from "@/lib/fetcher";
import { ChannelAvatar } from "@/components/posts/ChannelAvatar";
import { notifyError } from "@/components/posts/utils";
import { CaptionEditor } from "./CaptionEditor";
import { ScoreBadge } from "./ScoreBadge";
import type { DraftState } from "./draft";

export const SHARED_TAB = "shared";

interface Props {
  brandId: string;
  draft: DraftState;
  update: (fn: (d: DraftState) => DraftState) => void;
  selectedChannels: ChannelDTO[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
  readOnly?: boolean;
  score: PostScore | null;
  onFix: (checkId: PostScoreCheck["id"]) => Promise<void>;
}

export function CaptionSection({ brandId, draft, update, selectedChannels, activeTab, setActiveTab, readOnly, score, onFix }: Props) {
  const customizedCount = selectedChannels.filter((c) => draft.overrides[c.id] != null).length;
  const [customize, setCustomize] = useState(customizedCount > 0);
  const [tagging, setTagging] = useState(false);

  const setShared = (caption: string) => update((d) => ({ ...d, caption }));
  const setOverride = (id: string, text: string | null) =>
    update((d) => {
      const overrides = { ...d.overrides };
      if (text == null) delete overrides[id];
      else overrides[id] = text;
      return { ...d, overrides };
    });

  function toggleCustomize(on: boolean) {
    if (on) {
      setCustomize(true);
      return;
    }
    const off = () => {
      update((d) => ({ ...d, overrides: {} }));
      setCustomize(false);
      setActiveTab(SHARED_TAB);
    };
    if (!customizedCount) return off();
    modals.openConfirmModal({
      title: "Stop customizing per channel?",
      children: <Text size="sm">Custom captions for {customizedCount} channel(s) will be discarded and every channel will use the shared caption.</Text>,
      labels: { confirm: "Discard custom captions", cancel: "Keep" },
      confirmProps: { color: "red" },
      onConfirm: off,
    });
  }

  const tab = customize && selectedChannels.some((c) => c.id === activeTab) ? activeTab : SHARED_TAB;
  const activeChannel = selectedChannels.find((c) => c.id === tab);
  const activeText = activeChannel ? (draft.overrides[activeChannel.id] ?? null) : draft.caption;

  async function suggestHashtags() {
    const caption = activeText ?? draft.caption;
    if (!caption.trim()) return notifyError(new Error("Write a caption first"));
    setTagging(true);
    try {
      const res = await api<{ hashtags: string[] }>(`/api/brands/${brandId}/ai/hashtags`, "POST", {
        caption,
        channelIds: activeChannel ? [activeChannel.id] : draft.channelIds,
      });
      const missing = res.hashtags.filter((h) => !caption.toLowerCase().includes(h.toLowerCase()));
      if (!missing.length) return;
      const next = `${caption.trimEnd()}\n\n${missing.join(" ")}`;
      if (activeChannel) setOverride(activeChannel.id, next);
      else setShared(next);
    } catch (err) {
      notifyError(err, brandId);
    } finally {
      setTagging(false);
    }
  }

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between" wrap="wrap" gap="xs">
          <Group gap="xs">
            <Text fw={600}>Caption</Text>
            <Switch
              size="sm"
              label={
                <Group gap={6}>
                  <span>Customize per channel</span>
                  {customizedCount > 0 && (
                    <Badge size="xs" variant="filled" circle aria-label={`${customizedCount} customized`}>
                      {customizedCount}
                    </Badge>
                  )}
                </Group>
              }
              checked={customize}
              disabled={readOnly || selectedChannels.length === 0}
              onChange={(e) => toggleCustomize(e.currentTarget.checked)}
            />
          </Group>
          <Group gap="xs">
            {!readOnly && (
              <Tooltip label="Suggest hashtags with AI (1 credit)">
                <Button size="compact-sm" variant="subtle" color="violet" leftSection={<IconHash size={14} />} loading={tagging} onClick={suggestHashtags}>
                  Hashtags
                </Button>
              </Tooltip>
            )}
            <ScoreBadge score={score} onFix={onFix} readOnly={readOnly} />
          </Group>
        </Group>

        {customize && selectedChannels.length > 0 && (
          <Tabs value={tab} onChange={(v) => setActiveTab(v ?? SHARED_TAB)} variant="pills" radius="xl">
            <Tabs.List style={{ flexWrap: "wrap", gap: 4 }}>
              <Tabs.Tab value={SHARED_TAB}>All channels</Tabs.Tab>
              {selectedChannels.map((c) => (
                <Tabs.Tab
                  key={c.id}
                  value={c.id}
                  leftSection={<ChannelAvatar channel={c} size={18} tooltip={false} />}
                  rightSection={draft.overrides[c.id] != null ? <IconPencil size={12} aria-label="customized" /> : null}
                >
                  {c.name}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs>
        )}

        {activeChannel && activeText == null ? (
          <Paper withBorder radius="md" p="lg" bg="var(--mantine-color-default-hover)">
            <Stack align="center" gap="xs">
              <Text size="sm" c="dimmed" ta="center">
                {activeChannel.name} follows the shared caption.
              </Text>
              {!readOnly && (
                <Button size="xs" variant="light" leftSection={<IconPencil size={14} />} onClick={() => setOverride(activeChannel.id, draft.caption)}>
                  Customize for {activeChannel.name}
                </Button>
              )}
            </Stack>
          </Paper>
        ) : (
          <>
            <CaptionEditor
              key={tab}
              value={activeText ?? ""}
              onChange={(t) => (activeChannel ? setOverride(activeChannel.id, t) : setShared(t))}
              brandId={brandId}
              readOnly={readOnly}
              ariaLabel={activeChannel ? `Caption for ${activeChannel.name}` : "Post caption"}
              placeholder={activeChannel ? `Caption for ${activeChannel.name}…` : "What do you want to share? Select text for AI tools."}
            />
            {activeChannel && !readOnly && (
              <Group justify="flex-end">
                <Button size="compact-xs" variant="subtle" color="gray" leftSection={<IconArrowBackUp size={14} />} onClick={() => setOverride(activeChannel.id, null)}>
                  Reset to shared caption
                </Button>
              </Group>
            )}
          </>
        )}
      </Stack>
    </Paper>
  );
}
