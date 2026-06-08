/**
 * The public entry points.
 *
 * One pipeline, many front doors: every targeting input normalizes to DOM `Range`s, then
 * per-visual-line rectangles, then absolute-px {@link MarkGeometry} per line, then the selected
 * renderer tier. The returned handle owns the reflow observer and (for page/selection modes) the
 * mutation watcher or selection listener, tearing them all down on `remove()`.
 *
 * SSR-safe: outside a DOM the entry points return an inert no-op handle.
 */

import type {
  GroupHandle,
  HighlightOptions,
  LineRect,
  LineSpeedProfile,
  MarkGeometry,
  MarkHandle,
  RenderContext,
  Renderer,
  ResolvedOptions,
  SnapMode,
  Target,
} from "../types.js";
import { mergeOptions, resolveOptions } from "../config/merge.js";
import { buildMarkGeometry } from "../geometry/mark-space.js";
import { hashU32 } from "../geometry/rng.js";
import { snapRangeToBounds } from "../geometry/snap.js";
import { toRanges } from "../targeting/normalize.js";
import { collectPageRanges } from "../targeting/include-exclude.js";
import { computeAnchor, rangesToLineRects } from "../targeting/line-rects.js";
import { SelectionVelocityTracker } from "../targeting/velocity.js";
import { createMutationWatcher, createReflowObserver } from "../targeting/observers.js";
import { createOverlayContainer, teardownContainer } from "./renderer.js";
import { detectEnvironment, selectTier } from "./tier-select.js";
import { createSvgRenderer } from "./tier-a-svg.js";
import { createCssRenderer } from "./tier-b-css.js";
import { createHighlightApiRenderer } from "./tier-c-highlight-api.js";
import { applyDrawOn } from "./animation.js";
import { createMarkHandle } from "./mark-handle.js";
import { hasDom } from "../internal/dom.js";

/** An inert no-op handle for non-DOM environments so callers needn't branch. */
function inertHandle(): MarkHandle {
  return {
    show() {},
    hide() {},
    update() {},
    remove() {},
    isShowing() {
      return false;
    },
    tier: "css",
  };
}

function rendererForTier(tier: ReturnType<typeof selectTier>): Renderer {
  switch (tier) {
    case "svg":
      return createSvgRenderer();
    case "highlight-api":
      return createHighlightApiRenderer();
    case "css":
    default:
      return createCssRenderer();
  }
}

/** Default snap mode by target shape: elements/page yield line, text/selection yield word. */
function defaultSnap(target: Target): SnapMode {
  if (typeof target === "string" || target instanceof Element) return "line";
  if (typeof Range !== "undefined" && target instanceof Range) return "word";
  if (typeof Selection !== "undefined" && target instanceof Selection) return "word";
  if (typeof target === "object" && target !== null && "text" in target) return "word";
  return "line";
}

/** Apply the configured snap mode to a list of ranges. */
function snapRanges(ranges: Range[], mode: SnapMode): Range[] {
  if (mode === "none") return ranges;
  return ranges.map((r) => snapRangeToBounds(r, mode));
}

/** The host an overlay attaches to - the document body, where line boxes are anchored. */
function hostFor(ranges: Range[]): HTMLElement | null {
  for (const range of ranges) {
    const node = range.commonAncestorContainer;
    const el = node instanceof Element ? node : node.parentElement;
    if (el) {
      // Body, so absolute-px line boxes (document coordinates) line up regardless of the target's box.
      return el.ownerDocument.body ?? el.ownerDocument.documentElement;
    }
  }
  return null;
}

