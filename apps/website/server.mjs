// Minimal static server for the built SPA.
//
// It serves files from dist/, gives /docs its own pre-rendered HTML (its own OG
// card), and falls back to the SPA index for every other route. `serve` couldn't
// express this: its single-page mode rewrites /docs to the home index before any
// per-route rule, and a catch-all rewrite that covers multi-segment URLs also
// swallows /docs. A ~40-line server is the honest fit.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("./dist/", import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
};

async function send(res, file) {
  const body = await readFile(file); // throws if missing -> caller falls back
  res.writeHead(200, {
    "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
    // Hashed assets are immutable; everything else (HTML, public/) revalidates so deploys land.
    "cache-control": file.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
  });
  res.end(body);
}

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);

    // /docs (with or without trailing slash) serves its own pre-rendered HTML.
    if (pathname === "/docs" || pathname === "/docs/") {
      return await send(res, join(DIST, "docs", "index.html"));
    }

    // Try a real file under dist/, guarding against path traversal.
    const target = join(DIST, normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, ""));
    if (target.startsWith(DIST)) {
      try {
        return await send(res, target);
      } catch {
        // not a file -> SPA fallback below
      }
    }

    // SPA fallback: any unmatched route boots the app at index.html.
    return await send(res, join(DIST, "index.html"));
  } catch {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("Internal Server Error");
  }
}).listen(PORT, "0.0.0.0", () => console.log(`serving dist on :${PORT}`));
