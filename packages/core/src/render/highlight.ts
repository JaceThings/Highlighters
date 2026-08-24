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
import { collectPageRanges, excludeMarkedSubtrees } from "../targeting/include-exclude.js";
import { rangesToLineRects } from "../targeting/line-rects.js";
import { SelectionVelocityTracker } from "../targeting/velocity.js";
import { findSelectionAnchor } from "../targeting/anchor.js";
import { createMutationWatcher, createReflowObserver } from "../targeting/observers.js";
import { createOverlayContainer, teardownContainer } from "./renderer.js";
import { detectEnvironment, selectTier } from "./tier-select.js";
import { createSvgRenderer } from "./tier-a-svg.js";
import { createCssRenderer } from "./tier-b-css.js";
import { createHighlightApiRenderer } from "./tier-c-highlight-api.js";
import { applyDrawOn } from "./animation.js";
import { createMarkHandle } from "./mark-handle.js";
import { hasDom, hasGlobal } from "../internal/dom.js";

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

function defaultSnap(target: Target): SnapMode {
  if (!(target instanceof Object) || target instanceof Element) return "line";
  if (hasGlobal("Range") && target instanceof Range) return "word";
  if (hasGlobal("Selection") && target instanceof Selection) return "word";
  if ("text" in target) return "word";
  return "line";
}

function snapRanges(ranges: Range[], mode: SnapMode): Range[] {
  if (mode === "none") return ranges;
  return ranges.map((r) => snapRangeToBounds(r, mode));
}

function elementsFromRanges(ranges: Range[]): Element[] {
  const seen = new Set<Element>();
  const add = (node: Node | null) => {
    if (!node) return;
    const el = node instanceof Element ? node : node.parentElement;
    if (el) seen.add(el);
  };
  for (const range of ranges) {
    add(range.startContainer);
    add(range.endContainer);
    add(range.commonAncestorContainer);
  }
  return [...seen];
}

function reflowTargetsFor(host: HTMLElement, ranges: Range[]): Element[] {
  return [...new Set<Element>([host, ...elementsFromRanges(ranges)])];
}

function hostFor(ranges: Range[]): HTMLElement | null {
  for (const range of ranges) {
    const node = range.commonAncestorContainer;
    const el = node instanceof Element ? node : node.parentElement;
    if (el) {
      return el.ownerDocument.body ?? el.ownerDocument.documentElement;
    }
  }
  return null;
}

function measureLines(
  ranges: Range[],
  container: HTMLElement,
  cachedOrigin?: DOMRect,
  anchorHost?: HTMLElement,
): LineRect[] {
  if (ranges.length === 0) return [];
  const origin = cachedOrigin ?? container.getBoundingClientRect();
  const hostRect = anchorHost?.getBoundingClientRect();
  const lineRects = rangesToLineRects(
    ranges,
    undefined,
    origin.top,
    anchorHost && hostRect
      ? { scope: anchorHost, columnBounds: { left: hostRect.left, right: hostRect.right } }
      : undefined,
  );
  for (const rect of lineRects) {
    rect.left -= origin.left;
    rect.top -= origin.top;
  }
  return lineRects;
}

function linesToGeometry(
  locals: LineRect[],
  options: ResolvedOptions,
  flowReversed = false,
  profileFor?: (local: LineRect) => LineSpeedProfile | undefined,
): MarkGeometry[] {
  return locals.map((local) => {
    const seed = options.seed == null ? local.seed : hashU32(options.seed + local.seed);
    return buildMarkGeometry(local, options, seed, flowReversed, profileFor?.(local));
  });
}

function isSelectionBackward(selection: Selection): boolean {
  const { anchorNode, focusNode } = selection;
  if (selection.isCollapsed || !anchorNode || !focusNode) return false;
  if (anchorNode === focusNode) return selection.focusOffset < selection.anchorOffset;
  const relation = anchorNode.compareDocumentPosition(focusNode);
  return (relation & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
}

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

  let activeRanges = ranges;

  let cached: { snap: SnapMode; lines: LineRect[] } | null = null;

  const buildContext = (opts: ResolvedOptions): RenderContext => {
    if (cached === null || cached.snap !== opts.snap) {
      cached = { snap: opts.snap, lines: measureLines(snapRanges(activeRanges, opts.snap), container) };
    }
    const lines = linesToGeometry(cached.lines, opts);
    return { container, options: opts, lines, ranges: activeRanges };
  };

  const initialContext = buildContext(resolved);
  const tier = selectTier(resolved.renderer, env, initialContext.lines.length);
  const renderer = rendererForTier(tier);
  renderer.mount(initialContext);

  const animDisconnect = applyDrawOn(
    container,
    (seed) => renderer.bandFor(seed),
    initialContext.lines,
    resolved.animation,
    env,
  );

  const reflow = createReflowObserver(reflowTargetsFor(host, activeRanges), () => {
    cached = null;
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
      Object.assign(resolved, opts);
      if (rangeSource) {
        activeRanges = rangeSource();
        cached = null;
      }
      return buildContext(resolved);
    },
  });
}

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

