# syntax=docker/dockerfile:1.7
# Multistage build for the highlighte.rs landing site (Vite SPA, static).
#
# Stage 1: install workspace deps, build @highlighters/* so the website resolves
#          them via their dist/ outputs, then `vite build` the website to dist/.
# Stage 2: serve dist/ with `serve` in single-page mode (unknown routes fall
#          back to index.html). No nginx, no static-file layer.

ARG NODE_VERSION=20-bookworm-slim

# ---------- builder ----------
FROM node:${NODE_VERSION} AS builder

# Pin pnpm explicitly: a bare `pnpm@` resolves to the latest release (11.x,
# which needs Node 22), so activate the version this repo uses.
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /workspace

# Copy the lock + workspace + manifests first so the install layer caches
# independently of source-code changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/react/package.json packages/react/
COPY packages/vue/package.json packages/vue/
COPY packages/svelte/package.json packages/svelte/
COPY apps/website/package.json apps/website/

RUN pnpm install --frozen-lockfile

# Bring in the rest of the source.
COPY packages packages
COPY apps/website apps/website

# Build the library packages first (the website imports their dist/), then the
# website itself (vite build -> apps/website/dist).
RUN pnpm -r --filter "./packages/*" build \
    && pnpm --filter website build

# ---------- runtime ----------
FROM node:${NODE_VERSION} AS runtime

WORKDIR /app
ENV NODE_ENV=production

# `serve` is a tiny static file server. It binds 0.0.0.0, honours the PORT env
# Railway injects, and reads dist/serve.json for routing: /docs gets its own HTML
# (its own OG card), everything else falls back to the SPA. No -s flag: single
# mode would rewrite /docs to the home index before serve.json could route it.
RUN npm install -g serve@14

COPY --from=builder /workspace/apps/website/dist ./dist

# Drop root: the node base image ships an unprivileged `node` user. The static
# dist/ is world-readable and serve binds the high PORT Railway injects, so no
# root is needed at runtime.
USER node

EXPOSE 3000
CMD ["serve", "dist"]
