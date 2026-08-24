import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync, constants as zlib } from "node:zlib";

const dist = fileURLToPath(new URL("./dist/", import.meta.url));

function docsOgVariant(): Plugin {
  return {
    name: "docs-og-variant",
    apply: "build",
    closeBundle() {
      const src = readFileSync(`${dist}index.html`, "utf8");
      const html = src
        .replaceAll("/og-image.jpg", "/og-image-docs.jpg")
        .replace('content="https://highlighte.rs/"', 'content="https://highlighte.rs/docs"')
        .replace('href="https://highlighte.rs/"', 'href="https://highlighte.rs/docs"');
      if (html === src) throw new Error("docsOgVariant: no OG replacements matched - check index.html");
      mkdirSync(`${dist}docs`, { recursive: true });
      writeFileSync(`${dist}docs/index.html`, html);
    },
  };
}

function precompress(): Plugin {
  const compressible = /\.(?:js|css|html|svg|json|xml|txt|webmanifest)$/;
  return {
    name: "precompress",
    apply: "build",
    closeBundle: {
      sequential: true,
      handler() {
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
        manualChunks(id) {
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
          if (id.includes("/@highlighters/core") || id.includes("/@lisse/core")) {
            return "vendor";
          }
          return undefined;
        },
      },
    },
  },
});
