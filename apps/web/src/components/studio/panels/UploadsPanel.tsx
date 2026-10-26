"use client";

import { useState } from "react";
import useSWRInfinite from "swr/infinite";
import { Button, FileButton, Image, Loader, SimpleGrid, Skeleton, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconUpload } from "@tabler/icons-react";
import { notifyError } from "@/components/ui/notify";
import { canvasSrc, uploadMedia, type MediaItem } from "../client";
import { useStudio } from "../context";
import { useStore } from "../store";
import { PanelTitle, addImageLayer } from "./common";

type Page = { items: MediaItem[]; nextCursor: string | null };

export function useMediaLibrary(brandId: string) {
  return useSWRInfinite<Page>((i, prev: Page | null) => {
    if (prev && !prev.nextCursor) return null;
    return `/api/brands/${brandId}/media?limit=40${prev?.nextCursor ? `&cursor=${prev.nextCursor}` : ""}`;
  });
}

export function UploadsPanel() {
  const { brandId } = useStudio();
  const store = useStore();
  const { data, isLoading, size, setSize, mutate } = useMediaLibrary(brandId);
  const [uploading, setUploading] = useState(0);
  const images = (data ?? []).flatMap((p) => p.items).filter((m) => m.mime.startsWith("image/"));
  const hasMore = !!data?.[data.length - 1]?.nextCursor;

  const upload = async (files: File[]) => {
    setUploading((n) => n + files.length);
    for (const f of files) {
      try {
        const m = await uploadMedia(brandId, f);
        await addImageLayer(store, m);
      } catch (err) {
        notifyError(err, "Upload failed");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    void mutate();
  };

  return (
    <Stack gap="sm">
      <PanelTitle title="Uploads" hint="Your brand's media library. Drop images onto the canvas too." />
      <FileButton onChange={(f) => f.length && upload(f)} accept="image/png,image/jpeg,image/webp,image/gif" multiple>
        {(props) => (
          <Button {...props} leftSection={uploading ? <Loader size={14} color="white" /> : <IconUpload size={16} />} fullWidth>
            {uploading ? `Uploading ${uploading}…` : "Upload images"}
          </Button>
        )}
      </FileButton>
      {isLoading && (
        <SimpleGrid cols={2} spacing={8}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} h={110} radius="md" />
          ))}
        </SimpleGrid>
      )}
      {!isLoading && images.length === 0 && (
        <Text size="sm" c="dimmed" ta="center" py="lg">
          No images yet. Upload a photo or logo to get started.
        </Text>
      )}
      <SimpleGrid cols={2} spacing={8}>
        {images.map((m) => (
          <UnstyledButton key={m.id} className="studio-tile" onClick={() => addImageLayer(store, m)} style={{ borderRadius: 10, overflow: "hidden" }} aria-label="Add image">
            <Image src={canvasSrc(m.url)} alt="" h={110} fit="cover" radius="md" loading="lazy" />
          </UnstyledButton>
        ))}
      </SimpleGrid>
      {hasMore && (
        <Button variant="subtle" size="xs" onClick={() => setSize(size + 1)}>
          Load more
        </Button>
      )}
    </Stack>
  );
}
