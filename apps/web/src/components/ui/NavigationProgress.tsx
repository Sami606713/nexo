"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Thin top progress bar for client-side navigations. Starts on any same-origin link click, completes when the
 * route (pathname/search) changes. In dev, pages compile on first visit, so without this a click can look dead.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Route changed: finish the bar.
  useEffect(() => {
    setState((s) => (s === "loading" ? "done" : s));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 350);
  }, [pathname, search]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (timer.current) clearTimeout(timer.current);
      setState("loading");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (state === "idle") return null;
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 10000,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          height: "100%",
          background: "var(--mantine-color-indigo-6)",
          boxShadow: "0 0 8px var(--mantine-color-indigo-4)",
          transformOrigin: "left",
          transform: state === "done" ? "scaleX(1)" : "scaleX(0.85)",
          opacity: state === "done" ? 0 : 1,
          transition: state === "done" ? "transform 0.2s ease-out, opacity 0.3s 0.15s" : "transform 8s cubic-bezier(0.1, 0.7, 0.2, 1)",
          animation: state === "loading" ? "nav-progress-start 0.01s" : undefined,
        }}
      />
      <style>{`@keyframes nav-progress-start { from { transform: scaleX(0); } }`}</style>
    </div>
  );
}
