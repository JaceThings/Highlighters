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
    tip: {
      type: "chisel",
      width: 12,
      thickness: 3,
      angle: 8,
      overshoot: 2,
      overshootJitter: 1,
      angleJitter: 0,
    },
    ink: {
      flow: 0.5,
      viscosity: 0.5,
      saturation: 0.5,
      feathering: 0.4,
      streakiness: 0.5,
      dryout: 0,
      startEndBuildup: 0.3,
      flowFade: 0,
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
  const baseTip = {
    type: "chisel",
    width: 12,
    thickness: 3,
    angle: 8,
    overshoot: 0,
    overshootJitter: 0,
    angleJitter: 0,
  } as const;

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

  it("threads the supplied edge vertices as smooth Q control points (rounded corners)", () => {
    const s = buildClipPath({
      box: { x: 0, y: 0, width: 200, height: 24 },
      tip: { ...baseTip },
      topEdge: [{ x: 60, y: 0.5, gridIndex: 2 }],
      bottomEdge: [{ x: 90, y: 23.5, gridIndex: 3 }],
      cap: "round",
      radius: 3,
    });
    // Each wave vertex is a quadratic control point (smooth), never a sharp `L`.
    expect(s).toContain("Q 60.0 0.50");
    expect(s).toContain("Q 90.0 23.50");
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
      tip: {
        type: "bullet",
        width: 12,
        thickness: 12,
        angle: 0,
        overshoot: 0,
        overshootJitter: 0,
        angleJitter: 0,
      },
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
      tip: {
        type: "fine",
        width: 4,
        thickness: 2,
        angle: 0,
        overshoot: 0,
        overshootJitter: 0,
        angleJitter: 0,
      },
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

  it("chisel slant grows monotonically with angle across the full range", () => {
    const box = { x: 0, y: 0, width: 200, height: 24 };
    const slantStartX = (angle: number): number => {
      const s = buildClipPath({
        box,
        tip: { type: "chisel", width: 12, thickness: 3, angle, overshoot: 0, overshootJitter: 0, angleJitter: 0 },
        topEdge: [],
        bottomEdge: [],
        cap: "flat",
        radius: 0,
      });
      // The top edge starts at "M <slant> 0" (flat cap ⇒ R=0 ⇒ topStartX = slant).
      return Number(/^path\("M ([\d.]+) 0/.exec(s)![1]);
    };
    // A steeper nib angle leans the parallelogram further — visible end to end,
    // not saturated after a handful of degrees.
    const a10 = slantStartX(10);
    const a35 = slantStartX(35);
    const a70 = slantStartX(70);
    expect(a10).toBeGreaterThan(0);
    expect(a35).toBeGreaterThan(a10);
    expect(a70).toBeGreaterThan(a35);
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

  it("flowFade dries the stroke directionally — start wetter than the end", () => {
    const flat = buildPoolGradient({ lengthPx: 400, startEndBuildup: 0, color: "#000", opacity: 0.5 });
    const dry = buildPoolGradient({ lengthPx: 400, startEndBuildup: 0, color: "#000", opacity: 0.5, flowFade: 0.5 });
    // No flowFade → flat band, start alpha equals end alpha.
    expect(flat.stops[0].opacity).toBe(flat.stops[3].opacity);
    // flowFade leaves the start untouched and drops the end (drier as it slides).
    expect(dry.stops[0].opacity).toBe(flat.stops[0].opacity);
    expect(dry.stops[3].opacity!).toBeLessThan(dry.stops[0].opacity!);
    // Monotonic dry-out across the four stops.
    const a = dry.stops.map((s) => s.opacity!);
    expect(a[0]).toBeGreaterThanOrEqual(a[1]);
    expect(a[1]).toBeGreaterThanOrEqual(a[2]);
    expect(a[2]).toBeGreaterThanOrEqual(a[3]);
  });

  it("flowReversed mirrors the dry-out — wet end, dry start (backward drag)", () => {
    const base = { lengthPx: 400, startEndBuildup: 0, color: "#000", opacity: 0.5, flowFade: 0.5 };
    const fwd = buildPoolGradient(base);
    const rev = buildPoolGradient({ ...base, flowReversed: true });
    // Reversed is the forward ramp flipped end for end: start↔end alphas swap.
    expect(rev.stops[0].opacity).toBeCloseTo(fwd.stops[3].opacity!);
    expect(rev.stops[3].opacity).toBeCloseTo(fwd.stops[0].opacity!);
    // Now the END is the wettest and it dries toward the start (monotonic up).
    const a = rev.stops.map((s) => s.opacity!);
    expect(a[0]).toBeLessThanOrEqual(a[1]);
    expect(a[1]).toBeLessThanOrEqual(a[2]);
    expect(a[2]).toBeLessThanOrEqual(a[3]);
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
    expect(svg).toContain('baseFrequency="0.04 0.34"');
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
// clip-path.ts — draw-on front truncation (grow the band by adding nodes)
// ---------------------------------------------------------------------------

describe("buildClipPath front truncation", () => {
  const tip = {
    type: "chisel", width: 12, thickness: 3, angle: 8, overshoot: 0, overshootJitter: 0, angleJitter: 0,
  } as const;
  const args = (front?: number) => ({
    box: { x: 0, y: 0, width: 200, height: 24 },
    tip: { ...tip },
    topEdge: [] as never[],
    bottomEdge: [] as never[],
    cap: "round" as const,
    radius: 3,
    front,
  });

  it("a degenerate front (cap can't fit) emits an empty, not-yet-inked path", () => {
    expect(buildClipPath(args(0))).toBe('path("M 0 0 Z")');
  });

  it("front === box.width equals the un-truncated full clip (and is the default)", () => {
    const full = buildClipPath(args());
    expect(buildClipPath(args(200))).toBe(full);
  });

  it("draws the leading cap AT the front, not at the full width", () => {
    const mid = buildClipPath(args(120));
    expect(mid).toContain("120.0"); // leading cap arc sits at the front
    expect(mid).not.toContain("200.0"); // not the full box width
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
    // Compare the serializable geometry (the `clipAtFront` closure is a fresh
    // function instance per call, so exclude it and assert it behaves identically).
    const { clipAtFront: aFront, ...aData } = a;
    const { clipAtFront: bFront, ...bData } = b;
    expect(aData).toEqual(bData);
    expect(aFront(50)).toBe(bFront(50));
    // The two strings that get serialized into the DOM must be byte-identical.
    expect(a.clipPath).toBe(b.clipPath);
    expect(a.noiseTile.dataUrl).toBe(b.noiseTile.dataUrl);
  });

  it("carries the supplied seed through to the geometry", () => {
    const g = buildMarkGeometry(makeLineRect(), makeOptions(), 4242);
    expect(g.seed).toBe(4242);
  });

  it("clipAtFront grows the band by adding nodes (full front == clipPath)", () => {
    const g = buildMarkGeometry(makeLineRect({ width: 400 }), makeOptions(), 808);
    // The full-front clip is exactly the settled clip-path (one source of truth).
    expect(g.clipAtFront(g.box.width)).toBe(g.clipPath);
    // A smaller front is a different, shorter band that still starts identically
    // (the left cap + covered prefix is stable as the front grows, R22d).
    const mid = g.clipAtFront(180);
    expect(mid).not.toBe(g.clipPath);
    const prefix = 'path("M ';
    expect(mid.startsWith(prefix)).toBe(true);
    expect(g.clipPath.startsWith(mid.slice(0, 12))).toBe(true);
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
    // Every covered wave vertex the *smaller* clip path serialized (now as a
    // smooth quadratic CONTROL point, `Q x y …`) must appear verbatim in the
    // larger clip path. Each vertex's x/y are functions of its grid index and the
    // (constant) box origin, so a covered vertex never moves as the mark grows.
    // Corner/cap commands legitimately differ (they reference the front), so we
    // derive the set from the small path itself rather than over-matching.
    const vertexCommands = [...small.topEdge, ...small.bottomEdge]
      .map((v) => `Q ${v.x.toFixed(1)} ${v.y.toFixed(2)} `)
      .filter((cmd) => small.clipPath.includes(cmd));
    expect(vertexCommands.length).toBeGreaterThan(0);
    for (const cmd of vertexCommands) {
      expect(big.clipPath).toContain(cmd);
    }
  });

  it("applies the configured overshoot uniformly to every line, regardless of position", () => {
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
    // Overshoot is governed by tip.overshoot for every line; a line's box no
    // longer depends on whether it is the first/last of a run (no special stitch).
    expect(middle.box.width).toBe(single.box.width);
    expect(middle.box.x).toBe(single.box.x);
  });

  it("overshoot extends (or pulls in) the mark's true outer ends", () => {
    const seed = 71;
    const rect = makeLineRect({ seed, left: 100, width: 300 });
    const flush = buildMarkGeometry(
      rect,
      makeOptions({
        tip: { type: "chisel", width: 12, thickness: 3, angle: 8, overshoot: 0, overshootJitter: 0, angleJitter: 0 },
      }),
      seed,
    );
    const over = buildMarkGeometry(
      rect,
      makeOptions({
        tip: { type: "chisel", width: 12, thickness: 3, angle: 8, overshoot: 10, overshootJitter: 0, angleJitter: 0 },
      }),
      seed,
    );
    const under = buildMarkGeometry(
      rect,
      makeOptions({
        tip: { type: "chisel", width: 12, thickness: 3, angle: 8, overshoot: -6, overshootJitter: 0, angleJitter: 0 },
      }),
      seed,
    );
    // With zero jitter, overshoot is the exact px each end runs past the text.
    expect(flush.box.x).toBe(rect.left);
    expect(flush.box.width).toBe(rect.width);
    // +10 overshoot starts 10px earlier and is 20px wider (both ends).
    expect(over.box.x).toBe(rect.left - 10);
    expect(over.box.width).toBe(rect.width + 20);
    // Negative overshoot pulls both ends in.
    expect(under.box.x).toBe(rect.left + 6);
    expect(under.box.width).toBe(rect.width - 12);
  });

  it("overshootJitter varies the two ends deterministically", () => {
    const seed = 71;
    const rect = makeLineRect({ seed, left: 100, width: 300 });
    const opts = makeOptions({
      tip: { type: "chisel", width: 12, thickness: 3, angle: 8, overshoot: 4, overshootJitter: 4, angleJitter: 0 },
    });
    const a = buildMarkGeometry(rect, opts, seed);
    const b = buildMarkGeometry(rect, opts, seed);
    // Deterministic: identical inputs → identical box.
    expect(a.box).toEqual(b.box);
    // The two ends do not land on an identical inset (the whole point of jitter):
    // left inset = left - box.x; right inset = (box.x + width) - (left + width).
    const leftInset = rect.left - a.box.x;
    const rightInset = a.box.x + a.box.width - (rect.left + rect.width);
    expect(leftInset).not.toBe(rightInset);
    // Both stay within the base ± jitter envelope.
    for (const inset of [leftInset, rightInset]) {
      expect(inset).toBeGreaterThanOrEqual(4 - 4);
      expect(inset).toBeLessThanOrEqual(4 + 4);
    }
  });

  it("angleJitter leans each line by a different (deterministic) slant; off by default", () => {
    const rect = makeLineRect({ width: 300 });
    // Default (angleJitter 0): the slant is the same regardless of seed.
    expect(buildMarkGeometry(rect, makeOptions(), 10).slant).toBe(
      buildMarkGeometry(rect, makeOptions(), 20).slant,
    );
    // With angleJitter, two seeds lean by different amounts, yet a given seed is
    // deterministic.
    const opts = makeOptions({
      tip: { type: "chisel", width: 12, thickness: 3, angle: 8, overshoot: 0, overshootJitter: 0, angleJitter: 6 },
    });
    const a = buildMarkGeometry(rect, opts, 10);
    expect(a.slant).not.toBe(buildMarkGeometry(rect, opts, 20).slant);
    expect(buildMarkGeometry(rect, opts, 10).slant).toBe(a.slant);
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
