"use client";

import { ActionIcon, Button, Group, Menu, Paper, Text, Tooltip } from "@mantine/core";
import {
  IconCalendarTime,
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconDeviceFloppy,
  IconDots,
  IconSend,
  IconTrash,
  IconUserCheck,
  IconX,
  IconCalendarOff,
} from "@tabler/icons-react";
import type { PostStatus } from "@postline/core";
import { StatusBadge } from "@/components/posts/StatusBadge";
import { formatDateTime } from "@/components/posts/tz";

export type FooterAction = "save" | "schedule" | "publishNow" | "unschedule" | "requestApproval" | "duplicate" | "delete" | "approve" | "reject";

interface Props {
  status: PostStatus | null;
  scheduledAt: string | null;
  timezone: string;
  dirty: boolean;
  busy: FooterAction | null;
  canWrite: boolean;
  readOnly: boolean;
  isNew: boolean;
  canDecide: boolean;
  onAction: (a: FooterAction) => void;
}

export function EditorFooter({ status, scheduledAt, timezone, dirty, busy, canWrite, readOnly, isNew, canDecide, onAction }: Props) {
  const pending = status === "PENDING_APPROVAL";
  return (
    <Paper
      withBorder
      radius={0}
      px="md"
      py="sm"
      style={{ position: "sticky", bottom: 0, zIndex: 50, borderLeft: 0, borderRight: 0, borderBottom: 0 }}
    >
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          {status && <StatusBadge status={status} />}
          {scheduledAt && (
            <Text size="sm" c="dimmed" truncate>
              {formatDateTime(scheduledAt, timezone)}
            </Text>
          )}
          {dirty && !readOnly && (
            <Text size="xs" c="yellow.8">
              Unsaved changes
            </Text>
          )}
        </Group>

        <Group gap="xs" wrap="wrap">
          {canDecide && (
            <>
              <Button color="red" variant="light" leftSection={<IconX size={16} />} loading={busy === "reject"} onClick={() => onAction("reject")}>
                Reject
              </Button>
              <Button color="green" leftSection={<IconCheck size={16} />} loading={busy === "approve"} onClick={() => onAction("approve")}>
                Approve
              </Button>
            </>
          )}

          {canWrite && !isNew && (
            <Menu position="top-end" shadow="md">
              <Menu.Target>
                <ActionIcon variant="default" size="lg" aria-label="More actions">
                  <IconDots size={18} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconCopy size={14} />} onClick={() => onAction("duplicate")}>
                  Duplicate
                </Menu.Item>
                {!readOnly && scheduledAt && !pending && (
                  <Menu.Item leftSection={<IconCalendarOff size={14} />} onClick={() => onAction("unschedule")}>
                    Unschedule (move to drafts)
                  </Menu.Item>
                )}
                <Menu.Divider />
                <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => onAction("delete")}>
                  Delete
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}

          {canWrite && !readOnly && (
            <>
              <Tooltip label="Ask a teammate or client to approve before publishing">
                <Button variant="default" leftSection={<IconUserCheck size={16} />} loading={busy === "requestApproval"} onClick={() => onAction("requestApproval")}>
                  {pending ? "Change approvers" : "Request approval"}
                </Button>
              </Tooltip>
              <Tooltip label="Ctrl/⌘+S">
                <Button variant="default" leftSection={<IconDeviceFloppy size={16} />} loading={busy === "save"} onClick={() => onAction("save")}>
                  {scheduledAt || pending ? "Save" : "Save draft"}
                </Button>
              </Tooltip>
              <Button.Group>
                <Tooltip label="Ctrl/⌘+Enter">
                  <Button leftSection={<IconCalendarTime size={16} />} loading={busy === "schedule"} onClick={() => onAction("schedule")}>
                    {scheduledAt && !pending ? "Reschedule" : "Schedule"}
                  </Button>
                </Tooltip>
                <Menu position="top-end" shadow="md">
                  <Menu.Target>
                    <Button px={8} aria-label="More publish options" style={{ borderLeft: "1px solid rgba(255,255,255,.3)" }}>
                      <IconChevronDown size={16} />
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item leftSection={<IconSend size={14} />} disabled={pending} onClick={() => onAction("publishNow")}>
                      Publish now
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Button.Group>
            </>
          )}
        </Group>
      </Group>
    </Paper>
  );
}
