"use client";
// OWNED BY: inbox agent. Left pane: profiles with inbox toggles.
import { Badge, Box, Group, ScrollArea, Skeleton, Stack, Switch, Text, ThemeIcon, Tooltip, UnstyledButton } from "@mantine/core";
import { IconInbox, IconPlugOff } from "@tabler/icons-react";
import { NETWORK_META } from "@/components/channels/networkMeta";
import type { InboxChannelDto } from "./types";
import { PersonAvatar } from "./utils";

interface Props {
  channels: InboxChannelDto[] | undefined;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onToggle: (c: InboxChannelDto, enabled: boolean) => void;
  canEdit: boolean;
}

function Row({ active, onClick, disabled, children }: { active?: boolean; onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <UnstyledButton
      onClick={disabled ? undefined : onClick}
      px="sm"
      py={8}
      style={{
        borderRadius: 8,
        width: "100%",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        background: active ? "var(--mantine-primary-color-light)" : undefined,
      }}
    >
      {children}
    </UnstyledButton>
  );
}

export function ChannelPane({ channels, selected, onSelect, onToggle, canEdit }: Props) {
  const supported = channels?.filter((c) => c.supported) ?? [];
  const unsupported = channels?.filter((c) => !c.supported) ?? [];
  const totalUnread = supported.filter((c) => c.inboxEnabled).reduce((n, c) => n + c.unreadCount, 0);

  return (
    <Stack gap={0} h="100%">
      <Box px="md" py="sm" style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}>
        <Text fw={600} size="sm">
          Profiles
        </Text>
        <Text size="xs" c="dimmed">
          Choose which accounts feed the inbox
        </Text>
      </Box>
      <ScrollArea style={{ flex: 1 }} px="xs" py="xs">
        {!channels && (
          <Stack gap="xs" p="xs">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} h={40} radius="md" />
            ))}
          </Stack>
        )}
        {channels && (
          <Stack gap={2}>
            <Row active={selected === null} onClick={() => onSelect(null)}>
              <Group gap="sm" wrap="nowrap">
                <ThemeIcon variant="light" radius="xl" size={32}>
                  <IconInbox size={18} />
                </ThemeIcon>
                <Text size="sm" fw={500} style={{ flex: 1 }}>
                  All profiles
                </Text>
                {totalUnread > 0 && (
                  <Badge size="sm" radius="xl" variant="filled">
                    {totalUnread}
                  </Badge>
                )}
              </Group>
            </Row>
            {supported.length === 0 && (
              <Text size="xs" c="dimmed" px="sm" py="xs">
                Connect a Facebook, Instagram, Bluesky or Mastodon account to start receiving messages here.
              </Text>
            )}
            {supported.map((c) => (
              <Row key={c.id} active={selected === c.id} onClick={() => onSelect(c.id)}>
                <Group gap="sm" wrap="nowrap">
                  <PersonAvatar src={c.avatarUrl} name={c.name} network={c.network} size={32} />
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={500} truncate>
                      {c.name}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {c.health !== "OK"
                        ? "Reconnect needed"
                        : !c.inboxEnabled
                          ? "Inbox off"
                          : c.demo || !c.live
                            ? `${NETWORK_META[c.network].label} · sample data`
                            : NETWORK_META[c.network].label}
                    </Text>
                  </Box>
                  {c.inboxEnabled && c.unreadCount > 0 && (
                    <Badge size="xs" radius="xl" variant="light">
                      {c.unreadCount}
                    </Badge>
                  )}
                  <Tooltip label={c.inboxEnabled ? "Turn inbox off" : "Turn inbox on"} withArrow openDelay={400}>
                    <Switch
                      size="xs"
                      checked={c.inboxEnabled}
                      disabled={!canEdit}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onToggle(c, e.currentTarget.checked)}
                      aria-label={`Inbox for ${c.name}`}
                    />
                  </Tooltip>
                </Group>
              </Row>
            ))}
            {unsupported.length > 0 && (
              <>
                <Group gap={6} px="sm" mt="md" mb={4}>
                  <IconPlugOff size={13} color="var(--mantine-color-dimmed)" />
                  <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: 0.4 }}>
                    Not supported
                  </Text>
                </Group>
                {unsupported.map((c) => (
                  <Tooltip key={c.id} label="Inbox not supported for this network" position="right" withArrow>
                    <div>
                      <Row disabled>
                        <Group gap="sm" wrap="nowrap">
                          <PersonAvatar src={c.avatarUrl} name={c.name} network={c.network} size={32} />
                          <Box style={{ flex: 1, minWidth: 0 }}>
                            <Text size="sm" truncate>
                              {c.name}
                            </Text>
                            <Text size="xs" c="dimmed" truncate>
                              {NETWORK_META[c.network].label}
                            </Text>
                          </Box>
                          <Switch size="xs" checked={false} disabled aria-label="Inbox not supported for this network" />
                        </Group>
                      </Row>
                    </div>
                  </Tooltip>
                ))}
              </>
            )}
          </Stack>
        )}
      </ScrollArea>
      <Box px="md" py="sm" style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}>
        <Text size="xs" c="dimmed" lh={1.4}>
          Inbox works with Facebook, Instagram, Bluesky and Mastodon. Other networks aren&apos;t supported yet.
        </Text>
      </Box>
    </Stack>
  );
}
