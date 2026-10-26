"use client";

import { Accordion, Group, Paper, SegmentedControl, Select, Stack, Switch, Text, TextInput } from "@mantine/core";
import { NETWORK_LABELS, type Network } from "@postline/core";
import type { InstagramOptions, PinterestOptions, TikTokOptions } from "@/lib/posts/types";
import { NetworkIcon } from "@/components/posts/NetworkIcon";

const SUPPORTED: Network[] = ["INSTAGRAM", "TIKTOK", "PINTEREST"];

interface Props {
  networks: Network[];
  options: Record<string, Record<string, unknown>>;
  onChange: (network: Network, value: Record<string, unknown>) => void;
  readOnly?: boolean;
}

/** Network-specific options stored under PostGroup.options[network]. */
export function NetworkOptions({ networks, options, onChange, readOnly }: Props) {
  const present = SUPPORTED.filter((n) => networks.includes(n));
  if (!present.length) return null;

  const set = (n: Network, patch: object) => onChange(n, { ...(options[n] ?? {}), ...patch });

  return (
    <Paper withBorder radius="md" p={0}>
      <Accordion variant="default" multiple defaultValue={present}>
        {present.map((n) => (
          <Accordion.Item key={n} value={n}>
            <Accordion.Control icon={<NetworkIcon network={n} size={18} />}>
              <Text size="sm" fw={600}>
                {NETWORK_LABELS[n]} options
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              {n === "INSTAGRAM" && <InstagramFields value={(options[n] ?? {}) as InstagramOptions} onChange={(p) => set(n, p)} readOnly={readOnly} />}
              {n === "TIKTOK" && <TikTokFields value={(options[n] ?? {}) as TikTokOptions} onChange={(p) => set(n, p)} readOnly={readOnly} />}
              {n === "PINTEREST" && <PinterestFields value={(options[n] ?? {}) as PinterestOptions} onChange={(p) => set(n, p)} readOnly={readOnly} />}
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Paper>
  );
}

function InstagramFields({ value, onChange, readOnly }: { value: InstagramOptions; onChange: (p: InstagramOptions) => void; readOnly?: boolean }) {
  return (
    <Stack gap={4}>
      <Text size="sm" fw={500} id="ig-placement">
        Placement
      </Text>
      <SegmentedControl
        aria-labelledby="ig-placement"
        disabled={readOnly}
        value={value.placement ?? "feed"}
        onChange={(v) => onChange({ placement: v as InstagramOptions["placement"] })}
        data={[
          { value: "feed", label: "Feed" },
          { value: "reel", label: "Reel" },
          { value: "story", label: "Story" },
        ]}
      />
    </Stack>
  );
}

function TikTokFields({ value, onChange, readOnly }: { value: TikTokOptions; onChange: (p: TikTokOptions) => void; readOnly?: boolean }) {
  return (
    <Stack gap="sm">
      <Select
        label="Who can view this video"
        disabled={readOnly}
        allowDeselect={false}
        value={value.privacy ?? "PUBLIC_TO_EVERYONE"}
        onChange={(v) => onChange({ privacy: (v ?? "PUBLIC_TO_EVERYONE") as TikTokOptions["privacy"] })}
        data={[
          { value: "PUBLIC_TO_EVERYONE", label: "Everyone" },
          { value: "MUTUAL_FOLLOW_FRIENDS", label: "Friends" },
          { value: "FOLLOWER_OF_CREATOR", label: "Followers" },
          { value: "SELF_ONLY", label: "Only me" },
        ]}
      />
      <Group gap="lg">
        <Switch label="Allow comments" disabled={readOnly} checked={value.allowComments ?? true} onChange={(e) => onChange({ allowComments: e.currentTarget.checked })} />
        <Switch label="Allow Duet" disabled={readOnly} checked={value.allowDuet ?? true} onChange={(e) => onChange({ allowDuet: e.currentTarget.checked })} />
        <Switch label="Allow Stitch" disabled={readOnly} checked={value.allowStitch ?? true} onChange={(e) => onChange({ allowStitch: e.currentTarget.checked })} />
      </Group>
    </Stack>
  );
}

function PinterestFields({ value, onChange, readOnly }: { value: PinterestOptions; onChange: (p: PinterestOptions) => void; readOnly?: boolean }) {
  return (
    <Stack gap="sm">
      <TextInput
        label="Board ID"
        description="The board this Pin will be saved to"
        disabled={readOnly}
        value={value.boardId ?? ""}
        onChange={(e) => onChange({ boardId: e.currentTarget.value || undefined })}
      />
      <TextInput
        label="Destination link"
        placeholder="https://"
        type="url"
        disabled={readOnly}
        value={value.link ?? ""}
        onChange={(e) => onChange({ link: e.currentTarget.value || undefined })}
      />
    </Stack>
  );
}
