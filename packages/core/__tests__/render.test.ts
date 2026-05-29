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
import { createMarkHandle } from "../src/render/mark-handle.js";
import { highlight, group } from "../src/render/highlight.js";
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

  it("teardown removes the container and all children", () => {
    const container = createOverlayContainer(host);
    container.appendChild(document.createElement("span"));
    teardownContainer(container);
    expect(host.querySelector("[data-highlighters-overlay]")).toBeNull();
    expect(container.childNodes.length).toBe(0);
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

  it("mounts one aria-hidden band per line with multiply blend", () => {
    const renderer = createCssRenderer();
    const container = createOverlayContainer(host);
    const context: RenderContext = {
      container,
      options: resolved(),
      lines: [geometry(0), geometry(20)],
      ranges: [],
    };
    renderer.mount(context);

    const bands = container.querySelectorAll("div");
    expect(bands.length).toBe(2);
    for (const band of Array.from(bands)) {
      expect(band.getAttribute("aria-hidden")).toBe("true");
      expect((band as HTMLElement).style.mixBlendMode).toBe("multiply");
      expect((band as HTMLElement).style.position).toBe("absolute");
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

  it("retains surviving line nodes by identity on update", () => {
    const renderer = createCssRenderer();
    const container = createOverlayContainer(host);
    renderer.mount({ container, options: resolved(), lines: [geometry(0), geometry(20)], ranges: [] });
    const first = container.querySelector("div");

    // Drop the second line; the first must keep its exact node.
    renderer.update({ container, options: resolved(), lines: [geometry(0)], ranges: [] });
    expect(container.querySelectorAll("div").length).toBe(1);
    expect(container.querySelector("div")).toBe(first);
  });

  it("unmount removes every band", () => {
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

  it("applies the absolute-px clip-path and offset-sampled mask (A14)", () => {
    const renderer = createSvgRenderer();
    const container = createOverlayContainer(host);
    renderer.mount({ container, options: resolved(), lines: [geometry(40)], ranges: [] });
    const band = container.querySelector("div") as HTMLElement;
    expect(band.style.clipPath).toContain("path(");
    expect(band.style.maskPosition).toBe("-10px -5px");
    expect(band.style.maskSize).toBe("256px 64px");
    expect(band.style.maskRepeat).toBe("repeat");
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

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    container = createOverlayContainer(host);
    for (const seed of [0, 20]) {
      const band = document.createElement("div");
      band.style.clipPath = geometry(seed).clipPath;
      container.appendChild(band);
    }
  });
  afterEach(() => {
    host.remove();
    vi.useRealTimers();
  });

  const anim = resolved().animation;

  it("shows bands instantly under prefers-reduced-motion (R25)", () => {
    const disconnect = applyDrawOn(container, [geometry(0), geometry(20)], anim, fullEnv({ prefersReducedMotion: true }));
    for (const band of Array.from(container.children) as HTMLElement[]) {
      expect(band.style.clipPath).toBe("inset(0 0 0 0)");
      expect(band.style.transition).toBe("");
    }
    disconnect();
  });

  it("shows bands instantly when draw is disabled", () => {
    const noDraw = { ...anim, draw: false };
    applyDrawOn(container, [geometry(0)], noDraw, fullEnv());
    const band = container.firstElementChild as HTMLElement;
    expect(band.style.clipPath).toBe("inset(0 0 0 0)");
  });

  it("primes bands hidden and reveals them with a transition under draw-on", () => {
    vi.useFakeTimers();
    const disconnect = applyDrawOn(container, [geometry(0), geometry(20)], { ...anim, draw: true, trigger: "immediate", stagger: 50, duration: 200 }, fullEnv());
    // After priming (synchronous), bands are scaled to zero.
    const bands = Array.from(container.children) as HTMLElement[];
    expect(bands[0].style.transform).toBe("scaleX(0)");
    // Run the kickoff + staggered reveals.
    vi.runAllTimers();
    expect(bands[0].style.transform).toBe("scaleX(1)");
    expect(bands[0].style.transition).toContain("transform");
    disconnect();
  });

  it("disconnect cancels pending timers (R33)", () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const disconnect = applyDrawOn(container, [geometry(0)], { ...anim, draw: true, trigger: "immediate" }, fullEnv());
    disconnect();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
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
