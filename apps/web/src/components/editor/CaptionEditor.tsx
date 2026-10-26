"use client";

import { useEffect, useMemo, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Skeleton } from "@mantine/core";
import { editorText, textToDoc } from "./draft";
import { createTagHighlight } from "./highlight";
import { AiBubbleMenu } from "./AiBubbleMenu";
import classes from "./CaptionEditor.module.css";

interface Props {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  /** Enables the selection AI menu. */
  brandId?: string;
  ariaLabel?: string;
}

/** Plain-text caption editor (Tiptap) with hashtag/mention highlighting and an AI selection menu. */
export function CaptionEditor({ value, onChange, placeholder, readOnly, brandId, ariaLabel = "Post caption" }: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const highlight = useMemo(() => createTagHighlight({ tag: classes.tag!, mention: classes.mention! }), []);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        heading: false,
        bold: false,
        italic: false,
        strike: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        horizontalRule: false,
      }),
      Placeholder.configure({ placeholder: placeholder ?? "Write your post…" }),
      highlight,
    ],
    content: textToDoc(value),
    editorProps: {
      attributes: { "aria-label": ariaLabel, "aria-multiline": "true", role: "textbox", spellcheck: "true" },
    },
    onUpdate: ({ editor }) => onChangeRef.current(editorText(editor)),
  });

  // Push external value changes (AI fixes, hashtag inserts, tab switches) into the editor.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (editorText(editor) !== value) editor.commands.setContent(textToDoc(value), false);
  }, [editor, value]);

  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  if (!editor) return <Skeleton h={200} radius="md" />;

  return (
    <div className={`${classes.root} ${readOnly ? classes.readOnly : ""}`}>
      {brandId && !readOnly && <AiBubbleMenu editor={editor} brandId={brandId} className={classes.bubble!} />}
      <EditorContent editor={editor} className={classes.content} />
    </div>
  );
}
