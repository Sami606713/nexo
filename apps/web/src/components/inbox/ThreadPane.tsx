"use client";
// OWNED BY: inbox agent. Right pane: thread, actions and composer.
import { useEffect, useRef, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import {
  ActionIcon,
  Anchor,
  Avatar,
  Badge,
  Box,
  Button,
  Center,
  Divider,
  Group,
  Menu,
  Paper,
  ScrollArea,
  Select,
  Skeleton,
  Stack,
  TagsInput,
  Text,
  Textarea,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import {
  IconArchive,
  IconArrowBackUp,
  IconCheck,
  IconCloudOff,
  IconExternalLink,
  IconInbox,
  IconMessageReply,
  IconSend,
  IconSparkles,
  IconTemplate,
} from "@tabler/icons-react";
import { NETWORK_META } from "@/components/channels/networkMeta";
import { api } from "@/lib/fetcher";
import { notifyError } from "@/components/ui/notify";
import type { ConversationDetailDto, ConversationDto, MessageDto, ReplySnippetDto } from "./types";
import { KIND_NOUN, PersonAvatar, fullTime, initials } from "./utils";

export interface MemberOption {
  userId: string;
  name: string;
  image: string | null;
}

interface Props {
  brandId: string;
  conversationId: string | null;
  members: MemberOption[];
  snippets: ReplySnippetDto[];
  canEdit: boolean;
  /** Apply a PATCH and refresh the list. */
  onPatch: (id: string, data: Partial<{ status: string; assigneeId: string | null; labels: string[] }>) => Promise<void>;
  /** Something changed that the list should reflect (reply sent, opened). */
  onActivity: () => void;
  onBack?: () => void;
}

const KIND_LABEL = { DM: "Direct message", COMMENT: "Comment", MENTION: "Mention" } as const;

function Bubble({ m, participant, network }: { m: MessageDto; participant: ConversationDto; network: ConversationDto["channel"]["network"] }) {
  const out = m.direction === "OUT";
  return (
    <Group justify={out ? "flex-end" : "flex-start"} align="flex-end" gap="xs" wrap="nowrap">
      {!out && <PersonAvatar src={participant.participantAvatar} name={participant.participantName} network={network} size={28} />}
      <Stack gap={3} maw="78%" align={out ? "flex-end" : "flex-start"}>
        <Paper
          px="sm"
          py={8}
          radius="lg"
          style={{
            background: out ? "var(--mantine-primary-color-filled)" : "var(--mantine-color-default-hover)",
            color: out ? "var(--mantine-primary-color-contrast)" : undefined,
            borderBottomRightRadius: out ? 4 : undefined,
            borderBottomLeftRadius: out ? undefined : 4,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          <Text size="sm" inherit>
            {m.text}
          </Text>
        </Paper>
        <Group gap={6}>
          <Text size="10px" c="dimmed">
            {out ? `${m.sentBy?.name || m.authorName || "You"} · ` : ""}
            {fullTime(m.createdAt)}
          </Text>
          {m.undelivered && (
            <Tooltip label="Saved in the inbox only — this is a demo channel, so nothing was sent to the network." withArrow multiline w={220}>
              <Badge size="xs" variant="outline" color="gray" leftSection={<IconCloudOff size={10} />} tt="none" style={{ cursor: "help" }}>
                Not delivered · demo channel
              </Badge>
            </Tooltip>
          )}
        </Group>
      </Stack>
      {out && (
        <Avatar src={m.sentBy?.image} size={28} radius="xl" color="violet">
          <Text size="10px" fw={700}>
            {initials(m.sentBy?.name || m.authorName || "You")}
          </Text>
        </Avatar>
      )}
    </Group>
  );
}

export function ThreadPane({ brandId, conversationId, members, snippets, canEdit, onPatch, onActivity, onBack }: Props) {
  const base = `/api/brands/${brandId}/conversations/${conversationId}`;
  const { data: conv, mutate: mutateConv } = useSWR<ConversationDetailDto>(conversationId ? base : null, {
    refreshInterval: 15_000,
    onSuccess: (d) => d && onActivity(),
  });
  const { data: messages, mutate: mutateMessages } = useSWR<MessageDto[]>(conversationId ? `${base}/messages` : null, { refreshInterval: 15_000 });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setDraft(""), [conversationId]);
  useEffect(() => {
    viewport.current?.scrollTo({ top: viewport.current.scrollHeight });
  }, [messages?.length, conversationId]);

  if (!conversationId) {
    return (
      <Center h="100%" p="xl">
        <Stack align="center" gap="xs" ta="center" maw={320}>
          <ThemeIcon size={56} radius="xl" variant="light">
            <IconInbox size={28} />
          </ThemeIcon>
          <Text fw={600}>Pick a conversation</Text>
          <Text size="sm" c="dimmed">
            Select a message, mention or comment on the left to read the thread and reply.
          </Text>
        </Stack>
      </Center>
    );
  }
  if (!conv) {
    return (
      <Stack p="lg" gap="md">
        <Skeleton h={40} w="60%" />
        <Skeleton h={60} w="70%" />
        <Skeleton h={60} w="50%" ml="auto" />
      </Stack>
    );
  }

  const patch = async (data: Parameters<Props["onPatch"]>[1]) => {
    await mutateConv({ ...conv, ...(data as Partial<ConversationDetailDto>) }, { revalidate: false });
    try {
      await onPatch(conv.id, data);
    } finally {
      void mutateConv();
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      const m = await api<MessageDto>(`${base}/reply`, "POST", { text });
      await mutateMessages((cur) => [...(cur ?? []), m], { revalidate: false });
      setDraft("");
      onActivity();
    } catch (e) {
      notifyError(e, "Couldn't send the reply");
    } finally {
      setSending(false);
    }
  };

  const suggest = async () => {
    setSuggesting(true);
    try {
      const r = await api<{ text: string }>(`${base}/suggest-reply`, "POST");
      setDraft(r.text);
      composer.current?.focus();
    } catch (e) {
      notifyError(e, "Couldn't suggest a reply");
    } finally {
      setSuggesting(false);
    }
  };

  const insertSnippet = (s: ReplySnippetDto) => {
    setDraft((d) => (d.trim() ? `${d.trimEnd()} ${s.body}` : s.body));
    composer.current?.focus();
  };

  const resolved = conv.status === "RESOLVED";
  const archived = conv.status === "ARCHIVED";
  const net = NETWORK_META[conv.channel.network];
  const tooShort = (messages?.length ?? 0) < 2;

  return (
    <Stack gap={0} h="100%">
      {/* Header */}
      <Box px="lg" py="sm" style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}>
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            {onBack && (
              <ActionIcon variant="subtle" onClick={onBack} aria-label="Back to list" hiddenFrom="md">
                <IconArrowBackUp size={18} />
              </ActionIcon>
            )}
            <PersonAvatar src={conv.participantAvatar} name={conv.participantName} network={conv.channel.network} size={40} />
            <Box style={{ minWidth: 0 }}>
              <Text fw={600} truncate>
                {conv.participantName}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {conv.participantHandle ? `@${conv.participantHandle.replace(/^@/, "")} · ` : ""}
                {KIND_LABEL[conv.kind]} on {net.label} · {conv.channel.name}
              </Text>
            </Box>
          </Group>
          {canEdit && (
            <Group gap="xs" wrap="nowrap">
              <Button
                size="xs"
                variant={resolved ? "default" : "light"}
                color={resolved ? undefined : "teal"}
                leftSection={resolved ? <IconArrowBackUp size={14} /> : <IconCheck size={14} />}
                onClick={() => patch({ status: resolved || archived ? "OPEN" : "RESOLVED" })}
              >
                {resolved || archived ? "Reopen" : "Resolve"}
              </Button>
              {!archived && (
                <Tooltip label="Archive" withArrow>
                  <ActionIcon variant="default" size="md" onClick={() => patch({ status: "ARCHIVED" })} aria-label="Archive">
                    <IconArchive size={15} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          )}
        </Group>
        <Group gap="sm" mt="sm" wrap="nowrap" align="flex-start">
          <Select
            size="xs"
            w={190}
            placeholder="Unassigned"
            clearable
            disabled={!canEdit}
            value={conv.assignee?.id ?? null}
            data={members.map((m) => ({ value: m.userId, label: m.name }))}
            onChange={(v) => patch({ assigneeId: v ?? null })}
            leftSection={
              conv.assignee ? (
                <Avatar src={conv.assignee.image} size={16} radius="xl" color="violet">
                  <Text size="7px" fw={700}>
                    {initials(conv.assignee.name || conv.assignee.email)}
                  </Text>
                </Avatar>
              ) : null
            }
            aria-label="Assign to"
            comboboxProps={{ withinPortal: true }}
          />
          <TagsInput
            size="xs"
            style={{ flex: 1 }}
            placeholder={conv.labels.length ? "" : "Add labels"}
            disabled={!canEdit}
            value={conv.labels}
            onChange={(labels) => patch({ labels: labels.map((l) => l.trim().toLowerCase()).filter(Boolean) })}
            maxTags={10}
            aria-label="Labels"
          />
        </Group>
      </Box>

      {/* Thread */}
      <ScrollArea style={{ flex: 1 }} viewportRef={viewport} type="auto">
        <Stack gap="md" px="lg" py="md">
          {conv.kind !== "DM" && conv.post && (
            <Paper withBorder radius="md" p="sm" bg="var(--mantine-color-default)">
              <Group gap={6} mb={4}>
                <IconMessageReply size={14} color="var(--mantine-color-dimmed)" />
                <Text size="xs" c="dimmed" fw={600}>
                  {conv.kind === "COMMENT" ? "Comment on your post" : "Mentioned in a post"}
                </Text>
                {conv.post.url && (
                  <Anchor href={conv.post.url} target="_blank" rel="noreferrer" size="xs" ml="auto">
                    <Group gap={2}>
                      View <IconExternalLink size={12} />
                    </Group>
                  </Anchor>
                )}
              </Group>
              {conv.post.excerpt && (
                <Text size="sm" lineClamp={3} c="dimmed">
                  {conv.post.excerpt}
                </Text>
              )}
            </Paper>
          )}
          {!messages && <Skeleton h={50} w="60%" />}
          {messages?.map((m) => <Bubble key={m.id} m={m} participant={conv} network={conv.channel.network} />)}
          {(resolved || archived) && (
            <Divider label={resolved ? "Marked as resolved" : "Archived"} labelPosition="center" color="teal" />
          )}
        </Stack>
      </ScrollArea>

      {/* Composer */}
      {canEdit && (
        <Box px="lg" py="sm" style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}>
          <Textarea
            ref={composer}
            autosize
            minRows={2}
            maxRows={8}
            placeholder={`Reply to ${conv.participantName}…`}
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void send();
              }
            }}
            radius="md"
          />
          <Group justify="space-between" mt="xs" gap="xs">
            <Group gap="xs">
              <Menu shadow="md" width={300} position="top-start">
                <Menu.Target>
                  <Button size="xs" variant="default" leftSection={<IconTemplate size={14} />}>
                    Snippets
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Saved replies</Menu.Label>
                  {snippets.length === 0 && (
                    <Text size="xs" c="dimmed" px="sm" py={6}>
                      No saved replies yet — use “Save as snippet” to keep a reply for later.
                    </Text>
                  )}
                  {snippets.map((s) => (
                    <Menu.Item key={s.id} onClick={() => insertSnippet(s)}>
                      <Text size="sm" fw={500}>
                        {s.title}
                      </Text>
                      <Text size="xs" c="dimmed" lineClamp={2}>
                        {s.body}
                      </Text>
                    </Menu.Item>
                  ))}
                  <Menu.Divider />
                  <Menu.Item
                    disabled={!draft.trim()}
                    onClick={async () => {
                      const title = draft.trim().split(/\s+/).slice(0, 5).join(" ");
                      try {
                        await api(`/api/brands/${brandId}/reply-snippets`, "POST", { title, body: draft.trim() });
                        await globalMutate(`/api/brands/${brandId}/reply-snippets`);
                      } catch (e) {
                        notifyError(e);
                      }
                    }}
                  >
                    <Text size="sm">Save as snippet</Text>
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
              <Tooltip
                label={tooShort ? "The conversation is too short to suggest a reply" : "Drafts a reply in your brand voice from the latest messages"}
                withArrow
                multiline
                w={240}
              >
                <Button
                  size="xs"
                  variant="light"
                  color="violet"
                  leftSection={<IconSparkles size={14} />}
                  loading={suggesting}
                  disabled={tooShort}
                  onClick={suggest}
                >
                  Suggest reply (1 credit)
                </Button>
              </Tooltip>
            </Group>
            <Group gap="xs">
              {conv.channel.demo && (
                <Text size="10px" c="dimmed">
                  Demo channel — replies stay in the inbox
                </Text>
              )}
              <Button size="xs" rightSection={<IconSend size={14} />} loading={sending} disabled={!draft.trim()} onClick={send}>
                Send
              </Button>
            </Group>
          </Group>
        </Box>
      )}
      {!canEdit && (
        <Text size="xs" c="dimmed" ta="center" py="sm" style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}>
          You can read this {KIND_NOUN[conv.kind]} but your role can&apos;t reply.
        </Text>
      )}
    </Stack>
  );
}
