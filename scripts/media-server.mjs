// Read-only static server for apps/web/public (uploads + demo media) — exposes media files only, never the app.
// Used behind a tunnel so Instagram/Facebook can download post media during local development:
//   npm run media:serve   →  http://127.0.0.1:3100
//   npm run media:tunnel  →  prints a https://*.trycloudflare.com URL; put it in .env as PUBLIC_MEDIA_BASE_URL
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../apps/web/public", import.meta.url)));
const PORT = Number(process.env.MEDIA_PORT || 3100);
const TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};

createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") return res.writeHead(405).end();
  let path;
  try {
    path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  } catch {
    return res.writeHead(400).end();
  }
  const file = normalize(join(ROOT, path));
  const type = TYPES[extname(file).toLowerCase()];
  // Only known media types, only inside public/, never directories.
  if (!type || !file.startsWith(ROOT + sep)) return res.writeHead(404).end();
  let st;
  try {
    st = statSync(file);
  } catch {
    return res.writeHead(404).end();
  }
  if (!st.isFile()) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": type, "content-length": st.size, "cache-control": "public, max-age=3600" });
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}).listen(PORT, "127.0.0.1", () => console.log(`media server: http://127.0.0.1:${PORT} (serving ${ROOT})`));
