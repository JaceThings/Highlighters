// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_DEGRADE_THRESHOLD,
  detectEnvironment,
  selectTier,
} from "../src/render/tier-select.js";
import {
  NodePool,
  createOverlayContainer,
  teardownContainer,
} from "../src/render/renderer.js";
import { applyDrawOn, prefersReducedMotion } from "../src/render/animation.js";
import { createCssRenderer, poolGradientToCss } from "../src/render/tier-b-css.js";
import { createSvgRenderer } from "../src/render/tier-a-svg.js";
import { createHighlightApiRenderer } from "../src/render/tier-c-highlight-api.js";
import { createMarkHandle } from "../src/render/mark-handle.js";
import { highlight, highlightSelection, group } from "../src/render/highlight.js";
import { resolveOptions } from "../src/config/merge.js";
import type {
  MarkGeometry,
  RenderContext,
  RenderEnvironment,
  Renderer,
  ResolvedOptions,
} from "../src/types.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** A capability snapshot with everything supported and no preferences set. */
function fullEnv(overrides: Partial<RenderEnvironment> = {}): RenderEnvironment {
  return {
    supportsSvgFilters: true,
    supportsCssBlend: true,
    supportsHighlightApi: true,
    prefersReducedMotion: false,
    prefersReducedData: false,
    coarsePointer: false,
    degradeThreshold: DEFAULT_DEGRADE_THRESHOLD,
    ...overrides,
  };
}

/** A minimal MarkGeometry stub for renderer/animation tests. */
function geometry(seed: number): MarkGeometry {
  return {
    box: { x: 0, y: seed, width: 100, height: 20 },
    seed,
    clipPath: "path('M0 0 H100 V20 H0 Z')",
    // Front-truncated clip: an empty path when closed, the full clip at full width,
    // and a distinct truncated string in between - enough to drive the draw-on.
    clipAtFront: (front: number) =>
      front <= 0
        ? 'path("M 0 0 Z")'
        : front >= 100
          ? "path('M0 0 H100 V20 H0 Z')"
          : `path('M0 0 H${front.toFixed(1)} V20 H0 Z')`,
    slant: 6,
    minFront: 0,
    topEdge: [],
    bottomEdge: [],
    noiseTile: { dataUrl: "data:image/svg+xml,<svg/>", width: 256, height: 64 },
    maskOffset: { x: -10, y: -5 },
    pool: {
      angle: 85,
      startInsetPx: 2,
      startCorePx: 10,
      startCorePct: 40,
      endCorePx: 10,
      endCorePct: 60,
      endInsetPx: 2,
      stops: [
        { offset: 0, color: "#ff0" },
        { offset: 1, color: "#ff0" },
      ],
    },
  };
}

function resolved(overrides: Partial<ResolvedOptions> = {}): ResolvedOptions {
  return { ...resolveOptions(), ...overrides };
}

