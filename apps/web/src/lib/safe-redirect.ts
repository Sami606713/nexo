/** Only allow same-origin relative paths as post-auth redirects. */
export function safeCallback(raw: string | string[] | undefined, fallback = "/app"): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && v.startsWith("/") && !v.startsWith("//") ? v : fallback;
}
