"use client";

import { Button, Group } from "@mantine/core";
import { IconSparkles } from "@tabler/icons-react";

export const POST_IDEAS = [
  "Share a behind-the-scenes look at how we work",
  "Announce a new product feature with 3 key benefits",
  "Give 5 quick tips our audience can use today",
  "Celebrate a customer success story",
  "Ask our audience a question to spark discussion",
  "Share a lesson we learned the hard way",
];

export function IdeaChips({ onPick, ideas = POST_IDEAS }: { onPick: (idea: string) => void; ideas?: string[] }) {
  return (
    <Group gap="xs">
      {ideas.map((idea) => (
        <Button
          key={idea}
          size="compact-sm"
          variant="default"
          radius="xl"
          leftSection={<IconSparkles size={14} />}
          onClick={() => onPick(idea)}
          styles={{ label: { whiteSpace: "normal", textAlign: "left" } }}
        >
          {idea}
        </Button>
      ))}
    </Group>
  );
}
