"use client";

import { useState } from "react";
import { ActionIcon, Box, Group, ScrollArea, Stack, Text, TextInput, Tooltip, UnstyledButton } from "@mantine/core";
import {
  IconCircle,
  IconEye,
  IconEyeOff,
  IconGripVertical,
  IconLetterT,
  IconLine,
  IconLock,
  IconLockOpen,
  IconPhoto,
  IconSquare,
  IconStar,
  IconIcons,
} from "@tabler/icons-react";
import { layerLabel, type Layer } from "./scene";
import { useEditorState, useStore } from "./store";

const TYPE_ICON = {
  text: IconLetterT,
  image: IconPhoto,
  rect: IconSquare,
  ellipse: IconCircle,
  line: IconLine,
  star: IconStar,
  icon: IconIcons,
} as const;

function Row({ l, index, selected, onDragStart, onDropAt, dropHint }: { l: Layer; index: number; selected: boolean; onDragStart: (i: number) => void; onDropAt: (i: number) => void; dropHint: boolean }) {
  const store = useStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(layerLabel(l));
  const Icon = TYPE_ICON[l.type];
  return (
    <Box
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", l.id);
        onDragStart(index);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDropAt(index);
      }}
      onClick={(e) => (e.shiftKey ? store.toggleSelect(l.id) : store.select([l.id]))}
      onDoubleClick={() => {
        setName(layerLabel(l));
        setEditing(true);
      }}
      px={6}
      py={5}
      style={{
        borderRadius: 8,
        cursor: "pointer",
        background: selected ? "var(--mantine-color-indigo-light)" : undefined,
        borderTop: dropHint ? "2px solid var(--mantine-color-indigo-5)" : "2px solid transparent",
        opacity: l.hidden ? 0.5 : 1,
      }}
      className="studio-layer-row"
    >
      <Group gap={6} wrap="nowrap">
        <IconGripVertical size={14} style={{ color: "var(--mantine-color-dimmed)", cursor: "grab", flexShrink: 0 }} />
        <Icon size={15} style={{ flexShrink: 0 }} />
        {editing ? (
          <TextInput
            size="xs"
            autoFocus
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditing(false);
            }}
            onBlur={() => {
              setEditing(false);
              store.updateLayers([l.id], { name: name.trim() || undefined });
            }}
            style={{ flex: 1 }}
          />
        ) : (
          <Text size="sm" truncate style={{ flex: 1, minWidth: 0 }} title="Double-click to rename">
            {layerLabel(l)}
          </Text>
        )}
        <Tooltip label={l.hidden ? "Show" : "Hide"} openDelay={400}>
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            onClick={(e) => {
              e.stopPropagation();
              store.updateLayers([l.id], { hidden: !l.hidden });
            }}
            aria-label={l.hidden ? "Show layer" : "Hide layer"}
          >
            {l.hidden ? <IconEyeOff size={14} /> : <IconEye size={14} />}
          </ActionIcon>
        </Tooltip>
        <Tooltip label={l.locked ? "Unlock" : "Lock"} openDelay={400}>
          <ActionIcon
            size="sm"
            variant="subtle"
            color={l.locked ? "yellow" : "gray"}
            onClick={(e) => {
              e.stopPropagation();
              store.updateLayers([l.id], { locked: !l.locked });
            }}
            aria-label={l.locked ? "Unlock layer" : "Lock layer"}
          >
            {l.locked ? <IconLock size={14} /> : <IconLockOpen size={14} />}
          </ActionIcon>
        </Tooltip>
      </Group>
    </Box>
  );
}

/** Layer list, top-most first. Drag rows to reorder, double-click to rename. */
export function LayersPanel() {
  const store = useStore();
  const st = useEditorState();
  const layers = st.scene.layers;
  const display = [...layers].reverse();
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [hint, setHint] = useState<number | null>(null);

  return (
    <Stack gap={0} h="100%">
      <Group justify="space-between" px="md" h={44} style={{ borderBottom: "1px solid var(--mantine-color-default-border)", flexShrink: 0 }}>
        <Text fw={700} size="sm">
          Layers
        </Text>
        <Text size="xs" c="dimmed">
          {layers.length}
        </Text>
      </Group>
      <ScrollArea style={{ flex: 1 }} px={6} py={6} onDragLeave={() => setHint(null)}>
        {display.length === 0 && (
          <Text size="sm" c="dimmed" ta="center" mt="xl" px="md">
            Add text, shapes or images from the left — they'll show up here.
          </Text>
        )}
        <Stack gap={2} onDragOver={(e) => e.preventDefault()}>
          {display.map((l, i) => (
            <div key={l.id} onDragEnter={() => dragFrom !== null && setHint(i)}>
              <Row
                l={l}
                index={i}
                selected={st.selected.includes(l.id)}
                dropHint={hint === i && dragFrom !== null && dragFrom !== i}
                onDragStart={setDragFrom}
                onDropAt={(to) => {
                  if (dragFrom === null) return;
                  const item = display[dragFrom]!;
                  // Display is reversed: the item ends up at display row `to` → scene index len-1-to.
                  store.moveLayer(item.id, layers.length - 1 - to);
                  setDragFrom(null);
                  setHint(null);
                }}
              />
            </div>
          ))}
        </Stack>
        {display.length > 0 && (
          <UnstyledButton w="100%" py={8} onClick={() => store.select([])}>
            <Text size="xs" c="dimmed" ta="center">
              Background · click canvas to edit
            </Text>
          </UnstyledButton>
        )}
      </ScrollArea>
    </Stack>
  );
}
