/**
 * Renders a bio page. No hooks / no "use client": used by the public server page (/b/[slug]) and by the
 * editor's live phone preview. Plain inline styles so it never inherits app theme (light/dark).
 */
import type { CSSProperties, ReactNode } from "react";
import {
  IconBrandBluesky,
  IconBrandFacebook,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandMastodon,
  IconBrandPinterest,
  IconBrandThreads,
  IconBrandTiktok,
  IconBrandX,
  IconBrandYoutube,
  IconMail,
  IconWorld,
} from "@tabler/icons-react";
import { FONTS, isDarkBackground, youtubeId, type BioBlock, type BioTheme } from "./types";

const SOCIAL_ICON: Record<string, typeof IconWorld> = {
  instagram: IconBrandInstagram,
  x: IconBrandX,
  facebook: IconBrandFacebook,
  tiktok: IconBrandTiktok,
  youtube: IconBrandYoutube,
  linkedin: IconBrandLinkedin,
  bluesky: IconBrandBluesky,
  mastodon: IconBrandMastodon,
  threads: IconBrandThreads,
  pinterest: IconBrandPinterest,
  email: IconMail,
  website: IconWorld,
};

function contrastOn(hex: string): string {
  let s = hex.replace("#", "");
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
  return lum > 0.6 ? "#111111" : "#FFFFFF";
}

export interface BioPageViewProps {
  title: string;
  bio?: string | null;
  avatarUrl?: string | null;
  theme: BioTheme;
  blocks: BioBlock[];
  /** Href for a block (and social link index). Public page routes through the click tracker. */
  hrefFor?: (block: BioBlock, linkIndex?: number) => string | undefined;
  /** Editor preview: disable navigation. */
  preview?: boolean;
  footer?: ReactNode;
}

export function BioPageView({ title, bio, avatarUrl, theme, blocks, hrefFor, preview, footer }: BioPageViewProps) {
  const dark = isDarkBackground(theme.background);
  const text = theme.textColor ?? (dark ? "#F8F7F4" : "#1A1714");
  const muted = dark ? "rgba(248,247,244,0.72)" : "rgba(26,23,20,0.66)";
  const accent = theme.accent;
  const onAccent = contrastOn(accent);
  const font = FONTS[theme.font]?.css ?? FONTS.inter.css;
  const radius = theme.buttonStyle === "pill" ? 999 : 14;
  const href = (b: BioBlock, i?: number) => (hrefFor ? hrefFor(b, i) : i !== undefined ? b.links?.[i]?.url : b.url);

  const button: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
    padding: "14px 20px",
    borderRadius: radius,
    fontWeight: 600,
    fontSize: 15.5,
    textDecoration: "none",
    textAlign: "center",
    lineHeight: 1.3,
    transition: "transform .12s ease, box-shadow .12s ease",
    boxSizing: "border-box",
    width: "100%",
    ...(theme.buttonStyle === "outline"
      ? { border: `2px solid ${accent}`, color: dark && contrastOn(accent) === "#FFFFFF" ? text : accent, background: "transparent" }
      : theme.buttonStyle === "soft"
        ? { background: `color-mix(in srgb, ${accent} 16%, ${dark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.55)"})`, color: text, border: "1px solid transparent" }
        : { background: accent, color: onAccent, boxShadow: "0 6px 18px -8px rgba(0,0,0,0.35)" }),
  };

  // In preview the page is embedded inside other links (list cards), so render no nested <a>.
  const A = (preview ? "div" : "a") as "a";
  const linkProps = (h: string | undefined) =>
    preview || !h
      ? { onClick: undefined, href: undefined, role: "link" as const, "aria-disabled": true }
      : { href: h, ...(h.startsWith("/") ? {} : { rel: "noopener noreferrer" }) };

  return (
    <div
      style={{
        minHeight: "100%",
        background: theme.background.value,
        color: text,
        fontFamily: font,
        display: "flex",
        justifyContent: "center",
        padding: "48px 18px 40px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ width: "100%", maxWidth: 560, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            width={96}
            height={96}
            style={{ width: 96, height: 96, borderRadius: "50%", objectFit: "cover", boxShadow: "0 8px 24px -10px rgba(0,0,0,0.4)", background: "#fff" }}
          />
        ) : (
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: "50%",
              background: accent,
              color: onAccent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              fontWeight: 700,
            }}
          >
            {title.slice(0, 1).toUpperCase()}
          </div>
        )}
        <h1 style={{ margin: "6px 0 0", fontSize: 24, fontWeight: 700, textAlign: "center", letterSpacing: -0.3 }}>{title}</h1>
        {bio && <p style={{ margin: 0, fontSize: 15, color: muted, textAlign: "center", maxWidth: 420, lineHeight: 1.5, whiteSpace: "pre-line" }}>{bio}</p>}

        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
          {blocks
            .filter((b) => !b.hidden)
            .map((b) => {
              switch (b.type) {
                case "header":
                  return (
                    <h2 key={b.id} style={{ margin: "14px 0 0", fontSize: 13, textTransform: "uppercase", letterSpacing: 1.2, color: muted, textAlign: "center", fontWeight: 700 }}>
                      {b.label}
                    </h2>
                  );
                case "text":
                  return (
                    <p key={b.id} style={{ margin: 0, fontSize: 15, lineHeight: 1.55, textAlign: "center", color: text, whiteSpace: "pre-line" }}>
                      {b.text}
                    </p>
                  );
                case "link":
                  return (
                    <A key={b.id} {...linkProps(href(b))} style={button} className="bio-btn">
                      {b.label || b.url || "Untitled link"}
                    </A>
                  );
                case "image": {
                  if (!b.imageUrl) return null;
                  const img = (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.imageUrl} alt={b.label ?? ""} style={{ width: "100%", display: "block", borderRadius: 18, aspectRatio: "auto" }} loading="lazy" />
                  );
                  const h = b.url ? href(b) : undefined;
                  return h ? (
                    <A key={b.id} {...linkProps(h)} style={{ display: "block" }}>
                      {img}
                    </A>
                  ) : (
                    <div key={b.id}>{img}</div>
                  );
                }
                case "embed": {
                  const id = youtubeId(b.url);
                  if (!id) return null;
                  return (
                    <div key={b.id} style={{ position: "relative", width: "100%", paddingTop: "56.25%", borderRadius: 18, overflow: "hidden", background: "#000" }}>
                      {preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
                          alt={b.label ?? "Video"}
                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <iframe
                          src={`https://www.youtube-nocookie.com/embed/${id}`}
                          title={b.label ?? "Video"}
                          loading="lazy"
                          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                        />
                      )}
                    </div>
                  );
                }
                case "social":
                  return (
                    <div key={b.id} style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
                      {(b.links ?? []).map((l, i) => {
                        const Icon = SOCIAL_ICON[l.network] ?? IconWorld;
                        return (
                          <A
                            key={i}
                            {...linkProps(href(b, i))}
                            aria-label={l.network}
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: "50%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: text,
                              background: dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
                            }}
                          >
                            <Icon size={22} stroke={1.8} />
                          </A>
                        );
                      })}
                    </div>
                  );
                default:
                  return null;
              }
            })}
        </div>
        {footer}
      </div>
    </div>
  );
}
