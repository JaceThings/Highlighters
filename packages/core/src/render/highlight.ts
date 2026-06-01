/**
 * The public entry points (blueprint R6 / R9 / R10 / A2).
 *
 * One pipeline, many front doors (A2): every targeting input normalizes to a set
 * of DOM `Range`s, then to per-visual-line rectangles, then to absolute-px
 * {@link MarkGeometry} per line, then to the selected renderer tier. The handle a
 * call returns owns the reflow observer and (for page/selection modes) the
 * mutation watcher or selection listener, and tears them all down on `remove()`.
 *
 * Everything here is SSR-safe (R34): outside a DOM the entry points return an
 * inert handle that no-ops, touching neither `window` nor `document`.
 */

import type {
  GroupHandle,
  HighlightOptions,
  LineRect,
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
import { createMutationWatcher, createReflowObserver } from "../targeting/observers.js";
import { createOverlayContainer, teardownContainer } from "./renderer.js";
import { detectEnvironment, selectTier } from "./tier-select.js";
import { createSvgRenderer } from "./tier-a-svg.js";
import { createCssRenderer } from "./tier-b-css.js";
import { createHighlightApiRenderer } from "./tier-c-highlight-api.js";
import { applyDrawOn } from "./animation.js";
import { createMarkHandle } from "./mark-handle.js";
import { hasDom } from "../internal/dom.js";

/**
 * An inert handle returned in non-DOM environments so callers can hold a
 * stable object without branching on the platform (R34). Every method no-ops.
 */
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

/** Instantiate the renderer for a concrete tier. */
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

/** The positioned host an overlay attaches to — the nearest positioned ancestor. */
function hostFor(ranges: Range[]): HTMLElement | null {
  for (const range of ranges) {
    const node = range.commonAncestorContainer;
    const el = node instanceof Element ? node : node.parentElement;
    if (el) {
      // Attach to the document body so absolute-px line boxes (which are in
      // document coordinates) line up regardless of the target's own box.
      return el.ownerDocument.body ?? el.ownerDocument.documentElement;
    }
  }
  return null;
}

/**
 * Compute the per-line {@link MarkGeometry} for a set of ranges and resolved
 * options. This is the read-phase → geometry step shared by initial mount,
 * `update()`, and reflow. The seed is the explicit option seed when provided,
 * else each line's anchor-relative seed (A5 / A14 §5).
 */
function buildLines(
  ranges: Range[],
  options: ResolvedOptions,
  container: HTMLElement,
  flowReversed = false,
): MarkGeometry[] {
  if (ranges.length === 0) return [];
  // `getClientRects()` is viewport-relative; the overlay container sits at the
  // host's content origin and its rect encodes the scroll offset. Both the
  // per-line SEED (via rangesToLineRects) and POSITION (below) measure from it,
  // so a line's seed tracks its document position alone — stable under scroll and
  // either drag direction (A14). Correct for `body` and any positioned host.
  const origin = container.getBoundingClientRect();
  const lineRects: LineRect[] = rangesToLineRects(
    ranges,
    computeAnchor(ranges),
    origin.top,
  );
  return lineRects.map((rect) => {
    // An explicit `options.seed` must still yield a DISTINCT per-line seed: else a
    // wrapped mark keys every line's pooled wrapper to one value, collapsing them
    // onto a single node (only the last survives) and aliasing the draw-on. Mixing
    // it with the line's `rect.seed` via `hashU32` keeps lines distinct, yet stays
    // deterministic (same seed + layout → same per-line seeds).
    const seed = options.seed == null ? rect.seed : hashU32(options.seed + rect.seed);
    const local: LineRect = {
      ...rect,
      left: rect.left - origin.left,
      top: rect.top - origin.top,
    };
    return buildMarkGeometry(local, options, seed, flowReversed);
  });
}

/**
 * Is the live selection dragged right-to-left (backward) — its focus sitting
 * BEFORE its anchor in document order? A backward drag started at the right, so
 * the marker pours its dry-out ink from the right edge (the `flowReversed` path
 * into the pool gradient). Collapsed or detached selections read as forward.
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
 * Resolve a target to ranges, mount a renderer at the selected tier, wire a
 * reflow observer, and return the mark handle. Shared by all public entry points.
 *
 * @param ranges - The already-collected DOM ranges for this mark.
 * @param userOptions - The user-facing options (for the merge chain on update).
 * @param resolved - The resolved options for the initial render.
 * @param extraCleanup - Mode-specific teardown (mutation watcher, listener).
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

  // The live range set. For a static mark this never changes; for a watched page
  // mark (`rangeSource` set, R8) each update() re-collects it, so newly-added
  // nodes are painted and removed ones drop out.
  let activeRanges = ranges;

  // The geometry build closure: a fresh read phase → per-line geometry →
  // RenderContext. Called for initial mount, update(), and reflow (R21/R22d).
  const buildContext = (opts: ResolvedOptions): RenderContext => {
    const snapped = snapRanges(activeRanges, opts.snap);
    const lines = buildLines(snapped, opts, container);
    return { container, options: opts, lines, ranges: activeRanges };
  };

  const initialContext = buildContext(resolved);
  const tier = selectTier(resolved.renderer, env, initialContext.lines.length);
  const renderer = rendererForTier(tier);
  renderer.mount(initialContext);

  // Entrance animation (draw-on / in-view / reduced-motion), one-shot on mount.
  // The draw-on finds each line's wrapper by stable seed via the renderer — never
  // by index into the (possibly shared) overlay container — so marks that share a
  // container never animate each other's bands.
  const animDisconnect = applyDrawOn(
    container,
    (seed) => renderer.bandFor(seed),
    initialContext.lines,
    resolved.animation,
    env,
  );

  // Reflow: ResizeObserver + window resize + fonts.ready, rAF-batched. On reflow
  // we re-derive geometry and update the renderer WITHOUT re-animating (R22). If a
  // draw-on is still in flight (e.g. a late web-font load corrected a line's height
  // mid-entrance), retarget it onto the corrected geometry so it finishes drawing
  // the right shape instead of snapping — once settled, retarget is a no-op.
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
    // An explicit handle.show() replays the draw-on entrance (R24).
    replay: () => animDisconnect.replay(),
    rebuild: (opts) => {
      // Mutate `resolved` IN-PLACE (not reassign) so the reflow closure above —
      // which closed over this same reference — picks up the new option values on
      // its next build. Intentional shared-reference update, not a stale `const`.
      Object.assign(resolved, opts);
      // A watched page mark re-collects here, so an update() fired by the mutation
      // watcher paints newly-added nodes and drops removed ones (R8). Reflow calls
      // buildContext directly (above), so a resize never re-scans the DOM.
      if (rangeSource) activeRanges = rangeSource();
      return buildContext(resolved);
    },
  });
}

/**
 * Highlight a target — the primary entry point (R6a–R6c).
 *
 * Pipeline: `resolveOptions` → `toRanges` → `snapRangeToBounds` per `snap` →
 * `rangesToLineRects` → `buildMarkGeometry` per line → `selectTier` → renderer
 * `mount` → handle with a reflow observer.
 *
 * @param target - Any {@link Target}: element, selector, `Range`, `Selection`,
 *   text query, or page target.
 * @param options - Optional {@link HighlightOptions}.
 * @returns A {@link MarkHandle}; an inert no-op handle outside a DOM (R34).
 */
export function highlight(target: Target, options?: HighlightOptions): MarkHandle {
  if (!hasDom()) return inertHandle();

  const userOptions: HighlightOptions = {
    snap: defaultSnap(target),
    ...options,
  };
  const resolved = resolveOptions(userOptions);
  const ranges = toRanges(target);
  if (ranges.length === 0) return inertHandle();

  return mountMark(ranges, userOptions, resolved);
}

/**
 * Highlight whole-page / declarative-attribute content (R6d / R6e).
 *
 * Collects `data-highlight` elements and/or a {@link PageTarget} (default root
 * `document.body`), honouring exclusions (R7), and attaches a debounced
 * `MutationObserver` so dynamically-added matching nodes get marked and removed
 * nodes drop their marks without a full rescan (R8). Returns one handle covering
 * all matches.
 *
 * @param options - Optional {@link HighlightOptions}. `data-highlight="<preset>"`
 *   attribute values are respected per element by the targeting layer.
 * @returns A {@link MarkHandle}; inert outside a DOM (R34).
 */
export function highlightAll(options?: HighlightOptions): MarkHandle {
  if (!hasDom()) return inertHandle();

  const root = document.body ?? document.documentElement;
  const userOptions: HighlightOptions = { snap: "line", ...options };
  const resolved = resolveOptions(userOptions);

  const collect = (): Range[] => {
    const pageRanges = collectPageRanges({ root });
    // Declarative attributes: explicit data-highlight elements augment the page
    // scan; the targeting layer drops data-highlight-exclude subtrees (R7).
    const declaredRanges: Range[] = [];
    for (const el of root.querySelectorAll("[data-highlight]")) {
      declaredRanges.push(...toRanges(el));
    }
    return [...pageRanges, ...declaredRanges];
  };

  const ranges = collect();
  if (ranges.length === 0) {
    // Still wire the watcher so a later DOM change can produce a mark; return an
    // inert-but-observed handle by mounting an empty container on the root.
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
 * on subtree changes (R8). The handle's `update({})` re-collects ranges via the
 * `rangeSource` threaded into `mountMark`, so added nodes are painted and removed
 * ones drop out. The watcher's disconnect is folded into teardown via `remove()`.
 */
function wrapWithWatcher(
  handle: MarkHandle,
  root: Element | Document,
): MarkHandle {
  const watcher = createMutationWatcher(root, () => {
    // update() re-collects (via the handle's rangeSource) and re-renders, keeping
    // geometry stable for surviving nodes (identity-keyed pool) while painting
    // added nodes and dropping removed ones.
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
 * pointers (touch) it defers to the native selection UI rather than painting an
 * overlay (C5), so the mark only renders on fine-pointer devices. The returned
 * handle's `remove()` detaches the `selectionchange` listener.
 *
 * @param options - Optional {@link HighlightOptions}.
 * @returns A {@link MarkHandle}; inert outside a DOM (R34).
 */
export function highlightSelection(options?: HighlightOptions): MarkHandle {
  if (!hasDom()) return inertHandle();

  const env = detectEnvironment();
  // On touch devices, native selection is the better UX (C5): no overlay.
  if (env.coarsePointer) return inertHandle();

  // Accumulated across update() calls so options compose additively, exactly like
  // createMarkHandle (A7) — re-spreading the construction-time options each update
  // would revert prior updates and shallow-clobber sibling group fields.
  let userOptions: HighlightOptions = { snap: "word", ...options };
  let resolved = resolveOptions(userOptions);
  const host = document.body ?? document.documentElement;
  if (!host) return inertHandle();

  const container = createOverlayContainer(host as HTMLElement);
  let renderer: Renderer | null = null;
  let currentRanges: Range[] = [];

  const rebuild = (ranges: Range[], flowReversed: boolean): RenderContext => {
    const snapped = snapRanges(ranges, resolved.snap);
    const lines = buildLines(snapped, resolved, container, flowReversed);
    return { container, options: resolved, lines, ranges };
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
    currentRanges = ranges;
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
      document.removeEventListener("selectionchange", onSelectionChange);
      renderer?.unmount();
      renderer = null;
      teardownContainer(container);
    },
  };
}

/**
 * Bundle handles into a {@link GroupHandle} for sequential show/hide
 * choreography (R10), analogous to RoughNotation's `annotationGroup`. `show()`
 * reveals members in array order so their draw-on staggers like a pen travelling
 * down the page; `hide()`/`remove()` apply to all members.
 *
 * @param handles - The member handles, in choreography order.
 * @returns A {@link GroupHandle} wrapping the members.
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
