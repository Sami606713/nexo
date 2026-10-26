"use client";

import { useEffect, useState } from "react";
import { Avatar, Button, Group, Modal, MultiSelect, Stack, Text, Textarea } from "@mantine/core";
import { useMembers } from "@/components/posts/utils";

export function RequestApprovalModal({
  brandId,
  opened,
  onClose,
  onSubmit,
  busy,
  initialApprovers,
  currentUserId,
}: {
  brandId: string;
  opened: boolean;
  onClose: () => void;
  onSubmit: (approverIds: string[], comment: string) => void;
  busy?: boolean;
  initialApprovers?: string[];
  currentUserId: string;
}) {
  const { members, isLoading } = useMembers(brandId);
  const [ids, setIds] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  useEffect(() => {
    if (opened) {
      setIds(initialApprovers ?? []);
      setComment("");
    }
  }, [opened, initialApprovers]);

  const byId = new Map(members.map((m) => [m.userId, m]));
  return (
    <Modal opened={opened} onClose={onClose} title="Request approval" centered>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Approvers get a notification. The post won&apos;t publish until it&apos;s approved.
        </Text>
        <MultiSelect
          label="Approvers"
          placeholder={isLoading ? "Loading members…" : "Choose who should approve"}
          data={members.map((m) => ({ value: m.userId, label: `${m.name}${m.userId === currentUserId ? " (you)" : ""}${m.role ? ` · ${m.role.toLowerCase()}` : ""}` }))}
          value={ids}
          onChange={setIds}
          searchable
          renderOption={({ option }) => {
            const m = byId.get(option.value);
            return (
              <Group gap="xs" wrap="nowrap">
                <Avatar src={m?.image} size={22} radius="xl">
                  {(m?.name ?? "?").slice(0, 1)}
                </Avatar>
                <div>
                  <Text size="sm">{option.label}</Text>
                  {m?.email && (
                    <Text size="xs" c="dimmed">
                      {m.email}
                    </Text>
                  )}
                </div>
              </Group>
            );
          }}
          data-autofocus
        />
        <Textarea label="Message (optional)" autosize minRows={2} maxLength={2000} value={comment} onChange={(e) => setComment(e.currentTarget.value)} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!ids.length} loading={busy} onClick={() => onSubmit(ids, comment)}>
            Send request
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function RejectModal({ opened, onClose, onSubmit, busy }: { opened: boolean; onClose: () => void; onSubmit: (comment: string) => void; busy?: boolean }) {
  const [comment, setComment] = useState("");
  useEffect(() => {
    if (opened) setComment("");
  }, [opened]);
  return (
    <Modal opened={opened} onClose={onClose} title="Reject post" centered>
      <Stack gap="md">
        <Textarea
          label="What should change?"
          description="Shared with the person who requested approval."
          autosize
          minRows={3}
          maxLength={2000}
          value={comment}
          onChange={(e) => setComment(e.currentTarget.value)}
          data-autofocus
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button color="red" loading={busy} onClick={() => onSubmit(comment)}>
            Reject
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
