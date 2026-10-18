import type { Disconnect, MutationCallback, ReflowCallback } from "../types.js";
import { hasGlobal } from "../internal/dom.js";
import { OWN_NODE_SELECTOR } from "../render/renderer.js";

const MUTATION_DEBOUNCE_MS = 50;

function nearestPositionedContainer(el: Element): Element | null {
  for (let cur = el.parentElement; cur && cur !== document.documentElement; cur = cur.parentElement) {
    const position = getComputedStyle(cur).position;
    if (position && position !== "static") return cur;
  }
  return null;
}

export function createReflowObserver(targets: Element[], callback: ReflowCallback): Disconnect {
  if (!hasGlobal("window")) return () => {};

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
      const container = nearestPositionedContainer(target);
      for (const el of container ? [target, container] : [target]) {
        if (!observed.has(el)) {
          observed.add(el);
          resizeObserver.observe(el);
        }
      }
    }
  }

  window.addEventListener("resize", schedule);
  const vv = window.visualViewport;
  vv?.addEventListener("resize", schedule);
  document.fonts?.ready?.then(() => {
    if (!disposed) schedule();
  });

  return () => {
    if (disposed) return;
    disposed = true;
    resizeObserver?.disconnect();
    window.removeEventListener("resize", schedule);
    vv?.removeEventListener("resize", schedule);
    if (rafId !== undefined) cancelAnimationFrame(rafId);
    rafId = undefined;
  };
}

function isOwnNode(node: Node): boolean {
  const el = node instanceof Element ? node : node.parentElement;
  return !!el?.closest(OWN_NODE_SELECTOR);
}

function isOwnMutation(record: MutationRecord): boolean {
  if (isOwnNode(record.target)) return true;
  if (record.type !== "childList") return false;
  const nodes = [...record.addedNodes, ...record.removedNodes];
  return nodes.length > 0 && nodes.every(isOwnNode);
}

export function createMutationWatcher(root: Element | Document, callback: MutationCallback): Disconnect {
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
    const foreign = records.filter((r) => !isOwnMutation(r));
    if (foreign.length === 0) return;
    pending.push(...foreign);
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(flush, MUTATION_DEBOUNCE_MS);
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true });

  return () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pending = [];
  };
}
