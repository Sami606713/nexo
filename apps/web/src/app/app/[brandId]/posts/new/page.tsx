import { prisma } from "@postline/db";
import { requireBrand } from "@/lib/session";
import { toMediaDTO } from "@/lib/posts/dto";
import { PostEditor } from "@/components/editor/PostEditor";

export default async function NewPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<{ date?: string; channelId?: string; mediaId?: string }>;
}) {
  const { brandId } = await params;
  await requireBrand(brandId, "posts.write");
  const sp = await searchParams;
  // ?mediaId= pre-attaches a brand media item (e.g. a Studio export via "Use in post").
  const media = sp.mediaId ? await prisma.mediaAsset.findFirst({ where: { id: sp.mediaId, brandId } }) : null;
  return (
    <PostEditor
      initialDate={sp.date}
      initialChannelId={sp.channelId}
      initialMedia={media ? [toMediaDTO(media)] : undefined}
    />
  );
}
