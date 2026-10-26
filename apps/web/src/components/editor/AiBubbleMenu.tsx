"use client";

import { useState } from "react";
import { BubbleMenu, type Editor } from "@tiptap/react";
import { Badge, Button, Divider, Loader, Menu } from "@mantine/core";
import { IconChevronRight, IconLanguage, IconMoodSmile, IconSparkles } from "@tabler/icons-react";
import type { RewriteAction, Tone } from "@postline/core";
import { api } from "@/lib/fetcher";
import { notifyError } from "@/components/posts/utils";
import { editorText, textToNodes } from "./draft";

export const TONE_OPTIONS: { value: Tone; label: string }[] = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "witty", label: "Witty" },
  { value: "bold", label: "Bold" },
  { value: "inspirational", label: "Inspirational" },
  { value: "educational", label: "Educational" },
];

export const LANGUAGES = ["English", "Spanish", "French", "German", "Portuguese", "Italian", "Dutch", "Arabic", "Hindi", "Japanese", "Chinese (Simplified)"];

interface Props {
  editor: Editor;
  brandId: string;
  className: string;
}

/** Floating menu on text selection: AI rewrite actions replace the selection (1 credit each). */
export function AiBubbleMenu({ editor, brandId, className }: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  async function run(action: RewriteAction, label: string, extra?: { tone?: Tone; targetLanguage?: string }) {
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const text = editor.state.doc.textBetween(from, to, "\n");
    setBusy(label);
    try {
      const res = await api<{ text: string }>(`/api/brands/${brandId}/ai/rewrite`, "POST", {
        text,
        context: editorText(editor),
        action,
        ...extra,
      });
      editor.chain().focus().insertContentAt({ from, to }, textToNodes(res.text.trim())).run();
    } catch (err) {
      notifyError(err, brandId);
    } finally {
      setBusy(null);
    }
  }

  const btn = (action: RewriteAction, label: string) => (
    <Button size="compact-xs" variant="subtle" disabled={!!busy} onClick={() => run(action, label)}>
      {label}
    </Button>
  );

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 120, maxWidth: "none", placement: "top-start" }}
      shouldShow={({ state, from, to }) => from !== to && state.doc.textBetween(from, to).trim().length > 1}
    >
      <div className={className} role="toolbar" aria-label="AI writing tools">
        {busy ? (
          <Button size="compact-xs" variant="subtle" leftSection={<Loader size={12} />} disabled>
            {busy}…
          </Button>
        ) : (
          <IconSparkles size={16} color="var(--mantine-color-violet-filled)" style={{ margin: "0 4px" }} aria-hidden />
        )}
        {btn("rewrite", "Rewrite")}
        {btn("shorten", "Shorten")}
        {btn("expand", "Expand")}
        {btn("fix_grammar", "Fix grammar")}
        <Menu withinPortal={false} position="bottom-start" shadow="md">
          <Menu.Target>
            <Button size="compact-xs" variant="subtle" disabled={!!busy} leftSection={<IconMoodSmile size={14} />} rightSection={<IconChevronRight size={12} />}>
              Tone
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {TONE_OPTIONS.map((t) => (
              <Menu.Item key={t.value} onClick={() => run("change_tone", `Making it ${t.label.toLowerCase()}`, { tone: t.value })}>
                {t.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
        <Menu withinPortal={false} position="bottom-start" shadow="md">
          <Menu.Target>
            <Button size="compact-xs" variant="subtle" disabled={!!busy} leftSection={<IconLanguage size={14} />} rightSection={<IconChevronRight size={12} />}>
              Translate
            </Button>
          </Menu.Target>
          <Menu.Dropdown mah={260} style={{ overflowY: "auto" }}>
            {LANGUAGES.map((l) => (
              <Menu.Item key={l} onClick={() => run("translate", `Translating to ${l}`, { targetLanguage: l })}>
                {l}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
        <Divider orientation="vertical" mx={2} />
        <Badge size="xs" variant="light" color="violet">
          1 credit
        </Badge>
      </div>
    </BubbleMenu>
  );
}
