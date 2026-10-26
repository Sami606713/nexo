"use client";

import { useState } from "react";
import useSWR from "swr";
import { ActionIcon, Badge, Button, Card, ColorInput, Group, Modal, Skeleton, Stack, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { IconPencil, IconPlus, IconTag, IconTrash } from "@tabler/icons-react";
import type { Label } from "@postline/db";
import { api } from "@/lib/fetcher";
import { useBrand } from "@/components/shell/BrandContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { notifyError, notifySuccess } from "@/components/ui/notify";

const SWATCHES = ["#4C6EF5", "#7950F2", "#E64980", "#FA5252", "#FD7E14", "#FAB005", "#40C057", "#12B886", "#15AABF", "#868E96"];

export function LabelsSettings() {
  const b = useBrand();
  const key = `/api/brands/${b.brandId}/labels`;
  const { data, isLoading, mutate } = useSWR<Label[]>(key);
  const [editing, setEditing] = useState<Label | "new" | null>(null);
  const editable = b.can("settings.other");

  const remove = (l: Label) =>
    modals.openConfirmModal({
      title: `Delete label “${l.name}”?`,
      centered: true,
      children: <Text size="sm">It will be removed from all posts that use it.</Text>,
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await api(`${key}/${l.id}`, "DELETE");
          await mutate();
          notifySuccess("Label deleted");
        } catch (e) {
          notifyError(e);
        }
      },
    });

  return (
    <>
      <PageHeader
        title="Labels"
        description="Color-coded tags to organize posts in the planner."
        actions={
          editable && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing("new")}>
              New label
            </Button>
          )
        }
      />
      {isLoading ? (
        <Stack>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h={52} radius="md" />
          ))}
        </Stack>
      ) : !data?.length ? (
        <EmptyState
          icon={<IconTag size={26} />}
          title="No labels yet"
          description="Create labels like “Promo”, “Blog” or “Event” to filter and color posts on your calendar."
          action={
            editable && (
              <Button mt="xs" leftSection={<IconPlus size={16} />} onClick={() => setEditing("new")}>
                Create a label
              </Button>
            )
          }
        />
      ) : (
        <Card withBorder radius="lg" padding={0}>
          {data.map((l, i) => (
            <Group
              key={l.id}
              justify="space-between"
              px="md"
              py="sm"
              style={i ? { borderTop: "1px solid var(--mantine-color-default-border)" } : undefined}
            >
              <Badge size="lg" variant="light" color={l.color} leftSection={<span style={{ width: 8, height: 8, borderRadius: 8, background: l.color, display: "inline-block" }} />}>
                {l.name}
              </Badge>
              {editable && (
                <Group gap={4}>
                  <ActionIcon variant="subtle" color="gray" onClick={() => setEditing(l)} aria-label="Edit">
                    <IconPencil size={16} />
                  </ActionIcon>
                  <ActionIcon variant="subtle" color="red" onClick={() => remove(l)} aria-label="Delete">
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              )}
            </Group>
          ))}
        </Card>
      )}
      <LabelModal
        key={editing === null ? "closed" : editing === "new" ? "new" : editing.id}
        label={editing}
        onClose={() => setEditing(null)}
        onSaved={() => mutate()}
        endpoint={key}
      />
    </>
  );
}

function LabelModal({ label, onClose, onSaved, endpoint }: { label: Label | "new" | null; onClose: () => void; onSaved: () => void; endpoint: string }) {
  const existing = label && label !== "new" ? label : null;
  const [loading, setLoading] = useState(false);
  const form = useForm({
    initialValues: { name: existing?.name ?? "", color: existing?.color ?? SWATCHES[0]! },
    validate: { name: (v) => (v.trim() ? null : "Name is required"), color: (v) => (v ? null : "Pick a color") },
  });
  const submit = form.onSubmit(async (v) => {
    setLoading(true);
    try {
      if (existing) await api(`${endpoint}/${existing.id}`, "PATCH", v);
      else await api(endpoint, "POST", v);
      notifySuccess(existing ? "Label updated" : "Label created");
      onSaved();
      onClose();
    } catch (e) {
      notifyError(e);
    } finally {
      setLoading(false);
    }
  });
  return (
    <Modal opened={label !== null} onClose={onClose} title={<Text fw={600}>{existing ? "Edit label" : "New label"}</Text>} centered>
      <form onSubmit={submit}>
        <Stack>
          <TextInput label="Name" placeholder="Promo" data-autofocus {...form.getInputProps("name")} />
          <ColorInput label="Color" format="hex" swatches={SWATCHES} swatchesPerRow={10} {...form.getInputProps("color")} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
