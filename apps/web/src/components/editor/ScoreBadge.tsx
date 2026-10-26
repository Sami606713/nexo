"use client";

import { useState } from "react";
import { Badge, Button, Group, Popover, Progress, Stack, Text, ThemeIcon, UnstyledButton } from "@mantine/core";
import { IconCheck, IconSparkles, IconX } from "@tabler/icons-react";
import type { PostScore, PostScoreCheck } from "@postline/core";

const BAND_COLORS: Record<PostScore["band"], string> = { High: "green", Strong: "teal", Fair: "yellow", Low: "red" };

interface Props {
  score: PostScore | null;
  onFix?: (checkId: PostScoreCheck["id"]) => Promise<void>;
  readOnly?: boolean;
}

/** Post score badge with a checklist popover; fixable checks get an AI "Fix" (1 credit). */
export function ScoreBadge({ score, onFix, readOnly }: Props) {
  const [fixing, setFixing] = useState<string | null>(null);
  if (!score) return null;
  const color = BAND_COLORS[score.band];
  const sorted = [...score.checks].sort((a, b) => Number(a.passed) - Number(b.passed));

  return (
    <Popover width={340} position="bottom-end" shadow="md" withArrow>
      <Popover.Target>
        <UnstyledButton aria-label={`Post score ${score.total} (${score.band}). Show suggestions`}>
          <Badge size="lg" variant="light" color={color} leftSection={<IconSparkles size={12} />} style={{ cursor: "pointer" }}>
            {score.total} · {score.band}
          </Badge>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Group justify="space-between">
            <Text fw={600} size="sm">
              Post score
            </Text>
            <Text fw={700} c={color}>
              {score.total}/100
            </Text>
          </Group>
          <Progress value={score.total} color={color} size="sm" />
          {sorted.length === 0 && (
            <Text size="xs" c="dimmed">
              Start writing to see suggestions.
            </Text>
          )}
          <Stack gap={6} mah={340} style={{ overflowY: "auto" }}>
            {sorted.map((c) => (
              <Group key={c.id} gap="xs" align="flex-start" wrap="nowrap">
                <ThemeIcon size={18} radius="xl" variant="light" color={c.passed ? "green" : "gray"}>
                  {c.passed ? <IconCheck size={12} /> : <IconX size={12} />}
                </ThemeIcon>
                <Stack gap={2} style={{ flex: 1 }}>
                  <Text size="sm" fw={500}>
                    {c.label}
                  </Text>
                  {!c.passed && c.suggestion && (
                    <Text size="xs" c="dimmed">
                      {c.suggestion}
                    </Text>
                  )}
                </Stack>
                {!c.passed && c.fixable && onFix && !readOnly && (
                  <Button
                    size="compact-xs"
                    variant="light"
                    color="violet"
                    loading={fixing === c.id}
                    disabled={!!fixing && fixing !== c.id}
                    onClick={async () => {
                      setFixing(c.id);
                      try {
                        await onFix(c.id);
                      } finally {
                        setFixing(null);
                      }
                    }}
                  >
                    Fix (1 credit)
                  </Button>
                )}
              </Group>
            ))}
          </Stack>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
