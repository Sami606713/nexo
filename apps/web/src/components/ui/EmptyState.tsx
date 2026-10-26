import type { ReactNode } from "react";
import { Paper, Stack, Text, ThemeIcon, Title } from "@mantine/core";

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <Paper withBorder radius="lg" p="xl" style={{ borderStyle: "dashed" }}>
      <Stack align="center" gap="sm" py="lg" ta="center">
        <ThemeIcon size={56} radius="xl" variant="light">
          {icon}
        </ThemeIcon>
        <Title order={4}>{title}</Title>
        {description && (
          <Text c="dimmed" size="sm" maw={420}>
            {description}
          </Text>
        )}
        {action}
      </Stack>
    </Paper>
  );
}
