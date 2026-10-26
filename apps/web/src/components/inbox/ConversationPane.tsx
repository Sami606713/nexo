"use client";
// OWNED BY: inbox agent. Middle pane: tabs, filters, search, conversation list.
import { useEffect, useRef } from "react";
import {
  Avatar,
  Badge,
  Box,
  Button,
  Center,
  Chip,
  CloseButton,
  Group,
  Loader,
  ScrollArea,
  SegmentedControl,
  Skeleton,
  Stack,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconAt, IconMessageCircle, IconMessages, IconSearch, IconSparkles } from "@tabler/icons-react";
import type { ConversationDto, ConversationKind } from "./types";
import { KIND_NOUN, KIND_TABS, PersonAvatar, initials, shortTime } from "./utils";

export type StatusFilter = "OPEN" | "RESOLVED";

interface Props {
  kind: ConversationKind;
  onKind: (k: ConversationKind) => void;
  status: StatusFilter;
  onStatus: (s: StatusFilter) => void;
  mine: boolean;
  onMine: (v: boolean) => void;
  search: string;
  onSearch: (q: string) => void;
  counts: Record<ConversationKind, number> | undefined;
  conversations: ConversationDto[] | undefined;
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSeed?: () => void;
  seeding?: boolean;
}

const EMPTY_ICON: Record<ConversationKind, React.ReactNode> = {
  DM: <IconMessages size={24} />,
  MENTION: <IconAt size={24} />,
  COMMENT: <IconMessageCircle size={24} />,
};

function Item({ c, active, onClick }: { c: ConversationDto; active: boolean; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);
  return (
    <UnstyledButton
      ref={ref}
      onClick={onClick}
      px="md"
      py="sm"
      data-active={active || undefined}
      style={{
        width: "100%",
        borderBottom: "1px solid var(--mantine-color-default-border)",
        background: active ? "var(--mantine-primary-color-light)" : undefined,
        boxShadow: active ? "inset 3px 0 0 var(--mantine-primary-color-filled)" : undefined,
      }}
    >
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <PersonAvatar src={c.participantAvatar} name={c.participantName} network={c.channel.network} size={40} />
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group gap={6} wrap="nowrap" justify="space-between">
            <Text size="sm" fw={c.unread ? 700 : 500} truncate>
              {c.participantName}
            </Text>
            <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
              <Text size="xs" c={c.unread ? undefined : "dimmed"} fw={c.unread ? 600 : 400}>
                {shortTime(c.lastMessageAt)}
              </Text>
              {c.unread && <Box w={8} h={8} bg="var(--mantine-primary-color-filled)" style={{ borderRadius: "50%" }} aria-label="Unread" />}
            </Group>
          </Group>
          <Text size="xs" c={c.unread ? undefined : "dimmed"} lineClamp={2} mt={2}>
            {c.lastMessagePreview || "No messages yet"}
          </Text>
          {(c.labels.length > 0 || c.assignee) && (
            <Group gap={4} mt={6} wrap="nowrap" justify="space-between">
              <Group gap={4} wrap="nowrap" style={{ overflow: "hidden" }}>
                {c.labels.slice(0, 3).map((l) => (
                  <Badge key={l} size="xs" variant="light" color="gray" radius="sm" tt="none">
                    {l}
                  </Badge>
                ))}
              </Group>
              {c.assignee && (
                <Tooltip label={`Assigned to ${c.assignee.name || c.assignee.email}`} withArrow>
                  <Avatar src={c.assignee.image} size={18} radius="xl" color="violet">
                    <Text size="8px" fw={700}>
                      {initials(c.assignee.name || c.assignee.email)}
                    </Text>
                  </Avatar>
                </Tooltip>
              )}
            </Group>
          )}
        </Box>
      </Group>
    </UnstyledButton>
  );
}

