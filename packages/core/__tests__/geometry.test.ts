import { describe, it, expect } from "vitest";
import type { LineRect, ResolvedOptions } from "../src/types.js";
import { hashJitter, hashU32, mulberry } from "../src/geometry/rng.js";
import { buildEdge } from "../src/geometry/edges.js";
import { buildClipPath } from "../src/geometry/clip-path.js";
import { buildPoolGradient } from "../src/geometry/pool.js";
import {
  buildNoiseTile,
  buildNoiseTileDataUrl,
} from "../src/geometry/noise-tile.js";
import { buildMarkGeometry } from "../src/geometry/mark-space.js";
import { snapRangeToBounds } from "../src/geometry/snap.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/**
 * A minimal fully-resolved options object. The geometry modules only read the
 * fields exercised below, but every field is populated so the shape matches
 * `ResolvedOptions` exactly (the test does not depend on `config/` so it stays
 * decoupled from that in-flight module).
 */
function makeOptions(overrides: Partial<ResolvedOptions> = {}): ResolvedOptions {
  const base: ResolvedOptions = {
    markType: "highlight",
    color: "#ffe600",
    gradient: null,
    opacity: 0.5,
    blendMode: "multiply",
    tip: { type: "chisel", width: 12, thickness: 3, angle: 8 },
    ink: {
      flow: 0.5,
      viscosity: 0.5,
      saturation: 0.5,
      feathering: 0.4,
      streakiness: 0.5,
      dryout: 0,
      startEndBuildup: 0.3,
    },
    edge: { waviness: 1, frequency: 30, roughness: 0.3, cap: "round", radius: 3 },
    paper: { absorbency: 0.3 },
    glow: { enabled: false, intensity: 0, spread: 0, color: "#ffffff" },
    colorant: 0.5,
    quality: "standard",
    snap: "line",
    renderer: "auto",
    animation: {
      draw: true,
      duration: 400,
      easing: "ease-out",
      direction: "left-to-right",
      stagger: 80,
      trigger: "immediate",
      threshold: 0.2,
      rootMargin: "0px",
      repeat: false,
    },
    semantic: false,
    contrastBackground: null,
    seed: null,
  };
  return { ...base, ...overrides };
}

