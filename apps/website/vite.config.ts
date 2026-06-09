import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync, constants as zlib } from "node:zlib";

// Social crawlers don't run JS, so /docs needs its own real HTML to get a different preview card.
// After the build, emit dist/docs/index.html from the built index.html with the docs OG/Twitter
// image and a matching canonical (else crawlers fall back to the home card). server.mjs returns
// this file for /docs; the SPA still boots and routes there normally.
function docsOgVariant(): Plugin {
  return {
    name: "docs-og-variant",
    apply: "build",
    closeBundle() {
      const dist = fileURLToPath(new URL("./dist/", import.meta.url));
      const src = readFileSync(`${dist}index.html`, "utf8");
      const html = src
        .replaceAll("/og-image.jpg", "/og-image-docs.jpg")
        .replace('content="https://highlighte.rs/"', 'content="https://highlighte.rs/docs"')
        .replace('href="https://highlighte.rs/"', 'href="https://highlighte.rs/docs"');
      // Fail loud if index.html drifted and nothing matched, rather than shipping the home card on /docs.
      if (html === src) throw new Error("docsOgVariant: no OG replacements matched - check index.html");
      mkdirSync(`${dist}docs`, { recursive: true });
      writeFileSync(`${dist}docs/index.html`, html);
    },
  };
}

// Cloudflare only serves brotli to browsers when the origin supplies it, so emit .br/.gz
// sidecars for server.mjs to negotiate. Must run after docsOgVariant so dist/docs/index.html
// gets sidecars too: closeBundle is a parallel hook, so plugin position alone only orders
// synchronous handlers; sequential makes Rollup await the earlier hooks first.
function precompress(): Plugin {
  const compressible = /\.(?:js|css|html|svg|json|xml|txt|webmanifest)$/;
  return {
    name: "precompress",
    apply: "build",
    closeBundle: {
      sequential: true,
      handler() {
        const dist = fileURLToPath(new URL("./dist/", import.meta.url));
        for (const entry of readdirSync(dist, { recursive: true, withFileTypes: true })) {
          if (!entry.isFile() || !compressible.test(entry.name)) continue;
          const path = join(entry.parentPath, entry.name);
          const source = readFileSync(path);
          if (source.length < 1024) continue;
          const params = {
            [zlib.BROTLI_PARAM_QUALITY]: zlib.BROTLI_MAX_QUALITY,
            [zlib.BROTLI_PARAM_SIZE_HINT]: source.length,
          };
          writeFileSync(`${path}.br`, brotliCompressSync(source, { params }));
          writeFileSync(`${path}.gz`, gzipSync(source, { level: 9 }));
        }
      },
    },
  };
}

const coreSrc = fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url));

export default defineConfig({
  plugins: [tailwindcss(), react(), docsOgVariant(), precompress()],
  resolve: {
    // Dev resolves workspace package exports to stale dist; alias to source so core edits apply live.
    alias: {
      "@highlighters/core": coreSrc,
    },
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: [".trycloudflare.com", ".ngrok.io", ".ngrok-free.app"],
  },
  preview: {
    port: 4173,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        // Split stable, large vendors into their own long-cache chunks so the
        // browser cache survives app-code changes. The heavy /playground route
        // is code-split via lazyRouteComponent in router.tsx, so its chunk -
        // and the playground-only libs folded into it - stays off the "/"
        // critical path.
        manualChunks(id) {
          // @highlighters/core is a workspace package, so its symlink resolves to
          // packages/core/dist (outside node_modules) - match it before the guard below,
          // or it folds into the app chunk and busts its cache on every app-code change.
          if (id.includes("/packages/core/dist")) return "vendor";
          if (!id.includes("node_modules")) return undefined;
          if (
            id.includes("/react-router") ||
            id.includes("/react-dom/") ||
            /\/react\/[^/]*$/.test(id) ||
            id.includes("/react/index") ||
            id.includes("/scheduler/")
          ) {
            return "react-vendor";
          }
          if (id.includes("/framer-motion/") || id.includes("/motion-dom/") || id.includes("/motion-utils/")) {
            return "motion";
          }
          // Only the workspace libs actually mounted on "/" go in the eager
          // vendor chunk: @highlighters/core (SelectionMarker's live selection)
          // and @lisse/core (FocusRingOverlay's path geometry). The
          // playground-only libs - @highlighters/react, @lisse/react,
          // @numeric-text - are deliberately NOT forced here; returning
          // undefined lets Rollup fold them into the lazy /playground chunk so
          // they leave the landing critical path.
          if (id.includes("/@highlighters/core") || id.includes("/@lisse/core")) {
            return "vendor";
          }
          return undefined;
        },
      },
    },
  },
});
