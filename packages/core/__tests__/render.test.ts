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
import { highlight, highlightAll, highlightSelection, group } from "../src/render/highlight.js";
import { resolveOptions } from "../src/config/merge.js";
import type {
  MarkGeometry,
  RenderContext,
  RenderEnvironment,
  Renderer,
  ResolvedOptions,
} from "../src/types.js";

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

function geometry(seed: number): MarkGeometry {
  return {
    box: { x: 0, y: seed, width: 100, height: 20 },
    seed,
    clipPath: "path('M0 0 H100 V20 H0 Z')",
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

function dr(left: number, top: number, width: number, height: number): DOMRect {
  return new DOMRect(left, top, width, height);
}

class TestRectList extends Array<DOMRect> implements DOMRectList {
  item(index: number): DOMRect | null {
    return this[index] ?? null;
  }
}

function domRectList(rects: DOMRect[]): DOMRectList {
  const list = new TestRectList();
  list.push(...rects);
  return list;
}

function htmlElement(el: Element | null | undefined): HTMLElement {
  if (!(el instanceof HTMLElement)) throw new Error("expected an HTMLElement");
  return el;
}

function htmlChildren(parent: ParentNode): HTMLElement[] {
  return Array.from(parent.children).filter((el) => el instanceof HTMLElement);
}

function htmlQueryAll(parent: ParentNode, selector: string): HTMLElement[] {
  return Array.from(parent.querySelectorAll(selector)).filter((el) => el instanceof HTMLElement);
}

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
    expect([true, false]).toContain(env.prefersReducedMotion);
    expect([true, false]).toContain(env.coarsePointer);
  });
});

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
    const container = createOverlayContainer(host);
    teardownContainer(container);
    expect(host.querySelector("[data-highlighters-overlay]")).toBeNull();

    const shared = createOverlayContainer(host);
    shared.appendChild(document.createElement("span"));
    teardownContainer(shared);
    expect(host.querySelector("[data-highlighters-overlay]")).toBe(shared);
    expect(shared.childNodes.length).toBe(1);
  });
});

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

    const wrappers = htmlChildren(container);
    expect(wrappers.length).toBe(2);
    for (const wrapper of wrappers) {
      expect(wrapper.getAttribute("aria-hidden")).toBe("true");
      expect(wrapper.style.position).toBe("absolute");
      expect(wrapper.style.clipPath).toBe("");
      const band = htmlElement(wrapper.firstElementChild);
      expect(band).not.toBeNull();
      expect(band.getAttribute("aria-hidden")).toBe("true");
      expect(band.style.mixBlendMode).toBe("multiply");
      expect(band.style.position).toBe("absolute");
    }
  });

  it("builds the absolute-px pool gradient with min/max clamps (A14 §3)", () => {
    const css = poolGradientToCss(geometry(0).pool);
    expect(css).toContain("linear-gradient(85deg");
    expect(css).toContain("2px");
    expect(css).toContain("min(10px, 40%)");
    expect(css).toContain("max(calc(100% - 10px), 60%)");
    expect(css).toContain("calc(100% - 2px)");
  });

  it("renders a speed gradient as N px-positioned core stops (no min/max clamps)", () => {
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
    expect(css).not.toContain("min(10px");
    expect(css).not.toContain("max(calc");
    expect(css).toContain("color-mix(in srgb");
  });

  it("retains surviving line nodes by identity on update", () => {
    const renderer = createCssRenderer();
    const container = createOverlayContainer(host);
    renderer.mount({ container, options: resolved(), lines: [geometry(0), geometry(20)], ranges: [] });
    expect(container.children.length).toBe(2);
    const firstWrapper = container.firstElementChild;
    const firstBand = firstWrapper?.firstElementChild;

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

  it("under vivid, mounts bands into a normal escape layer beside the multiply container", () => {
    const renderer = createCssRenderer();
    const container = createOverlayContainer(host);
    renderer.mount({ container, options: resolved({ vivid: true }), lines: [geometry(0), geometry(20)], ranges: [] });

    const layer = htmlChildren(host).find(
      (el) => el !== container && el.style.mixBlendMode === "normal",
    );
    expect(layer).toBeDefined();
    expect(layer!.style.isolation).toBe("isolate");
    expect(container.children.length).toBe(0);
    expect(layer!.children.length).toBe(2);
    const bandBlends = htmlQueryAll(layer!, "div").map((n) => n.style.mixBlendMode);
    expect(bandBlends).toContain("multiply");

    renderer.unmount();
    expect(host.contains(layer!)).toBe(false);
  });

  it("reconciles the escape layer when vivid changes across updates (re-blends, tears down)", () => {
    const renderer = createCssRenderer();
    const container = createOverlayContainer(host);
    const escapeLayers = () =>
      htmlChildren(host).filter((el) => el !== container);

    renderer.mount({ container, options: resolved({ vivid: "screen" }), lines: [geometry(0)], ranges: [] });
    expect(escapeLayers().map((l) => l.style.mixBlendMode)).toEqual(["screen"]);
    renderer.update({ container, options: resolved({ vivid: true }), lines: [geometry(0)], ranges: [] });
    expect(escapeLayers().map((l) => l.style.mixBlendMode)).toEqual(["normal"]);
    expect(container.children.length).toBe(0);

    renderer.update({ container, options: resolved({ vivid: false }), lines: [geometry(0)], ranges: [] });
    expect(escapeLayers().length).toBe(0);
    expect(container.children.length).toBe(1);

    renderer.unmount();
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
    const wrapper = htmlElement(container.firstElementChild);
    expect(wrapper.style.position).toBe("absolute");
    expect(wrapper.style.clipPath).toBe("");
    const ink = htmlElement(wrapper.lastElementChild);
    expect(ink.style.clipPath).toContain("path(");
    expect(ink.style.getPropertyValue("mask-position")).toBe("-10px -5px");
    expect(ink.style.getPropertyValue("mask-size")).toBe("256px 64px");
    expect(ink.style.getPropertyValue("mask-repeat")).toBe("repeat");
  });

  it("adds an additive (screen) glow node only when glow is enabled (R16)", () => {
    const renderer = createSvgRenderer();
    const container = createOverlayContainer(host);
    const glowOpts = resolved({
      glow: { enabled: true, intensity: 0.5, spread: 4, color: "#ffff66" },
    });
    renderer.mount({ container, options: glowOpts, lines: [geometry(0)], ranges: [] });
    const screenNodes = htmlQueryAll(container, "div").filter(
      (n) => n.style.mixBlendMode === "screen",
    );
    expect(screenNodes.length).toBe(1);
  });

  it("under vivid, escapes the multiply container into a sibling normal layer on the host", () => {
    const renderer = createSvgRenderer();
    const container = createOverlayContainer(host);
    renderer.mount({ container, options: resolved({ vivid: true }), lines: [geometry(0)], ranges: [] });

    const layer = htmlChildren(host).find(
      (el) => el !== container && el.style.mixBlendMode === "normal",
    );
    expect(layer).toBeDefined();
    expect(layer!.style.isolation).toBe("isolate");
    expect(container.children.length).toBe(0);
    expect(layer!.querySelector("div")).not.toBeNull();
    const inkBlends = htmlQueryAll(layer!, "div").map((n) => n.style.mixBlendMode);
    expect(inkBlends).toContain("multiply");

    renderer.unmount();
    expect(host.contains(layer!)).toBe(false);
  });

  it('under vivid: "screen", the escape layer uses the screen blend', () => {
    const renderer = createSvgRenderer();
    const container = createOverlayContainer(host);
    renderer.mount({ container, options: resolved({ vivid: "screen" }), lines: [geometry(0)], ranges: [] });

    const layer = htmlChildren(host).find(
      (el) => el !== container && el.style.mixBlendMode === "screen",
    );
    expect(layer).toBeDefined();
    expect(layer!.style.isolation).toBe("isolate");
    expect(container.children.length).toBe(0);

    renderer.unmount();
  });

  it("reconciles the escape layer when vivid changes across updates (re-blends, tears down)", () => {
    const renderer = createSvgRenderer();
    const container = createOverlayContainer(host);
    const escapeLayers = () =>
      htmlChildren(host).filter((el) => el !== container);

    renderer.mount({ container, options: resolved({ vivid: "screen" }), lines: [geometry(0)], ranges: [] });
    expect(escapeLayers().map((l) => l.style.mixBlendMode)).toEqual(["screen"]);
    renderer.update({ container, options: resolved({ vivid: true }), lines: [geometry(0)], ranges: [] });
    expect(escapeLayers().map((l) => l.style.mixBlendMode)).toEqual(["normal"]);
    expect(container.children.length).toBe(0);

    renderer.update({ container, options: resolved({ vivid: false }), lines: [geometry(0)], ranges: [] });
    expect(escapeLayers().length).toBe(0);
    expect(container.children.length).toBe(1);

    renderer.unmount();
  });
});

