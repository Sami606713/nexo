"use client";

import { Group, Paper, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconAlertTriangle, IconCircleCheck, IconCircleX } from "@tabler/icons-react";
import { NETWORK_LIMITS, countCharacters, type ValidationIssue } from "@postline/core";
import type { ChannelDTO } from "@/lib/posts/types";
import { ChannelAvatar } from "@/components/posts/ChannelAvatar";

export interface ChannelCheck {
  channel: ChannelDTO;
  caption: string;
  customized: boolean;
  issues: ValidationIssue[];
}

/** Live per-channel character counters and validation issues. */
export function ChannelChecks({ checks }: { checks: ChannelCheck[] }) {
  if (!checks.length) return null;
  return (
    <Paper withBorder radius="md" p="sm">
      <Stack gap={8}>
        {checks.map(({ channel, caption, customized, issues }) => {
          const limits = NETWORK_LIMITS[channel.network];
          const count = countCharacters(channel.network, caption);
          const over = count > (limits.captionHard ?? limits.caption);
          const thread = !over && count > limits.caption && !!limits.captionHard;
          const errors = issues.filter((i) => i.level === "error");
          const warnings = issues.filter((i) => i.level === "warning");
          return (
            <Group key={channel.id} gap="sm" wrap="nowrap" align="flex-start">
              <ChannelAvatar channel={channel} size={24} />
              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                <Group gap={6} justify="space-between" wrap="nowrap">
                  <Text size="sm" fw={500} truncate>
                    {channel.name}
                    {customized && (
                      <Text span size="xs" c="indigo" ml={6}>
                        customized
                      </Text>
                    )}
                  </Text>
                  <Text
                    size="xs"
                    c={over ? "red" : thread ? "yellow.8" : "dimmed"}
                    fw={over ? 600 : 400}
                    aria-label={`${count} of ${limits.caption} characters`}
                    style={{ fontVariantNumeric: "tabular-nums", flexShrink: 0 }}
                  >
                    {count.toLocaleString()} / {limits.caption.toLocaleString()}
                  </Text>
                </Group>
                {errors.map((i) => (
                  <Group key={i.code + i.message} gap={4} wrap="nowrap">
                    <IconCircleX size={14} color="var(--mantine-color-red-filled)" style={{ flexShrink: 0 }} />
                    <Text size="xs" c="red">
                      {i.message}
                    </Text>
                  </Group>
                ))}
                {warnings.map((i) => (
                  <Group key={i.code + i.message} gap={4} wrap="nowrap">
                    <IconAlertTriangle size={14} color="var(--mantine-color-yellow-filled)" style={{ flexShrink: 0 }} />
                    <Text size="xs" c="yellow.8">
                      {i.message}
                    </Text>
                  </Group>
                ))}
              </Stack>
              {!errors.length && !warnings.length && (
                <ThemeIcon size="sm" variant="transparent" color="green" aria-label="Looks good">
                  <IconCircleCheck size={16} />
                </ThemeIcon>
              )}
            </Group>
          );
        })}
      </Stack>
    </Paper>
  );
}
