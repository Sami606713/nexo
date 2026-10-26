import { prisma } from "@postline/db";
import { ai, brandContext, withCredits } from "@postline/ai";
import { scorePostHeuristic } from "@postline/ai/score";
import { CREDIT_COST } from "@postline/core";
import { notFound, route } from "@/lib/http";
import { readBody } from "@/lib/posts/body";
import { requireBrand } from "@/lib/session";
import { aiPostInput } from "@/lib/posts/ai-inputs";
import { brandChannels } from "@/lib/posts/ai-helpers";
import { attachMediaToGroup, brandColors, defaultImageSize, generateAndStoreImages } from "@/lib/ai-images";

type Ctx = { params: Promise<{ brandId: string }> };

export const maxDuration = 300;

/**
 * Synchronous AI post generation: creates a GENERATING group, generates inside withCredits,
 * writes caption + per-network overrides, flips to DRAFT. Returns { groupId }.
 */
export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  const input = await readBody(req, aiPostInput);
  const { channels, networks } = await brandChannels(access.brand.id, input.channelIds);

  let library: string[] | undefined;
  if (input.hashtagLibraryId) {
    const lib = await prisma.hashtagLibrary.findFirst({ where: { id: input.hashtagLibraryId, brandId: access.brand.id } });
    if (!lib) throw notFound("Hashtag library not found");
    library = lib.tags;
  }

  const group = await prisma.postGroup.create({
    data: {
      brandId: access.brand.id,
      authorId: access.user.id,
      status: "GENERATING",
      notes: `AI prompt: ${input.prompt}`,
      posts: { create: channels.map((c) => ({ channelId: c.id, status: "GENERATING" as const })) },
    },
  });

  try {
    const generated = await withCredits(
      { brandId: access.brand.id, actorId: access.user.id, reason: "caption", amount: CREDIT_COST.caption, refType: "PostGroup", refId: group.id },
      () =>
        ai.generatePost(brandContext(access.brand), {
          prompt: input.prompt,
          networks: networks.length ? networks : ["LINKEDIN"],
          tone: input.tone,
          length: input.length,
          includeHashtags: input.includeHashtags,
          hashtagLibrary: library,
          language: input.language,
        }),
    );

    const withTags = (text: string) => {
      if (!input.includeHashtags || !generated.hashtags.length) return text;
      const missing = generated.hashtags
        .map((h) => (h.startsWith("#") ? h : `#${h}`))
        .filter((h) => !text.toLowerCase().includes(h.toLowerCase()));
      return missing.length ? `${text.trimEnd()}\n\n${missing.join(" ")}` : text;
    };
    const caption = withTags(generated.caption);

    await prisma.$transaction([
      ...channels.map((c) => {
        const variant = generated.perNetwork?.[c.network];
        return prisma.post.update({
          where: { groupId_channelId: { groupId: group.id, channelId: c.id } },
          data: { status: "DRAFT", captionOverride: variant ? withTags(variant) : null },
        });
      }),
      prisma.postGroup.update({
        where: { id: group.id },
        data: {
          caption,
          status: "DRAFT",
          score: scorePostHeuristic({ caption, networks, mediaCount: 0 }).total,
        },
      }),
    ]);
  } catch (err) {
    await prisma.postGroup.delete({ where: { id: group.id } }).catch(() => undefined);
    throw err;
  }

  // Optional AI images (1 credit each). The caption is already saved, so failures here are reported, not fatal.
  const imagesCount = Math.min(4, input.imagesCount ?? 0);
  if (imagesCount > 0) {
    try {
      const rows = await generateAndStoreImages({
        brand: access.brand,
        actorId: access.user.id,
        prompt: input.prompt,
        ...defaultImageSize(networks),
        count: imagesCount,
        style: brandColors(access.brand.colors).length ? "brand" : undefined,
        refType: "PostGroup",
        refId: group.id,
      });
      await attachMediaToGroup(group.id, rows.map((r) => r.id));
      return { groupId: group.id, images: rows.length };
    } catch (err) {
      console.error("[ai/post] image generation failed", err);
      const imagesError = (err as Error)?.name === "InsufficientCreditsError" ? "Not enough credits for images" : "Image generation failed";
      return { groupId: group.id, images: 0, imagesError };
    }
  }
  return { groupId: group.id };
});
