import type {
  BlendMode,
  Box,
  ColorValue,
  MarkGeometry,
  RenderContext,
  Renderer,
  RendererTier,
} from "../types.js";
import { effectiveInk } from "./blend.js";

const OVERLAY_FLAG = "data-highlighters-overlay";

const appliedStyles = new WeakMap<HTMLElement, Record<string, string>>();

function changed(el: HTMLElement, prop: string, value: string): boolean {
  let cache = appliedStyles.get(el);
  if (!cache) appliedStyles.set(el, (cache = {}));
  if (cache[prop] === value) return false;
  cache[prop] = value;
  return true;
}

export function setStyleOnce(el: HTMLElement, prop: string, value: string): void {
  if (changed(el, prop, value)) el.style.setProperty(prop, value);
}

export type VendorProperty = "clip-path" | "mask-image" | "mask-repeat" | "mask-position" | "mask-size";

export function setVendorPrefixed(el: HTMLElement, prop: VendorProperty, value: string): void {
  if (!changed(el, prop, value)) return;
  el.style.setProperty(prop, value);
  el.style.setProperty(`-webkit-${prop}`, value);
}

export function fillParent(el: HTMLElement): void {
  setStyleOnce(el, "position", "absolute");
  setStyleOnce(el, "left", "0");
  setStyleOnce(el, "top", "0");
  setStyleOnce(el, "width", "100%");
  setStyleOnce(el, "height", "100%");
  setStyleOnce(el, "pointer-events", "none");
}

export function applyBoxPosition(el: HTMLElement, box: Box): void {
  setStyleOnce(el, "position", "absolute");
  setStyleOnce(el, "left", `${box.x}px`);
  setStyleOnce(el, "top", `${box.y}px`);
  setStyleOnce(el, "width", `${box.width}px`);
  setStyleOnce(el, "height", `${box.height}px`);
}

export function hiddenDiv(doc: Document): HTMLElement {
  const el = doc.createElement("div");
  el.setAttribute("aria-hidden", "true");
  return el;
}

export function ensurePositioned(el: HTMLElement): void {
  const view = el.ownerDocument.defaultView;
  if (view && view.getComputedStyle(el).position === "static") el.style.position = "relative";
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

export function createOverlayContainer(host: HTMLElement): HTMLElement {
  const existing = host.querySelector<HTMLElement>(`:scope > [${OVERLAY_FLAG}]`);
  if (existing) return existing;

  const container = host.ownerDocument.createElement("div");
  container.setAttribute(OVERLAY_FLAG, "");
  styleOverlayLayer(container, "multiply");
  ensurePositioned(host);
  host.appendChild(container);
  return container;
}

export function teardownContainer(container: HTMLElement): void {
  if (!container.firstChild) container.remove();
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
  const layer = host.ownerDocument.createElement("div");
  styleOverlayLayer(layer, layerBlend);
  host.appendChild(layer);
  return { target: layer, layer };
}

export class NodePool<T extends Node> {
  private readonly nodes = new Map<number, T>();

  get(key: number): T | undefined {
    return this.nodes.get(key);
  }

  set(key: number, node: T): void {
    this.nodes.set(key, node);
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

export type PaintLine = (wrapper: HTMLElement, line: MarkGeometry) => void;

export function createBandRenderer(
  tier: RendererTier,
  beginRender: (context: RenderContext, inkColor: ColorValue | undefined) => PaintLine,
): Renderer {
  const wrappers = new NodePool<HTMLElement>();
  let blendLayer: HTMLElement | null = null;

  function render(context: RenderContext): void {
    const { container, options } = context;
    const doc = container.ownerDocument;
    const node = context.ranges[0]?.commonAncestorContainer;
    const backdrop =
      (node instanceof Element ? node : node?.parentElement) ?? container.parentElement;
    const plan = effectiveInk(options.blendMode, options.color, backdrop, doc, options.vivid);
    const { target, layer } = resolveBlendTarget(container.parentElement, container, blendLayer, plan.layer);
    blendLayer = layer;
    const paint = beginRender(context, plan.color === options.color ? undefined : plan.color);

    const keep = new Set<number>();
    for (const line of context.lines) {
      keep.add(line.seed);
      let wrapper = wrappers.get(line.seed);
      if (!wrapper) {
        wrapper = hiddenDiv(doc);
        wrapper.style.pointerEvents = "none";
        wrappers.set(line.seed, wrapper);
      }
      if (wrapper.parentElement !== target) target.appendChild(wrapper);
      applyBoxPosition(wrapper, line.box);
      paint(wrapper, line);
    }
    wrappers.retain(keep, (el) => el.remove());
  }

  return {
    tier,
    get layer() {
      return blendLayer;
    },
    mount: render,
    update: render,
    bandFor: (seed) => wrappers.get(seed) ?? null,
    unmount() {
      wrappers.clear((el) => el.remove());
      blendLayer?.remove();
      blendLayer = null;
    },
  };
}