/** Compute per-line {@link MarkGeometry} for a set of ranges; shared by mount, `update()`, and reflow. */
function buildLines(
  ranges: Range[],
  options: ResolvedOptions,
  container: HTMLElement,
  flowReversed = false,
  profileFor?: (local: LineRect) => LineSpeedProfile | undefined,
  cachedOrigin?: DOMRect,
): MarkGeometry[] {
  if (ranges.length === 0) return [];
  // `getClientRects()` is viewport-relative; subtracting the container's rect ties a line's seed
  // and position to its document position alone, stable under scroll and either drag direction.
  // A caller mid-frame can pass `cachedOrigin` so several builds share one layout read.
  const origin = cachedOrigin ?? container.getBoundingClientRect();
  const lineRects: LineRect[] = rangesToLineRects(
    ranges,
    computeAnchor(ranges),
    origin.top,
  );
  return lineRects.map((rect) => {
    // An explicit `options.seed` must still yield a distinct per-line seed, else every line's
    // pooled wrapper keys to one value and collapses onto a single node, aliasing the draw-on.
    const seed = options.seed == null ? rect.seed : hashU32(options.seed + rect.seed);
    const local: LineRect = {
      ...rect,
      left: rect.left - origin.left,
      top: rect.top - origin.top,
    };
    return buildMarkGeometry(local, options, seed, flowReversed, profileFor?.(local));
  });
}

