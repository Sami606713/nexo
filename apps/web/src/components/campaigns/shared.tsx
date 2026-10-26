"use client";

import { Badge, Box, Group, Image, type BadgeProps } from "@mantine/core";
import {
  IconBolt,
  IconCalendarEvent,
  IconDiscount2,
  IconRocket,
  IconSchool,
  IconSpeakerphone,
  IconTargetArrow,
  type Icon,
} from "@tabler/icons-react";
import type { CampaignGoal } from "@postline/core";
import { dayjs } from "@/components/posts/tz";
import type { CampaignStatus } from "./types";
import { GOALS } from "./campaignMath";

export const GOAL_ICONS: Record<CampaignGoal, Icon> = {
  awareness: IconSpeakerphone,
  leads: IconTargetArrow,
  launch: IconRocket,
  offer: IconDiscount2,
  education: IconSchool,
  event: IconCalendarEvent,
};

export const GOAL_COLORS: Record<CampaignGoal, string> = {
  awareness: "indigo",
  leads: "teal",
  launch: "violet",
  offer: "orange",
  education: "cyan",
  event: "pink",
};

export const goalLabel = (g: CampaignGoal) => GOALS.find((x) => x.value === g)?.label ?? g;

export function GoalBadge({ goal, ...rest }: { goal: CampaignGoal } & BadgeProps) {
  const GoalIcon = GOAL_ICONS[goal] ?? IconBolt;
  return (
    <Badge variant="light" color={GOAL_COLORS[goal]} leftSection={<GoalIcon size={12} />} radius="sm" {...rest}>
      {goalLabel(goal)}
    </Badge>
  );
}

const STATUS_META: Record<CampaignStatus, { label: string; color: string }> = {
  GENERATING: { label: "Generating", color: "violet" },
  READY: { label: "Ready", color: "teal" },
  ERROR: { label: "Error", color: "red" },
};

export function CampaignStatusBadge({ status, ...rest }: { status: CampaignStatus } & BadgeProps) {
  const m = STATUS_META[status];
  return (
    <Badge variant={status === "GENERATING" ? "dot" : "light"} color={m.color} radius="sm" {...rest}>
      {m.label}
    </Badge>
  );
}

/** "Oct 28 – Nov 6, 2026" */
export function formatRange(start: string, end: string): string {
  const a = dayjs(start);
  const b = dayjs(end);
  if (start === end) return a.format("MMM D, YYYY");
  if (a.year() !== b.year()) return `${a.format("MMM D, YYYY")} – ${b.format("MMM D, YYYY")}`;
  return `${a.format("MMM D")} – ${b.format(a.month() === b.month() ? "D, YYYY" : "MMM D, YYYY")}`;
}

/** Up to four thumbnails as a mosaic; falls back to a soft goal-coloured gradient. */
export function ThumbMosaic({ urls, goal, height = 120 }: { urls: string[]; goal: CampaignGoal; height?: number }) {
  const color = GOAL_COLORS[goal] ?? "violet";
  const GoalIcon = GOAL_ICONS[goal] ?? IconBolt;
  if (!urls.length) {
    return (
      <Box
        h={height}
        style={{
          background: `linear-gradient(135deg, var(--mantine-color-${color}-1), var(--mantine-color-${color}-4))`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <GoalIcon size={40} color={`var(--mantine-color-${color}-7)`} stroke={1.4} />
      </Box>
    );
  }
  return (
    <Group gap={2} h={height} wrap="nowrap" style={{ overflow: "hidden" }}>
      {urls.slice(0, 4).map((u, i) => (
        <Image key={`${i}-${u}`} src={u} alt="" h={height} fit="cover" style={{ flex: 1, minWidth: 0 }} />
      ))}
    </Group>
  );
}
