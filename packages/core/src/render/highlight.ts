/**
 * The public entry points (blueprint R6 / R9 / R10 / A2).
 *
 * One pipeline, many front doors (A2): every targeting input normalizes to DOM
 * `Range`s → per-visual-line rectangles → absolute-px {@link MarkGeometry} per line
 * → the selected renderer tier. The returned handle owns the reflow observer and
 * (for page/selection modes) the mutation watcher or selection listener, tearing
 * them all down on `remove()`.
 *
 * SSR-safe (R34): outside a DOM the entry points return an inert no-op handle.
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

/** An inert no-op handle for non-DOM environments so callers needn't branch (R34). */
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

/** Default snap mode by target shape (R22b): elements/page → line, text/sel → word. */
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
      // Body, so absolute-px line boxes (in document coordinates) line up
      // regardless of the target's own box.
      return el.ownerDocument.body ?? el.ownerDocument.documentElement;
    }
  }
  return null;
}

/**
 * Compute per-line {@link MarkGeometry} for a set of ranges - the read-phase →
 * geometry step shared by initial mount, `update()`, and reflow.
 */
function buildLines(
  ranges: Range[],
  options: ResolvedOptions,
  container: HTMLElement,
  flowReversed = false,
  profileFor?: (local: LineRect) => LineSpeedProfile | undefined,
): MarkGeometry[] {
  if (ranges.length === 0) return [];
  // `getClientRects()` is viewport-relative; the container's rect encodes the
  // scroll offset. Measuring both the per-line SEED and POSITION from it keeps a
  // line's seed tied to its document position alone - stable under scroll and
  // either drag direction (A14). Correct for `body` and any positioned host.
  const origin = container.getBoundingClientRect();
  const lineRects: LineRect[] = rangesToLineRects(
    ranges,
    computeAnchor(ranges),
    origin.top,
  );
  return lineRects.map((rect) => {
    // An explicit `options.seed` must still yield a DISTINCT per-line seed, else a
    // wrapped mark keys every line's pooled wrapper to one value, collapsing them
    // onto a single node and aliasing the draw-on. Mixing it with `rect.seed` via
    // `hashU32` keeps lines distinct yet deterministic.
    const seed = options.seed == null ? rect.seed : hashU32(options.seed + rect.seed);
    const local: LineRect = {
      ...rect,
      left: rect.left - origin.left,
      top: rect.top - origin.top,
    };
    return buildMarkGeometry(local, options, seed, flowReversed, profileFor?.(local));
  });
}

/**
 * Is the live selection dragged backward (focus before anchor in document order)?
 * A backward drag started at the right, so the marker pours its dry-out ink from
 * the right edge (the `flowReversed` pool path). Collapsed/detached read as forward.
 */
function isSelectionBackward(selection: Selection): boolean {
  const { anchorNode, focusNode } = selection;
  if (selection.isCollapsed || !anchorNode || !focusNode) return false;
  if (anchorNode === focusNode) return selection.focusOffset < selection.anchorOffset;
  // compareDocumentPosition(focus) sets PRECEDING when focus comes before anchor.
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

  // Static mark: never changes. Watched page mark (`rangeSource` set, R8): each
  // update() re-collects so added nodes are painted and removed ones drop out.
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

  // Entrance animation, one-shot on mount. The draw-on finds each line's wrapper by
  // stable seed via the renderer - never by index into the (possibly shared)
  // container - so marks sharing a container don't animate each other's bands.
  const animDisconnect = applyDrawOn(
    container,
    (seed) => renderer.bandFor(seed),
    initialContext.lines,
    resolved.animation,
    env,
  );

  // Re-derive geometry and update the renderer WITHOUT re-animating (R22). An
  // in-flight draw-on is retargeted onto the corrected geometry so it finishes
  // drawing the right shape instead of snapping; once settled, retarget is a no-op.
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
      // Mutate `resolved` IN-PLACE so the reflow closure above (which closed over
      // this reference) picks up the new option values on its next build.
      Object.assign(resolved, opts);
      // A watched page mark re-collects here so a watcher-fired update() paints
      // added nodes and drops removed ones (R8). Reflow calls buildContext directly,
      // so a resize never re-scans the DOM.
      if (rangeSource) activeRanges = rangeSource();
      return buildContext(resolved);
    },
  });
}

/**
 * Highlight a target - the primary entry point (R6a–R6c).
 *
 * @param target - Any {@link Target}: element, selector, `Range`, `Selection`,
 *   text query, or page target.
 * @param host - Optional positioned element to mount the overlay inside, instead
 *   of `document.body`. Use it to scope the overlay to a transformed, scrolling, or
 *   stacked container - the overlay then moves and z-orders with that container
 *   rather than sitting in document coordinates. Promoted to `position: relative`
 *   if static. Defaults to the body (document-coordinate overlay).
 * @returns A {@link MarkHandle}; inert outside a DOM (R34).
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
 * Highlight whole-page / declarative-attribute content (R6d / R6e).
 *
 * Collects `data-highlight` elements and/or a page target (default root
 * `document.body`), honouring exclusions (R7), and attaches a debounced
 * `MutationObserver` so added matching nodes get marked and removed nodes drop
 * their marks without a full rescan (R8). Returns one handle covering all matches.
 *
 * @returns A {@link MarkHandle}; inert outside a DOM (R34).
 */
