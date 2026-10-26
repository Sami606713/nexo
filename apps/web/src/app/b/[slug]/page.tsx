import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@postline/db";
import { BioPageView } from "@/components/bio/BioPageView";
import { FONTS, normalizeBlocks, normalizeTheme } from "@/components/bio/types";
import { isBot, loadPublicPage, refHost } from "./_load";

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadPublicPage(slug);
  if (!page) return { title: "Page not found", robots: { index: false } };
  const description = page.bio ?? `Links from ${page.title}`;
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const image = page.avatarUrl ? new URL(page.avatarUrl, base).toString() : undefined;
  return {
    title: { absolute: page.title },
    description,
    alternates: { canonical: `${base}/b/${page.slug}` },
    openGraph: { title: page.title, description, url: `${base}/b/${page.slug}`, type: "profile", images: image ? [{ url: image }] : undefined },
    twitter: { card: "summary", title: page.title, description, images: image ? [image] : undefined },
    robots: { index: true, follow: true },
  };
}

export default async function PublicBioPage({ params }: Props) {
  const { slug } = await params;
  const page = await loadPublicPage(slug);
  if (!page) notFound();
  const theme = normalizeTheme(page.theme);
  const blocks = normalizeBlocks(page.blocks);

  const h = await headers();
  if (!isBot(h.get("user-agent")) && h.get("purpose") !== "prefetch" && h.get("next-router-prefetch") === null) {
    const referrer = refHost(h.get("referer"), h.get("host"));
    after(() => prisma.bioPageEvent.create({ data: { pageId: page.id, kind: "view", referrer } }).catch(() => undefined));
  }

  const google = FONTS[theme.font]?.google;
  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: theme.background.value }}>
      {google && (
        <>
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${google}&display=swap`} precedence="default" />
        </>
      )}
      <style>{`.bio-btn:hover{transform:translateY(-1px)} .bio-btn:active{transform:translateY(0)}`}</style>
      <main style={{ flex: 1 }}>
        <BioPageView
          title={page.title}
          bio={page.bio}
          avatarUrl={page.avatarUrl}
          theme={theme}
          blocks={blocks}
          hrefFor={(b, i) => {
            const target = i !== undefined ? b.links?.[i]?.url : b.url;
            if (!target) return undefined;
            return `/b/${page.slug}/go/${encodeURIComponent(b.id)}${i !== undefined ? `?i=${i}` : ""}`;
          }}
          footer={
            <p style={{ marginTop: 28, fontSize: 12, opacity: 0.55, textAlign: "center" }}>
              Made with {process.env.NEXT_PUBLIC_APP_NAME ?? "Postline"}
            </p>
          }
        />
      </main>
    </div>
  );
}
