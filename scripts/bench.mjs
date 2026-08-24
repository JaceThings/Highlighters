#!/usr/bin/env node
import { performance } from "node:perf_hooks";
import {
  buildClipPath,
  buildEdge,
  buildMarkGeometry,
  buildNoiseTile,
  resolveOptions,
} from "../packages/core/dist/index.js";

const opts = resolveOptions({});
const line = {
  left: 100,
  top: 200,
  width: 420,
  height: 24,
  seed: 1729,
  isFirst: true,
  isLast: true,
};

function bench(name, n, fn) {
  fn();
  const start = performance.now();
  for (let i = 0; i < n; i++) fn(i);
  const ms = performance.now() - start;
  const per = (ms / n) * 1000;
  return { name, n, ms, us: per };
}

function row({ name, n, ms, us }) {
  return `${name.padEnd(42)} ${String(n).padStart(8)}  ${ms.toFixed(1).padStart(8)} ms  ${us.toFixed(3).padStart(8)} µs/op`;
}

const geoCached = bench("buildMarkGeometry (same seed, cache hit)", 5000, () =>
  buildMarkGeometry(line, opts, line.seed),
);

const geoFresh = bench("buildMarkGeometry (unique seed)", 800, (i) =>
  buildMarkGeometry(line, opts, 10_000 + i),
);

const g = buildMarkGeometry(line, opts, line.seed);
const clipFull = bench("clipAtFront (full / settled)", 8000, () => g.clipAtFront(g.box.width));
const clipAnim = bench("clipAtFront (draw-on fronts)", 8000, (i) =>
  g.clipAtFront(20 + (i % Math.floor(g.box.width))),
);

const edge = bench("buildEdge (~20 verts)", 20000, () =>
  buildEdge({
    startX: 100,
    endX: 520,
    baseY: 0,
    segmentLength: 22,
    amplitude: 1.15,
    roughness: 0.2,
    seed: 1929,
  }),
);

const tileHit = bench("buildNoiseTile (cache hit)", 20000, () =>
  buildNoiseTile({
    width: 1024,
    height: 64,
    seed: 1729,
    streakiness: 0.25,
    feathering: 0.275,
    dryout: 0.2,
  }),
);

const tileMiss = bench("buildNoiseTile (unique seed)", 400, (i) =>
  buildNoiseTile({
    width: 1024,
    height: 64,
    seed: 50_000 + i,
    streakiness: 0.25,
    feathering: 0.275,
    dryout: 0.2,
  }),
);

const clipDirect = bench("buildClipPath (wavy, full front)", 8000, () =>
  buildClipPath({
    box: g.box,
    tip: opts.tip,
    topEdge: g.topEdge,
    bottomEdge: g.bottomEdge,
    cap: opts.edge.cap,
    radius: opts.edge.radius,
  }),
);

const results = [geoCached, geoFresh, clipFull, clipAnim, clipDirect, edge, tileHit, tileMiss];

console.log("Highlighters geometry bench");
console.log(`${"case".padEnd(42)} ${"iters".padStart(8)}  ${"total".padStart(11)}  ${"per-op".padStart(12)}`);
for (const r of results) console.log(row(r));
console.log(
  `\nclipPath length: ${g.clipPath.length}  verts: ${g.topEdge.length}+${g.bottomEdge.length}  tile: ${g.noiseTile.dataUrl.length} chars`,
);
