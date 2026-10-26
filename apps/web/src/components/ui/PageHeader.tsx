import type { ReactNode } from "react";
import { Group, Stack, Text, Title } from "@mantine/core";

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <Group justify="space-between" align="flex-start" mb="lg" gap="md">
      <Stack gap={4}>
        <Title order={2}>{title}</Title>
        {description && (
          <Text c="dimmed" size="sm">
            {description}
          </Text>
        )}
      </Stack>
      {actions && <Group gap="sm">{actions}</Group>}
    </Group>
  );
}