export function ConversationPane(p: Props) {
  const filtered = p.mine || p.search || p.status === "RESOLVED";
  return (
    <Stack gap={0} h="100%">
      <Tabs value={p.kind} onChange={(v) => v && p.onKind(v as ConversationKind)} variant="default">
        <Tabs.List grow style={{ flexWrap: "nowrap" }}>
          {KIND_TABS.map((t) => (
            <Tabs.Tab
              key={t.value}
              value={t.value}
              rightSection={
                p.counts && p.counts[t.value] > 0 ? (
                  <Badge size="sm" variant={p.kind === t.value ? "filled" : "light"} radius="xl" px={6} miw={20} styles={{ label: { overflow: "visible" } }}>
                    {p.counts[t.value]}
                  </Badge>
                ) : null
              }
            >
              {t.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      <Stack gap="xs" px="md" py="sm" style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}>
        <Group gap="xs" wrap="nowrap">
          <SegmentedControl
            size="xs"
            value={p.status}
            onChange={(v) => p.onStatus(v as StatusFilter)}
            data={[
              { value: "OPEN", label: "Open" },
              { value: "RESOLVED", label: "Resolved" },
            ]}
          />
          <Chip size="xs" checked={p.mine} onChange={p.onMine} variant="light">
            Assigned to me
          </Chip>
        </Group>
        <TextInput
          size="xs"
          placeholder="Search people, messages, labels"
          leftSection={<IconSearch size={14} />}
          value={p.search}
          onChange={(e) => p.onSearch(e.currentTarget.value)}
          rightSection={p.search ? <CloseButton size="xs" onClick={() => p.onSearch("")} aria-label="Clear search" /> : null}
        />
      </Stack>
      <ScrollArea style={{ flex: 1 }} type="auto">
        {p.loading && (
          <Stack gap={0}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Group key={i} gap="sm" px="md" py="sm" wrap="nowrap">
                <Skeleton circle h={40} w={40} />
                <Stack gap={6} style={{ flex: 1 }}>
                  <Skeleton h={10} w="50%" />
                  <Skeleton h={8} w="90%" />
                </Stack>
              </Group>
            ))}
          </Stack>
        )}
        {!p.loading && p.conversations?.length === 0 && (
          <Center py={48} px="lg">
            <Stack align="center" gap="xs" ta="center" maw={260}>
              <ThemeIcon size={48} radius="xl" variant="light">
                {EMPTY_ICON[p.kind]}
              </ThemeIcon>
              <Text fw={600} size="sm">
                {filtered ? `No ${KIND_NOUN[p.kind]}s match` : p.status === "OPEN" ? "You're all caught up" : `No ${KIND_NOUN[p.kind]}s yet`}
              </Text>
              <Text size="xs" c="dimmed">
                {filtered
                  ? "Try another filter or clear the search."
                  : `New ${KIND_NOUN[p.kind]}s from your connected profiles will land here automatically.`}
              </Text>
              {p.onSeed && !filtered && (
                <Button size="xs" variant="light" mt="xs" leftSection={<IconSparkles size={14} />} loading={p.seeding} onClick={p.onSeed}>
                  Load sample conversations
                </Button>
              )}
            </Stack>
          </Center>
        )}
        {!p.loading &&
          p.conversations?.map((c) => <Item key={c.id} c={c} active={c.id === p.selectedId} onClick={() => p.onSelect(c.id)} />)}
        {p.hasMore && (
          <Center py="sm">
            {p.loadingMore ? (
              <Loader size="sm" />
            ) : (
              <Button variant="subtle" size="xs" onClick={p.onLoadMore}>
                Load more
              </Button>
            )}
          </Center>
        )}
      </ScrollArea>
      <Group px="md" py={6} gap="md" style={{ borderTop: "1px solid var(--mantine-color-default-border)" }} visibleFrom="md">
        <Text size="10px" c="dimmed">
          <Kbd>j</Kbd> <Kbd>k</Kbd> move · <Kbd>e</Kbd> resolve
        </Text>
      </Group>
    </Stack>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <Box
      component="kbd"
      px={4}
      style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 4, fontSize: 10, fontFamily: "inherit" }}
    >
      {children}
    </Box>
  );
}
