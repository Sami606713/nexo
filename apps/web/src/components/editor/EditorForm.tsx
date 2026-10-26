"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Anchor, Box, Grid, Group, Paper, Stack, Tabs, Text, Title } from "@mantine/core";
import { useDebouncedValue, useHotkeys } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { IconArrowLeft, IconEye, IconMessages, IconNotes, IconTags } from "@tabler/icons-react";
import { scorePostHeuristic } from "@postline/ai/score";
import { validateForNetwork } from "@postline/integrations/client";
import type { MediaItem, Network, PostScoreCheck, UpsertPostGroupInput } from "@postline/core";
import { api } from "@/lib/fetcher";
import type { ChannelDTO, PostGroupDTO, PostGroupDetailDTO } from "@/lib/posts/types";
import { useBrand } from "@/components/shell/BrandContext";
import { notifyError, notifyOk, useBrandChannels } from "@/components/posts/utils";
import { ChannelPicker } from "./ChannelPicker";
import { CaptionSection, SHARED_TAB } from "./CaptionSection";
import { ChannelChecks, type ChannelCheck } from "./ChannelChecks";
import { MediaSection } from "./MediaSection";
import { NetworkOptions } from "./NetworkOptions";
import { PreviewPanel } from "./PreviewPanel";
import { CommentsPanel } from "./CommentsPanel";
import { HashtagPanel, LabelsPanel, NotesPanel } from "./DetailsPanels";
import { EditorFooter, type FooterAction } from "./EditorFooter";
import { ScheduleModal } from "./ScheduleModal";
import { RejectModal, RequestApprovalModal } from "./ApprovalModals";
import { StatusBanners } from "./StatusBanners";
import { draftFromGroup, effectiveCaption, fingerprint, toPayload, type DraftState } from "./draft";

interface Props {
  group: PostGroupDetailDTO | null;
  initialDraft: DraftState;
  onSaved: (g: PostGroupDetailDTO) => void;
}

type SaveResponse = PostGroupDTO & { viewer?: PostGroupDetailDTO["viewer"]; channelIssues?: unknown };

