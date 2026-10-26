"use client";

import { Badge, type BadgeProps } from "@mantine/core";
import { STATUS_LABELS, type PostStatus } from "@postline/core";
import { STATUS_COLORS } from "./utils";

export function StatusBadge({ status, ...rest }: { status: PostStatus } & BadgeProps) {
  return (
    <Badge color={STATUS_COLORS[status]} variant="light" radius="sm" {...rest}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
