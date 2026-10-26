"use client";

/** Scoped styles for the Studio editor & gallery (light + dark). */
export function StudioStyles() {
  return (
    <style>{`
:root { --studio-canvas-bg: #eceef3; --studio-surface: #ffffff; }
[data-mantine-color-scheme="dark"] { --studio-canvas-bg: #101113; --studio-surface: var(--mantine-color-dark-7); }
.studio-root {
  position: fixed; inset: 0; z-index: 150; display: flex; flex-direction: column;
  background: var(--mantine-color-body); color: var(--mantine-color-text);
}
.studio-topbar { border-bottom: 1px solid var(--mantine-color-default-border); background: var(--studio-surface); flex-shrink: 0; }
.studio-name input:hover { background: var(--mantine-color-default-hover); }
.studio-name input:focus { background: var(--mantine-color-default-hover); outline: 2px solid var(--mantine-color-indigo-5); }
.studio-body { flex: 1; min-height: 0; display: flex; }
.studio-rail { width: 76px; flex-shrink: 0; border-right: 1px solid var(--mantine-color-default-border); background: var(--studio-surface); align-items: center; }
.studio-rail-btn {
  width: 64px; padding: 8px 0 6px; border-radius: 10px; display: flex; flex-direction: column; align-items: center;
  color: var(--mantine-color-dimmed); transition: background 120ms ease, color 120ms ease;
}
.studio-rail-btn:hover { background: var(--mantine-color-default-hover); color: var(--mantine-color-text); }
.studio-rail-btn[data-active] { background: var(--mantine-color-indigo-light); color: var(--mantine-color-indigo-light-color); }
.studio-panel {
  width: 320px; flex-shrink: 0; border-right: 1px solid var(--mantine-color-default-border); background: var(--studio-surface);
  animation: studio-slide 160ms ease-out;
}
@keyframes studio-slide { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }
.studio-center { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.studio-layers { width: 264px; flex-shrink: 0; border-left: 1px solid var(--mantine-color-default-border); background: var(--studio-surface); }
.studio-layer-row:hover { background: var(--mantine-color-default-hover); }
.studio-tile { transition: transform 140ms ease, box-shadow 140ms ease; }
.studio-tile:hover { transform: translateY(-2px); }
.studio-tile:active { transform: translateY(0) scale(0.98); }
.studio-busy {
  position: absolute; inset: 0; z-index: 10; display: grid; place-items: center;
  background: color-mix(in srgb, var(--mantine-color-body) 70%, transparent); backdrop-filter: blur(2px);
}
button.studio-card { display: block; text-align: left; align-self: start; }
button.studio-tile { display: block; width: 100%; text-align: left; }
.studio-card { transition: box-shadow 160ms ease, transform 160ms ease; }
.studio-card:hover { box-shadow: var(--mantine-shadow-md); transform: translateY(-2px); }
.studio-card .studio-card-actions { opacity: 0; transition: opacity 120ms ease; }
.studio-card:hover .studio-card-actions, .studio-card .studio-card-actions[data-open] { opacity: 1; }
.studio-checker { background: repeating-conic-gradient(rgba(127,127,127,.12) 0% 25%, transparent 0% 50%) 50% / 18px 18px; }
@media (max-width: 1100px) { .studio-layers { display: none; } }
@media (max-width: 800px) { .studio-panel { width: 260px; } }
`}</style>
  );
}