export function EditorForm({ group, initialDraft, onSaved }: Props) {
  const router = useRouter();
  const brand = useBrand();
  const brandId = brand.brandId;
  const tz = group?.timezone ?? brand.timezone;

  const [draft, setDraft] = useState<DraftState>(initialDraft);
  const [baseline, setBaseline] = useState(() => fingerprint(initialDraft));
  const [activeTab, setActiveTab] = useState(SHARED_TAB);
  const [sideTab, setSideTab] = useState<string | null>("preview");
  const [busy, setBusy] = useState<FooterAction | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const update = useCallback((fn: (d: DraftState) => DraftState) => setDraft(fn), []);
  const dirty = fingerprint(draft) !== baseline;

  const canWrite = brand.can("posts.write");
  const status = group?.status ?? null;
  const locked = !!group?.viewer.locked;
  const readOnly = !canWrite || locked || status === "GENERATING";
  const canDecide = !!group?.viewer.canDecide;

  // ── channels (brand list + any channels already on the post)
  const { channels: brandChannels, isLoading: channelsLoading } = useBrandChannels(brandId);
  const allChannels = useMemo(() => {
    const map = new Map<string, ChannelDTO>();
    for (const c of brandChannels) map.set(c.id, c);
    for (const p of group?.posts ?? []) if (!map.has(p.channelId)) map.set(p.channelId, p.channel);
    return [...map.values()];
  }, [brandChannels, group]);
  const selectedChannels = useMemo(
    () => draft.channelIds.map((id) => allChannels.find((c) => c.id === id)).filter((c): c is ChannelDTO => !!c),
    [draft.channelIds, allChannels],
  );
  const networks = useMemo(() => [...new Set(selectedChannels.map((c) => c.network))], [selectedChannels]);

  // ── validation
  const mediaItems: MediaItem[] = useMemo(
    () => draft.media.map((m) => ({ url: m.url, mime: m.mime, width: m.width ?? undefined, height: m.height ?? undefined, sizeBytes: m.sizeBytes, durationSec: m.duration ?? undefined, alt: m.alt ?? undefined })),
    [draft.media],
  );
  const checks: ChannelCheck[] = useMemo(
    () =>
      selectedChannels.map((c) => {
        const caption = effectiveCaption(draft, c.id);
        return {
          channel: c,
          caption,
          customized: draft.overrides[c.id] != null,
          issues: validateForNetwork(c.network, { caption, media: mediaItems, options: (draft.options[c.network] ?? {}) as Record<string, unknown> }),
        };
      }),
    [selectedChannels, draft, mediaItems],
  );
  const hasErrors = checks.some((c) => c.issues.some((i) => i.level === "error"));

  // ── score (debounced, client-side heuristic)
  const [debouncedCaption] = useDebouncedValue(draft.caption, 400);
  const score = useMemo(
    () => scorePostHeuristic({ caption: debouncedCaption, networks, mediaCount: draft.media.length }),
    [debouncedCaption, networks, draft.media.length],
  );

  async function fixCheck(checkId: PostScoreCheck["id"]) {
    try {
      const res = await api<{ caption: string }>(`/api/brands/${brandId}/ai/score-fix`, "POST", {
        caption: draft.caption,
        checkId,
        channelIds: draft.channelIds,
      });
      update((d) => ({ ...d, caption: res.caption }));
      notifyOk("Caption updated");
    } catch (err) {
      notifyError(err, brandId);
    }
  }

  // ── persistence
  function applySaved(res: PostGroupDetailDTO) {
    const next = draftFromGroup(res);
    setDraft(next);
    setBaseline(fingerprint(next));
    onSaved(res);
  }

  async function save(extra?: Partial<UpsertPostGroupInput>, action: FooterAction = "save"): Promise<PostGroupDetailDTO | null> {
    setBusy(action);
    try {
      const body = toPayload(draft, extra);
      const res = group
        ? await api<SaveResponse>(`/api/brands/${brandId}/posts/${group.id}`, "PATCH", body)
        : await api<SaveResponse>(`/api/brands/${brandId}/posts`, "POST", body);
      const detail: PostGroupDetailDTO = {
        ...res,
        viewer: res.viewer ?? { canWrite: true, isApprover: false, canDecide: false, locked: false },
      };
      applySaved(detail);
      if (!group) router.replace(`/app/${brandId}/posts/${res.id}`);
      return detail;
    } catch (err) {
      notifyError(err, brandId);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function onAction(a: FooterAction) {
    switch (a) {
      case "save": {
        // A draft with a planned time (e.g. from a campaign) stays a draft; only "Schedule" schedules it.
        const res = await save(group?.status === "DRAFT" ? { keepDraft: true } : undefined);
        if (res) notifyOk(res.status === "SCHEDULED" ? "Saved — still scheduled" : "Saved");
        return;
      }
      case "schedule":
        if (!draft.channelIds.length) return notifyError(new Error("Select at least one channel"));
        if (hasErrors) return notifyError(new Error("Fix the errors shown under the caption before scheduling"));
        return setScheduleOpen(true);
      case "unschedule": {
        const res = await save({ scheduledAt: null }, "save");
        if (res) notifyOk("Moved to drafts");
        return;
      }
      case "publishNow":
        if (!draft.channelIds.length) return notifyError(new Error("Select at least one channel"));
        if (hasErrors) return notifyError(new Error("Fix the errors shown under the caption before publishing"));
        modals.openConfirmModal({
          title: "Publish now?",
          children: (
            <Text size="sm">
              This post will be published immediately to {selectedChannels.length} channel{selectedChannels.length === 1 ? "" : "s"}:{" "}
              {selectedChannels.map((c) => c.name).join(", ")}.
            </Text>
          ),
          labels: { confirm: "Publish now", cancel: "Cancel" },
          onConfirm: async () => {
            const res = await save({ publishNow: true, scheduledAt: null }, "publishNow");
            if (res) notifyOk("Publishing started");
          },
        });
        return;
      case "requestApproval":
        return setApprovalOpen(true);
      case "duplicate":
        if (!group) return;
        try {
          setBusy("duplicate");
          const copy = await api<PostGroupDTO>(`/api/brands/${brandId}/posts/${group.id}/duplicate`, "POST");
          notifyOk("Duplicated as a new draft");
          router.push(`/app/${brandId}/posts/${copy.id}`);
        } catch (err) {
          notifyError(err, brandId);
        } finally {
          setBusy(null);
        }
        return;
      case "delete":
        if (!group) return;
        modals.openConfirmModal({
          title: "Delete this post?",
          children: (
            <Text size="sm">
              {group.posts.some((p) => p.status === "POSTED")
                ? "It will also be removed from the networks it was published to (where the network allows it)."
                : "This can't be undone."}
            </Text>
          ),
          labels: { confirm: "Delete", cancel: "Cancel" },
          confirmProps: { color: "red" },
          onConfirm: async () => {
            try {
              await api(`/api/brands/${brandId}/posts/${group.id}`, "DELETE");
              setBaseline(fingerprint(draft));
              notifyOk("Post deleted");
              router.push(`/app/${brandId}/planner`);
            } catch (err) {
              notifyError(err, brandId);
            }
          },
        });
        return;
      case "approve":
        return decide("approved");
      case "reject":
        return setRejectOpen(true);
    }
  }

  async function decide(decision: "approved" | "rejected", comment?: string) {
    if (!group) return;
    setBusy(decision === "approved" ? "approve" : "reject");
    try {
      const res = await api<{ group: PostGroupDTO; message: string }>(`/api/brands/${brandId}/posts/${group.id}/approval/decide`, "POST", {
        decision,
        comment: comment || undefined,
      });
      notifyOk(res.message, decision === "approved" ? "Approved" : "Rejected");
      setRejectOpen(false);
      applySaved({ ...res.group, viewer: { ...group.viewer, canDecide: false } });
    } catch (err) {
      notifyError(err, brandId);
    } finally {
      setBusy(null);
    }
  }

  const [retrying, setRetrying] = useState(false);
  async function retry() {
    if (!group) return;
    setRetrying(true);
    try {
      const res = await api<PostGroupDetailDTO>(`/api/brands/${brandId}/posts/${group.id}/retry`, "POST");
      applySaved(res);
      notifyOk("Retrying failed channels now");
    } catch (err) {
      notifyError(err, brandId);
    } finally {
      setRetrying(false);
    }
  }

  async function requestApproval(approverIds: string[], comment: string) {
    let target = group;
    if (!target || dirty) {
      target = await save(undefined, "requestApproval");
      if (!target) return;
    }
    setBusy("requestApproval");
    try {
      const res = await api<PostGroupDTO>(`/api/brands/${brandId}/posts/${target.id}/approval`, "POST", { approverIds, comment: comment || undefined });
      notifyOk("Approval requested");
      setApprovalOpen(false);
      onSaved({ ...res, viewer: { ...target.viewer, isApprover: approverIds.includes(brand.user.id), canDecide: approverIds.includes(brand.user.id) && brand.can("posts.approve") } });
    } catch (err) {
      notifyError(err, brandId);
    } finally {
      setBusy(null);
    }
  }

  async function schedule(iso: string) {
    const res = await save({ scheduledAt: iso }, "schedule");
    if (res) {
      setScheduleOpen(false);
      notifyOk(res.status === "PENDING_APPROVAL" ? "Time saved — it will be scheduled once approved" : "Post scheduled");
    }
  }

  function insertTags(tags: string[]) {
    const append = (text: string) => {
      const missing = tags.filter((t) => !text.toLowerCase().includes(t.toLowerCase()));
      return missing.length ? `${text.trimEnd()}${text.trim() ? "\n\n" : ""}${missing.join(" ")}` : text;
    };
    update((d) => {
      if (activeTab !== SHARED_TAB && d.overrides[activeTab] != null) return { ...d, overrides: { ...d.overrides, [activeTab]: append(d.overrides[activeTab]!) } };
      return { ...d, caption: append(d.caption) };
    });
  }

  // ── keyboard shortcuts
  useHotkeys(
    [
      ["mod+S", () => !readOnly && onAction("save")],
      ["mod+Enter", () => !readOnly && onAction("schedule")],
      [
        "mod+J",
        () => {
          setSideTab("notes");
          setTimeout(() => notesRef.current?.focus(), 50);
        },
      ],
    ],
    [],
    true,
  );

  // ── unsaved-changes guard
  useEffect(() => {
    if (!dirty || readOnly) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, readOnly]);

  function guardedBack(e: React.MouseEvent) {
    if (!dirty || readOnly) return;
    e.preventDefault();
    modals.openConfirmModal({
      title: "Discard unsaved changes?",
      children: <Text size="sm">You have changes that haven&apos;t been saved.</Text>,
      labels: { confirm: "Discard", cancel: "Keep editing" },
      confirmProps: { color: "red" },
      onConfirm: () => router.push(`/app/${brandId}/planner`),
    });
  }

  const setOption = (n: Network, value: Record<string, unknown>) => update((d) => ({ ...d, options: { ...d.options, [n]: value } }));

  return (
    <Box>
      <Box px={{ base: "sm", sm: "md" }} py="md" maw={1400} mx="auto">
        <Group justify="space-between" mb="md">
          <Group gap="xs">
            <Anchor component={Link} href={`/app/${brandId}/planner`} onClick={guardedBack} c="dimmed" size="sm" aria-label="Back to planner">
              <Group gap={4}>
                <IconArrowLeft size={16} /> Planner
              </Group>
            </Anchor>
            <Title order={3}>{group ? (readOnly ? "View post" : "Edit post") : "New post"}</Title>
          </Group>
        </Group>

        {group && (
          <Box mb="md">
            <StatusBanners brandId={brandId} group={group} onRetry={canWrite ? retry : undefined} retrying={retrying} />
          </Box>
        )}

        <Grid gutter="md">
          <Grid.Col span={{ base: 12, md: 7, lg: 8 }}>
            <Stack gap="md">
              <Paper withBorder radius="md" p="md">
                <Text fw={600} mb="xs">
                  Post to
                </Text>
                <ChannelPicker
                  brandId={brandId}
                  channels={allChannels}
                  loading={channelsLoading && !allChannels.length}
                  selected={draft.channelIds}
                  onChange={(ids) => update((d) => ({ ...d, channelIds: ids }))}
                  readOnly={readOnly}
                />
              </Paper>
              <CaptionSection
                brandId={brandId}
                draft={draft}
                update={update}
                selectedChannels={selectedChannels}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                readOnly={readOnly}
                score={debouncedCaption.trim() || draft.media.length ? score : null}
                onFix={fixCheck}
              />
              <ChannelChecks checks={checks} />
              <MediaSection brandId={brandId} media={draft.media} onChange={(fn) => update((d) => ({ ...d, media: fn(d.media) }))} readOnly={readOnly} caption={draft.caption} networks={networks} />
              <NetworkOptions networks={networks} options={draft.options} onChange={setOption} readOnly={readOnly} />
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }}>
            <Paper withBorder radius="md" p="sm" style={{ position: "sticky", top: 16 }}>
              <Tabs value={sideTab} onChange={setSideTab} keepMounted={false}>
                <Tabs.List grow mb="sm">
                  <Tabs.Tab value="preview" leftSection={<IconEye size={14} />}>
                    Preview
                  </Tabs.Tab>
                  <Tabs.Tab value="details" leftSection={<IconTags size={14} />}>
                    Tags
                  </Tabs.Tab>
                  <Tabs.Tab value="notes" leftSection={<IconNotes size={14} />}>
                    Notes
                  </Tabs.Tab>
                  <Tabs.Tab value="comments" leftSection={<IconMessages size={14} />}>
                    Comments
                  </Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="preview">
                  <Box mah="70vh" style={{ overflowY: "auto" }}>
                    <PreviewPanel channels={selectedChannels} captionFor={(id) => effectiveCaption(draft, id)} media={draft.media} />
                  </Box>
                </Tabs.Panel>
                <Tabs.Panel value="details">
                  <Stack gap="lg">
                    <LabelsPanel brandId={brandId} value={draft.labelIds} onChange={(ids) => update((d) => ({ ...d, labelIds: ids }))} readOnly={readOnly} />
                    <HashtagPanel brandId={brandId} onInsert={insertTags} readOnly={readOnly} />
                  </Stack>
                </Tabs.Panel>
                <Tabs.Panel value="notes">
                  <NotesPanel ref={notesRef} value={draft.notes} onChange={(notes) => update((d) => ({ ...d, notes }))} readOnly={!canWrite} />
                </Tabs.Panel>
                <Tabs.Panel value="comments">
                  <CommentsPanel brandId={brandId} groupId={group?.id ?? null} />
                </Tabs.Panel>
              </Tabs>
            </Paper>
          </Grid.Col>
        </Grid>
      </Box>

      <EditorFooter
        status={status}
        scheduledAt={draft.scheduledAt}
        timezone={tz}
        dirty={dirty}
        busy={busy}
        canWrite={canWrite}
        readOnly={readOnly}
        isNew={!group}
        canDecide={canDecide}
        onAction={onAction}
      />

      <ScheduleModal opened={scheduleOpen} onClose={() => setScheduleOpen(false)} timezone={tz} initialIso={draft.scheduledAt} onConfirm={schedule} busy={busy === "schedule"} />
      <RequestApprovalModal
        brandId={brandId}
        opened={approvalOpen}
        onClose={() => setApprovalOpen(false)}
        onSubmit={requestApproval}
        busy={busy === "requestApproval"}
        initialApprovers={group?.approval && !group.approval.decision ? group.approval.approverIds : undefined}
        currentUserId={brand.user.id}
      />
      <RejectModal opened={rejectOpen} onClose={() => setRejectOpen(false)} onSubmit={(c) => decide("rejected", c)} busy={busy === "reject"} />
    </Box>
  );
}

