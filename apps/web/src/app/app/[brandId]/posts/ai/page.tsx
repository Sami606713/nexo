import { requireBrand } from "@/lib/session";
import { AiComposer } from "@/components/editor/AiComposer";

export default async function AiComposerPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<{ prompt?: string }>;
}) {
  const { brandId } = await params;
  await requireBrand(brandId, "posts.write");
  const { prompt } = await searchParams;
  return <AiComposer initialPrompt={prompt?.slice(0, 4000)} />;
}