/** Is the live selection dragged backward (focus before anchor)? Then ink pours from the right edge. Collapsed/detached read as forward. */
function isSelectionBackward(selection: Selection): boolean {
  const { anchorNode, focusNode } = selection;
  if (selection.isCollapsed || !anchorNode || !focusNode) return false;
  if (anchorNode === focusNode) return selection.focusOffset < selection.anchorOffset;
  const relation = anchorNode.compareDocumentPosition(focusNode);
  return (relation & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
}

/**
 * Mount a renderer at the selected tier, wire a reflow observer, and return the
 * mark handle. Shared by all public entry points.
 *
 * @param hostOverride - Optional explicit overlay host (else derived from ranges).
 */
function mountMark(
  ranges: Range[],
  userOptions: HighlightOptions,
  resolved: ResolvedOptions,
  extraCleanup: (() => void)[] = [],
  hostOverride?: HTMLElement | null,
  rangeSource?: () => Range[],
): MarkHandle {
  const host = hostOverride ?? hostFor(ranges);
  if (!host) return inertHandle();

  const container = createOverlayContainer(host);
  const env = detectEnvironment();

  // Static mark never changes; a watched page mark (`rangeSource` set) re-collects each update()
  // so added nodes are painted and removed ones drop out.
  let activeRanges = ranges;

  const buildContext = (opts: ResolvedOptions): RenderContext => {
    const snapped = snapRanges(activeRanges, opts.snap);
    const lines = buildLines(snapped, opts, container);
    return { container, options: opts, lines, ranges: activeRanges };
  };

  const initialContext = buildContext(resolved);
  const tier = selectTier(resolved.renderer, env, initialContext.lines.length);
  const renderer = rendererForTier(tier);
  renderer.mount(initialContext);

  // Entrance animation, one-shot on mount. The draw-on finds each line's wrapper by stable seed,
  // never by index, so marks sharing a container don't animate each other's bands.
  const animDisconnect = applyDrawOn(
    container,
    (seed) => renderer.bandFor(seed),
    initialContext.lines,
    resolved.animation,
    env,
  );

  // Re-derive geometry and update the renderer without re-animating. An in-flight draw-on is
  // retargeted onto the corrected geometry so it finishes the right shape instead of snapping.
  const reflowTargets = host instanceof Element ? [host] : [];
  const reflow = createReflowObserver(reflowTargets, () => {
    const ctx = buildContext(resolved);
    renderer.update(ctx);
    animDisconnect.retarget(ctx.lines);
  });

  return createMarkHandle({
    ranges,
    options: resolved,
    userOptions,
    renderer,
    container,
    reflow,
    cleanup: [animDisconnect, ...extraCleanup],
    replay: () => animDisconnect.replay(),
    retarget: (lines) => animDisconnect.retarget(lines),
    rebuild: (opts) => {
      // Mutate `resolved` in place so the reflow closure above picks up the new values next build.
      Object.assign(resolved, opts);
      // A watched page mark re-collects here so a watcher-fired update() paints added and drops
      // removed nodes. Reflow calls buildContext directly, so a resize never re-scans the DOM.
      if (rangeSource) activeRanges = rangeSource();
      return buildContext(resolved);
    },
  });
}

/**
 * Highlight a target: the primary entry point.
 *
 * @param target - Any {@link Target}: element, selector, `Range`, `Selection`, text query, or page target.
 * @param host - Optional positioned element to mount the overlay inside, scoping it to a transformed,
 *   scrolling, or stacked container. Promoted to `position: relative` if static. Defaults to the body.
 * @returns A {@link MarkHandle}; inert outside a DOM.
 */
export function highlight(
  target: Target,
  options?: HighlightOptions,
  host?: HTMLElement | null,
): MarkHandle {
  if (!hasDom()) return inertHandle();

  const userOptions: HighlightOptions = {
    snap: defaultSnap(target),
    ...options,
  };
  const resolved = resolveOptions(userOptions);
  const ranges = toRanges(target);
  if (ranges.length === 0) return inertHandle();

  return mountMark(ranges, userOptions, resolved, [], host ?? undefined);
}

/**
 * Highlight whole-page / declarative-attribute content.
 *
 * Collects `data-highlight` elements and/or a page target (default root `document.body`), honouring
 * exclusions, and attaches a debounced `MutationObserver` so added nodes get marked and removed nodes
 * drop their marks without a full rescan. Returns one handle covering all matches.
 * @returns A {@link MarkHandle}; inert outside a DOM.
 */
export function highlightAll(options?: HighlightOptions): MarkHandle {
  if (!hasDom()) return inertHandle();

  const root = document.body ?? document.documentElement;
  const userOptions: HighlightOptions = { snap: "line", ...options };
  const resolved = resolveOptions(userOptions);

  const collect = (): Range[] => {
    const pageRanges = collectPageRanges({ root });
    // Explicit data-highlight elements augment the page scan; the targeting layer drops excluded subtrees.
    const declaredRanges: Range[] = [];
    for (const el of root.querySelectorAll("[data-highlight]")) {
      declaredRanges.push(...toRanges(el));
    }
    return [...pageRanges, ...declaredRanges];
  };

  const ranges = collect();
  if (ranges.length === 0) {
    // Still wire the watcher so a later DOM change can produce a mark.
    const host = root instanceof HTMLElement ? root : document.body;
    if (!host) return inertHandle();
    const handle = mountMark([], userOptions, resolved, [], host, collect);
    return wrapWithWatcher(handle, root);
  }

  const handle = mountMark(ranges, userOptions, resolved, [], undefined, collect);
  return wrapWithWatcher(handle, root);
}

/** Attach a debounced mutation watcher that re-renders on subtree changes; its disconnect folds into `remove()`. */
function wrapWithWatcher(
  handle: MarkHandle,
  root: Element | Document,
): MarkHandle {
  const watcher = createMutationWatcher(root, () => {
    handle.update({});
  });

  const baseRemove = handle.remove.bind(handle);
  return {
    get tier() {
      return handle.tier;
    },
    show: handle.show.bind(handle),
    hide: handle.hide.bind(handle),
    isShowing: handle.isShowing.bind(handle),
    update: handle.update.bind(handle),
    remove(): void {
      watcher();
      baseRemove();
    },
  };
}

/**
 * Highlight the user's live selection in real time.
 *
 * Drives `selectionchange`-derived ranges into the same pipeline. On coarse pointers it defers to
 * native selection UI rather than painting an overlay. `remove()` detaches the listener.
 * @returns A {@link MarkHandle}; inert outside a DOM.
 */
export function highlightSelection(options?: HighlightOptions): MarkHandle {
  if (!hasDom()) return inertHandle();

  const env = detectEnvironment();
  // On touch devices native selection is the better UX: no overlay.
  if (env.coarsePointer) return inertHandle();

  // Accumulated across update() calls so options compose additively; re-spreading the
  // construction-time options each update would revert prior ones.
  let userOptions: HighlightOptions = { snap: "word", ...options };
  let resolved = resolveOptions(userOptions);
  const host = document.body ?? document.documentElement;
  if (!host) return inertHandle();

  const container = createOverlayContainer(host as HTMLElement);
  let renderer: Renderer | null = null;
  let currentRanges: Range[] = [];

  // Speed-aware ink, live-drag only. The tracker samples focus-caret velocity during a primary
  // fine-pointer drag and serves a per-line deposit profile. Skipped under reduced motion; gated on
  // `speed.enabled` and `dragging` so programmatic/keyboard/instant selections build no field.
  const tracker = env.prefersReducedMotion ? null : new SelectionVelocityTracker();
  let dragging = false;
  const onPointerDown = (e: PointerEvent): void => {
    // Primary-button, fine-pointer only.
    if (e.button !== 0 || (e.pointerType !== "mouse" && e.pointerType !== "pen")) return;
    dragging = true;
    tracker?.reset();
  };
  const endDrag = (): void => {
    // Paint any frame still pending while the drag is "live" so the settled mark keeps the last
    // sampled speed look, matching the pre-coalescing behaviour where the final event rendered sync.
    flushRender();
    dragging = false;
  };
  if (tracker) {
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", endDrag, true);
    document.addEventListener("pointercancel", endDrag, true);
    // A pointer released outside the window fires no pointerup, so blur clears the flag too,
    // else it sticks true and a later non-drag selection paints with speed.
    window.addEventListener("blur", endDrag);
  }

  const rebuild = (
    ranges: Range[],
    flowReversed: boolean,
    origin?: DOMRect,
  ): RenderContext => {
    const snapped = snapRanges(ranges, resolved.snap);
    // Speed profile only while a drag actively feeds the tracker; gating on `dragging` stops a
    // post-release selection from reusing a finished gesture's stale samples. The look persists
    // after release because nothing repaints until the next gesture.
    const speedOn = tracker !== null && resolved.speed.enabled && dragging;
    const profileFor = speedOn
      ? (local: LineRect): LineSpeedProfile | undefined =>
          tracker!.profileForLine(
            { top: local.top, height: local.height, left: local.left, width: local.width },
            resolved.speed,
          )
      : undefined;
    const lines = buildLines(snapped, resolved, container, flowReversed, profileFor, origin);
    return { container, options: resolved, lines, ranges };
  };

  // Clear-fade: when the selection empties, fade the overlay out then drop the bands; re-selecting cancels it.
  const CLEAR_FADE_MS = 200;
  let clearTimer: ReturnType<typeof setTimeout> | null = null;
  const cancelClearFade = (): void => {
    if (clearTimer !== null) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
    // Transition off first so resetting opacity is instant, not a fade back.
    container.style.transition = "";
    container.style.opacity = "";
  };

  // Sample the focus-caret velocity on EVERY selectionchange (cheap; the field's fidelity depends
  // on per-event sampling), but coalesce the expensive geometry+paint into one rAF per frame. Each
  // frame still reads the latest selection, so intermediate states that would be overwritten anyway
  // are skipped rather than drawn.
  const sample = (): void => {
    if (!tracker || !dragging || !resolved.speed.enabled) return;
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed) return;
    // Same container-local px space buildLines projects into, so the lookup is exact during the drag.
    const origin = container.getBoundingClientRect();
    tracker.recordSample(
      selection,
      origin.left,
      origin.top,
      performance.now(),
      resolved.speed.smoothing,
    );
  };

  const renderSelection = (): void => {
    const selection = document.getSelection();
    const ranges: Range[] = [];
    // A backward drag (focus before anchor) pours its ink from the right edge.
    let flowReversed = false;
    if (selection && !selection.isCollapsed) {
      flowReversed = isSelectionBackward(selection);
      for (let i = 0; i < selection.rangeCount; i++) {
        ranges.push(selection.getRangeAt(i).cloneRange());
      }
    }

    // Selection just emptied: fade out, then drop the bands when the fade lands (instant clear if disabled/reduced-motion).
    const cleared = ranges.length === 0 && currentRanges.length > 0;
    currentRanges = ranges;
    if (cleared && resolved.fadeOnClear && renderer && !env.prefersReducedMotion) {
      container.style.transition = `opacity ${CLEAR_FADE_MS}ms ease-out`;
      container.style.opacity = "0";
      clearTimer = setTimeout(() => {
        clearTimer = null;
        renderer?.update(rebuild([], false));
        container.style.transition = "";
        container.style.opacity = "";
      }, CLEAR_FADE_MS);
      return;
    }
    cancelClearFade();

    // One layout read per frame, shared by every line's build.
    const origin = ranges.length > 0 ? container.getBoundingClientRect() : undefined;
    const context = rebuild(ranges, flowReversed, origin);
    if (!renderer) {
      const tier = selectTier(resolved.renderer, env, context.lines.length);
      renderer = rendererForTier(tier);
      renderer.mount(context);
    } else {
      renderer.update(context);
    }
  };

  let rafId = 0;
  const scheduleRender = (): void => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      renderSelection();
    });
  };
  // Flush a pending coalesced frame synchronously (e.g. on drag-settle), so the final selection is
  // painted now rather than a frame later, while `dragging` is still true and the speed look holds.
  const flushRender = (): void => {
    if (!rafId) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
    renderSelection();
  };

  const onSelectionChange = (): void => {
    sample();
    scheduleRender();
  };
  document.addEventListener("selectionchange", onSelectionChange);
  renderSelection();

  let showing = true;
  let removed = false;
  return {
    get tier() {
      return renderer?.tier ?? "css";
    },
    show(): void {
      if (removed) return;
      showing = true;
      container.style.visibility = "";
    },
    hide(): void {
      if (removed) return;
      showing = false;
      container.style.visibility = "hidden";
    },
    isShowing(): boolean {
      return showing && !removed && currentRanges.length > 0;
    },
    update(opts: Partial<HighlightOptions>): void {
      if (removed) return;
      userOptions = mergeOptions(userOptions, opts as HighlightOptions);
      resolved = resolveOptions(userOptions);
      // An option change renders synchronously; drop any pending coalesced frame (same selection).
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      renderSelection();
    },
    remove(): void {
      if (removed) return;
      removed = true;
      showing = false;
      if (rafId) cancelAnimationFrame(rafId);
      if (clearTimer !== null) clearTimeout(clearTimer);
      document.removeEventListener("selectionchange", onSelectionChange);
      if (tracker) {
        document.removeEventListener("pointerdown", onPointerDown, true);
        document.removeEventListener("pointerup", endDrag, true);
        document.removeEventListener("pointercancel", endDrag, true);
        window.removeEventListener("blur", endDrag);
        tracker.reset();
      }
      renderer?.unmount();
      renderer = null;
      teardownContainer(container);
    },
  };
}

/**
 * Bundle handles into a {@link GroupHandle} for sequential show/hide choreography. `show()`
 * reveals members in array order so their draw-on staggers like a pen down the page.
 * @param handles - The member handles, in choreography order.
 */
export function group(handles: MarkHandle[]): GroupHandle {
  const marks = [...handles];
  return {
    get marks(): MarkHandle[] {
      return marks;
    },
    show(): void {
      for (const handle of marks) handle.show();
    },
    hide(): void {
      for (const handle of marks) handle.hide();
    },
    remove(): void {
      for (const handle of marks) handle.remove();
    },
  };
}
