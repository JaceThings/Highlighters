/**
 * Reflow and dynamic-DOM observation.
 *
 * `createReflowObserver` funnels every event that can move a mark - element/
 * container resize, window resize, web-font load - into a single rAF-batched
 * callback, so reflow updates coalesce to one read-then-write pass per frame.
 * `createMutationWatcher` is the scoped, debounced `MutationObserver` for page/
 * declarative modes.
 *
 * Both return a `Disconnect` that tears down everything they wired, leaving no
 * active timers, rAF loops, or listeners - teardown is leak-free and idempotent.
 */

import type {
  Disconnect,
  MutationCallback,
  ReflowCallback,
} from "../types.js";
import { hasWindow } from "../internal/dom.js";

const MUTATION_DEBOUNCE_MS = 50;

/**
 * Nearest ancestor whose `position` is not `static` (what overlays are positioned
 * against). Returns `null` if none before the document root, or outside a DOM.
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
 * rAF-batched `callback`: each target and its nearest positioned container via
 * `ResizeObserver`, `window` resize, and late web-font load (`document.fonts.ready`).
 * The callback runs once per frame regardless of how many sources fired. Returns a
 * leak-free `Disconnect`; inert outside a DOM and idempotent.
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

  // Also observe each target's positioned container: a container resize moves
  // overlays without resizing the target. De-dupe to avoid double-observing.
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

  // Late web-font load shifts text metrics; reflow once fonts are ready.
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
 * Scoped, debounced `MutationObserver` on `root`. Child-list/subtree mutations are
 * buffered and flushed once the DOM has been quiet for {@link MUTATION_DEBOUNCE_MS},
 * so a burst triggers a single `callback` with the accumulated records. Returns a
 * leak-free `Disconnect`; inert outside a DOM and idempotent.
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
