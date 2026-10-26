"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Group, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconPencilPlus, IconSparkles } from "@tabler/icons-react";
import { IdeaChips } from "@/components/posts/IdeaChips";

export function PlannerEmpty({ brandId, canWrite, filtered, past }: { brandId: string; canWrite: boolean; filtered?: boolean; past?: boolean }) {
  const router = useRouter();
  if (filtered || past || !canWrite) {
    return (
      <Text c="dimmed" ta="center" py="xl" size="sm">
        {filtered ? "No posts match these filters." : past ? "No past posts yet." : "Nothing scheduled yet."}
      </Text>
    );
  }
  return (
    <Card withBorder radius="lg" p="xl" maw={720} mx="auto" w="100%">
      <Stack align="center" gap="md">
        <ThemeIcon size={56} radius="xl" variant="light" color="violet">
          <IconSparkles size={30} />
        </ThemeIcon>
        <Title order={3} ta="center">
          Create a post with AI
        </Title>
        <Text c="dimmed" ta="center" size="sm" maw={460}>
          Describe what you want to share and we&apos;ll draft it in your brand voice, tailored to each channel.
        </Text>
        <IdeaChips onPick={(idea) => router.push(`/app/${brandId}/posts/ai?prompt=${encodeURIComponent(idea)}`)} />
        <Group>
          <Button component={Link} href={`/app/${brandId}/posts/ai`} leftSection={<IconSparkles size={16} />}>
            Create with AI
          </Button>
          <Button component={Link} href={`/app/${brandId}/posts/new`} variant="default" leftSection={<IconPencilPlus size={16} />}>
            Write it yourself
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
