"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { Anchor, Burger, Drawer, Stack } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Logo } from "@/components/ui/Logo";
import { APP_NAME, NAV, SIGNUP_LABEL } from "./content";
import { useReducedMotionSafe } from "./motion";
import s from "./site.module.css";

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const [opened, { toggle, close }] = useDisclosure(false);
  const pathname = usePathname();
  const reduce = useReducedMotionSafe();
  const { scrollY } = useScroll();
  // Boolean flip only when crossing the threshold, not on every scroll frame.
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", (v) => {
    const next = v > 12;
    if (next !== scrolled) setScrolled(next);
  });

  const cta = signedIn ? (
    <Link href="/app" className={s.btnPrimary} style={{ height: 40, padding: "0 18px", fontSize: 14 }}>
      Open app
    </Link>
  ) : (
    <>
      <Link href="/login" className={s.btnGhost} style={{ height: 40, padding: "0 18px", fontSize: 14, border: "none", background: "transparent" }}>
        Log in
      </Link>
      <Link href="/signup" className={s.btnPrimary} style={{ height: 40, padding: "0 18px", fontSize: 14 }}>
        {SIGNUP_LABEL}
      </Link>
    </>
  );

  return (
    <motion.header
      initial={reduce ? false : { y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        height: 64,
        transition: "background 0.3s, border-color 0.3s, backdrop-filter 0.3s",
        background: scrolled ? "color-mix(in srgb, var(--mantine-color-body) 84%, transparent)" : "transparent",
        backdropFilter: scrolled ? "saturate(180%) blur(14px)" : "none",
        borderBottom: `1px solid ${scrolled ? "var(--mantine-color-default-border)" : "transparent"}`,
      }}
    >
      <div className={s.container} style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
        <Anchor component={Link} href="/" underline="never" c="inherit" aria-label={`${APP_NAME} home`}>
          <Logo />
        </Anchor>
        <nav className="site-nav" style={{ display: "flex", gap: 4 }}>
          {NAV.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                style={{
                  position: "relative",
                  padding: "8px 14px",
                  fontSize: 14,
                  fontWeight: 500,
                  textDecoration: "none",
                  color: active ? "var(--mantine-color-text)" : "var(--mantine-color-dimmed)",
                }}
              >
                {n.label}
                {active && (
                  <motion.span
                    layoutId="nav-underline"
                    style={{ position: "absolute", left: 14, right: 14, bottom: 2, height: 2, borderRadius: 2, background: "var(--mantine-color-indigo-6)" }}
                  />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="site-cta" style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {cta}
        </div>
        <Burger className="site-burger" opened={opened} onClick={toggle} aria-label="Toggle navigation" size="sm" />
      </div>
      <style>{`
        .site-burger { display: none; }
        @media (max-width: 860px) {
          .site-nav, .site-cta { display: none !important; }
          .site-burger { display: inline-flex; }
        }
      `}</style>
      <Drawer opened={opened} onClose={close} position="right" size="80%" title={<Logo size="sm" />}>
        <Stack gap={4}>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} onClick={close} style={{ padding: "12px 8px", fontSize: 17, fontWeight: 500, color: "var(--mantine-color-text)", textDecoration: "none" }}>
              {n.label}
            </Link>
          ))}
          <Stack gap="xs" mt="lg" onClick={close}>
            {cta}
          </Stack>
        </Stack>
      </Drawer>
    </motion.header>
  );
}

const FOOTER = [
  { title: "Product", links: [{ href: "/features", label: "Features" }, { href: "/integrations", label: "Integrations" }, { href: "/signup", label: "Create an account" }] },
  { title: "Company", links: [{ href: "/about", label: "About" }, { href: "/contact", label: "Contact" }] },
  { title: "Legal", links: [{ href: "/privacy", label: "Privacy policy" }, { href: "/terms", label: "Terms of service" }] },
];

export function SiteFooter() {
  return (
    <footer style={{ borderTop: "1px solid var(--mantine-color-default-border)", marginTop: 96 }}>
      <div className={s.container} style={{ padding: "56px 24px 40px" }}>
        <div className="site-footer-grid" style={{ display: "grid", gridTemplateColumns: "1.6fr repeat(3, 1fr)", gap: 40 }}>
          <div>
            <Logo size="sm" />
            <p className={s.cellBody} style={{ marginTop: 14, maxWidth: "32ch" }}>
              Free AI-powered social media management for creators, teams and communities.
            </p>
          </div>
          {FOOTER.map((col) => (
            <div key={col.title}>
              <p style={{ fontSize: 14, fontWeight: 650, margin: "0 0 14px" }}>{col.title}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {col.links.map((l) => (
                  <Link key={l.href} href={l.href} style={{ fontSize: 14, color: "var(--mantine-color-dimmed)", textDecoration: "none" }}>
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 13, color: "var(--mantine-color-dimmed)", margin: "48px 0 0" }}>
          © {new Date().getFullYear()} {APP_NAME}. Made for the community.
        </p>
      </div>
      <style>{`@media (max-width: 767px) { .site-footer-grid { grid-template-columns: 1fr 1fr !important; } .site-footer-grid > div:first-child { grid-column: 1 / -1; } }`}</style>
    </footer>
  );
}
