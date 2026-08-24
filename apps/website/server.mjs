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

// Key by realpath, not URL: SPA fallback maps unbounded paths onto index.html.
const cache = new Map();

const etagOf = (body) => `"${createHash("sha256").update(body).digest("base64url")}"`;

async function loadFile(path) {
  let entry = cache.get(path);
  if (!entry) {
    const body = await readFile(path);
    entry = { body, etag: etagOf(body) };
    cache.set(path, entry);
  }
  return entry;
}

async function loadSidecar(path) {
  if (!cache.has(path)) {
    const body = await readFile(path).catch(() => null);
    cache.set(path, body && { body, etag: etagOf(body) });
  }
  return cache.get(path);
}

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
  file = await realpath(file);
  let entry = await loadFile(file);

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

  const immutable = ["/assets/", "/fonts/", "/audio/"].some((dir) => file.includes(dir));

  const headers = {
    "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
  };
  if (encoding) headers["content-encoding"] = encoding;
  if (hasSidecars) headers["vary"] = "Accept-Encoding";

  if (!immutable) {
    headers["etag"] = entry.etag;
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

    if (pathname === "/docs" || pathname === "/docs/") {
      return await send(req, res, join(DIST, "docs", "index.html"));
    }

    const target = join(DIST, normalize(pathname));
    if (target.startsWith(DIST)) {
      try {
        return await send(req, res, target);
      } catch {
        // not a file
      }
    }

    return await send(req, res, join(DIST, "index.html"));
  } catch {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("Internal Server Error");
  }
}).listen(PORT, "0.0.0.0", () => console.log(`serving dist on :${PORT}`));
