import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const RE = /(^|[^\p{L}\p{N}_])([#@][\p{L}\p{N}_]+)/gu;

/** Colours #hashtags and @mentions (decorations only — the document stays plain text). */
export function createTagHighlight(classes: { tag: string; mention: string }) {
  return Extension.create({
    name: "tagHighlight",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("tagHighlight"),
          props: {
            decorations(state) {
              const decos: Decoration[] = [];
              state.doc.descendants((node, pos) => {
                if (!node.isText || !node.text) return;
                for (const m of node.text.matchAll(RE)) {
                  const start = pos + (m.index ?? 0) + (m[1]?.length ?? 0);
                  const word = m[2]!;
                  decos.push(Decoration.inline(start, start + word.length, { class: word[0] === "#" ? classes.tag : classes.mention }));
                }
              });
              return DecorationSet.create(state.doc, decos);
            },
          },
        }),
      ];
    },
  });
}
