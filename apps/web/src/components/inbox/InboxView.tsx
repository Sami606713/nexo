"use client";
// OWNED BY: inbox agent. /app/[brandId]/inbox — three-pane social inbox.
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { ActionIcon, Alert, Box, Button, Paper, Tooltip } from "@mantine/core";
import { useDebouncedValue, useHotkeys, useMediaQuery } from "@mantine/hooks";
import { IconInfoCircle, IconRefresh, IconSparkles } from "@tabler/icons-react";
import { api } from "@/lib/fetcher";
import { useBrand } from "@/components/shell/BrandContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { notifyError, notifySuccess } from "@/components/ui/notify";
import { ChannelPane } from "./ChannelPane";
import { ConversationPane, type StatusFilter } from "./ConversationPane";
import { ThreadPane, type MemberOption } from "./ThreadPane";
import type { ConversationKind, ConversationListResponse, InboxChannelDto, ReplySnippetDto } from "./types";

const REFRESH_MS = 15_000;
const IS_DEV = process.env.NODE_ENV !== "production";

interface MemberRow {
  id: string;
  role: string;
  user: { id: string; name: string | null; email: string; image: string | null };
}

export function InboxView() {
  const b = useBrand();
  const base = `/api/brands/${b.brandId}`;
  const canEdit = b.can("posts.write");
  const wide = useMediaQuery("(min-width: 62em)", true);

  const [kind, setKind] = useState<ConversationKind>("DM");
  const [status, setStatus] = useState<StatusFilter>("OPEN");
  const [mine, setMine] = useState(false);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [q] = useDebouncedValue(search.trim(), 300);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const { data: channels, mutate: mutateChannels } = useSWR<InboxChannelDto[]>(`${base}/inbox/channels`, { refreshInterval: 60_000 });
  const { data: memberRows } = useSWR<MemberRow[]>(`${base}/members`);
  const { data: snippets, mutate: mutateSnippets } = useSWR<ReplySnippetDto[]>(`${base}/reply-snippets`);

  const query = useMemo(() => {
    const sp = new URLSearchParams({ kind, status });
    if (mine) sp.set("assigned", "me");
    if (channelId) sp.set("channelId", channelId);
    if (q) sp.set("q", q);
    return sp.toString();
  }, [kind, status, mine, channelId, q]);

  const {
    data: pages,
    size,
    setSize,
    isLoading,
    isValidating,
    mutate: mutateList,
  } = useSWRInfinite<ConversationListResponse>(
    (i, prev: ConversationListResponse | null) => {
      if (prev && !prev.nextCursor) return null;
      return `${base}/conversations?${query}${i > 0 && prev?.nextCursor ? `&cursor=${prev.nextCursor}` : ""}`;
    },
    { refreshInterval: REFRESH_MS, revalidateFirstPage: true },
  );
  const conversations = useMemo(() => pages?.flatMap((p) => p.conversations), [pages]);
  const counts = pages?.[0]?.counts;
  const hasMore = !!pages?.[pages.length - 1]?.nextCursor;

  // Keep the selection valid when filters change.
  useEffect(() => {
    if (!conversations) return;
    if (selectedId && conversations.some((c) => c.id === selectedId)) return;
    if (wide) setSelectedId(conversations[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, wide]);

  const members: MemberOption[] = useMemo(
    () => (memberRows ?? []).filter((m) => m.role !== "CLIENT").map((m) => ({ userId: m.user.id, name: m.user.name || m.user.email, image: m.user.image })),
    [memberRows],
  );

  const refreshAll = useCallback(() => {
    void mutateList();
    void mutateChannels();
    void mutateSnippets();
  }, [mutateList, mutateChannels, mutateSnippets]);

  const onPatch = useCallback(
    async (id: string, data: Record<string, unknown>) => {
      try {
        await api(`${base}/conversations/${id}`, "PATCH", data);
        if (data.status === "RESOLVED") notifySuccess("Conversation resolved");
        if (data.status === "ARCHIVED") notifySuccess("Conversation archived");
      } catch (e) {
        notifyError(e);
      } finally {
        void mutateList();
        void mutateChannels();
      }
    },
    [base, mutateList, mutateChannels],
  );

  const toggleInbox = async (c: InboxChannelDto, enabled: boolean) => {
    await mutateChannels((cur) => cur?.map((x) => (x.id === c.id ? { ...x, inboxEnabled: enabled } : x)), { revalidate: false });
    try {
      await api(`${base}/channels/${c.id}/inbox`, "PATCH", { enabled });
      notifySuccess(enabled ? `Inbox on for ${c.name}` : `Inbox off for ${c.name}`);
    } catch (e) {
      notifyError(e);
    } finally {
      void mutateChannels();
    }
  };

  const seed = async () => {
    setSeeding(true);
    try {
      const r = await api<{ conversations: number }>(`${base}/inbox/demo-seed`, "POST");
      notifySuccess(`${r.conversations} sample conversations added`);
      refreshAll();
    } catch (e) {
      notifyError(e);
    } finally {
      setSeeding(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const r = await api<{ queued: number }>(`${base}/inbox/sync`, "POST");
      notifySuccess(r.queued ? `Checking ${r.queued} profile${r.queued === 1 ? "" : "s"} for new messages…` : "Inbox is up to date");
      setTimeout(() => void mutateList(), 4000);
    } catch (e) {
      notifyError(e);
    } finally {
      void mutateList();
      setSyncing(false);
    }
  };

  const move = (delta: number) => {
    if (!conversations?.length) return;
    const i = conversations.findIndex((c) => c.id === selectedId);
    const next = conversations[Math.min(conversations.length - 1, Math.max(0, (i < 0 ? -1 : i) + delta))];
    if (next) setSelectedId(next.id);
  };
  const selected = conversations?.find((c) => c.id === selectedId);
  useHotkeys([
    ["j", () => move(1)],
    ["k", () => move(-1)],
    [
      "e",
      () => {
        if (!selected || !canEdit) return;
        const nextStatus = selected.status === "OPEN" ? "RESOLVED" : "OPEN";
        // Move on to the next conversation, like an email client.
        if (status === "OPEN" && nextStatus === "RESOLVED") move(1);
        void onPatch(selected.id, { status: nextStatus });
      },
    ],
  ]);

  const anyLive = channels?.some((c) => c.supported && c.inboxEnabled && c.live);
  const hasDemo = channels?.some((c) => c.demo && c.inboxEnabled && c.supported);
  const showList = wide || !selectedId;
  const showThread = wide || !!selectedId;

  return (
    <>
      <PageHeader
        title="Inbox"
        description="Messages, mentions and comments from your profiles, in one place."
        actions={
          <>
            {IS_DEV && canEdit && (
              <Tooltip label="Development only: fills the inbox with sample conversations" withArrow>
                <Button variant="default" size="sm" leftSection={<IconSparkles size={16} />} loading={seeding} onClick={seed}>
                  Sample data
                </Button>
              </Tooltip>
            )}
            <Tooltip label="Check for new messages" withArrow>
              <ActionIcon variant="default" size="lg" loading={syncing || (isValidating && !isLoading)} onClick={syncNow} aria-label="Refresh inbox">
                <IconRefresh size={18} />
              </ActionIcon>
            </Tooltip>
          </>
        }
      />
      {channels && !anyLive && hasDemo && (
        <Alert variant="light" color="blue" icon={<IconInfoCircle size={18} />} mb="md" radius="md" py="xs">
          Facebook and Instagram messages arrive here once the Meta integration is approved. Until then you&apos;re looking at sample conversations — replies are saved but not sent.
        </Alert>
      )}
      <Paper
        withBorder
        radius="lg"
        style={{ overflow: "hidden", height: "calc(100dvh - 190px)", minHeight: 520, display: "grid", gridTemplateColumns: wide ? "250px 360px 1fr" : "1fr" }}
      >
        {wide && (
          <Box style={{ borderRight: "1px solid var(--mantine-color-default-border)", minHeight: 0 }}>
            <ChannelPane
              channels={channels}
              selected={channelId}
              onSelect={(id) => {
                setChannelId(id);
                setSelectedId(null);
              }}
              onToggle={toggleInbox}
              canEdit={canEdit}
            />
          </Box>
        )}
        {showList && (
          <Box style={{ borderRight: wide ? "1px solid var(--mantine-color-default-border)" : undefined, minHeight: 0 }}>
            <ConversationPane
              kind={kind}
              onKind={(k) => {
                setKind(k);
                setSelectedId(null);
                void setSize(1);
              }}
              status={status}
              onStatus={(s) => {
                setStatus(s);
                setSelectedId(null);
              }}
              mine={mine}
              onMine={setMine}
              search={search}
              onSearch={setSearch}
              counts={counts}
              conversations={conversations}
              loading={isLoading}
              hasMore={hasMore}
              loadingMore={isValidating && size > (pages?.length ?? 0)}
              onLoadMore={() => void setSize(size + 1)}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onSeed={IS_DEV && canEdit ? seed : undefined}
              seeding={seeding}
            />
          </Box>
        )}
        {showThread && (
          <Box style={{ minHeight: 0, minWidth: 0 }}>
            <ThreadPane
              brandId={b.brandId}
              conversationId={selectedId}
              members={members}
              snippets={snippets ?? []}
              canEdit={canEdit}
              onPatch={onPatch}
              onActivity={() => void mutateList()}
              onBack={wide ? undefined : () => setSelectedId(null)}
            />
          </Box>
        )}
      </Paper>
    </>
  );
}
