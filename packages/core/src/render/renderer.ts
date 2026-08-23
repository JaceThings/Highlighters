import type { BlendMode, Box, RenderContext } from "../types.js";

export type { Renderer, RenderContext } from "../types.js";

const OVERLAY_FLAG = "data-highlighters-overlay";

const appliedStyles = new WeakMap<HTMLElement, Record<string, string>>();

function applyOnce(el: HTMLElement, key: string, value: string, apply: () => void): void {
  let cache = appliedStyles.get(el);
  if (!cache) {
    cache = {};
    appliedStyles.set(el, cache);
  }
  if (cache[key] === value) return;
  cache[key] = value;
  apply();
}

export function setVendorPrefixed(
  el: HTMLElement,
  prop: "clipPath" | "maskImage" | "maskRepeat" | "maskPosition" | "maskSize",
  value: string,
): void {
  applyOnce(el, prop, value, () => {
    const s = el.style as CSSStyleDeclaration & Record<string, string>;
    s[prop] = value;
    const webkitProp = `webkit${prop.charAt(0).toUpperCase()}${prop.slice(1)}`;
    s[webkitProp] = value;
  });
}

export function setStyleOnce(el: HTMLElement, prop: string, value: string): void {
  applyOnce(el, prop, value, () => {
    (el.style as CSSStyleDeclaration & Record<string, string>)[prop] = value;
  });
}

export function backdropElement(context: RenderContext): Element | null {
  const node = context.ranges[0]?.commonAncestorContainer;
  const el = node instanceof Element ? node : (node?.parentElement ?? null);
  return el ?? context.container.parentElement;
}

export function applyBoxPosition(el: HTMLElement, box: Box): void {
  setStyleOnce(el, "position", "absolute");
  setStyleOnce(el, "left", `${box.x}px`);
  setStyleOnce(el, "top", `${box.y}px`);
  setStyleOnce(el, "width", `${box.width}px`);
  setStyleOnce(el, "height", `${box.height}px`);
}

export function createOverlayContainer(host: HTMLElement): HTMLElement {
  const existing = host.querySelector<HTMLElement>(`:scope > [${OVERLAY_FLAG}]`);
  if (existing) return existing;

  const doc = host.ownerDocument;
  const container = doc.createElement("div");
  container.setAttribute(OVERLAY_FLAG, "");
  styleOverlayLayer(container, "multiply");

  const view = doc.defaultView;
  if (view) {
    const position = view.getComputedStyle(host).position;
    if (position === "static") host.style.position = "relative";
  }

  host.appendChild(container);
  return container;
}

function styleOverlayLayer(el: HTMLElement, blend: BlendMode): void {
  el.setAttribute("aria-hidden", "true");
  const s = el.style;
  s.position = "absolute";
  s.top = "0";
  s.left = "0";
  s.width = "100%";
  s.height = "100%";
  s.pointerEvents = "none";
  s.isolation = "isolate";
  s.mixBlendMode = blend;
  s.overflow = "visible";
  s.userSelect = "none";
}

function createBlendLayer(host: Element, blend: BlendMode): HTMLElement {
  const layer = host.ownerDocument.createElement("div");
  styleOverlayLayer(layer, blend);
  host.appendChild(layer);
  return layer;
}

export interface BlendTarget {
  target: HTMLElement;
  layer: HTMLElement | null;
}

export function resolveBlendTarget(
  host: Element | null,
  container: HTMLElement,
  current: HTMLElement | null,
  layerBlend: BlendMode | null,
): BlendTarget {
  if (!layerBlend || !host) {
    current?.remove();
    return { target: container, layer: null };
  }
  if (current && current.style.mixBlendMode === layerBlend) {
    return { target: current, layer: current };
  }
  current?.remove();
  const layer = createBlendLayer(host, layerBlend);
  return { target: layer, layer };
}

export function teardownContainer(container: HTMLElement): void {
  if (!container.firstChild) container.remove();
}

export class NodePool<T extends Node> {
  private readonly nodes = new Map<number, T>();

  get size(): number {
    return this.nodes.size;
  }

  get(key: number): T | undefined {
    return this.nodes.get(key);
  }

  set(key: number, node: T): void {
    this.nodes.set(key, node);
  }

  has(key: number): boolean {
    return this.nodes.has(key);
  }

  retain(keep: Set<number>, dispose: (node: T) => void): void {
    for (const [key, node] of this.nodes) {
      if (!keep.has(key)) {
        dispose(node);
        this.nodes.delete(key);
      }
    }
  }

  clear(dispose: (node: T) => void): void {
    for (const node of this.nodes.values()) dispose(node);
    this.nodes.clear();
  }
}
