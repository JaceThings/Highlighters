import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
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
        // is code-split via lazyRouteComponent in router.tsx, so its chunk —
        // and the playground-only libs folded into it — stays off the "/"
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
          // playground-only libs — @highlighters/react, @lisse/react,
          // @numeric-text — are deliberately NOT forced here; returning
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
