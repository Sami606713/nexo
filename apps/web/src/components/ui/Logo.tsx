import { Group, Text, ThemeIcon } from "@mantine/core";
import { IconSend2 } from "@tabler/icons-react";

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const icon = size === "lg" ? 36 : size === "sm" ? 24 : 28;
  return (
    <Group gap={8} wrap="nowrap">
      <ThemeIcon size={icon} radius="md" color="indigo">
        <IconSend2 size={icon * 0.6} />
      </ThemeIcon>
      <Text fw={800} fz={size === "lg" ? 24 : size === "sm" ? 16 : 19} style={{ letterSpacing: -0.5 }}>
        {process.env.NEXT_PUBLIC_APP_NAME ?? "Nexo"}
      </Text>
    </Group>
  );
}
