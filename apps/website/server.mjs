// Minimal static server for the built SPA.
//
// It serves files from dist/, gives /docs its own pre-rendered HTML (its own OG
// card), and falls back to the SPA index for every other route. `serve` couldn't
// express this: its single-page mode rewrites /docs to the home index before any
// per-route rule, and a catch-all rewrite that covers multi-segment URLs also
// swallows /docs. A small single-file server is the honest fit.
import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

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

// dist/ is immutable for a container's lifetime, so each file is read and hashed
// once. Keyed by canonical on-disk path (realpath in send), never the request
// URL: the SPA fallback maps unbounded URLs onto index.html, and case-insensitive
// filesystems fold case variants, so the cache stays bounded by the file set.
const cache = new Map();

const etagOf = (body) => `"${createHash("sha256").update(body).digest("base64url")}"`;

async function loadFile(path) {
  let entry = cache.get(path);
  if (!entry) {
    const body = await readFile(path); // throws if missing -> caller falls back; misses stay uncached
    entry = { body, etag: etagOf(body) };
    cache.set(path, entry);
  }
  return entry;
}

// Sidecar absence is cached as null; only called for files that exist, so the
// keyspace stays bounded.
async function loadSidecar(path) {
  if (!cache.has(path)) {
    const body = await readFile(path).catch(() => null);
    cache.set(path, body && { body, etag: etagOf(body) });
  }
  return cache.get(path);
}

// Accept-Encoding is a comma list of `token;q=...` parts: names are
// case-insensitive whole tokens and q=0 means refused, so substring or
// case-sensitive matching would hand a refusing client an undecodable body.
function acceptedEncodings(header) {
  const ok = new Set();
  for (const part of String(header ?? "").split(",")) {
    const [name, ...params] = part.split(";");
    const token = name.trim().toLowerCase();
    if (!token) continue;
    const q = params.map((p) => p.trim()).find((p) => p.toLowerCase().startsWith("q="));
    if (q && !(parseFloat(q.slice(2)) > 0)) continue;
    ok.add(token);
  }
  return ok;
}

async function send(req, res, file) {
  // Canonicalize before caching: throws if missing (caller falls back).
  file = await realpath(file);
  let entry = await loadFile(file);

  // Precompressed sidecars from the build: prefer br, then gzip, else identity.
  const accept = acceptedEncodings(req.headers["accept-encoding"]);
  let encoding = null;
  let hasSidecars = false;
  for (const [name, ext] of [["br", ".br"], ["gzip", ".gz"]]) {
    const sidecar = await loadSidecar(file + ext);
    if (!sidecar) continue;
    hasSidecars = true;
    if (accept.has(name)) {
      entry = sidecar;
      encoding = name;
      break;
    }
  }

  // A content change to any file under these directories must ship under a new filename.
  const immutable = ["/assets/", "/fonts/", "/audio/"].some((dir) => file.includes(dir));

  const headers = {
    // Content type of the original extension even when a sidecar is served.
    "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
  };
  if (encoding) headers["content-encoding"] = encoding;
  if (hasSidecars) headers["vary"] = "Accept-Encoding";

  if (!immutable) {
    headers["etag"] = entry.etag;
    // Weak comparison: proxies may weaken the tag with a W/ prefix.
    const inm = req.headers["if-none-match"];
    if (inm && inm.split(",").some((tag) => tag.trim().replace(/^W\//, "") === entry.etag)) {
      res.writeHead(304, headers);
      return res.end();
    }
  }
  res.writeHead(200, headers);
  res.end(entry.body);
}

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);

    // /docs (with or without trailing slash) serves its own pre-rendered HTML.
    if (pathname === "/docs" || pathname === "/docs/") {
      return await send(req, res, join(DIST, "docs", "index.html"));
    }

    // Try a real file under dist/. normalize() collapses any ../ in the absolute
    // pathname; the startsWith(DIST) check is the traversal backstop.
    const target = join(DIST, normalize(pathname));
    if (target.startsWith(DIST)) {
      try {
        return await send(req, res, target);
      } catch {
        // not a file -> SPA fallback below
      }
    }

    // SPA fallback: any unmatched route boots the app at index.html.
    return await send(req, res, join(DIST, "index.html"));
  } catch {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("Internal Server Error");
  }
}).listen(PORT, "0.0.0.0", () => console.log(`serving dist on :${PORT}`));
