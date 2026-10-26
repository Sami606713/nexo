"use client";

import { useState } from "react";
import useSWR from "swr";
import { ActionIcon, Badge, Button, Card, CopyButton, Group, Modal, SimpleGrid, Skeleton, Stack, TagsInput, Text, TextInput, Tooltip } from "@mantine/core";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { IconCheck, IconCopy, IconHash, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import type { HashtagLibrary } from "@postline/db";
import { api } from "@/lib/fetcher";
import { useBrand } from "@/components/shell/BrandContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { notifyError, notifySuccess } from "@/components/ui/notify";

export function HashtagsSettings() {
  const b = useBrand();
  const key = `/api/brands/${b.brandId}/hashtag-libraries`;
  const { data, isLoading, mutate } = useSWR<HashtagLibrary[]>(key);
  const [editing, setEditing] = useState<HashtagLibrary | "new" | null>(null);
  const editable = b.can("settings.other");

  const remove = (l: HashtagLibrary) =>
    modals.openConfirmModal({
      title: `Delete “${l.name}”?`,
      centered: true,
      children: <Text size="sm">This hashtag group will be permanently deleted.</Text>,
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await api(`${key}/${l.id}`, "DELETE");
          await mutate();
          notifySuccess("Hashtag group deleted");
        } catch (e) {
          notifyError(e);
        }
      },
    });

  return (
    <>
      <PageHeader
        title="Hashtag libraries"
        description="Saved hashtag groups you can drop into any post."
        actions={
          editable && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing("new")}>
              New group
            </Button>
          )
        }
      />
      {isLoading ? (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {[0, 1].map((i) => (
            <Skeleton key={i} h={120} radius="lg" />
          ))}
        </SimpleGrid>
      ) : !data?.length ? (
        <EmptyState
          icon={<IconHash size={26} />}
          title="No hashtag groups yet"
          description="Save the hashtags you use often — e.g. “Product launch” or “Local” — and insert them in one click from the editor."
          action={
            editable && (
              <Button mt="xs" leftSection={<IconPlus size={16} />} onClick={() => setEditing("new")}>
                Create a group
              </Button>
            )
          }
        />
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {data.map((l) => (
            <Card key={l.id} withBorder radius="lg" padding="md">
              <Group justify="space-between" mb="sm" wrap="nowrap">
                <Text fw={600} truncate>
                  {l.name}{" "}
                  <Text span size="xs" c="dimmed">
                    · {l.tags.length}
                  </Text>
                </Text>
                <Group gap={4} wrap="nowrap">
                  <CopyButton value={l.tags.join(" ")}>
                    {({ copied, copy }) => (
                      <Tooltip label={copied ? "Copied" : "Copy all"}>
                        <ActionIcon variant="subtle" color={copied ? "teal" : "gray"} onClick={copy} aria-label="Copy">
                          {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </CopyButton>
                  {editable && (
                    <>
                      <ActionIcon variant="subtle" color="gray" onClick={() => setEditing(l)} aria-label="Edit">
                        <IconPencil size={16} />
                      </ActionIcon>
                      <ActionIcon variant="subtle" color="red" onClick={() => remove(l)} aria-label="Delete">
                        <IconTrash size={16} />
                      </ActionIcon>
                    </>
                  )}
                </Group>
              </Group>
              <Group gap={6}>
                {l.tags.length === 0 && (
                  <Text size="sm" c="dimmed">
                    Empty
                  </Text>
                )}
                {l.tags.map((t) => (
                  <Badge key={t} variant="light" tt="none">
                    {t}
                  </Badge>
                ))}
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      )}
      <LibraryModal
        key={editing === null ? "closed" : editing === "new" ? "new" : editing.id}
        library={editing}
        onClose={() => setEditing(null)}
        onSaved={() => mutate()}
        endpoint={key}
      />
    </>
  );
}

function LibraryModal({
  library,
  onClose,
  onSaved,
  endpoint,
}: {
  library: HashtagLibrary | "new" | null;
  onClose: () => void;
  onSaved: () => void;
  endpoint: string;
}) {
  const existing = library && library !== "new" ? library : null;
  const [loading, setLoading] = useState(false);
  const form = useForm({
    initialValues: { name: existing?.name ?? "", tags: existing?.tags ?? [] },
    validate: { name: (v) => (v.trim() ? null : "Name is required") },
  });
  const submit = form.onSubmit(async (v) => {
    setLoading(true);
    try {
      if (existing) await api(`${endpoint}/${existing.id}`, "PATCH", v);
      else await api(endpoint, "POST", v);
      notifySuccess(existing ? "Hashtag group updated" : "Hashtag group created");
      onSaved();
      onClose();
    } catch (e) {
      notifyError(e);
    } finally {
      setLoading(false);
    }
  });
  return (
    <Modal opened={library !== null} onClose={onClose} title={<Text fw={600}>{existing ? "Edit hashtag group" : "New hashtag group"}</Text>} centered size="lg">
      <form onSubmit={submit}>
        <Stack>
          <TextInput label="Name" placeholder="Product launch" data-autofocus {...form.getInputProps("name")} />
          <TagsInput
            label="Hashtags"
            description="Press Enter, comma or space to add. Paste a list to add many at once."
            placeholder="#launch"
            splitChars={[",", " ", "\n"]}
            clearable
            {...form.getInputProps("tags")}
          />
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