export function highlightAll(options?: HighlightOptions): MarkHandle {
  if (!hasDom()) return inertHandle();

  const root = document.body ?? document.documentElement;
  const userOptions: HighlightOptions = { snap: "line", ...options };
  const resolved = resolveOptions(userOptions);

  const collect = (): Range[] => {
    const pageRanges = collectPageRanges({ root });
    const declaredRanges: Range[] = [];
    for (const el of root.querySelectorAll("[data-highlight]")) {
      declaredRanges.push(...toRanges(el));
    }
    return [...pageRanges, ...declaredRanges];
  };

  const ranges = collect();
  if (ranges.length === 0) {
    const host = root instanceof HTMLElement ? root : document.body;
    if (!host) return inertHandle();
    const handle = mountMark([], userOptions, resolved, [], host, collect);
    return wrapWithWatcher(handle, root);
  }

  const handle = mountMark(ranges, userOptions, resolved, [], undefined, collect);
  return wrapWithWatcher(handle, root);
}

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

export function highlightSelection(options?: HighlightOptions): MarkHandle {
  if (!hasDom()) return inertHandle();

  const env = detectEnvironment();
  if (env.coarsePointer) return inertHandle();

  let userOptions: HighlightOptions = { snap: "word", ...options };
  let resolved = resolveOptions(userOptions);
  let currentHost: HTMLElement | null = null;
  let container: HTMLElement | null = null;
  let reflowDisconnect: () => void = () => {};
  let renderer: Renderer | null = null;
  let currentRanges: Range[] = [];

  const ensureAnchor = (anchor: HTMLElement): boolean => {
    if (anchor === currentHost && container) return false;
    if (!container) {
      container = createOverlayContainer(anchor);
      currentHost = anchor;
      return true;
    }
    if (anchor !== currentHost) {
      const view = anchor.ownerDocument.defaultView;
      if (view && view.getComputedStyle(anchor).position === "static") {
        anchor.style.position = "relative";
      }
      anchor.appendChild(container);
      currentHost = anchor;
      return true;
    }
    return false;
  };

  const armReflow = (anchor: HTMLElement, ranges: Range[]): void => {
    reflowDisconnect();
    reflowDisconnect = createReflowObserver(reflowTargetsFor(anchor, ranges), () => {
      if (currentRanges.length === 0) return;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      renderSelection();
    });
  };

  const tracker = env.prefersReducedMotion ? null : new SelectionVelocityTracker();
  let dragging = false;
  const onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 || (e.pointerType !== "mouse" && e.pointerType !== "pen")) return;
    dragging = true;
    tracker?.reset();
  };
  const endDrag = (): void => {
    flushRender();
    dragging = false;
  };
  if (tracker) {
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", endDrag, true);
    document.addEventListener("pointercancel", endDrag, true);
    window.addEventListener("blur", endDrag);
  }

  const rebuild = (
    ranges: Range[],
    flowReversed: boolean,
    origin?: DOMRect,
  ): RenderContext => {
    const snapped = snapRanges(ranges, resolved.snap);
    const speedOn = tracker !== null && resolved.speed.enabled && dragging;
    const profileFor = speedOn
      ? (local: LineRect): LineSpeedProfile | undefined =>
          tracker!.profileForLine(
            { top: local.top, height: local.height, left: local.left, width: local.width },
            resolved.speed,
          )
      : undefined;
    const lines = linesToGeometry(
      measureLines(snapped, container!, origin, currentHost ?? undefined),
      resolved,
      flowReversed,
      profileFor,
    );
    return { container: container!, options: resolved, lines, ranges };
  };

  const CLEAR_FADE_MS = 200;
  let clearTimer: ReturnType<typeof setTimeout> | null = null;
  const cancelClearFade = (): void => {
    if (clearTimer !== null) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
    if (container) {
      container.style.transition = "";
      container.style.opacity = "";
    }
  };

  const sample = (): void => {
    if (!tracker || !dragging || !resolved.speed.enabled) return;
    if (!container) return;
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed) return;
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
    let flowReversed = false;
    if (selection && !selection.isCollapsed) {
      flowReversed = isSelectionBackward(selection);
      for (let i = 0; i < selection.rangeCount; i++) {
        ranges.push(selection.getRangeAt(i).cloneRange());
      }
    }
    const painted = excludeMarkedSubtrees(ranges);

    const cleared = painted.length === 0 && currentRanges.length > 0;
    currentRanges = painted;
    if (cleared && resolved.fadeOnClear && renderer && !env.prefersReducedMotion) {
      container!.style.transition = `opacity ${CLEAR_FADE_MS}ms ease-out`;
      container!.style.opacity = "0";
      clearTimer = setTimeout(() => {
        clearTimer = null;
        if (!container) return;
        renderer?.update(rebuild([], false));
        container.style.transition = "";
        container.style.opacity = "";
      }, CLEAR_FADE_MS);
      return;
    }
    cancelClearFade();

    if (painted.length > 0) {
      const anchor = findSelectionAnchor(painted[0].commonAncestorContainer);
      if (ensureAnchor(anchor)) armReflow(anchor, painted);
    }

    if (!container) return;

    const origin = container.getBoundingClientRect();
    const context = rebuild(painted, flowReversed, origin);
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
      if (container) container.style.visibility = "";
    },
    hide(): void {
      if (removed) return;
      showing = false;
      if (container) container.style.visibility = "hidden";
    },
    isShowing(): boolean {
      return showing && !removed && currentRanges.length > 0;
    },
    update(opts: Partial<HighlightOptions>): void {
      if (removed) return;
      userOptions = mergeOptions(userOptions, opts);
      resolved = resolveOptions(userOptions);
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
      reflowDisconnect();
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
      if (container) {
        teardownContainer(container);
        container = null;
        currentHost = null;
      }
    },
  };
}

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