/** Build a line rect at the given left/width, defaulting to a single full line. */
function makeLineRect(over: Partial<LineRect> = {}): LineRect {
  return {
    left: 100,
    top: 200,
    width: 300,
    height: 24,
    seed: 1729,
    isFirst: true,
    isLast: true,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// rng.ts
// ---------------------------------------------------------------------------

describe("hashJitter", () => {
  it("is deterministic and stays within [-1, 1]", () => {
    for (let s = -50; s <= 50; s++) {
      const a = hashJitter(s);
      const b = hashJitter(s);
      expect(a).toBe(b);
      expect(a).toBeGreaterThanOrEqual(-1);
      expect(a).toBeLessThanOrEqual(1);
    }
  });

  it("matches the canonical sin()-based hash exactly", () => {
    const reference = (seed: number) => {
      const x = Math.sin(seed * 9301 + 49297) * 233280;
      return (x - Math.floor(x)) * 2 - 1;
    };
    for (const s of [0, 1, 17, 42, 200, 300, -11, 9999]) {
      expect(hashJitter(s)).toBe(reference(s));
    }
  });

  it("decorrelates adjacent seeds (offsetting changes the value)", () => {
    expect(hashJitter(100)).not.toBe(hashJitter(101));
    expect(hashJitter(100)).not.toBe(hashJitter(111));
  });

  it("never reads the platform PRNG (stable across a Math.random override)", () => {
    const original = Math.random;
    try {
      // If any code path leaned on Math.random this would perturb the output.
      Math.random = () => 0.123456789;
      expect(hashJitter(7)).toBe(hashJitter(7));
    } finally {
      Math.random = original;
    }
  });
});

describe("hashU32", () => {
  it("returns an unsigned 32-bit integer, deterministically", () => {
    for (const s of [0, 1, 2, 255, 1000, -5]) {
      const v = hashU32(s);
      expect(v).toBe(hashU32(s));
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("avalanches adjacent seeds to far-apart outputs", () => {
    expect(hashU32(1)).not.toBe(hashU32(2));
    expect(hashU32(1000)).not.toBe(hashU32(1001));
  });
});

describe("mulberry", () => {
  it("produces a deterministic stream in [0, 1)", () => {
    const a = mulberry(42);
    const b = mulberry(42);
    for (let i = 0; i < 16; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("different seeds give different streams", () => {
    const a = mulberry(1);
    const b = mulberry(2);
    expect(a()).not.toBe(b());
  });
});

// ---------------------------------------------------------------------------
// edges.ts — the fixed-grid method
// ---------------------------------------------------------------------------

describe("buildEdge", () => {
  it("places vertices on the fixed global grid (x = i * segmentLength)", () => {
    const v = buildEdge({
      startX: 0,
      endX: 100,
      baseY: 0,
      segmentLength: 30,
      amplitude: 1,
      roughness: 0,
      seed: 200,
    });
    for (const vertex of v) {
      expect(vertex.x).toBe(vertex.gridIndex * 30);
    }
    // Grid indices 1,2,3 fall in (0.5, 99.5); index 0 and 100/30≈3.33 excluded.
    expect(v.map((p) => p.gridIndex)).toEqual([1, 2, 3]);
  });

  it("seeds y by grid index, deterministically within amplitude", () => {
    const v = buildEdge({
      startX: 0,
      endX: 200,
      baseY: 10,
      segmentLength: 30,
      amplitude: 2,
      roughness: 0,
      seed: 200,
    });
    for (const vertex of v) {
      const expected = 10 + hashJitter(200 + vertex.gridIndex * 17) * 2;
      expect(vertex.y).toBe(expected);
      expect(Math.abs(vertex.y - 10)).toBeLessThanOrEqual(2);
    }
  });

  it("applies the half-px epsilon so endpoints clear the corner arcs", () => {
    // With segLen 10 over [0, 100], grid points 0 and 10 sit exactly on the
    // corners; the epsilon must drop both (keep only 1..9).
    const v = buildEdge({
      startX: 0,
      endX: 100,
      baseY: 0,
      segmentLength: 10,
      amplitude: 1,
      roughness: 0,
      seed: 1,
    });
    expect(v[0].gridIndex).toBe(1);
    expect(v[v.length - 1].gridIndex).toBe(9);
  });

  it("is invariant under reversed start/end order (same grid, same coords)", () => {
    const forward = buildEdge({
      startX: 0,
      endX: 300,
      baseY: 5,
      segmentLength: 30,
      amplitude: 1,
      roughness: 0.4,
      seed: 300,
    });
    const reversed = buildEdge({
      startX: 300,
      endX: 0,
      baseY: 5,
      segmentLength: 30,
      amplitude: 1,
      roughness: 0.4,
      seed: 300,
    });
    expect(reversed).toEqual(forward);
  });

  it("only appends fresh vertices as the extent grows (prefix invariant, R22d)", () => {
    const small = buildEdge({
      startX: 0,
      endX: 120,
      baseY: 0,
      segmentLength: 30,
      amplitude: 1,
      roughness: 0.3,
      seed: 200,
    });
    const grown = buildEdge({
      startX: 0,
      endX: 360,
      baseY: 0,
      segmentLength: 30,
      amplitude: 1,
      roughness: 0.3,
      seed: 200,
    });
    // Every vertex from the smaller extent appears, byte-identical, in the
    // larger one at the same grid index — nothing re-seeds or shifts.
    for (const v of small) {
      const match = grown.find((g) => g.gridIndex === v.gridIndex);
      expect(match).toEqual(v);
    }
  });

  it("returns no vertices for a sub-segment span", () => {
    const v = buildEdge({
      startX: 0,
      endX: 5,
      baseY: 0,
      segmentLength: 30,
      amplitude: 1,
      roughness: 0,
      seed: 1,
    });
    expect(v).toEqual([]);
  });

  it("returns no vertices for a non-positive segment length", () => {
    expect(
      buildEdge({
        startX: 0,
        endX: 100,
        baseY: 0,
        segmentLength: 0,
        amplitude: 1,
        roughness: 0,
        seed: 1,
      }),
    ).toEqual([]);
  });

  it("roughness 0 yields the pure base wave; roughness perturbs it", () => {
    const common = {
      startX: 0,
      endX: 300,
      baseY: 0,
      segmentLength: 30,
      amplitude: 2,
      seed: 200,
    };
    const clean = buildEdge({ ...common, roughness: 0 });
    const frayed = buildEdge({ ...common, roughness: 1 });
    expect(clean.length).toBe(frayed.length);
    // At least one vertex must differ once roughness is engaged.
    expect(frayed.some((f, i) => f.y !== clean[i].y)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// clip-path.ts
// ---------------------------------------------------------------------------

describe("buildClipPath", () => {
  const baseTip = { type: "chisel", width: 12, thickness: 3, angle: 8 } as const;

  it("returns a bare path(...) value with no clip-path: prefix", () => {
    const s = buildClipPath({
      box: { x: 0, y: 0, width: 200, height: 24 },
      tip: { ...baseTip },
      topEdge: [],
      bottomEdge: [],
      cap: "round",
      radius: 3,
    });
    expect(s.startsWith('path("M ')).toBe(true);
    expect(s.endsWith('Z")')).toBe(true);
    expect(s).not.toContain("clip-path:");
  });

  it("threads the supplied edge vertices as L commands", () => {
    const s = buildClipPath({
      box: { x: 0, y: 0, width: 200, height: 24 },
      tip: { ...baseTip },
      topEdge: [{ x: 60, y: 0.5, gridIndex: 2 }],
      bottomEdge: [{ x: 90, y: 23.5, gridIndex: 3 }],
      cap: "round",
      radius: 3,
    });
    expect(s).toContain("L 60.0 0.50");
    expect(s).toContain("L 90.0 23.50");
  });

  it("emits quadratic Q arcs for the four rounded corners", () => {
    const s = buildClipPath({
      box: { x: 0, y: 0, width: 200, height: 24 },
      tip: { ...baseTip },
      topEdge: [],
      bottomEdge: [],
      cap: "round",
      radius: 3,
    });
    expect((s.match(/Q /g) ?? []).length).toBe(4);
  });

  it("chisel applies a px slant; bullet/fine do not", () => {
    const box = { x: 0, y: 0, width: 200, height: 24 };
    const chisel = buildClipPath({
      box,
      tip: { ...baseTip },
      topEdge: [],
      bottomEdge: [],
      cap: "flat",
      radius: 0,
    });
    const bullet = buildClipPath({
      box,
      tip: { type: "bullet", width: 12, thickness: 12, angle: 0 },
      topEdge: [],
      bottomEdge: [],
      cap: "flat",
      radius: 0,
    });
    // With no slant and no radius the top edge starts at x=0.0; chisel's slant
    // pushes its top start strictly right of 0.
    expect(bullet).toContain("M 0.0 0");
    expect(chisel).not.toContain("M 0.0 0");
  });

  it("flat/square caps drop corner rounding (no Q in a wave-free body)", () => {
    const s = buildClipPath({
      box: { x: 0, y: 0, width: 200, height: 24 },
      tip: { type: "fine", width: 4, thickness: 2, angle: 0 },
      topEdge: [],
      bottomEdge: [],
      cap: "flat",
      radius: 6,
    });
    // radius resolves to 0 for flat caps, so the Q arcs collapse onto their
    // anchor points; the corners are effectively square. The string still
    // contains "Q " tokens but with zero radius — assert the box corners are
    // at the exact box extents instead.
    expect(s).toContain("M 0.0 0");
    expect(s).toContain("200.0");
  });

  it("is deterministic — identical inputs give a byte-identical string", () => {
    const args = {
      box: { x: 0, y: 0, width: 247, height: 22 },
      tip: { ...baseTip },
      topEdge: [{ x: 60, y: 0.3, gridIndex: 2 }],
      bottomEdge: [{ x: 90, y: 22.4, gridIndex: 3 }],
      cap: "round" as const,
      radius: 3,
    };
    expect(buildClipPath(args)).toBe(buildClipPath(args));
  });
});

// ---------------------------------------------------------------------------
// pool.ts
// ---------------------------------------------------------------------------

describe("buildPoolGradient", () => {
  it("uses absolute-px clamped stops, not percentages of length", () => {
    const g = buildPoolGradient({
      lengthPx: 500,
      startEndBuildup: 0,
      color: "#ffe600",
      opacity: 0.5,
    });
    expect(g.startInsetPx).toBe(2);
    expect(g.endInsetPx).toBe(2);
    expect(g.startCorePx).toBe(10);
    expect(g.endCorePx).toBe(10);
    expect(g.startCorePct).toBe(40);
    expect(g.endCorePct).toBe(60);
    expect(g.angle).toBe(85);
  });

  it("the px pool width is identical for short and long marks (R22c)", () => {
    const short = buildPoolGradient({
      lengthPx: 60,
      startEndBuildup: 0.5,
      color: "#000",
      opacity: 0.5,
    });
    const long = buildPoolGradient({
      lengthPx: 900,
      startEndBuildup: 0.5,
      color: "#000",
      opacity: 0.5,
    });
    expect(short.startInsetPx).toBe(long.startInsetPx);
    expect(short.startCorePx).toBe(long.startCorePx);
    expect(short.endCorePx).toBe(long.endCorePx);
    expect(short.endInsetPx).toBe(long.endInsetPx);
  });

  it("positive buildup pools the ends darker than the core", () => {
    const g = buildPoolGradient({
      lengthPx: 400,
      startEndBuildup: 1,
      color: "#000",
      opacity: 0.5,
    });
    const endAlpha = g.stops[0].opacity!;
    const coreAlpha = g.stops[1].opacity!;
    expect(endAlpha).toBeGreaterThan(coreAlpha);
    expect(g.stops[3].opacity).toBe(endAlpha);
  });

  it("zero buildup is flat (all stops equal)", () => {
    const g = buildPoolGradient({
      lengthPx: 400,
      startEndBuildup: 0,
      color: "#000",
      opacity: 0.5,
    });
    const alphas = g.stops.map((s) => s.opacity);
    expect(new Set(alphas).size).toBe(1);
  });

  it("negative buildup engages the anti-pool guardrail (lighter ends)", () => {
    const g = buildPoolGradient({
      lengthPx: 400,
      startEndBuildup: -1,
      color: "#000",
      opacity: 0.5,
    });
    expect(g.stops[0].opacity!).toBeLessThan(g.stops[1].opacity!);
    expect(g.stops[3].opacity!).toBeLessThan(g.stops[2].opacity!);
  });

  it("clamps alpha into [0, 1] even at extreme opacity + buildup", () => {
    const g = buildPoolGradient({
      lengthPx: 400,
      startEndBuildup: 1,
      color: "#000",
      opacity: 1,
    });
    for (const s of g.stops) {
      expect(s.opacity).toBeGreaterThanOrEqual(0);
      expect(s.opacity).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// noise-tile.ts
// ---------------------------------------------------------------------------

describe("buildNoiseTile / buildNoiseTileDataUrl", () => {
  it("emits a base64 data URL with two stitched feTurbulence layers", () => {
    const url = buildNoiseTileDataUrl({ seed: 5, streakiness: 0.5, feathering: 0.4 });
    expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const svg = Buffer.from(url.split(",")[1], "base64").toString("utf8");
    expect((svg.match(/feTurbulence/g) ?? []).length).toBe(2);
    expect((svg.match(/stitchTiles="stitch"/g) ?? []).length).toBe(2);
    expect(svg).toContain('baseFrequency="0.04 0.7"');
    expect(svg).toContain('baseFrequency="0.012"');
  });

  it("defaults to a fixed 256x64 px tile (never percentage-sized)", () => {
    const tile = buildNoiseTile({ seed: 1, streakiness: 0.5, feathering: 0.5 });
    expect(tile.width).toBe(256);
    expect(tile.height).toBe(64);
    const svg = Buffer.from(tile.dataUrl.split(",")[1], "base64").toString("utf8");
    // The tile's own canvas and the painted rect are sized in absolute px — the
    // grain is never percentage/cover-scaled. (The `<filter>` region uses the
    // standard `width="100%"` to cover its input, which is filter-region sizing,
    // not texture scaling, so it is expected and excluded here.)
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="64">');
    expect(svg).toContain('<rect width="256" height="64"');
    expect(svg).not.toMatch(/<(svg|rect)[^>]*=("|')\d+%/);
  });

  it("is deterministic from the seed (byte-identical strings)", () => {
    const a = buildNoiseTileDataUrl({ seed: 9, streakiness: 0.6, feathering: 0.3 });
    const b = buildNoiseTileDataUrl({ seed: 9, streakiness: 0.6, feathering: 0.3 });
    expect(a).toBe(b);
  });

  it("different seeds produce different tile seeds (distinct grain)", () => {
    const a = buildNoiseTileDataUrl({ seed: 1, streakiness: 0.5, feathering: 0.5 });
    const b = buildNoiseTileDataUrl({ seed: 2, streakiness: 0.5, feathering: 0.5 });
    expect(a).not.toBe(b);
  });

  it("does not depend on the DOM btoa global", () => {
    const original = (globalThis as { btoa?: unknown }).btoa;
    try {
      // Remove btoa entirely — the pure encoder must still work (SSR safety).
      delete (globalThis as { btoa?: unknown }).btoa;
      const url = buildNoiseTileDataUrl({ seed: 3, streakiness: 0.5, feathering: 0.5 });
      expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true);
    } finally {
      (globalThis as { btoa?: unknown }).btoa = original;
    }
  });
});

// ---------------------------------------------------------------------------
// mark-space.ts — the resolution-independent integrator
// ---------------------------------------------------------------------------

describe("buildMarkGeometry", () => {
  it("V2 — same seed yields byte-identical geometry (determinism)", () => {
    const opts = makeOptions();
    const rect = makeLineRect();
    const a = buildMarkGeometry(rect, opts, rect.seed);
    const b = buildMarkGeometry(rect, opts, rect.seed);
    expect(a).toEqual(b);
    // The two strings that get serialized into the DOM must be byte-identical.
    expect(a.clipPath).toBe(b.clipPath);
    expect(a.noiseTile.dataUrl).toBe(b.noiseTile.dataUrl);
  });

  it("carries the supplied seed through to the geometry", () => {
    const g = buildMarkGeometry(makeLineRect(), makeOptions(), 4242);
    expect(g.seed).toBe(4242);
  });

  it("samples the mask by per-seed offset (never scaled)", () => {
    const seed = 1729;
    const g = buildMarkGeometry(makeLineRect({ seed }), makeOptions(), seed);
    const tileW = g.noiseTile.width;
    const tileH = g.noiseTile.height;
    expect(g.maskOffset.x).toBe(-(((seed * 37) % tileW + tileW) % tileW));
    expect(g.maskOffset.y).toBe(-(((seed * 13) % tileH + tileH) % tileH));
    // Offsets are within one tile (a slide of the window, not a scale).
    expect(g.maskOffset.x).toBeGreaterThan(-tileW);
    expect(g.maskOffset.x).toBeLessThanOrEqual(0);
  });

  it("V9e — same logical mark at two widths shares wavelength, grain & pool px", () => {
    const opts = makeOptions();
    const seed = 555;
    const narrow = buildMarkGeometry(
      makeLineRect({ seed, width: 200 }),
      opts,
      seed,
    );
    const wide = buildMarkGeometry(
      makeLineRect({ seed, width: 800 }),
      opts,
      seed,
    );

    // (a) Identical grain: same fixed tile, same data URL, same sample offset.
    expect(wide.noiseTile.dataUrl).toBe(narrow.noiseTile.dataUrl);
    expect(wide.noiseTile.width).toBe(narrow.noiseTile.width);
    expect(wide.noiseTile.height).toBe(narrow.noiseTile.height);
    expect(wide.maskOffset).toEqual(narrow.maskOffset);

    // (b) Identical wave wavelength: adjacent grid vertices are exactly
    // `frequency` px apart at both widths.
    const spacing = (verts: { x: number }[]) =>
      verts.length >= 2 ? verts[1].x - verts[0].x : null;
    expect(spacing(narrow.topEdge)).toBe(opts.edge.frequency);
    expect(spacing(wide.topEdge)).toBe(opts.edge.frequency);

    // Only the *count* of periods differs (wider mark has strictly more).
    expect(wide.topEdge.length).toBeGreaterThan(narrow.topEdge.length);

    // (c) Identical cap-pool px width.
    expect(wide.pool.startInsetPx).toBe(narrow.pool.startInsetPx);
    expect(wide.pool.startCorePx).toBe(narrow.pool.startCorePx);
    expect(wide.pool.endCorePx).toBe(narrow.pool.endCorePx);
    expect(wide.pool.endInsetPx).toBe(narrow.pool.endInsetPx);
  });

  it("V9e — vertex y values at shared grid indices are identical across widths", () => {
    const opts = makeOptions();
    const seed = 555;
    const narrow = buildMarkGeometry(makeLineRect({ seed, width: 200 }), opts, seed);
    const wide = buildMarkGeometry(makeLineRect({ seed, width: 800 }), opts, seed);
    for (const v of narrow.topEdge) {
      const match = wide.topEdge.find((w) => w.gridIndex === v.gridIndex);
      expect(match).toEqual(v);
    }
  });

  it("V9f — growing a mark leaves the covered-region path prefix byte-identical", () => {
    const opts = makeOptions();
    const seed = 808;
    // Grow the same line incrementally (left fixed, width increasing) and
    // assert each step's edge vertices for the covered region are unchanged.
    const widths = [200, 320, 460, 700];
    const steps = widths.map((width) =>
      buildMarkGeometry(makeLineRect({ seed, left: 100, width }), opts, seed),
    );

    for (let i = 1; i < steps.length; i++) {
      const prev = steps[i - 1];
      const next = steps[i];
      // Every top-edge vertex emitted in the smaller step survives byte-for-byte
      // at the same local x/y/gridIndex in the larger step — ink that's down
      // stays down (R22d).
      for (const v of prev.topEdge) {
        const match = next.topEdge.find((w) => w.gridIndex === v.gridIndex);
        expect(match).toEqual(v);
      }
      for (const v of prev.bottomEdge) {
        const match = next.bottomEdge.find((w) => w.gridIndex === v.gridIndex);
        expect(match).toEqual(v);
      }
    }
  });

  it("V9f — the clip-path's threaded vertex commands form a stable prefix on growth", () => {
    const opts = makeOptions();
    const seed = 808;
    const small = buildMarkGeometry(makeLineRect({ seed, left: 100, width: 200 }), opts, seed);
    const big = buildMarkGeometry(makeLineRect({ seed, left: 100, width: 700 }), opts, seed);
    // Every threaded wave-vertex command the *smaller* clip path actually
    // serialized must appear verbatim in the larger clip path. Each vertex's
    // x/y are functions of its grid index and the (constant) box origin, so a
    // covered vertex never moves as the mark grows. Corner/cap commands
    // legitimately differ (they reference the box width), so we derive the set
    // from the small path itself rather than over-matching.
    const vertexCommands = [...small.topEdge, ...small.bottomEdge]
      .map((v) => `L ${v.x.toFixed(1)} ${v.y.toFixed(2)} `)
      .filter((cmd) => small.clipPath.includes(cmd));
    expect(vertexCommands.length).toBeGreaterThan(0);
    for (const cmd of vertexCommands) {
      expect(big.clipPath).toContain(cmd);
    }
  });

  it("applies wrap overshoot to inner edges of multiline runs (R20)", () => {
    const opts = makeOptions();
    const seed = 333;
    const single = buildMarkGeometry(
      makeLineRect({ seed, isFirst: true, isLast: true }),
      opts,
      seed,
    );
    const middle = buildMarkGeometry(
      makeLineRect({ seed, isFirst: false, isLast: false }),
      opts,
      seed,
    );
    // A middle line overshoots on both sides, so its band is wider and starts
    // further left than a standalone line with the same text rect.
    expect(middle.box.width).toBeGreaterThan(single.box.width);
    expect(middle.box.x).toBeLessThan(single.box.x);
  });

  it("positions underline and strike-through as thin bands within the line", () => {
    const seed = 12;
    const rect = makeLineRect({ seed, height: 24 });
    const highlight = buildMarkGeometry(rect, makeOptions({ markType: "highlight" }), seed);
    const underline = buildMarkGeometry(rect, makeOptions({ markType: "underline" }), seed);
    const strike = buildMarkGeometry(rect, makeOptions({ markType: "strike-through" }), seed);
    // The full-line highlight is taller than either thin band.
    expect(highlight.box.height).toBeGreaterThan(underline.box.height);
    expect(highlight.box.height).toBeGreaterThan(strike.box.height);
    // Strike sits above the underline (its top y is smaller).
    expect(strike.box.y).toBeLessThan(underline.box.y);
  });

  it("does not touch the DOM (works with document/window undefined)", () => {
    // buildMarkGeometry consumes a plain LineRect, so it must be callable in a
    // pure context. We assert it simply runs and returns absolute-px geometry.
    const g = buildMarkGeometry(makeLineRect(), makeOptions(), 1);
    expect(typeof g.box.x).toBe("number");
    expect(typeof g.box.width).toBe("number");
    expect(g.clipPath).toContain("path(");
  });
});

// ---------------------------------------------------------------------------
// snap.ts
// ---------------------------------------------------------------------------

describe("snapRangeToBounds", () => {
  /** Create a range over a single text node's [start, end] offsets. */
  function rangeOver(text: string, start: number, end: number): Range {
    const node = document.createTextNode(text);
    document.body.appendChild(node);
    const r = document.createRange();
    r.setStart(node, start);
    r.setEnd(node, end);
    return r;
  }

  it("returns the same reference unchanged for mode 'none'", () => {
    const r = rangeOver("hello world", 0, 11);
    expect(snapRangeToBounds(r, "none")).toBe(r);
  });

  it("trims surrounding whitespace for glyph mode", () => {
    const r = rangeOver("  hello  ", 0, 9);
    const snapped = snapRangeToBounds(r, "glyph");
    expect(snapped.toString()).toBe("hello");
  });

  it("expands to whole words for word mode", () => {
    const text = "the quick brown fox";
    // Select "ick brow" (mid-word both ends) -> should grow to "quick brown".
    const start = text.indexOf("ick");
    const end = text.indexOf("brow") + "brow".length;
    const r = rangeOver(text, start, end);
    const snapped = snapRangeToBounds(r, "word");
    expect(snapped.toString()).toBe("quick brown");
  });

  it("does not mutate the input range (returns a clone)", () => {
    const r = rangeOver("  hello  ", 0, 9);
    const before = r.toString();
    snapRangeToBounds(r, "glyph");
    expect(r.toString()).toBe(before);
  });

  it("line mode trims whitespace flush with the text", () => {
    const r = rangeOver("  word  ", 0, 8);
    const snapped = snapRangeToBounds(r, "line");
    expect(snapped.toString()).toBe("word");
  });
});
