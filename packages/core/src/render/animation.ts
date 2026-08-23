import type {
  Disconnect,
  MarkGeometry,
  ResolvedAnimation,
  RenderEnvironment,
} from "../types.js";
import { hasGlobal } from "../internal/dom.js";

export function prefersReducedMotion(): boolean {
  if (!hasGlobal("window") || !("matchMedia" in window)) {
    return false;
  }
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

type Easer = (t: number) => number;

const NAMED_EASINGS = {
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
} as const;

type NamedEasing = keyof typeof NAMED_EASINGS;

function cubicBezierEaser(p1x: number, p1y: number, p2x: number, p2y: number): Easer {
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-4) break;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    return sampleY(t);
  };
}

function isNamedEasing(value: string): value is NamedEasing {
  return value in NAMED_EASINGS;
}

function parseEasing(easing: ResolvedAnimation["easing"]): Easer {
  if (easing === "linear") return (t) => t;
  if (isNamedEasing(easing)) {
    const [x1, y1, x2, y2] = NAMED_EASINGS[easing];
    return cubicBezierEaser(x1, y1, x2, y2);
  }
  const m = /cubic-bezier\(([^)]+)\)/.exec(easing);
  if (m) {
    const n = m[1].split(",").map((s) => Number(s.trim()));
    if (n.length === 4 && n.every(Number.isFinite)) {
      return cubicBezierEaser(n[0], n[1], n[2], n[3]);
    }
  }
  const fallback = NAMED_EASINGS["ease-out"];
  return cubicBezierEaser(fallback[0], fallback[1], fallback[2], fallback[3]);
}

function setClip(el: HTMLElement, path: string): void {
  el.style.clipPath = path;
  el.style.setProperty("-webkit-clip-path", path);
}

const FADE_IN_MS = 50;

function fadeOpacity(elapsedMs: number, fadeMs: number): string {
  if (elapsedMs >= fadeMs) return "";
  return (Math.max(0, elapsedMs) / fadeMs).toFixed(3);
}

type BandFor = (seed: number) => HTMLElement | null;

interface DrawItem {
  node: HTMLElement;
  full: string;
  build: (front: number) => string;
  width: number;
  minFront: number;
  startMs: number;
}

function drawItems(bandFor: BandFor, lines: MarkGeometry[], stagger: number): DrawItem[] {
  const items: DrawItem[] = [];
  lines.forEach((line, i) => {
    const node = bandFor(line.seed);
    if (!node) return;
    items.push({
      node,
      full: line.clipPath,
      build: line.clipAtFront,
      width: line.box.width,
      minFront: line.minFront,
      startMs: i * stagger,
    });
  });
  return items;
}

function showFull(items: DrawItem[]): void {
  for (const it of items) {
    setClip(it.node, it.full);
    it.node.style.opacity = "";
  }
}

export type DrawOnHandle = Disconnect & {
  retarget: (lines: MarkGeometry[]) => void;
  replay: () => void;
};

function asHandle(
  disconnect: Disconnect,
  retarget: DrawOnHandle["retarget"],
  replay: DrawOnHandle["replay"],
): DrawOnHandle {
  return Object.assign(disconnect, { retarget, replay });
}

export function applyDrawOn(
  container: HTMLElement,
  bandFor: BandFor,
  lines: MarkGeometry[],
  animation: ResolvedAnimation,
  env: RenderEnvironment,
): DrawOnHandle {
  if (lines.length === 0) return asHandle(() => {}, () => {}, () => {});

  let items = drawItems(bandFor, lines, animation.stagger);
  if (items.length === 0) return asHandle(() => {}, () => {}, () => {});

  if (
    env.prefersReducedMotion ||
    !animation.draw ||
    !hasGlobal("requestAnimationFrame")
  ) {
    showFull(items);
    return asHandle(
      () => {},
      (next) => showFull(drawItems(bandFor, next, animation.stagger)),
      () => showFull(items),
    );
  }

  const ease = parseEasing(animation.easing);
  const duration = Math.max(1, animation.duration);
  const fadeMs = Math.min(FADE_IN_MS, duration * 0.5);
  let raf = 0;
  let startTime = 0;
  let observer: IntersectionObserver | null = null;
  let played = false;

  function primeClosed(it: DrawItem): void {
    setClip(it.node, it.build(0));
  }

  function frame(now: number): void {
    if (startTime === 0) startTime = now;
    let done = true;
    for (const it of items) {
      const elapsed = now - startTime - it.startMs;
      const t = elapsed / duration;
      if (t >= 1) {
        setClip(it.node, it.full);
        it.node.style.opacity = "";
        continue;
      }
      done = false;
      const p = t <= 0 ? 0 : ease(t);
      const front = p <= 0 ? 0 : it.minFront + p * (it.width - it.minFront);
      setClip(it.node, it.build(front));
      it.node.style.opacity = fadeOpacity(elapsed, fadeMs);
    }
    raf = done ? 0 : requestAnimationFrame(frame);
  }

  function play(): void {
    startTime = 0;
    for (const it of items) primeClosed(it);
    raf = requestAnimationFrame(frame);
  }

  function stop(): void {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  if (animation.trigger === "in-view" && hasGlobal("IntersectionObserver")) {
    for (const it of items) primeClosed(it);
    observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (!visible) return;
        if (played && !animation.repeat) return;
        if (animation.repeat) stop();
        played = true;
        play();
        if (!animation.repeat) {
          observer?.disconnect();
          observer = null;
        }
      },
      { threshold: animation.threshold, rootMargin: animation.rootMargin },
    );
    observer.observe(container);
  } else {
    played = true;
    play();
  }

  function retarget(next: MarkGeometry[]): void {
    items = drawItems(bandFor, next, animation.stagger);
    if (raf !== 0) return;
    if (played) showFull(items);
    else for (const it of items) primeClosed(it);
  }

  function replay(): void {
    stop();
    played = true;
    play();
  }

  return asHandle(
    () => {
      stop();
      observer?.disconnect();
      observer = null;
      showFull(items);
    },
    retarget,
    replay,
  );
}
