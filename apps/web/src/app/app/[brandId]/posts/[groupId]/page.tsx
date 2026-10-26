import { requireBrand } from "@/lib/session";
import { PostEditor } from "@/components/editor/PostEditor";

export default async function EditPostPage({ params }: { params: Promise<{ brandId: string; groupId: string }> }) {
  const { brandId, groupId } = await params;
  await requireBrand(brandId);
  return <PostEditor groupId={groupId} />;
}
