"use client";

import { Accordion, Group, Paper, SegmentedControl, Select, Stack, Switch, Text, TextInput } from "@mantine/core";
import { NETWORK_LABELS, type Network } from "@postline/core";
import type { ChannelDTO, InstagramOptions, NotionOptions, PinterestOptions, RedditOptions, TikTokOptions } from "@/lib/posts/types";
import { NetworkIcon } from "@/components/posts/NetworkIcon";

const SUPPORTED: Network[] = ["INSTAGRAM", "TIKTOK", "PINTEREST", "REDDIT", "NOTION"];

interface Props {
  networks: Network[];
  /** Selected channels; their `extras` carry account data such as Pinterest boards and Notion pages. */
  channels?: ChannelDTO[];
  options: Record<string, Record<string, unknown>>;
  onChange: (network: Network, value: Record<string, unknown>) => void;
  readOnly?: boolean;
}

interface NamedId {
  id: string;
  name: string;
}

/** `extras[key]` lists ({id, name}[]) from all selected channels of a network, de-duplicated. */
function extrasList(channels: ChannelDTO[] | undefined, network: Network, key: string): NamedId[] {
  const out = new Map<string, NamedId>();
  for (const c of channels ?? []) {
    if (c.network !== network) continue;
    const list = (c.extras as Record<string, unknown> | undefined)?.[key];
    if (Array.isArray(list))
      for (const item of list as NamedId[]) if (item && typeof item.id === "string") out.set(item.id, { id: item.id, name: String(item.name ?? item.id) });
  }
  return [...out.values()];
}

/** Network-specific options stored under PostGroup.options[network]. */
export function NetworkOptions({ networks, channels, options, onChange, readOnly }: Props) {
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
              {n === "PINTEREST" && (
                <PinterestFields
                  value={(options[n] ?? {}) as PinterestOptions}
                  boards={extrasList(channels, n, "boards")}
                  onChange={(p) => set(n, p)}
                  readOnly={readOnly}
                />
              )}
              {n === "REDDIT" && <RedditFields value={(options[n] ?? {}) as RedditOptions} onChange={(p) => set(n, p)} readOnly={readOnly} />}
              {n === "NOTION" && (
                <NotionFields
                  value={(options[n] ?? {}) as NotionOptions}
                  pages={extrasList(channels, n, "pages")}
                  onChange={(p) => set(n, p)}
                  readOnly={readOnly}
                />
              )}
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

function PinterestFields({
  value,
  boards,
  onChange,
  readOnly,
}: {
  value: PinterestOptions;
  boards: NamedId[];
  onChange: (p: PinterestOptions) => void;
  readOnly?: boolean;
}) {
  return (
    <Stack gap="sm">
      {boards.length ? (
        <Select
          label="Board"
          description="Leave empty to use your first board"
          placeholder={boards[0]?.name}
          clearable
          disabled={readOnly}
          value={value.boardId ?? null}
          onChange={(v) => onChange({ boardId: v ?? undefined })}
          data={boards.map((b) => ({ value: b.id, label: b.name }))}
        />
      ) : (
        <TextInput
          label="Board ID"
          description="Leave empty to use your first board"
          disabled={readOnly}
          value={value.boardId ?? ""}
          onChange={(e) => onChange({ boardId: e.currentTarget.value || undefined })}
        />
      )}
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

function RedditFields({ value, onChange, readOnly }: { value: RedditOptions; onChange: (p: RedditOptions) => void; readOnly?: boolean }) {
  return (
    <Stack gap="sm">
      <TextInput
        label="Subreddit"
        placeholder="coffee"
        leftSection={<Text size="sm" c="dimmed">r/</Text>}
        withAsterisk
        disabled={readOnly}
        value={value.subreddit ?? ""}
        onChange={(e) => onChange({ subreddit: e.currentTarget.value.replace(/^\/?r\//i, "") || undefined })}
      />
      <TextInput
        label="Title"
        description="Leave empty to use the first line of the caption (max 300 characters)"
        maxLength={300}
        disabled={readOnly}
        value={value.title ?? ""}
        onChange={(e) => onChange({ title: e.currentTarget.value || undefined })}
      />
      <TextInput
        label="Link"
        description="Set a URL to make this a link post instead of a text post"
        placeholder="https://"
        type="url"
        disabled={readOnly}
        value={value.link ?? ""}
        onChange={(e) => onChange({ link: e.currentTarget.value || undefined })}
      />
      <TextInput
        label="Flair ID"
        description="Required by some subreddits"
        disabled={readOnly}
        value={value.flairId ?? ""}
        onChange={(e) => onChange({ flairId: e.currentTarget.value || undefined })}
      />
    </Stack>
  );
}

function NotionFields({
  value,
  pages,
  onChange,
  readOnly,
}: {
  value: NotionOptions;
  pages: NamedId[];
  onChange: (p: NotionOptions) => void;
  readOnly?: boolean;
}) {
  return (
    <Stack gap="sm">
      <Select
        label="Parent page"
        description="The post is created as a new page inside this one"
        placeholder={pages[0] ? `${pages[0].name} (default)` : "First shared page"}
        clearable
        searchable
        disabled={readOnly}
        value={value.parentPageId ?? null}
        onChange={(v) => onChange({ parentPageId: v ?? undefined })}
        data={pages.map((p) => ({ value: p.id, label: p.name }))}
      />
      <TextInput
        label="Page title"
        description="Leave empty to use the first line of the caption"
        disabled={readOnly}
        value={value.title ?? ""}
        onChange={(e) => onChange({ title: e.currentTarget.value || undefined })}
      />
    </Stack>
  );
}
