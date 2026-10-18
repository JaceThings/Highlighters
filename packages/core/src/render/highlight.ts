import type {
  Disconnect,
  GroupHandle,
  HighlightOptions,
  LineRect,
  LineSpeedProfile,
  MarkGeometry,
  MarkHandle,
  RenderContext,
  Renderer,
  RendererTier,
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
import { createOverlayContainer, ensurePositioned, teardownContainer } from "./renderer.js";
import { detectEnvironment, selectTier } from "./tier-select.js";
import { createSvgRenderer } from "./tier-a-svg.js";
import { createCssRenderer } from "./tier-b-css.js";
import { createHighlightApiRenderer } from "./tier-c-highlight-api.js";
import { applyDrawOn } from "./animation.js";
import { createMarkHandle } from "./mark-handle.js";
import { hasDom, hasGlobal } from "../internal/dom.js";

const INERT_HANDLE: MarkHandle = {
  tier: "css",
  show() {},
  hide() {},
  update() {},
  remove() {},
  isShowing: () => false,
};

const RENDERERS: Record<RendererTier, () => Renderer> = {
  svg: createSvgRenderer,
  css: createCssRenderer,
  "highlight-api": createHighlightApiRenderer,
};

function defaultSnap(target: Target): SnapMode {
  if (!(target instanceof Object) || target instanceof Element) return "line";
  if (hasGlobal("Range") && target instanceof Range) return "word";
  if (hasGlobal("Selection") && target instanceof Selection) return "word";
  return "text" in target ? "word" : "line";
}

function snapRanges(ranges: Range[], mode: SnapMode): Range[] {
  return mode === "none" ? ranges : ranges.map((r) => snapRangeToBounds(r, mode));
}

function elementOf(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement;
}

function reflowTargets(host: HTMLElement, ranges: Range[]): Element[] {
  const seen = new Set<Element>([host]);
  for (const range of ranges) {
    for (const node of [range.startContainer, range.endContainer, range.commonAncestorContainer]) {
      const el = elementOf(node);
      if (el) seen.add(el);
    }
  }
  return [...seen];
}

function hostFor(ranges: Range[]): HTMLElement | null {
  for (const range of ranges) {
    const el = elementOf(range.commonAncestorContainer);
    if (el) return el.ownerDocument.body ?? el.ownerDocument.documentElement;
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
  return (anchorNode.compareDocumentPosition(focusNode) & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
}

function mountMark(
  ranges: Range[],
  userOptions: HighlightOptions,
  resolved: ResolvedOptions,
  host: HTMLElement | null = hostFor(ranges),
  rangeSource?: () => Range[],
  cleanup: Disconnect[] = [],
): MarkHandle {
  if (!host) return INERT_HANDLE;

  const container = createOverlayContainer(host);
  const env = detectEnvironment();
  let activeRanges = ranges;
  let cached: { snap: SnapMode; lines: LineRect[] } | null = null;

  const buildContext = (opts: ResolvedOptions): RenderContext => {
    if (cached === null || cached.snap !== opts.snap) {
      cached = { snap: opts.snap, lines: measureLines(snapRanges(activeRanges, opts.snap), container) };
    }
    return { container, options: opts, lines: linesToGeometry(cached.lines, opts), ranges: activeRanges };
  };

  const initialContext = buildContext(resolved);
  const renderer = RENDERERS[selectTier(resolved.renderer, env, initialContext.lines.length)]();
  renderer.mount(initialContext);

  const anim = applyDrawOn(
    container,
    (seed) => renderer.bandFor(seed),
    initialContext.lines,
    resolved.animation,
    env,
  );

  const reflow = createReflowObserver(reflowTargets(host, activeRanges), () => {
    cached = null;
    const ctx = buildContext(resolved);
    renderer.update(ctx);
    anim.retarget(ctx.lines);
  });

  return createMarkHandle({
    options: resolved,
    userOptions,
    renderer,
    container,
    reflow,
    cleanup: [anim, ...cleanup],
    replay: anim.replay,
    retarget: anim.retarget,
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
  if (!hasDom()) return INERT_HANDLE;

  const userOptions: HighlightOptions = { snap: defaultSnap(target), ...options };
  const resolved = resolveOptions(userOptions);
  const ranges = toRanges(target);
  if (ranges.length === 0) return INERT_HANDLE;

  return mountMark(ranges, userOptions, resolved, host ?? undefined);
}

export function highlightAll(options?: HighlightOptions): MarkHandle {
  if (!hasDom()) return INERT_HANDLE;

  const root = document.body ?? document.documentElement;
  const userOptions: HighlightOptions = { snap: "line", ...options };
  const resolved = resolveOptions(userOptions);

  const collect = (): Range[] => {
    const ranges = collectPageRanges({ root });
    for (const el of root.querySelectorAll("[data-highlight]")) ranges.push(...toRanges(el));
    return ranges;
  };

  let handle: MarkHandle;
  const watcher = createMutationWatcher(root, () => handle.update({}));
  handle = mountMark(collect(), userOptions, resolved, root, collect, [watcher]);
  return handle;
}

const CLEAR_FADE_MS = 200;

export function highlightSelection(options?: HighlightOptions): MarkHandle {
  if (!hasDom()) return INERT_HANDLE;

  const env = detectEnvironment();
  if (env.coarsePointer) return INERT_HANDLE;

  let userOptions: HighlightOptions = { snap: "word", ...options };
  let resolved = resolveOptions(userOptions);
  let currentHost: HTMLElement | null = null;
  let container: HTMLElement | null = null;
  let reflowDisconnect: Disconnect = () => {};
  let renderer: Renderer | null = null;
  let currentRanges: Range[] = [];
  let rafId = 0;
  let clearTimer: ReturnType<typeof setTimeout> | null = null;

  const ensureAnchor = (anchor: HTMLElement): boolean => {
    if (anchor === currentHost && container) return false;
    if (container) {
      ensurePositioned(anchor);
      anchor.appendChild(container);
    } else {
      container = createOverlayContainer(anchor);
    }
    currentHost = anchor;
    return true;
  };

  const tracker = env.prefersReducedMotion ? null : new SelectionVelocityTracker();
  let dragging = false;
  const onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 || (e.pointerType !== "mouse" && e.pointerType !== "pen")) return;
    dragging = true;
    tracker?.reset();
  };
  const endDrag = (): void => {
    if (rafId) renderNow();
    dragging = false;
  };
  if (tracker) {
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", endDrag, true);
    document.addEventListener("pointercancel", endDrag, true);
    window.addEventListener("blur", endDrag);
  }

  const rebuild = (ranges: Range[], flowReversed: boolean, origin?: DOMRect): RenderContext => {
    const snapped = snapRanges(ranges, resolved.snap);
    const profileFor =
      tracker && resolved.speed.enabled && dragging
        ? (local: LineRect): LineSpeedProfile | undefined =>
            tracker.profileForLine(
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

  const fadeTargets = (): HTMLElement[] => {
    const targets: HTMLElement[] = [];
    if (container) targets.push(container);
    if (renderer?.layer) targets.push(renderer.layer);
    return targets;
  };
  const resetFade = (targets: HTMLElement[]): void => {
    for (const el of targets) {
      el.style.transition = "";
      el.style.opacity = "";
    }
  };

  const sample = (): void => {
    if (!tracker || !dragging || !resolved.speed.enabled || !container) return;
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed) return;
    const origin = container.getBoundingClientRect();
    tracker.recordSample(selection, origin.left, origin.top, performance.now(), resolved.speed.smoothing);
  };

  const renderSelection = (): void => {
    const selection = document.getSelection();
    const ranges: Range[] = [];
    let flowReversed = false;
    if (selection && !selection.isCollapsed) {
      flowReversed = isSelectionBackward(selection);
      for (let i = 0; i < selection.rangeCount; i++) ranges.push(selection.getRangeAt(i).cloneRange());
    }
    const painted = excludeMarkedSubtrees(ranges);
    const cleared = painted.length === 0 && currentRanges.length > 0;
    currentRanges = painted;

    if (cleared && resolved.fadeOnClear && renderer && !env.prefersReducedMotion) {
      const targets = fadeTargets();
      for (const el of targets) {
        el.style.transition = `opacity ${CLEAR_FADE_MS}ms ease-out`;
        el.style.opacity = "0";
      }
      clearTimer = setTimeout(() => {
        clearTimer = null;
        if (!container) return;
        renderer?.update(rebuild([], false));
        resetFade(targets);
      }, CLEAR_FADE_MS);
      return;
    }
    if (clearTimer !== null) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
    resetFade(fadeTargets());

    if (painted.length > 0) {
      const anchor = findSelectionAnchor(painted[0].commonAncestorContainer);
      if (ensureAnchor(anchor)) {
        reflowDisconnect();
        reflowDisconnect = createReflowObserver(reflowTargets(anchor, painted), () => {
          if (currentRanges.length > 0) renderNow();
        });
      }
    }
    if (!container) return;

    const context = rebuild(painted, flowReversed, container.getBoundingClientRect());
    if (renderer) {
      renderer.update(context);
    } else {
      renderer = RENDERERS[selectTier(resolved.renderer, env, context.lines.length)]();
      renderer.mount(context);
    }
  };

  const renderNow = (): void => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    renderSelection();
  };
  const onSelectionChange = (): void => {
    sample();
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      renderSelection();
    });
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
      renderNow();
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
