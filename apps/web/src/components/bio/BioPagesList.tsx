"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useDebouncedValue } from "@mantine/hooks";
import { ActionIcon, Badge, Button, Card, CopyButton, Group, Modal, SimpleGrid, Skeleton, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import { IconCheck, IconCopy, IconExternalLink, IconEye, IconLink, IconPlus, IconClick } from "@tabler/icons-react";
import { api } from "@/lib/fetcher";
import { useBrand } from "@/components/shell/BrandContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { notifyError } from "@/components/ui/notify";
import { BioPageView } from "./BioPageView";
import { normalizeBlocks, normalizeTheme } from "./types";

export interface BioPageDto {
  id: string;
  slug: string;
  title: string;
  bio: string | null;
  avatarUrl: string | null;
  theme: unknown;
  blocks: unknown;
  published: boolean;
  updatedAt: string;
  stats?: { views: number; clicks: number };
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40)
    .replace(/^-|-$/g, "");

export function useSlugCheck(brandId: string, slug: string, excludeId?: string) {
  const [debounced] = useDebouncedValue(slug, 350);
  const key = debounced ? `/api/brands/${brandId}/bio-pages/check-slug?slug=${encodeURIComponent(debounced)}${excludeId ? `&excludeId=${excludeId}` : ""}` : null;
  const { data, isLoading } = useSWR<{ available: boolean; reason: string | null }>(key);
  const pending = slug !== debounced || isLoading;
  return { pending, available: !pending && !!data?.available, reason: pending ? null : (data?.reason ?? null) };
}

export function BioPagesList() {
  const b = useBrand();
  const router = useRouter();
  const { data, isLoading } = useSWR<BioPageDto[]>(`/api/brands/${b.brandId}/bio-pages`);
  const [open, setOpen] = useState(false);
  const canEdit = b.can("posts.write");
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <>
      <PageHeader
        title="Bio pages"
        description="One link for your profiles: a mobile page with your links, socials and content — with click analytics."
        actions={
          canEdit && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setOpen(true)}>
              New bio page
            </Button>
          )
        }
      />
      {isLoading || !data ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h={320} radius="lg" />
          ))}
        </SimpleGrid>
      ) : data.length === 0 ? (
        <EmptyState
          icon={<IconLink size={26} />}
          title="Create your first bio page"
          description="Put one link in your Instagram, TikTok or Bluesky bio and send people anywhere: your shop, events, newest post."
          action={
            canEdit && (
              <Button leftSection={<IconPlus size={16} />} onClick={() => setOpen(true)}>
                New bio page
              </Button>
            )
          }
        />
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
          {data.map((p) => (
            <Card key={p.id} withBorder radius="lg" padding={0} style={{ overflow: "hidden" }}>
              <Link href={`/app/${b.brandId}/bio/${p.id}`} style={{ display: "block", height: 220, overflow: "hidden", position: "relative" }}>
                <div style={{ transform: "scale(0.62)", transformOrigin: "top center", height: 360, pointerEvents: "none" }}>
                  <BioPageView preview title={p.title} bio={p.bio} avatarUrl={p.avatarUrl} theme={normalizeTheme(p.theme)} blocks={normalizeBlocks(p.blocks).slice(0, 4)} />
                </div>
              </Link>
              <Stack gap={6} p="md">
                <Group justify="space-between" wrap="nowrap">
                  <Text fw={600} truncate component={Link} href={`/app/${b.brandId}/bio/${p.id}`}>
                    {p.title}
                  </Text>
                  <Badge variant="light" color={p.published ? "teal" : "gray"}>
                    {p.published ? "Live" : "Draft"}
                  </Badge>
                </Group>
                <Group gap={4} wrap="nowrap">
                  <Text size="sm" c="dimmed" truncate>
                    /b/{p.slug}
                  </Text>
                  <CopyButton value={`${origin}/b/${p.slug}`}>
                    {({ copied, copy }) => (
                      <Tooltip label={copied ? "Copied" : "Copy link"}>
                        <ActionIcon variant="subtle" size="sm" color={copied ? "teal" : "gray"} onClick={copy}>
                          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </CopyButton>
                  {p.published && (
                    <Tooltip label="Open public page">
                      <ActionIcon variant="subtle" size="sm" color="gray" component="a" href={`/b/${p.slug}`} target="_blank">
                        <IconExternalLink size={14} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
                <Group gap="md">
                  <Group gap={4}>
                    <IconEye size={14} color="var(--mantine-color-dimmed)" />
                    <Text size="xs" c="dimmed">
                      {(p.stats?.views ?? 0).toLocaleString()} views
                    </Text>
                  </Group>
                  <Group gap={4}>
                    <IconClick size={14} color="var(--mantine-color-dimmed)" />
                    <Text size="xs" c="dimmed">
                      {(p.stats?.clicks ?? 0).toLocaleString()} clicks · 30d
                    </Text>
                  </Group>
                </Group>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      )}
      <CreateModal opened={open} onClose={() => setOpen(false)} onCreated={(id) => router.push(`/app/${b.brandId}/bio/${id}`)} />
    </>
  );
}

function CreateModal({ opened, onClose, onCreated }: { opened: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const b = useBrand();
  const [title, setTitle] = useState(b.name);
  const [slug, setSlug] = useState(slugify(b.name));
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const check = useSlugCheck(b.brandId, slug);
  useEffect(() => {
    if (!touched) setSlug(slugify(title));
  }, [title, touched]);

  const submit = async () => {
    setBusy(true);
    try {
      const p = await api<{ id: string }>(`/api/brands/${b.brandId}/bio-pages`, "POST", { title, slug });
      onCreated(p.id);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="New bio page" radius="lg">
      <Stack>
        <TextInput label="Page title" value={title} onChange={(e) => setTitle(e.currentTarget.value)} required data-autofocus />
        <SlugInput slug={slug} onChange={(s) => (setTouched(true), setSlug(s))} check={check} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} disabled={!title.trim() || !check.available}>
            Create page
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function SlugInput({ slug, onChange, check }: { slug: string; onChange: (s: string) => void; check: ReturnType<typeof useSlugCheck> }) {
  const origin = typeof window !== "undefined" ? window.location.host : "";
  return (
    <TextInput
      label="Page address"
      leftSection={
        <Text size="sm" c="dimmed" pl={8} style={{ whiteSpace: "nowrap" }}>
          {origin}/b/
        </Text>
      }
      leftSectionWidth={Math.max(60, (origin.length + 3) * 7.4 + 12)}
      value={slug}
      onChange={(e) => onChange(e.currentTarget.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
      error={check.reason ?? undefined}
      description={check.pending ? "Checking…" : check.available ? "✓ Available" : undefined}
      styles={{ description: { color: check.available ? "var(--mantine-color-teal-6)" : undefined } }}
    />
  );
}
