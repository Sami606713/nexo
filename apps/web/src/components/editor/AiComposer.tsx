"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Anchor, Badge, Button, Group, Paper, SegmentedControl, Select, Stack, Switch, Text, Textarea, Title, Tooltip } from "@mantine/core";
import { getHotkeyHandler } from "@mantine/hooks";
import { IconArrowLeft, IconPhoto, IconSparkles } from "@tabler/icons-react";
import { CREDIT_COST, type Length, type Tone } from "@postline/core";
import { api } from "@/lib/fetcher";
import { useBrand } from "@/components/shell/BrandContext";
import { IdeaChips } from "@/components/posts/IdeaChips";
import { notifyError, useBrandChannels, useHashtagLibraries } from "@/components/posts/utils";
import { ChannelPicker } from "./ChannelPicker";
import { TONE_OPTIONS } from "./AiBubbleMenu";

/** AI post composer: prompt → POST /ai/post → editor. */
export function AiComposer({ initialPrompt = "" }: { initialPrompt?: string }) {
  const brand = useBrand();
  const brandId = brand.brandId;
  const router = useRouter();
  const { channels, isLoading } = useBrandChannels(brandId);
  const { libraries } = useHashtagLibraries(brandId);

  const [prompt, setPrompt] = useState(initialPrompt);
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [includeHashtags, setIncludeHashtags] = useState(true);
  const [libraryId, setLibraryId] = useState<string | null>(null);
  const [tone, setTone] = useState<Tone>("friendly");
  const [length, setLength] = useState<Length>("medium");
  const [busy, setBusy] = useState(false);
  const [withImages, setWithImages] = useState(false);
  const [imagesCount, setImagesCount] = useState(1);
  const images = withImages ? imagesCount : 0;
  const cost = CREDIT_COST.caption + images * CREDIT_COST.image;

  async function generate() {
    if (prompt.trim().length < 3) return notifyError(new Error("Describe the post you want to create"));
    setBusy(true);
    try {
      const res = await api<{ groupId: string; imagesError?: string }>(`/api/brands/${brandId}/ai/post`, "POST", {
        prompt,
        channelIds,
        tone,
        length,
        includeHashtags,
        hashtagLibraryId: includeHashtags ? libraryId : null,
        imagesCount: images,
      });
      if (res.imagesError) notifyError(new Error(`${res.imagesError}. Your caption is ready — you can add images in the editor.`), brandId);
      router.push(`/app/${brandId}/posts/${res.groupId}`);
    } catch (err) {
      notifyError(err, brandId);
      setBusy(false);
    }
  }

  return (
    <Stack maw={860} mx="auto" p={{ base: "sm", sm: "md" }} gap="md">
      <Group gap="xs">
        <Anchor component={Link} href={`/app/${brandId}/planner`} c="dimmed" size="sm">
          <Group gap={4}>
            <IconArrowLeft size={16} /> Planner
          </Group>
        </Anchor>
      </Group>
      <Group gap="xs">
        <IconSparkles size={26} color="var(--mantine-color-violet-filled)" />
        <Title order={2}>Create a post with AI</Title>
      </Group>
      <Text c="dimmed" size="sm">
        Written in {brand.name}&apos;s voice. You&apos;ll be able to edit everything before it goes out.
      </Text>

      <Paper withBorder radius="md" p="md">
        <Stack gap="md">
          <Textarea
            aria-label="Prompt"
            placeholder="Describe the post you want to create..."
            autosize
            minRows={4}
            maxRows={12}
            maxLength={4000}
            value={prompt}
            onChange={(e) => setPrompt(e.currentTarget.value)}
            onKeyDown={getHotkeyHandler([["mod+Enter", generate]])}
            data-autofocus
            disabled={busy}
          />
          {!prompt.trim() && (
            <Stack gap={6}>
              <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                Need inspiration?
              </Text>
              <IdeaChips onPick={setPrompt} />
            </Stack>
          )}

          <Stack gap={6}>
            <Text size="sm" fw={500}>
              Channels
            </Text>
            <ChannelPicker brandId={brandId} channels={channels} loading={isLoading} selected={channelIds} onChange={setChannelIds} readOnly={busy} />
          </Stack>

          <Group gap="md" align="flex-end" wrap="wrap">
            <Select
              label="Tone"
              w={170}
              allowDeselect={false}
              data={TONE_OPTIONS}
              value={tone}
              onChange={(v) => v && setTone(v as Tone)}
              disabled={busy}
            />
            <Stack gap={4}>
              <Text size="sm" fw={500} id="ai-length">
                Length
              </Text>
              <SegmentedControl
                aria-labelledby="ai-length"
                value={length}
                onChange={(v) => setLength(v as Length)}
                disabled={busy}
                data={[
                  { value: "short", label: "Short" },
                  { value: "medium", label: "Medium" },
                  { value: "long", label: "Long" },
                ]}
              />
            </Stack>
            <Switch label="Hashtags" checked={includeHashtags} onChange={(e) => setIncludeHashtags(e.currentTarget.checked)} disabled={busy} mb={8} />
            {includeHashtags && libraries.length > 0 && (
              <Select
                label="Hashtag library"
                placeholder="Let AI choose"
                clearable
                w={200}
                data={libraries.map((l) => ({ value: l.id, label: l.name }))}
                value={libraryId}
                onChange={setLibraryId}
                disabled={busy}
              />
            )}
          </Group>

          <Group gap="md" align="center" wrap="wrap">
            <Switch
              label="Images"
              description="AI-generated visuals attached to the post"
              checked={withImages}
              onChange={(e) => setWithImages(e.currentTarget.checked)}
              disabled={busy}
              thumbIcon={<IconPhoto size={10} />}
            />
            {withImages && (
              <SegmentedControl
                aria-label="Number of images"
                value={String(imagesCount)}
                onChange={(v) => setImagesCount(Number(v))}
                disabled={busy}
                data={["1", "2", "3", "4"]}
              />
            )}
          </Group>

          <Group justify="space-between">
            <Tooltip label={`1 credit for the caption${images ? ` + ${images * CREDIT_COST.image} for ${images} image${images > 1 ? "s" : ""}` : ""}`} withArrow>
              <Badge variant="light" color="violet" size="lg">
                {cost} credit{cost > 1 ? "s" : ""}
              </Badge>
            </Tooltip>
            <Button size="md" leftSection={<IconSparkles size={18} />} loading={busy} onClick={generate} disabled={!prompt.trim()}>
              {busy && images ? "Writing & painting…" : "Generate"}
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
