"use client";

import Link from "next/link";
import { Alert, Anchor, Group, Skeleton, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { IconCheck, IconPlugConnected } from "@tabler/icons-react";
import { NETWORK_LABELS } from "@postline/core";
import type { ChannelDTO } from "@/lib/posts/types";
import { ChannelAvatar } from "@/components/posts/ChannelAvatar";

interface Props {
  brandId: string;
  channels: ChannelDTO[];
  loading?: boolean;
  selected: string[];
  onChange: (ids: string[]) => void;
  readOnly?: boolean;
}

export function ChannelPicker({ brandId, channels, loading, selected, onChange, readOnly }: Props) {
  if (loading) {
    return (
      <Group gap="sm">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} circle h={44} />
        ))}
      </Group>
    );
  }
  if (!channels.length) {
    return (
      <Alert variant="light" color="indigo" icon={<IconPlugConnected size={18} />} title="No channels connected yet">
        <Text size="sm">
          Connect a social account to publish this post.{" "}
          <Anchor component={Link} href={`/app/${brandId}/channels`} size="sm">
            Connect channels
          </Anchor>
        </Text>
      </Alert>
    );
  }

  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <Group gap="sm" role="group" aria-label="Channels">
      {channels.map((c) => {
        const isSelected = selected.includes(c.id);
        const unhealthy = c.health !== "OK";
        const disabled = readOnly || (unhealthy && !isSelected);
        const label = unhealthy
          ? `${c.name} needs to be reconnected before you can post to it`
          : `${c.name} · ${NETWORK_LABELS[c.network]}${c.username ? ` (@${c.username})` : ""}`;
        return (
          <Tooltip key={c.id} label={label} withArrow multiline maw={260}>
            <UnstyledButton
              onClick={() => !disabled && toggle(c.id)}
              aria-pressed={isSelected}
              aria-label={label}
              aria-disabled={disabled}
              style={{
                position: "relative",
                borderRadius: "50%",
                padding: 3,
                cursor: disabled ? "not-allowed" : "pointer",
                outline: isSelected ? "2px solid var(--mantine-primary-color-filled)" : "2px solid transparent",
                outlineOffset: 1,
                transition: "outline-color 120ms ease",
              }}
            >
              <ChannelAvatar channel={c} size={40} tooltip={false} dimmed={!isSelected || unhealthy} />
              {isSelected && (
                <span
                  style={{
                    position: "absolute",
                    top: -2,
                    right: -2,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "var(--mantine-primary-color-filled)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "2px solid var(--mantine-color-body)",
                  }}
                >
                  <IconCheck size={10} color="white" stroke={3} />
                </span>
              )}
            </UnstyledButton>
          </Tooltip>
        );
      })}
    </Group>
  );
}