describe("applyDrawOn", () => {
  let host: HTMLElement;
  let container: HTMLElement;
  let bands: Map<number, HTMLElement>;
  const bandFor = (seed: number): HTMLElement | null => bands.get(seed) ?? null;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    container = createOverlayContainer(host);
    bands = new Map();
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
  const FULL = geometry(0).clipPath;
  const wrapperOf = (i: number) => htmlChildren(container)[i];
  const inkOf = (i: number) => htmlElement(wrapperOf(i).firstElementChild);

  it("shows the full clip instantly under prefers-reduced-motion (R25)", () => {
    const disconnect = applyDrawOn(container, bandFor, [geometry(0), geometry(20)], anim, fullEnv({ prefersReducedMotion: true }));
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
    expect(wrapper.style.clipPath).toContain("M 0 0 Z");
    expect(wrapper.style.getPropertyValue("mask-image")).toBe("");
    expect(wrapper.style.opacity).toBe("");
    expect(wrapper.style.transform).toBe("");
    vi.advanceTimersByTime(90);
    const mid = wrapper.style.clipPath;
    expect(mid).toContain("path(");
    expect(mid).not.toContain("M 0 0 Z");
    expect(mid).not.toBe(FULL);
    vi.advanceTimersByTime(500);
    expect(wrapper.style.clipPath).toBe(FULL);
    disconnect();
  });

  it("draws on the wrapper, never the ink child - so the renderer keeps the ink's geometry clip", () => {
    vi.useFakeTimers();
    const disconnect = applyDrawOn(container, bandFor, [geometry(0)], { ...anim, draw: true, trigger: "immediate", stagger: 0, duration: 200 }, fullEnv());
    vi.advanceTimersByTime(90);
    expect(wrapperOf(0).style.clipPath).not.toBe(FULL);
    expect(inkOf(0).style.clipPath).toBe(FULL);
    disconnect();
  });

  it("survives a reflow that resets the ink clip mid-draw - no flash to full, no restart", () => {
    vi.useFakeTimers();
    const handle = applyDrawOn(container, bandFor, [geometry(0)], { ...anim, draw: true, trigger: "immediate", stagger: 0, duration: 200 }, fullEnv());
    vi.advanceTimersByTime(90);
    const beforeFront = wrapperOf(0).style.clipPath;
    expect(beforeFront).not.toBe(FULL);
    inkOf(0).style.clipPath = FULL;
    handle.retarget([geometry(0)]);
    expect(wrapperOf(0).style.clipPath).not.toBe(FULL);
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
    vi.advanceTimersByTime(60);
    expect(wrapper.style.clipPath).toContain("path(");
    expect(wrapper.style.clipPath).not.toContain("H200");
    const wide = {
      ...geometry(0),
      clipPath: "path('M0 0 H200 V20 H0 Z')",
      clipAtFront: (f: number) =>
        f <= 0 ? 'path("M 0 0 Z")' : f >= 200 ? "path('M0 0 H200 V20 H0 Z')" : `path('M0 0 H${f.toFixed(1)} V20 H0 Z')`,
    };
    handle.retarget([wide]);
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
    vi.useFakeTimers();
    const seed = 0;
    const line: MarkGeometry = {
      ...geometry(seed),
      minFront: 30,
      clipAtFront: (f: number) => (f <= 0 ? 'path("M 0 0 Z")' : `path('M0 0 H${f.toFixed(1)} V20 H0 Z')`),
    };
    const readFront = (): number => {
      const m = /H([\d.]+)/.exec(wrapperOf(0).style.clipPath);
      return m ? Number(m[1]) : NaN;
    };
    const disconnect = applyDrawOn(container, bandFor, [line], { ...anim, draw: true, trigger: "immediate", stagger: 0, duration: 200 }, fullEnv());
    vi.advanceTimersByTime(50);
    const early = readFront();
    expect(early).toBeGreaterThanOrEqual(30);
    vi.advanceTimersByTime(60);
    const later = readFront();
    expect(later).toBeGreaterThan(early);
    disconnect();
  });

  it("wicks the onset in (wrapper opacity ramps up), then clears opacity at settle", () => {
    vi.useFakeTimers();
    const disconnect = applyDrawOn(container, bandFor, [geometry(0)], { ...anim, draw: true, trigger: "immediate", stagger: 0, duration: 1000 }, fullEnv());
    vi.advanceTimersByTime(40);
    const op = wrapperOf(0).style.opacity;
    expect(op).not.toBe("");
    expect(Number(op)).toBeGreaterThanOrEqual(0);
    expect(Number(op)).toBeLessThan(1);
    vi.advanceTimersByTime(1200);
    expect(wrapperOf(0).style.opacity).toBe("");
    disconnect();
  });

  it("only touches its OWN seed's band, never a sibling mark sharing the container", () => {
    vi.useFakeTimers();
    const sibling = wrapperOf(1);
    expect(sibling.style.clipPath).toBe("");
    const disconnect = applyDrawOn(container, bandFor, [geometry(0)], { ...anim, draw: true, trigger: "immediate", stagger: 0, duration: 200 }, fullEnv());
    vi.advanceTimersByTime(90);
    expect(wrapperOf(0).style.clipPath).toContain("path(");
    expect(sibling.style.clipPath).toBe("");
    vi.advanceTimersByTime(300);
    expect(wrapperOf(0).style.clipPath).toBe(FULL);
    expect(sibling.style.clipPath).toBe("");
    disconnect();
  });

  it("an armed in-view mark stays parked closed across a reflow (no pre-view flash)", () => {
    class FakeIO {
      constructor(public cb: (e: { isIntersecting: boolean }[]) => void) {}
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", FakeIO);
    try {
      const handle = applyDrawOn(container, bandFor, [geometry(0)], { ...anim, draw: true, trigger: "in-view", duration: 200 }, fullEnv());
      expect(wrapperOf(0).style.clipPath).toContain("M 0 0 Z");
      handle.retarget([geometry(0)]);
      expect(wrapperOf(0).style.clipPath).toContain("M 0 0 Z");
      expect(wrapperOf(0).style.clipPath).not.toBe(FULL);
      handle();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("prefersReducedMotion", () => {
  it("returns a boolean and does not throw", () => {
    expect([true, false]).toContain(prefersReducedMotion());
  });
});

describe("createMarkHandle", () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
  });
  afterEach(() => host.remove());

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
    expect(replay).not.toHaveBeenCalled();
    handle.hide();
    handle.show();
    expect(replay).toHaveBeenCalledTimes(1);
    handle.remove();
    handle.show();
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

  it("measures each range once (no extra computeAnchor layout walk)", () => {
    const spy = vi.spyOn(Range.prototype, "getClientRects");
    const handle = highlight(target, { animation: { draw: false } });
    const calls = spy.mock.calls.length;
    handle.remove();
    spy.mockRestore();
    expect(calls).toBe(1);
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
      expect(htmlElement(overlay).style.pointerEvents).toBe("none");
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
    const twoLines = domRectList([dr(10, 100, 200, 18), dr(10, 124, 200, 18)]);
    const spy = vi.spyOn(Range.prototype, "getClientRects").mockReturnValue(twoLines);
    try {
      const handle = highlight(target, { seed: 42, renderer: "css", animation: { draw: false } });
      const overlay = document.body.querySelector("[data-highlighters-overlay]")!;
      expect(overlay.children.length).toBe(2);
      const clipsA = htmlChildren(overlay).map((w) => w.style.clipPath);
      expect(clipsA[0]).not.toBe(clipsA[1]);
      handle.remove();
      const handle2 = highlight(target, { seed: 42, renderer: "css", animation: { draw: false } });
      const overlay2 = document.body.querySelector("[data-highlighters-overlay]")!;
      const clipsB = htmlChildren(overlay2).map((w) => w.style.clipPath);
      expect(clipsB).toEqual(clipsA);
      handle2.remove();
    } finally {
      spy.mockRestore();
    }
  });

  it("removing one mark spares a sibling sharing the body container (R9)", () => {
    const other = document.createElement("p");
    other.textContent = "A second highlighted line.";
    document.body.appendChild(other);
    const oneLine = domRectList([dr(10, 100, 200, 18)]);
    const spy = vi.spyOn(Range.prototype, "getClientRects").mockReturnValue(oneLine);
    try {
      const h1 = highlight(target, { renderer: "css", animation: { draw: false } });
      const h2 = highlight(other, { renderer: "css", animation: { draw: false } });
      const overlay = document.body.querySelector("[data-highlighters-overlay]")!;
      expect(overlay.children.length).toBe(2);

      h1.remove();
      expect(document.body.querySelector("[data-highlighters-overlay]")).toBe(overlay);
      expect(overlay.children.length).toBe(1);

      h2.remove();
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
        htmlElement(document.body.querySelector("[data-highlighters-overlay]")!.children[0]);
      expect(overlay().style.top).toBe("98px");

      spy.mockReturnValue(domRectList([dr(10, 180, 200, 18)]));
      window.dispatchEvent(new Event("resize"));
      await flushRaf();

      expect(overlay().style.top).toBe("178px");
      handle.remove();
    } finally {
      spy.mockRestore();
    }
  });

  it("update() reshaping the mark refreshes the draw-on wrapper clip (no stale crop)", () => {
    const oneLine = domRectList([dr(10, 100, 200, 18)]);
    const spy = vi.spyOn(Range.prototype, "getClientRects").mockReturnValue(oneLine);
    try {
      const handle = highlight(target, {
        renderer: "css",
        animation: { draw: false },
        tip: { type: "chisel", angle: 16 },
      });
      const wrapper = htmlElement(
        document.body.querySelector("[data-highlighters-overlay]")!.children[0],
      );
      const slantedClip = wrapper.style.clipPath;
      expect(slantedClip).not.toBe("");

      handle.update({ tip: { type: "bullet", angle: 0 } });
      expect(wrapper.style.clipPath).not.toBe(slantedClip);
      handle.remove();
    } finally {
      spy.mockRestore();
    }
  });

  it("serves ink-only update()s from the measurement cache: zero forced layout reads", () => {
    const rects = vi.spyOn(Range.prototype, "getClientRects").mockReturnValue(domRectList([dr(10, 100, 200, 18)]));
    const origin = vi.spyOn(Element.prototype, "getBoundingClientRect");
    try {
      const handle = highlight(target, { renderer: "css", animation: { draw: false } });
      const rectReads = rects.mock.calls.length;
      const originReads = origin.mock.calls.length;
      expect(rectReads).toBeGreaterThan(0);
      expect(originReads).toBeGreaterThan(0);

      handle.update({ color: "#ff0000" });
      handle.update({ opacity: 0.4 });

      expect(rects.mock.calls.length).toBe(rectReads);
      expect(origin.mock.calls.length).toBe(originReads);
      handle.remove();
    } finally {
      rects.mockRestore();
      origin.mockRestore();
    }
  });

  it("re-measures when the reflow observer fires, then serves updates from the fresh rects", async () => {
    const rects = vi.spyOn(Range.prototype, "getClientRects").mockReturnValue(domRectList([dr(10, 100, 200, 18)]));
    const origin = vi.spyOn(Element.prototype, "getBoundingClientRect");
    try {
      const handle = highlight(target, { renderer: "css", animation: { draw: false } });
      handle.update({ opacity: 0.4 });
      const rectReads = rects.mock.calls.length;
      const originReads = origin.mock.calls.length;

      rects.mockReturnValue(domRectList([dr(10, 180, 200, 18)]));
      window.dispatchEvent(new Event("resize"));
      await flushRaf();

      expect(rects.mock.calls.length).toBeGreaterThan(rectReads);
      expect(origin.mock.calls.length).toBeGreaterThan(originReads);
      const overlay = () =>
        htmlElement(document.body.querySelector("[data-highlighters-overlay]")!.children[0]);
      expect(overlay().style.top).toBe("178px");

      const reflowedReads = rects.mock.calls.length;
      handle.update({ color: "#ff0000" });
      expect(rects.mock.calls.length).toBe(reflowedReads);
      expect(overlay().style.top).toBe("178px");
      handle.remove();
    } finally {
      rects.mockRestore();
      origin.mockRestore();
    }
  });

  it("re-measures when update() changes the resolved snap, once per snap value", () => {
    const rects = vi.spyOn(Range.prototype, "getClientRects").mockReturnValue(domRectList([dr(10, 100, 200, 18)]));
    const origin = vi.spyOn(Element.prototype, "getBoundingClientRect");
    try {
      const handle = highlight(target, { renderer: "css", animation: { draw: false } });
      const rectReads = rects.mock.calls.length;
      const originReads = origin.mock.calls.length;

      handle.update({ snap: "none" });
      expect(rects.mock.calls.length).toBeGreaterThan(rectReads);
      expect(origin.mock.calls.length).toBeGreaterThan(originReads);

      const snapReads = rects.mock.calls.length;
      handle.update({ snap: "none" });
      expect(rects.mock.calls.length).toBe(snapReads);
      handle.remove();
    } finally {
      rects.mockRestore();
      origin.mockRestore();
    }
  });

  it("a cached rebuild yields geometry identical to a fresh measurement of the same layout", () => {
    const twoLines = domRectList([dr(10, 100, 200, 18), dr(10, 124, 200, 18)]);
    const rects = vi.spyOn(Range.prototype, "getClientRects").mockReturnValue(twoLines);
    try {
      const readGeometry = () =>
        htmlChildren(document.body.querySelector("[data-highlighters-overlay]")!).map((el) => [
          el.style.top,
          el.style.left,
          el.style.width,
          el.style.height,
          el.style.clipPath,
        ]);

      const handle = highlight(target, { renderer: "css", animation: { draw: false } });
      handle.update({ tip: { type: "bullet", angle: 0 } });
      const cached = readGeometry();
      handle.remove();

      const fresh = highlight(target, { renderer: "css", animation: { draw: false }, tip: { type: "bullet", angle: 0 } });
      expect(readGeometry()).toEqual(cached);
      fresh.remove();
    } finally {
      rects.mockRestore();
    }
  });

  it("a watched mark's update() re-collects ranges and re-measures", () => {
    const rects = vi.spyOn(Range.prototype, "getClientRects").mockReturnValue(domRectList([dr(10, 100, 200, 18)]));
    const origin = vi.spyOn(Element.prototype, "getBoundingClientRect");
    try {
      const handle = highlightAll({ renderer: "css", animation: { draw: false } });
      const rectReads = rects.mock.calls.length;
      const originReads = origin.mock.calls.length;
      expect(rectReads).toBeGreaterThan(0);

      handle.update({});
      expect(rects.mock.calls.length).toBeGreaterThan(rectReads);
      expect(origin.mock.calls.length).toBeGreaterThan(originReads);
      handle.remove();
    } finally {
      rects.mockRestore();
      origin.mockRestore();
    }
  });
});

function selectWithin(el: HTMLElement, anchorOffset: number, focusOffset: number): void {
  const text = el.firstChild;
  if (!(text instanceof Text)) throw new Error("expected the target to start with a text node");
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.setBaseAndExtent(text, anchorOffset, text, focusOffset);
}

describe("highlightSelection reflow", () => {
  let target: HTMLElement;
  let article: HTMLElement;

  beforeEach(() => {
    article = document.createElement("article");
    article.style.position = "relative";
    target = document.createElement("p");
    target.textContent = "Selected text here";
    article.appendChild(target);
    document.body.appendChild(article);
  });

  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    article.remove();
    document.getElementById("highlighters-shared-defs")?.remove();
    vi.restoreAllMocks();
  });

  it("mounts the overlay on the selection anchor, not document.body", () => {
    const rects = vi.spyOn(Range.prototype, "getClientRects");
    rects.mockReturnValue(domRectList([dr(10, 100, 200, 18)]));
    selectWithin(target, 0, 5);
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

    selectWithin(target, 0, 5);

    const handle = highlightSelection({ renderer: "css", animation: { draw: false } });
    const overlay = () =>
      htmlElement(article.querySelector("[data-highlighters-overlay]")!.children[0]);
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
    expect(css).not.toContain("background-color: #ff0000;");
    renderer.unmount();
    host.remove();
  });
});

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
