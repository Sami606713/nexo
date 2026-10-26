import type { Editor } from "@tiptap/react";
import type { UpsertPostGroupInput } from "@postline/core";
import type { MediaDTO, PostGroupDTO } from "@/lib/posts/types";

/** Client-side editable state of a post group. */
export interface DraftState {
  caption: string;
  channelIds: string[];
  /** channelId → custom caption. Present key = channel is customized. */
  overrides: Record<string, string>;
  media: MediaDTO[];
  labelIds: string[];
  options: Record<string, Record<string, unknown>>;
  notes: string;
  /** ISO instant or null. */
  scheduledAt: string | null;
}

export function emptyDraft(init?: Partial<DraftState>): DraftState {
  return {
    caption: "",
    channelIds: [],
    overrides: {},
    media: [],
    labelIds: [],
    options: {},
    notes: "",
    scheduledAt: null,
    ...init,
  };
}

export function draftFromGroup(g: PostGroupDTO): DraftState {
  const overrides: Record<string, string> = {};
  for (const p of g.posts) if (p.captionOverride != null) overrides[p.channelId] = p.captionOverride;
  return {
    caption: g.caption,
    channelIds: g.posts.map((p) => p.channelId),
    overrides,
    media: g.media,
    labelIds: g.labels.map((l) => l.id),
    options: g.options ?? {},
    notes: g.notes ?? "",
    scheduledAt: g.scheduledAt,
  };
}

/** Request body for POST/PATCH. */
export function toPayload(d: DraftState, extra?: Partial<UpsertPostGroupInput>): UpsertPostGroupInput {
  return {
    caption: d.caption,
    channels: d.channelIds.map((id) => ({ channelId: id, captionOverride: d.overrides[id] ?? null })),
    mediaIds: d.media.map((m) => m.id),
    labelIds: d.labelIds,
    options: d.options,
    notes: d.notes.trim() ? d.notes : null,
    scheduledAt: d.scheduledAt,
    ...extra,
  };
}

/** Stable fingerprint for dirty-checking. */
export function fingerprint(d: DraftState): string {
  const p = toPayload(d);
  return JSON.stringify({ ...p, alts: d.media.map((m) => m.alt ?? "") });
}

export function effectiveCaption(d: DraftState, channelId: string): string {
  return d.overrides[channelId] ?? d.caption;
}

/** Plain text ↔ Tiptap JSON (one paragraph per line). */
export function textToDoc(text: string) {
  return {
    type: "doc",
    content: text.split("\n").map((line) => ({
      type: "paragraph",
      ...(line ? { content: [{ type: "text", text: line }] } : {}),
    })),
  };
}

export function textToNodes(text: string) {
  const lines = text.split("\n");
  if (lines.length === 1) return lines[0] ? [{ type: "text", text: lines[0] }] : [];
  return textToDoc(text).content;
}

export function editorText(editor: Editor): string {
  return editor.getText({ blockSeparator: "\n" });
}
