import type {
  Disconnect,
  MutationCallback,
  ReflowCallback,
} from "../types.js";
import { hasGlobal, hasWindow } from "../internal/dom.js";

const MUTATION_DEBOUNCE_MS = 50;

function nearestPositionedContainer(el: Element): Element | null {
  if (!hasWindow() || !hasGlobal("getComputedStyle")) return null;
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

  let resizeObserver: ResizeObserver | undefined;
  if (hasGlobal("ResizeObserver")) {
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

  const vv = window.visualViewport;
  if (vv) vv.addEventListener("resize", schedule);

  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts && fonts.ready && "then" in fonts.ready) {
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

export function createMutationWatcher(
  root: Element | Document,
  callback: MutationCallback,
): Disconnect {
  if (!hasGlobal("MutationObserver")) return () => {};

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