/** A DOMRect-ish for stubbing Range.getClientRects in happy-dom. */
function dr(left: number, top: number, width: number, height: number): DOMRect {
  return { x: left, y: top, width, height, left, top, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
}
function domRectList(rects: DOMRect[]): DOMRectList {
  const list = {
    length: rects.length,
    item: (i: number) => rects[i] ?? null,
    [Symbol.iterator]: () => rects[Symbol.iterator](),
  } as unknown as DOMRectList & Record<number, DOMRect>;
  for (let i = 0; i < rects.length; i++) list[i] = rects[i];
  return list;
}

// ---------------------------------------------------------------------------
// Tier selection + auto-degrade (R27)
// ---------------------------------------------------------------------------

describe("selectTier", () => {
  it("selects the realistic SVG tier under auto when everything is supported", () => {
    expect(selectTier("auto", fullEnv(), 1)).toBe("svg");
  });

  it("degrades auto SVG -> CSS under prefers-reduced-motion", () => {
    expect(selectTier("auto", fullEnv({ prefersReducedMotion: true }), 1)).toBe("css");
  });

  it("degrades auto SVG -> CSS under prefers-reduced-data", () => {
    expect(selectTier("auto", fullEnv({ prefersReducedData: true }), 1)).toBe("css");
  });

  it("degrades auto SVG -> CSS once the mark count exceeds the threshold", () => {
    const env = fullEnv({ degradeThreshold: 50 });
    expect(selectTier("auto", env, 50)).toBe("svg");
    expect(selectTier("auto", env, 51)).toBe("css");
  });

  it("falls to the next supported tier when SVG filters are unavailable", () => {
    expect(selectTier("auto", fullEnv({ supportsSvgFilters: false }), 1)).toBe("css");
  });

  it("falls all the way to the highlight API when only it is supported", () => {
    const env = fullEnv({ supportsSvgFilters: false, supportsCssBlend: false });
    expect(selectTier("auto", env, 1)).toBe("highlight-api");
  });

  it("honours a pinned tier without auto-degrading on count or preference", () => {
    const env = fullEnv({ prefersReducedMotion: true, degradeThreshold: 1 });
    expect(selectTier("svg", env, 9999)).toBe("svg");
  });

  it("steps a pinned-but-unsupported tier down to the nearest supported one", () => {
    const env = fullEnv({ supportsSvgFilters: false });
    expect(selectTier("svg", env, 1)).toBe("css");
  });
});

describe("detectEnvironment", () => {
  it("returns a snapshot with the default degrade threshold", () => {
    const env = detectEnvironment();
    expect(env.degradeThreshold).toBe(DEFAULT_DEGRADE_THRESHOLD);
    expect(typeof env.prefersReducedMotion).toBe("boolean");
    expect(typeof env.coarsePointer).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// Overlay container: aria-hidden + non-interactive (R30 / V13)
// ---------------------------------------------------------------------------

describe("createOverlayContainer", () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  it("creates an aria-hidden, non-interactive, isolated overlay", () => {
    const container = createOverlayContainer(host);
    expect(container.getAttribute("aria-hidden")).toBe("true");
    expect(container.style.pointerEvents).toBe("none");
    expect(container.style.position).toBe("absolute");
    expect(container.style.isolation).toBe("isolate");
    expect(container.style.mixBlendMode).toBe("multiply");
  });

  it("is idempotent per host", () => {
    const a = createOverlayContainer(host);
    const b = createOverlayContainer(host);
    expect(a).toBe(b);
    expect(host.querySelectorAll(":scope > [data-highlighters-overlay]").length).toBe(1);
  });

  it("teardown removes an emptied container but spares one still holding marks", () => {
    // The container is shared by every mark on a host; each mark's renderer.unmount
    // removes its OWN nodes before teardown. An emptied container is stripped so the
    // last mark out leaves the DOM pristine (R9)...
    const container = createOverlayContainer(host);
    teardownContainer(container);
    expect(host.querySelector("[data-highlighters-overlay]")).toBeNull();

    // ...but a container still holding another mark's nodes is left intact, so
    // removing one mark never tears down its neighbours.
    const shared = createOverlayContainer(host);
    shared.appendChild(document.createElement("span"));
    teardownContainer(shared);
    expect(host.querySelector("[data-highlighters-overlay]")).toBe(shared);
    expect(shared.childNodes.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// NodePool: identity-keyed pooling (A14 §6 / R22d)
// ---------------------------------------------------------------------------

describe("NodePool", () => {
  it("keys nodes by identity and keeps survivors across reconciliation", () => {
    const pool = new NodePool<HTMLElement>();
    const a = document.createElement("div");
    const b = document.createElement("div");
    pool.set(1, a);
    pool.set(2, b);

    const disposed: HTMLElement[] = [];
    pool.retain(new Set([1]), (n) => disposed.push(n));

    expect(pool.get(1)).toBe(a);
    expect(pool.has(2)).toBe(false);
    expect(disposed).toEqual([b]);
  });

  it("clears every node on teardown", () => {
    const pool = new NodePool<HTMLElement>();
    pool.set(1, document.createElement("div"));
    pool.set(2, document.createElement("div"));
    const disposed: HTMLElement[] = [];
    pool.clear((n) => disposed.push(n));
    expect(pool.size).toBe(0);
    expect(disposed.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Renderers: mount/update/unmount leave no residue, nodes aria-hidden (V4/V13)
// ---------------------------------------------------------------------------

describe("createCssRenderer", () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
  });
  afterEach(() => host.remove());

  it("mounts one aria-hidden wipe wrapper per line, each holding a multiply band", () => {
    const renderer = createCssRenderer();
    const container = createOverlayContainer(host);
    const context: RenderContext = {
      container,
      options: resolved(),
      lines: [geometry(0), geometry(20)],
      ranges: [],
    };
    renderer.mount(context);

    // One positioned wrapper per line is mounted as a direct child of the
    // container; the wrapper carries the box position and NO geometry clip so the
    // draw-on can wipe it open without scaling.
    const wrappers = Array.from(container.children) as HTMLElement[];
    expect(wrappers.length).toBe(2);
    for (const wrapper of wrappers) {
      expect(wrapper.getAttribute("aria-hidden")).toBe("true");
      expect(wrapper.style.position).toBe("absolute");
      expect(wrapper.style.clipPath).toBe("");
      // Each wrapper holds exactly one painted band child with the multiply optic.
      const band = wrapper.firstElementChild as HTMLElement;
      expect(band).not.toBeNull();
      expect(band.getAttribute("aria-hidden")).toBe("true");
      expect(band.style.mixBlendMode).toBe("multiply");
      expect(band.style.position).toBe("absolute");
    }
  });

  it("builds the absolute-px pool gradient with min/max clamps (A14 §3)", () => {
    // The clamp keeps a short mark from over-pooling: stops at 2px,
    // min(10px,40%), max(100%-10px,60%), 100%-2px.
    const css = poolGradientToCss(geometry(0).pool);
    expect(css).toContain("linear-gradient(85deg");
    expect(css).toContain("2px");
    expect(css).toContain("min(10px, 40%)");
    expect(css).toContain("max(calc(100% - 10px), 60%)");
    expect(css).toContain("calc(100% - 2px)");
  });

  it("renders a speed gradient as N px-positioned core stops (no min/max clamps)", () => {
    // A live-speed PoolGradient (coreStopsPositionsPx present) → the px-stop path.
    const speedPool = {
      angle: 85,
      startInsetPx: 2,
      startCorePx: 10,
      startCorePct: 40,
      endCorePx: 10,
      endCorePct: 60,
      endInsetPx: 2,
      coreStopCount: 4,
      coreStopsPositionsPx: [16, 80, 160, 240],
      layerScale: 0.6,
      stops: [
        { offset: 0, color: "#000", opacity: 0.5 },
        { offset: 0, color: "#000", opacity: 0.5 },
        { offset: 0.33, color: "#000", opacity: 0.3 },
        { offset: 0.66, color: "#000", opacity: 0.3 },
        { offset: 1, color: "#000", opacity: 0.5 },
        { offset: 1, color: "#000", opacity: 0.5 },
      ],
    };
    const css = poolGradientToCss(speedPool);
    expect(css).toContain("linear-gradient(85deg");
    expect(css).toContain("16px");
    expect(css).toContain("240px");
    expect(css).toContain("calc(100% - 2px)");
    // The speed path uses pre-computed px, never the legacy min()/max() clamps.
    expect(css).not.toContain("min(10px");
    expect(css).not.toContain("max(calc");
    // Relative-alpha normalization (color-mix to the brightest stop) still applies.
    expect(css).toContain("color-mix(in srgb");
  });

  it("retains surviving line nodes by identity on update", () => {
    const renderer = createCssRenderer();
    const container = createOverlayContainer(host);
    renderer.mount({ container, options: resolved(), lines: [geometry(0), geometry(20)], ranges: [] });
    // Two wrappers (the per-line wipe surfaces) are mounted as direct children.
    expect(container.children.length).toBe(2);
    const firstWrapper = container.firstElementChild;
    const firstBand = firstWrapper?.firstElementChild;

    // Drop the second line; the first must keep its exact wrapper + band subtree.
    renderer.update({ container, options: resolved(), lines: [geometry(0)], ranges: [] });
    expect(container.children.length).toBe(1);
    expect(container.firstElementChild).toBe(firstWrapper);
    expect(container.firstElementChild?.firstElementChild).toBe(firstBand);
  });

  it("unmount removes every wrapper and band", () => {
    const renderer = createCssRenderer();
    const container = createOverlayContainer(host);
    renderer.mount({ container, options: resolved(), lines: [geometry(0), geometry(20)], ranges: [] });
    renderer.unmount();
    expect(container.querySelectorAll("div").length).toBe(0);
  });
});

describe("createSvgRenderer", () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
  });
  afterEach(() => {
    host.remove();
    document.getElementById("highlighters-shared-defs")?.remove();
  });

  it("reuses a single shared <svg>/<defs> across marks (R31)", () => {
    const a = createSvgRenderer();
    const b = createSvgRenderer();
    const ca = createOverlayContainer(host);
    const hostB = document.createElement("div");
    document.body.appendChild(hostB);
    const cb = createOverlayContainer(hostB);

    a.mount({ container: ca, options: resolved(), lines: [geometry(0)], ranges: [] });
    b.mount({ container: cb, options: resolved(), lines: [geometry(0)], ranges: [] });

    expect(document.querySelectorAll("#highlighters-shared-defs").length).toBe(1);
    hostB.remove();
  });

  it("applies the absolute-px clip-path and offset-sampled mask to the ink inside the wrapper (A14)", () => {
    const renderer = createSvgRenderer();
    const container = createOverlayContainer(host);
    renderer.mount({ container, options: resolved(), lines: [geometry(40)], ranges: [] });
    // The direct child is the wipe wrapper: positioned at the box, NO geometry
    // clip (so the draw-on inset never stretches the shape).
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.position).toBe("absolute");
    expect(wrapper.style.clipPath).toBe("");
    // The ink node lives inside the wrapper and carries the shape clip + mask.
    const ink = wrapper.lastElementChild as HTMLElement;
    expect(ink.style.clipPath).toContain("path(");
    expect(ink.style.maskPosition).toBe("-10px -5px");
    expect(ink.style.maskSize).toBe("256px 64px");
    expect(ink.style.maskRepeat).toBe("repeat");
  });

  it("adds an additive (screen) glow node only when glow is enabled (R16)", () => {
    const renderer = createSvgRenderer();
    const container = createOverlayContainer(host);
    const glowOpts = resolved({
      glow: { enabled: true, intensity: 0.5, spread: 4, color: "#ffff66" },
    });
    renderer.mount({ container, options: glowOpts, lines: [geometry(0)], ranges: [] });
    const screenNodes = Array.from(container.querySelectorAll("div")).filter(
      (n) => (n as HTMLElement).style.mixBlendMode === "screen",
    );
    expect(screenNodes.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Animation: reduced-motion forces instant; draw-on stagger; in-view (R23-R25)
// ---------------------------------------------------------------------------

describe("applyDrawOn", () => {
  let host: HTMLElement;
  let container: HTMLElement;
  // Per-seed wrapper lookup, exactly like a renderer's `bandFor`: the draw-on finds
  // a line's wrapper by its stable seed, NOT by index into the (possibly shared)
  // container - so marks sharing a container never animate each other's bands.
  let bands: Map<number, HTMLElement>;
  const bandFor = (seed: number): HTMLElement | null => bands.get(seed) ?? null;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    container = createOverlayContainer(host);
    bands = new Map();
    // Mirror the renderer's structure: each direct child is a WRAPPER holding a
    // clip-bearing ink. The renderer owns the ink's full geometry clip; applyDrawOn
    // grows the WRAPPER's clip-path front frame to frame (revealing the subtree),
    // then restores the full clip. The two never write the same element's clip.
    for (const seed of [0, 20]) {
      const wrapper = document.createElement("div");
      const ink = document.createElement("div");
      ink.style.clipPath = geometry(seed).clipPath;
      wrapper.appendChild(ink);
      container.appendChild(wrapper);
      bands.set(seed, wrapper);
    }
  });
  afterEach(() => {
    host.remove();
    vi.useRealTimers();
  });

  const anim = resolved().animation;
  const FULL = geometry(0).clipPath; // the settled clip the stub returns at full front
  const wrapperOf = (i: number) => Array.from(container.children)[i] as HTMLElement;
  const inkOf = (i: number) => wrapperOf(i).firstElementChild as HTMLElement;

  it("shows the full clip instantly under prefers-reduced-motion (R25)", () => {
    const disconnect = applyDrawOn(container, bandFor, [geometry(0), geometry(20)], anim, fullEnv({ prefersReducedMotion: true }));
    // Instant = the full settled clip on the wrapper, no animation.
    expect(wrapperOf(0).style.clipPath).toBe(FULL);
    expect(wrapperOf(1).style.clipPath).toBe(FULL);
    disconnect();
  });

  it("shows the full clip instantly when draw is disabled", () => {
    applyDrawOn(container, bandFor, [geometry(0)], { ...anim, draw: false }, fullEnv());
    expect(wrapperOf(0).style.clipPath).toBe(FULL);
  });

  it("grows the wrapper's clip-path front, then restores the full clip (no mask/opacity/scale)", () => {
    vi.useFakeTimers();
    const disconnect = applyDrawOn(container, bandFor, [geometry(0), geometry(20)], { ...anim, draw: true, trigger: "immediate", direction: "left-to-right", stagger: 50, duration: 200 }, fullEnv());
    const wrapper = wrapperOf(0);
    // play() runs synchronously: the line is parked CLOSED (an empty front clip) -
    // revealed by growing the clip, never by a mask, opacity fade, or transform.
    expect(wrapper.style.clipPath).toContain("M 0 0 Z");
    expect(wrapper.style.maskImage ?? "").toBe("");
    expect(wrapper.style.opacity).toBe("");
    expect(wrapper.style.transform).toBe("");
    // Advance partway: the clip is a TRUNCATED band - non-empty, not yet full.
    vi.advanceTimersByTime(90);
    const mid = wrapper.style.clipPath;
    expect(mid).toContain("path(");
    expect(mid).not.toContain("M 0 0 Z");
    expect(mid).not.toBe(FULL);
    // Advance past duration + stagger: the full settled clip is restored.
    vi.advanceTimersByTime(500);
    expect(wrapper.style.clipPath).toBe(FULL);
    disconnect();
  });

  it("draws on the wrapper, never the ink child - so the renderer keeps the ink's geometry clip", () => {
    vi.useFakeTimers();
    const disconnect = applyDrawOn(container, bandFor, [geometry(0)], { ...anim, draw: true, trigger: "immediate", stagger: 0, duration: 200 }, fullEnv());
    vi.advanceTimersByTime(90);
    // The draw lives on the wrapper; the ink child's clip (the renderer's geometry)
    // is untouched by the animation throughout.
    expect(wrapperOf(0).style.clipPath).not.toBe(FULL);
    expect(inkOf(0).style.clipPath).toBe(FULL);
    disconnect();
  });

  it("survives a reflow that resets the ink clip mid-draw - no flash to full, no restart", () => {
    // The exact regression: a reflow re-runs renderer.update(), which rewrites the
    // ink child's clip to FULL. Because the draw clips the WRAPPER (not the ink),
    // the front is preserved and the band keeps drawing instead of flashing full.
    vi.useFakeTimers();
    const handle = applyDrawOn(container, bandFor, [geometry(0)], { ...anim, draw: true, trigger: "immediate", stagger: 0, duration: 200 }, fullEnv());
    vi.advanceTimersByTime(90);
    const beforeFront = wrapperOf(0).style.clipPath;
    expect(beforeFront).not.toBe(FULL);
    // Simulate renderer.update on reflow: the ink child is reset to its full clip…
    inkOf(0).style.clipPath = FULL;
    // …and the draw is retargeted onto the (unchanged) geometry.
    handle.retarget([geometry(0)]);
    // The wrapper's front clip is still truncated - the visible band did NOT snap to
    // full. (A flash-to-full would mean the wrapper read FULL here.)
    expect(wrapperOf(0).style.clipPath).not.toBe(FULL);
    // The next frame keeps advancing from where it was, then settles - one draw.
    vi.advanceTimersByTime(40);
    expect(wrapperOf(0).style.clipPath).toContain("path(");
    vi.advanceTimersByTime(200);
    expect(wrapperOf(0).style.clipPath).toBe(FULL);
    handle();
  });

  it("retargets an in-flight draw-on onto reflow-corrected geometry, preserving progress", () => {
    vi.useFakeTimers();
    const handle = applyDrawOn(container, bandFor, [geometry(0)], { ...anim, draw: true, trigger: "immediate", stagger: 0, duration: 200 }, fullEnv());
    const wrapper = wrapperOf(0);
    // Mid-draw on the ORIGINAL (width-100) geometry.
    vi.advanceTimersByTime(60);
    expect(wrapper.style.clipPath).toContain("path(");
    expect(wrapper.style.clipPath).not.toContain("H200");
    // A reflow corrects the geometry to width 200 (a late font load widened the
    // line). Retarget the still-running draw-on onto it.
    const wide = {
      ...geometry(0),
      clipPath: "path('M0 0 H200 V20 H0 Z')",
      clipAtFront: (f: number) =>
        f <= 0 ? 'path("M 0 0 Z")' : f >= 200 ? "path('M0 0 H200 V20 H0 Z')" : `path('M0 0 H${f.toFixed(1)} V20 H0 Z')`,
    };
    handle.retarget([wide]);
    // Finish: it settles to the WIDE full clip, not the stale narrow one.
    vi.advanceTimersByTime(400);
    expect(wrapper.style.clipPath).toBe("path('M0 0 H200 V20 H0 Z')");
    handle();
  });

  it("disconnect cancels the draw and restores the full clip (R33)", () => {
    vi.useFakeTimers();
    const cancelSpy = vi.spyOn(globalThis, "cancelAnimationFrame");
    const disconnect = applyDrawOn(container, bandFor, [geometry(0)], { ...anim, draw: true, trigger: "immediate" }, fullEnv());
    disconnect();
    expect(cancelSpy).toHaveBeenCalled();
    expect(wrapperOf(0).style.clipPath).toBe(FULL);
    cancelSpy.mockRestore();
  });

  it("starts the front at minFront (tip touchdown), never below - no start-of-draw pause", () => {
    // The draw maps progress 0→1 onto front [minFront → width]. With a chisel-like
    // minFront of 30, the FIRST drawn frame must already be at ≥30 (the band touches
    // down at its tip and drags) - not a sub-tip value that build() would clamp,
    // which is what made the band pop then sit frozen.
    vi.useFakeTimers();
    const seed = 0;
    const line: MarkGeometry = {
      ...geometry(seed),
      minFront: 30,
      // Echo the requested front so the test can read exactly what was drawn.
      clipAtFront: (f: number) => (f <= 0 ? 'path("M 0 0 Z")' : `path('M0 0 H${f.toFixed(1)} V20 H0 Z')`),
    };
    const readFront = (): number => {
      const m = /H([\d.]+)/.exec(wrapperOf(0).style.clipPath);
      return m ? Number(m[1]) : NaN;
    };
    const disconnect = applyDrawOn(container, bandFor, [line], { ...anim, draw: true, trigger: "immediate", stagger: 0, duration: 200 }, fullEnv());
    // Early in the draw: the band has already touched down at its tip (≥ minFront),
    // never a sub-tip front that build() would clamp into a frozen plateau.
    vi.advanceTimersByTime(50);
    const early = readFront();
    expect(early).toBeGreaterThanOrEqual(30);
    // Later: it has dragged forward (no plateau, no freeze at the touchdown width).
    vi.advanceTimersByTime(60);
    const later = readFront();
    expect(later).toBeGreaterThan(early);
    disconnect();
  });

  it("wicks the onset in (wrapper opacity ramps up), then clears opacity at settle", () => {
    // The touchdown fades in like ink seeping into paper, instead of hard-popping.
    // Opacity rides the WRAPPER (the container carries the page-facing multiply), and
    // is cleared at settle so the rested mark forms no lingering stacking context.
    vi.useFakeTimers();
    const disconnect = applyDrawOn(container, bandFor, [geometry(0)], { ...anim, draw: true, trigger: "immediate", stagger: 0, duration: 1000 }, fullEnv());
    vi.advanceTimersByTime(40);
    const op = wrapperOf(0).style.opacity;
    expect(op).not.toBe(""); // actively fading in during the onset
    expect(Number(op)).toBeGreaterThanOrEqual(0);
    expect(Number(op)).toBeLessThan(1);
    // After the draw settles, opacity is cleared (full, no isolated group at rest).
    vi.advanceTimersByTime(1200);
    expect(wrapperOf(0).style.opacity).toBe("");
    disconnect();
  });

  it("only touches its OWN seed's band, never a sibling mark sharing the container", () => {
    // The root cause of "draws twice": several marks share ONE overlay container,
    // so wrappers for unrelated marks are siblings. A draw-on for line seed 0 must
    // animate ONLY the seed-0 wrapper - never the seed-20 wrapper that belongs to a
    // different mark (which would let N marks all clobber one band).
    vi.useFakeTimers();
    const sibling = wrapperOf(1); // the seed-20 band; this draw-on must not touch it
    expect(sibling.style.clipPath).toBe("");
    const disconnect = applyDrawOn(container, bandFor, [geometry(0)], { ...anim, draw: true, trigger: "immediate", stagger: 0, duration: 200 }, fullEnv());
    vi.advanceTimersByTime(90);
    expect(wrapperOf(0).style.clipPath).toContain("path("); // our band IS drawing
    expect(sibling.style.clipPath).toBe(""); // the other mark's band is untouched
    vi.advanceTimersByTime(300);
    expect(wrapperOf(0).style.clipPath).toBe(FULL);
    expect(sibling.style.clipPath).toBe(""); // still untouched after settle
    disconnect();
  });

  it("an armed in-view mark stays parked closed across a reflow (no pre-view flash)", () => {
    // A reflow that lands BEFORE an in-view mark enters view must not reveal it -
    // otherwise it flashes fully-drawn, then restarts when it finally intersects.
    class FakeIO {
      constructor(public cb: (e: { isIntersecting: boolean }[]) => void) {}
      observe() {}
      disconnect() {}
    }
    const prev = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIO;
    try {
      const handle = applyDrawOn(container, bandFor, [geometry(0)], { ...anim, draw: true, trigger: "in-view", duration: 200 }, fullEnv());
      // Armed, not yet intersected → parked closed (empty front clip).
      expect(wrapperOf(0).style.clipPath).toContain("M 0 0 Z");
      // A reflow lands before view: retarget must keep it closed, not show full.
      handle.retarget([geometry(0)]);
      expect(wrapperOf(0).style.clipPath).toContain("M 0 0 Z");
      expect(wrapperOf(0).style.clipPath).not.toBe(FULL);
      handle();
    } finally {
      (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = prev;
    }
  });
});

describe("prefersReducedMotion", () => {
  it("returns a boolean and does not throw", () => {
    expect(typeof prefersReducedMotion()).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// Mark handle lifecycle: leaves zero residue, observers disconnected (V4)
// ---------------------------------------------------------------------------

describe("createMarkHandle", () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
  });
  afterEach(() => host.remove());

  /** A stub renderer that records mount/update/unmount calls. */
  function stubRenderer(): Renderer & { calls: string[] } {
    const calls: string[] = [];
    return {
      tier: "svg",
      calls,
      mount() {
        calls.push("mount");
      },
      update() {
        calls.push("update");
      },
      bandFor() {
        return null;
      },
      unmount() {
        calls.push("unmount");
      },
    };
  }

  it("remove() unmounts the renderer, disconnects reflow + cleanups, strips the container", () => {
    const container = createOverlayContainer(host);
    const renderer = stubRenderer();
    let reflowDisconnected = false;
    let cleanupRun = false;

    const handle = createMarkHandle({
      ranges: [],
      options: resolved(),
      renderer,
      container,
      reflow: () => {
        reflowDisconnected = true;
      },
      cleanup: [
        () => {
          cleanupRun = true;
        },
      ],
      rebuild: (opts) => ({ container, options: opts, lines: [], ranges: [] }),
    });

    expect(handle.tier).toBe("svg");
    handle.remove();

    expect(renderer.calls).toContain("unmount");
    expect(reflowDisconnected).toBe(true);
    expect(cleanupRun).toBe(true);
    expect(host.querySelector("[data-highlighters-overlay]")).toBeNull();
  });

  it("remove() is idempotent and post-remove methods no-op", () => {
    const container = createOverlayContainer(host);
    const renderer = stubRenderer();
    const handle = createMarkHandle({
      ranges: [],
      options: resolved(),
      renderer,
      container,
      reflow: () => {},
      rebuild: (opts) => ({ container, options: opts, lines: [], ranges: [] }),
    });

    handle.remove();
    expect(() => handle.remove()).not.toThrow();
    handle.show();
    handle.update({});
    expect(handle.isShowing()).toBe(false);
    // Only one unmount despite the second remove() and post-remove update().
    expect(renderer.calls.filter((c) => c === "unmount").length).toBe(1);
  });

  it("show() replays the draw-on entrance, but not on initial mount (R24)", () => {
    const container = createOverlayContainer(host);
    const renderer = stubRenderer();
    const replay = vi.fn();
    const handle = createMarkHandle({
      ranges: [],
      options: resolved(),
      renderer,
      container,
      reflow: () => {},
      replay,
      rebuild: (opts) => ({ container, options: opts, lines: [], ranges: [] }),
    });
    // The initial entrance runs via applyDrawOn directly, so creating the handle
    // does not replay; only an explicit re-show does.
    expect(replay).not.toHaveBeenCalled();
    handle.hide();
    handle.show();
    expect(replay).toHaveBeenCalledTimes(1);
    handle.remove();
    handle.show(); // post-remove no-op
    expect(replay).toHaveBeenCalledTimes(1);
  });

  it("show/hide toggle container visibility without tearing down geometry", () => {
    const container = createOverlayContainer(host);
    const renderer = stubRenderer();
    const handle = createMarkHandle({
      ranges: [],
      options: resolved(),
      renderer,
      container,
      reflow: () => {},
      rebuild: (opts) => ({ container, options: opts, lines: [], ranges: [] }),
    });

    expect(handle.isShowing()).toBe(true);
    handle.hide();
    expect(container.style.visibility).toBe("hidden");
    expect(handle.isShowing()).toBe(false);
    handle.show();
    expect(container.style.visibility).toBe("");
    expect(handle.isShowing()).toBe(true);
    handle.remove();
  });

  it("update() re-resolves options and re-renders (R9)", () => {
    const container = createOverlayContainer(host);
    const renderer = stubRenderer();
    const handle = createMarkHandle({
      ranges: [],
      options: resolved(),
      renderer,
      container,
      reflow: () => {},
      rebuild: (opts) => ({ container, options: opts, lines: [], ranges: [] }),
    });

    handle.update({ opacity: 0.3 });
    expect(renderer.calls).toContain("update");
    handle.remove();
  });
});

// ---------------------------------------------------------------------------
// Public highlight() integration: text untouched, aria-hidden, lifecycle (V13/V4)
// ---------------------------------------------------------------------------

describe("highlight", () => {
  let target: HTMLElement;

  beforeEach(() => {
    target = document.createElement("p");
    target.textContent = "The quick brown fox jumps over the lazy dog.";
    document.body.appendChild(target);
  });
  afterEach(() => {
    target.remove();
    document.getElementById("highlighters-shared-defs")?.remove();
  });

  it("does not alter the underlying text (R29 / V13)", () => {
    const original = target.textContent;
    const handle = highlight(target);
    expect(target.textContent).toBe(original);
    handle.remove();
    expect(target.textContent).toBe(original);
  });

  it("mounts only aria-hidden, non-interactive overlay nodes (R30 / V13)", () => {
    const handle = highlight(target);
    const overlay = document.body.querySelector("[data-highlighters-overlay]");
    if (overlay) {
      expect(overlay.getAttribute("aria-hidden")).toBe("true");
      expect((overlay as HTMLElement).style.pointerEvents).toBe("none");
      for (const child of Array.from(overlay.children)) {
        expect(child.getAttribute("aria-hidden")).toBe("true");
      }
    }
    handle.remove();
  });

  it("remove() leaves zero residual overlay nodes (V4)", () => {
    const before = document.body.querySelectorAll("[data-highlighters-overlay]").length;
    const handle = highlight(target);
    handle.remove();
    const after = document.body.querySelectorAll("[data-highlighters-overlay]").length;
    expect(after).toBe(before);
  });

  it("exposes the active renderer tier on the handle (R27)", () => {
    const handle = highlight(target, { renderer: "css" });
    expect(["svg", "css", "highlight-api"]).toContain(handle.tier);
    handle.remove();
  });

  it("returns an inert handle for an empty/unmatched target", () => {
    const handle = highlight(".does-not-exist");
    expect(handle.isShowing()).toBe(false);
    expect(() => handle.remove()).not.toThrow();
  });

  it("an explicit seed still gives each visual line its OWN wrapper (no collapse)", () => {
    // Two stacked line rects + an explicit seed. Pre-fix every line got the same
    // seed, collapsing the seed-keyed pool to one wrapper (only the last line
    // painted); now each line keeps a distinct deterministic seed.
    const twoLines = domRectList([dr(10, 100, 200, 18), dr(10, 124, 200, 18)]);
    const spy = vi.spyOn(Range.prototype, "getClientRects").mockReturnValue(twoLines);
    try {
      const handle = highlight(target, { seed: 42, renderer: "css", animation: { draw: false } });
      const overlay = document.body.querySelector("[data-highlighters-overlay]")!;
      expect(overlay.children.length).toBe(2);
      const clipsA = Array.from(overlay.children).map((w) => (w as HTMLElement).style.clipPath);
      // Distinct seeds → distinct wave geometry per line (not two identical clips).
      expect(clipsA[0]).not.toBe(clipsA[1]);
      handle.remove();
      // Determinism: same seed + same layout → byte-identical per-line geometry.
      const handle2 = highlight(target, { seed: 42, renderer: "css", animation: { draw: false } });
      const overlay2 = document.body.querySelector("[data-highlighters-overlay]")!;
      const clipsB = Array.from(overlay2.children).map((w) => (w as HTMLElement).style.clipPath);
      expect(clipsB).toEqual(clipsA);
      handle2.remove();
    } finally {
      spy.mockRestore();
    }
  });

  it("removing one mark spares a sibling sharing the body container (R9)", () => {
    // Two marks on different targets both resolve their host to <body>, so they share
    // one overlay container (createOverlayContainer reuses it). Removing the first must
    // not tear the container - and the second's mark - down with it.
    const other = document.createElement("p");
    other.textContent = "A second highlighted line.";
    document.body.appendChild(other);
    const oneLine = domRectList([dr(10, 100, 200, 18)]);
    const spy = vi.spyOn(Range.prototype, "getClientRects").mockReturnValue(oneLine);
    try {
      const h1 = highlight(target, { renderer: "css", animation: { draw: false } });
      const h2 = highlight(other, { renderer: "css", animation: { draw: false } });
      const overlay = document.body.querySelector("[data-highlighters-overlay]")!;
      expect(overlay.children.length).toBe(2); // one wrapper from each mark

      h1.remove();
      // The shared container and h2's mark survive; only h1's wrapper is gone.
      expect(document.body.querySelector("[data-highlighters-overlay]")).toBe(overlay);
      expect(overlay.children.length).toBe(1);

      h2.remove();
      // Last mark out: the emptied container is stripped, leaving the DOM pristine.
      expect(document.body.querySelector("[data-highlighters-overlay]")).toBeNull();
    } finally {
      spy.mockRestore();
      other.remove();
    }
  });

  async function flushRaf(): Promise<void> {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  it("reflows overlay positions on window resize", async () => {
    const spy = vi.spyOn(Range.prototype, "getClientRects");
    spy.mockReturnValue(domRectList([dr(10, 100, 200, 18)]));
    try {
      const handle = highlight(target, { renderer: "css", animation: { draw: false } });
      const overlay = () =>
        document.body.querySelector("[data-highlighters-overlay]")!.children[0] as HTMLElement;
      expect(overlay().style.top).toBe("98px");

      spy.mockReturnValue(domRectList([dr(10, 180, 200, 18)]));
      window.dispatchEvent(new Event("resize"));
      await flushRaf();

      // Re-query: a reflow that shifts the line seed swaps the pooled wrapper node.
      expect(overlay().style.top).toBe("178px");
      handle.remove();
    } finally {
      spy.mockRestore();
    }
  });

  it("update() reshaping the mark refreshes the draw-on wrapper clip (no stale crop)", () => {
    // The draw-on clips the WRAPPER to the mark shape; the ink child carries the same
    // geometry. An option change that reshapes the mark (a tip swap) must re-point the
    // draw-on, else the wrapper keeps the OLD shape's clip and crops the new one.
    const oneLine = domRectList([dr(10, 100, 200, 18)]);
    const spy = vi.spyOn(Range.prototype, "getClientRects").mockReturnValue(oneLine);
    try {
      const handle = highlight(target, {
        renderer: "css",
        animation: { draw: false },
        tip: { type: "chisel", angle: 16 },
      });
      const wrapper = document.body.querySelector("[data-highlighters-overlay]")!
        .children[0] as HTMLElement;
      const slantedClip = wrapper.style.clipPath;
      expect(slantedClip).not.toBe(""); // the settled draw-on left a full clip on the wrapper

      // Reshape in place: slanted chisel -> bullet. The wrapper clip must follow.
      handle.update({ tip: { type: "bullet", angle: 0 } });
      expect(wrapper.style.clipPath).not.toBe(slantedClip);
      handle.remove();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("highlightSelection reflow", () => {
  let target: HTMLElement;
  let mockRange: Range;
  let article: HTMLElement;

  beforeEach(() => {
    article = document.createElement("article");
    article.style.position = "relative";
    target = document.createElement("p");
    target.textContent = "Selected text here";
    article.appendChild(target);
    document.body.appendChild(article);
    mockRange = document.createRange();
    mockRange.selectNodeContents(target);
  });

  afterEach(() => {
    article.remove();
    document.getElementById("highlighters-shared-defs")?.remove();
    vi.restoreAllMocks();
  });

  it("mounts the overlay on the selection anchor, not document.body", () => {
    const rects = vi.spyOn(Range.prototype, "getClientRects");
    rects.mockReturnValue(domRectList([dr(10, 100, 200, 18)]));
    const mockSelection = {
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => mockRange.cloneRange(),
      anchorNode: target.firstChild,
      focusNode: target.firstChild,
      anchorOffset: 0,
      focusOffset: 5,
    };
    vi.spyOn(document, "getSelection").mockReturnValue(mockSelection as unknown as Selection);
    const handle = highlightSelection({ renderer: "css", animation: { draw: false } });
    expect(article.querySelector("[data-highlighters-overlay]")).not.toBeNull();
    expect(document.body.querySelector(":scope > [data-highlighters-overlay]")).toBeNull();
    handle.remove();
    rects.mockRestore();
  });

  async function flushRaf(): Promise<void> {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  it("reflows on window resize while a selection is active", async () => {
    const rects = vi.spyOn(Range.prototype, "getClientRects");
    rects.mockReturnValue(domRectList([dr(10, 100, 200, 18)]));

    const mockSelection = {
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => mockRange.cloneRange(),
      anchorNode: target.firstChild,
      focusNode: target.firstChild,
      anchorOffset: 0,
      focusOffset: 5,
    };
    vi.spyOn(document, "getSelection").mockReturnValue(mockSelection as unknown as Selection);

    const handle = highlightSelection({ renderer: "css", animation: { draw: false } });
    const overlay = () =>
      article.querySelector("[data-highlighters-overlay]")!.children[0] as HTMLElement;
    expect(overlay().style.top).toBe("98px");

    rects.mockReturnValue(domRectList([dr(10, 180, 200, 18)]));
    window.dispatchEvent(new Event("resize"));
    await flushRaf();

    expect(overlay().style.top).toBe("178px");
    handle.remove();
  });
});

describe("Tier C (Custom Highlight API)", () => {
  afterEach(() => {
    document.getElementById("highlighters-highlight-api-styles")?.remove();
  });

  it("folds opacity into the fill via color-mix so coverage matches A/B (R28)", () => {
    const host = document.createElement("p");
    document.body.appendChild(host);
    const container = createOverlayContainer(host);
    const renderer = createHighlightApiRenderer();
    const options = resolved({ color: "#ff0000", opacity: 0.5 });
    renderer.mount({ container, options, lines: [], ranges: [] });
    const css = document.getElementById("highlighters-highlight-api-styles")?.textContent ?? "";
    expect(css).toContain("color-mix");
    expect(css).toContain("50%");
    // Not a bare, fully-opaque fill.
    expect(css).not.toContain("background-color: #ff0000;");
    renderer.unmount();
    host.remove();
  });
});

// ---------------------------------------------------------------------------
// group(): choreography over multiple handles (R10)
// ---------------------------------------------------------------------------

describe("group", () => {
  it("shows, hides, and removes all member handles", () => {
    const events: string[] = [];
    const make = (id: string) =>
      ({
        show: () => events.push(`show:${id}`),
        hide: () => events.push(`hide:${id}`),
        remove: () => events.push(`remove:${id}`),
        update: () => {},
        isShowing: () => true,
        tier: "css",
      }) as const;

    const g = group([make("a"), make("b")]);
    expect(g.marks.length).toBe(2);
    g.show();
    g.hide();
    g.remove();
    expect(events).toEqual([
      "show:a",
      "show:b",
      "hide:a",
      "hide:b",
      "remove:a",
      "remove:b",
    ]);
  });
});