export function highlightAll(options?: HighlightOptions): MarkHandle {
  if (!hasDom()) return inertHandle();

  const root = document.body ?? document.documentElement;
  const userOptions: HighlightOptions = { snap: "line", ...options };
  const resolved = resolveOptions(userOptions);

  const collect = (): Range[] => {
    const pageRanges = collectPageRanges({ root });
    // Explicit data-highlight elements augment the page scan; the targeting layer
    // drops data-highlight-exclude subtrees (R7).
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

/**
 * Attach a debounced mutation watcher to `root` that re-renders the handle's mark
 * on subtree changes (R8). `update({})` re-collects ranges via the `rangeSource`
 * threaded into `mountMark`. The watcher's disconnect is folded into `remove()`.
 */
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
 * Highlight the user's live selection in real time (R6f / A10 / C5).
 *
 * Drives `selectionchange`-derived ranges into the same pipeline. On coarse
 * pointers it defers to native selection UI rather than painting an overlay (C5).
 * `remove()` detaches the `selectionchange` listener.
 *
 * @returns A {@link MarkHandle}; inert outside a DOM (R34).
 */
export function highlightSelection(options?: HighlightOptions): MarkHandle {
  if (!hasDom()) return inertHandle();

  const env = detectEnvironment();
  // On touch devices, native selection is the better UX (C5): no overlay.
  if (env.coarsePointer) return inertHandle();

  // Accumulated across update() calls so options compose additively (A7) -
  // re-spreading the construction-time options each update would revert prior ones.
  let userOptions: HighlightOptions = { snap: "word", ...options };
  let resolved = resolveOptions(userOptions);
  const host = document.body ?? document.documentElement;
  if (!host) return inertHandle();

  const container = createOverlayContainer(host as HTMLElement);
  let renderer: Renderer | null = null;
  let currentRanges: Range[] = [];

  // Speed-aware ink (R17), live-drag only. The tracker samples the focus caret's
  // velocity during a primary fine-pointer drag and serves a per-line deposit
  // profile. Skipped under reduced motion; sampling/profile additionally gated on
  // `speed.enabled` and `dragging` so programmatic/keyboard/instant selections
  // build no field → byte-identical legacy paint.
  const tracker = env.prefersReducedMotion ? null : new SelectionVelocityTracker();
  let dragging = false;
  const onPointerDown = (e: PointerEvent): void => {
    // Primary-button, fine-pointer only - matching the live-drag contract.
    if (e.button !== 0 || (e.pointerType !== "mouse" && e.pointerType !== "pen")) return;
    dragging = true;
    tracker?.reset();
  };
  const endDrag = (): void => {
    dragging = false;
  };
  if (tracker) {
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", endDrag, true);
    document.addEventListener("pointercancel", endDrag, true);
    // A pointer released OUTSIDE the window fires no pointerup, so blur clears the
    // flag too - else it sticks `true` and a later non-drag selection paints with speed.
    window.addEventListener("blur", endDrag);
  }

  const rebuild = (ranges: Range[], flowReversed: boolean): RenderContext => {
    const snapped = snapRanges(ranges, resolved.snap);
    // Speed profile only while a drag is actively feeding the tracker: gating on
    // `dragging` keeps a programmatic/keyboard/post-release selection from reusing a
    // finished gesture's stale samples (it paints legacy geometry instead). A line
    // with no samples also returns undefined → legacy geometry. The speed look
    // persists after release because nothing repaints until the next gesture.
    const speedOn = tracker !== null && resolved.speed.enabled && dragging;
    const profileFor = speedOn
      ? (local: LineRect): LineSpeedProfile | undefined =>
          tracker!.profileForLine(
            { top: local.top, height: local.height, left: local.left, width: local.width },
            resolved.speed,
          )
      : undefined;
    const lines = buildLines(snapped, resolved, container, flowReversed, profileFor);
    return { container, options: resolved, lines, ranges };
  };

  // Clear-fade (resolved.fadeOnClear): when the selection empties, fade the overlay
  // out over CLEAR_FADE_MS then drop the bands. Re-selecting cancels the pending fade.
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

  const renderSelection = (): void => {
    const selection = document.getSelection();
    const ranges: Range[] = [];
    // A backward drag (focus before anchor) pours its ink from the right edge.
    let flowReversed = false;
    if (selection && !selection.isCollapsed) {
      flowReversed = isSelectionBackward(selection);
      // Sample in the SAME container-local px space buildLines projects into, so the
      // spatial lookup is exact during the drag.
      if (tracker && dragging && resolved.speed.enabled) {
        const origin = container.getBoundingClientRect();
        tracker.recordSample(
          selection,
          origin.left,
          origin.top,
          performance.now(),
          resolved.speed.smoothing,
        );
      }
      for (let i = 0; i < selection.rangeCount; i++) {
        ranges.push(selection.getRangeAt(i).cloneRange());
      }
    }

    // Selection just emptied: fade out, then drop the bands when the fade lands.
    // Disabled or reduced-motion → instant clear (below).
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

    const context = rebuild(ranges, flowReversed);
    if (!renderer) {
      const tier = selectTier(resolved.renderer, env, context.lines.length);
      renderer = rendererForTier(tier);
      renderer.mount(context);
    } else {
      renderer.update(context);
    }
  };

  const onSelectionChange = (): void => renderSelection();
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
      renderSelection();
    },
    remove(): void {
      if (removed) return;
      removed = true;
      showing = false;
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
 * Bundle handles into a {@link GroupHandle} for sequential show/hide choreography
 * (R10). `show()` reveals members in array order so their draw-on staggers like a
 * pen travelling down the page; `hide()`/`remove()` apply to all members.
 *
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
