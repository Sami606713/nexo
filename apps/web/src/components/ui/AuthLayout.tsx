import type { ReactNode } from "react";
import { Box, Center, Paper, Stack, Text, Title } from "@mantine/core";
import { Logo } from "./Logo";

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <Box
      mih="100vh"
      style={{
        background:
          "radial-gradient(1200px 600px at 10% -10%, var(--mantine-color-indigo-light), transparent), radial-gradient(900px 500px at 110% 110%, var(--mantine-color-violet-light), transparent)",
      }}
    >
      <Center mih="100vh" p="md">
        <Stack w="100%" maw={420} gap="lg">
          <Center>
            <Logo size="lg" />
          </Center>
          <Paper withBorder shadow="md" radius="lg" p={{ base: "lg", sm: "xl" }}>
            <Stack gap={4} mb="lg">
              <Title order={3}>{title}</Title>
              {subtitle && (
                <Text c="dimmed" size="sm">
                  {subtitle}
                </Text>
              )}
            </Stack>
            {children}
          </Paper>
          {footer && (
            <Text ta="center" size="sm" c="dimmed">
              {footer}
            </Text>
          )}
        </Stack>
      </Center>
    </Box>
  );
}
