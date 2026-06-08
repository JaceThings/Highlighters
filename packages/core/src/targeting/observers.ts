/**
 * Reflow and dynamic-DOM observation. `createReflowObserver` funnels every event that can move a mark
 * (resize, web-font load) into a single rAF-batched callback. `createMutationWatcher` is the scoped,
 * debounced `MutationObserver` for page/declarative modes. Both return a leak-free, idempotent `Disconnect`.
 */

import type {
  Disconnect,
  MutationCallback,
  ReflowCallback,
} from "../types.js";
import { hasWindow } from "../internal/dom.js";

const MUTATION_DEBOUNCE_MS = 50;

/** Nearest ancestor whose `position` is not `static` (what overlays position against). `null` if none before the root or off-DOM. */
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

/** Wire reflow observation for `targets` (and their positioned containers), window resize, and web-font load into one rAF-batched `callback`. Leak-free `Disconnect`; inert off-DOM. */
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

  // Observe each target's positioned container too: a container resize moves overlays without resizing the target. De-duped.
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

  // visualViewport.resize (mobile URL bar, pinch-zoom) shifts layout without a window resize.
  const vv = window.visualViewport;
  if (vv) vv.addEventListener("resize", schedule);

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
    if (vv) vv.removeEventListener("resize", schedule);
    if (rafId !== undefined) {
      cancelAnimationFrame(rafId);
      rafId = undefined;
    }
  };
}

/** Scoped, debounced `MutationObserver` on `root`: a mutation burst flushes one `callback` once the DOM is quiet for {@link MUTATION_DEBOUNCE_MS}. Leak-free `Disconnect`; inert off-DOM. */
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
