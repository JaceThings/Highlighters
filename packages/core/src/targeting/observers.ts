/**
 * Reflow and dynamic-DOM observation (A9, R8, R22, R33).
 *
 * `createReflowObserver` funnels every event that can move a mark — element/
 * container resize, window resize, and web-font load — into a single
 * `requestAnimationFrame`-batched callback, so reflow updates coalesce to one
 * read-then-write pass per frame and never animate.
 *
 * `createMutationWatcher` is the scoped, debounced `MutationObserver` used by
 * page/declarative modes (R8) to pick up added/removed nodes without a
 * full-page rescan.
 *
 * Both return a `Disconnect` that tears down *everything* they wired and leaves
 * no active timers, rAF loops, or listeners behind — idle cost is zero (R33),
 * and teardown is leak-free and idempotent (R8/R33/V4).
 */

import type {
  Disconnect,
  MutationCallback,
  ReflowCallback,
} from "../types.js";

/** Debounce window (ms) for the mutation watcher — coalesces bursts of mutations. */
const MUTATION_DEBOUNCE_MS = 50;

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

/**
 * Walk up from `el` to the nearest ancestor whose `position` is not `static`
 * (the element overlays are positioned against). Returns `null` if none is found
 * before the document root, or outside a DOM.
 */
function nearestPositionedContainer(el: Element): Element | null {
  if (!hasWindow() || typeof getComputedStyle === "undefined") return null;
  let current: Element | null = el.parentElement;
  while (current && current !== document.documentElement) {
    let position: string;
    try {
      position = getComputedStyle(current).position;
    } catch {
      position = "static";
    }
    if (position && position !== "static") return current;
    current = current.parentElement;
  }
  return null;
}

/**
 * Wire reflow observation for `targets` and funnel everything into a single
 * rAF-batched `callback` (R22).
 *
 * Observes each target and its nearest positioned container with a
 * `ResizeObserver`, listens for `window` resize, and resolves
 * `document.fonts.ready` (late web-font load, R22). Every source schedules at
 * most one pending `requestAnimationFrame`; the callback runs once per frame
 * regardless of how many sources fired.
 *
 * Returns a `Disconnect` that disconnects the observer, removes the resize
 * listener, and cancels any pending rAF — zero idle cost afterward (R33). Safe
 * and inert outside a DOM, and idempotent.
 */
export function createReflowObserver(
  targets: Element[],
  callback: ReflowCallback,
): Disconnect {
  if (!hasWindow()) return () => {};

  let disposed = false;
  let rafId: number | undefined;

  const schedule = () => {
    if (disposed || rafId !== undefined) return;
    rafId = requestAnimationFrame(() => {
      rafId = undefined;
      if (!disposed) callback();
    });
  };

  // ResizeObserver on each target plus its nearest positioned container, so a
  // container resize (which moves overlays without resizing the target) is
  // also caught. De-duplicate to avoid observing the same node twice.
  let resizeObserver: ResizeObserver | undefined;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(schedule);
    const observed = new Set<Element>();
    for (const target of targets) {
      if (!observed.has(target)) {
        observed.add(target);
        resizeObserver.observe(target);
      }
      const container = nearestPositionedContainer(target);
      if (container && !observed.has(container)) {
        observed.add(container);
        resizeObserver.observe(container);
      }
    }
  }

  window.addEventListener("resize", schedule);

  // Late web-font load shifts text metrics; reflow once fonts are ready (R22).
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts && typeof fonts.ready?.then === "function") {
    fonts.ready.then(() => {
      if (!disposed) schedule();
    });
  }

  return () => {
    if (disposed) return;
    disposed = true;
    resizeObserver?.disconnect();
    window.removeEventListener("resize", schedule);
    if (rafId !== undefined) {
      cancelAnimationFrame(rafId);
      rafId = undefined;
    }
  };
}

/**
 * Create a scoped, debounced `MutationObserver` on `root` (R8). Child-list and
 * subtree mutations are buffered and flushed once the DOM has been quiet for
 * {@link MUTATION_DEBOUNCE_MS}, so a burst of inserted/removed nodes triggers a
 * single `callback` with the accumulated records rather than one per mutation.
 *
 * Returns a `Disconnect` that disconnects the observer and cancels any pending
 * debounced flush — fully leak-free (R8/V4). Inert outside a DOM, and
 * idempotent.
 */
export function createMutationWatcher(
  root: Element | Document,
  callback: MutationCallback,
): Disconnect {
  if (typeof MutationObserver === "undefined") return () => {};

  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: MutationRecord[] = [];

  const flush = () => {
    timer = undefined;
    if (disposed) return;
    const records = pending;
    pending = [];
    if (records.length > 0) callback(records);
  };

  const observer = new MutationObserver((records) => {
    if (disposed) return;
    for (const record of records) pending.push(record);
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(flush, MUTATION_DEBOUNCE_MS);
  });

  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  return () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    pending = [];
  };
}
