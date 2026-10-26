"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { Anchor, Badge, Button, ColorSwatch, Group, MultiSelect, Stack, Text, Textarea } from "@mantine/core";
import { IconHash } from "@tabler/icons-react";
import { useHashtagLibraries, useLabels } from "@/components/posts/utils";

export function LabelsPanel({ brandId, value, onChange, readOnly }: { brandId: string; value: string[]; onChange: (ids: string[]) => void; readOnly?: boolean }) {
  const { labels, isLoading } = useLabels(brandId);
  const colorOf = (id: string) => labels.find((l) => l.id === id)?.color ?? "gray";
  return (
    <Stack gap="xs">
      <MultiSelect
        label="Labels"
        placeholder={isLoading ? "Loading…" : labels.length ? "Pick labels" : "No labels yet"}
        data={labels.map((l) => ({ value: l.id, label: l.name }))}
        value={value}
        onChange={onChange}
        disabled={readOnly}
        searchable
        clearable
        renderOption={({ option }) => (
          <Group gap="xs">
            <ColorSwatch color={colorOf(option.value)} size={12} />
            <Text size="sm">{option.label}</Text>
          </Group>
        )}
      />
      {value.length > 0 && (
        <Group gap={6}>
          {value.map((id) => {
            const l = labels.find((x) => x.id === id);
            return l ? (
              <Badge key={id} color={l.color} variant="light" leftSection={<ColorSwatch color={l.color} size={8} />}>
                {l.name}
              </Badge>
            ) : null;
          })}
        </Group>
      )}
      <Anchor component={Link} href={`/app/${brandId}/settings/labels`} size="xs">
        Manage labels
      </Anchor>
    </Stack>
  );
}

export function HashtagPanel({ brandId, onInsert, readOnly }: { brandId: string; onInsert: (tags: string[]) => void; readOnly?: boolean }) {
  const { libraries, isLoading } = useHashtagLibraries(brandId);
  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        Hashtag libraries
      </Text>
      {isLoading && (
        <Text size="xs" c="dimmed">
          Loading…
        </Text>
      )}
      {!isLoading && !libraries.length && (
        <Text size="xs" c="dimmed">
          Save groups of hashtags you use often.{" "}
          <Anchor component={Link} href={`/app/${brandId}/settings/hashtags`} size="xs">
            Create a library
          </Anchor>
        </Text>
      )}
      {libraries.map((lib) => (
        <Group key={lib.id} justify="space-between" wrap="nowrap" gap="xs">
          <div style={{ minWidth: 0 }}>
            <Text size="sm" fw={500} truncate>
              {lib.name}
            </Text>
            <Text size="xs" c="dimmed" lineClamp={1}>
              {lib.tags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ")}
            </Text>
          </div>
          <Button
            size="compact-xs"
            variant="light"
            leftSection={<IconHash size={12} />}
            disabled={readOnly || !lib.tags.length}
            onClick={() => onInsert(lib.tags.map((t) => (t.startsWith("#") ? t : `#${t}`)))}
          >
            Insert
          </Button>
        </Group>
      ))}
    </Stack>
  );
}

export const NotesPanel = forwardRef<HTMLTextAreaElement, { value: string; onChange: (v: string) => void; readOnly?: boolean }>(function NotesPanel(
  { value, onChange, readOnly },
  ref,
) {
  return (
    <Textarea
      ref={ref}
      label="Notes"
      description="Private notes for your team — never published. Shortcut: Ctrl/⌘+J"
      autosize
      minRows={5}
      maxRows={16}
      maxLength={10_000}
      readOnly={readOnly}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
});
