"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Anchor, Image, LoadingOverlay, SegmentedControl, SimpleGrid, Skeleton, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconSearch } from "@tabler/icons-react";
import { api } from "@/lib/fetcher";
import { notifyError } from "@/components/ui/notify";
import type { MediaItem } from "../client";
import { useStudio } from "../context";
import { useStore } from "../store";
import { PanelTitle, addImageLayer } from "./common";

interface StockPhoto {
  provider: "unsplash" | "pexels";
  id: string;
  thumb: string;
  full: string;
  width: number;
  height: number;
  author: string;
  authorUrl: string;
  downloadLocation?: string;
}

type StockResponse = { providers: { unsplash: boolean; pexels: boolean }; provider?: string; items: StockPhoto[] };

export function useStockProviders(brandId: string) {
  const { data } = useSWR<StockResponse>(`/api/brands/${brandId}/stock?probe=1`);
  return data?.providers ?? { unsplash: false, pexels: false };
}

export function PhotosPanel() {
  const { brandId } = useStudio();
  const store = useStore();
  const providers = useStockProviders(brandId);
  const [provider, setProvider] = useState<"unsplash" | "pexels">(providers.unsplash ? "unsplash" : "pexels");
  useEffect(() => setProvider(providers.unsplash ? "unsplash" : "pexels"), [providers.unsplash]);
  const [q, setQ] = useState("");
  const [dq] = useDebouncedValue(q, 400);
  const { data, isLoading, error } = useSWR<StockResponse>(`/api/brands/${brandId}/stock?provider=${provider}&q=${encodeURIComponent(dq)}`);
  const [busy, setBusy] = useState(false);

  const pick = async (p: StockPhoto) => {
    setBusy(true);
    try {
      const m = await api<MediaItem>(`/api/brands/${brandId}/stock/import`, "POST", {
        provider: p.provider,
        url: p.full,
        downloadLocation: p.downloadLocation,
        alt: `Photo by ${p.author}`,
      });
      await addImageLayer(store, m);
    } catch (err) {
      notifyError(err, "Couldn't add that photo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="sm" pos="relative">
      <LoadingOverlay visible={busy} overlayProps={{ blur: 1 }} />
      <PanelTitle title="Photos" hint="Free stock photos. Added photos are saved to your library." />
      {providers.unsplash && providers.pexels && (
        <SegmentedControl size="xs" value={provider} onChange={(v) => setProvider(v as "unsplash" | "pexels")} data={[{ value: "unsplash", label: "Unsplash" }, { value: "pexels", label: "Pexels" }]} />
      )}
      <TextInput size="sm" placeholder="Search photos" leftSection={<IconSearch size={15} />} value={q} onChange={(e) => setQ(e.currentTarget.value)} />
      {error && (
        <Text size="sm" c="red">
          {error.message}
        </Text>
      )}
      <SimpleGrid cols={2} spacing={8}>
        {isLoading && Array.from({ length: 8 }, (_, i) => <Skeleton key={i} h={110} radius="md" />)}
        {data?.items.map((p) => (
          <Stack key={`${p.provider}-${p.id}`} gap={2}>
            <UnstyledButton className="studio-tile" onClick={() => pick(p)} style={{ borderRadius: 10, overflow: "hidden" }} aria-label={`Add photo by ${p.author}`}>
              <Image src={p.thumb} alt={`Photo by ${p.author}`} h={110} fit="cover" radius="md" loading="lazy" />
            </UnstyledButton>
            <Anchor href={p.authorUrl} target="_blank" rel="noreferrer" size="10px" c="dimmed" truncate>
              {p.author}
            </Anchor>
          </Stack>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
