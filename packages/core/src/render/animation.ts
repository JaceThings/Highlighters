import type {
  Disconnect,
  MarkGeometry,
  ResolvedAnimation,
  RenderEnvironment,
} from "../types.js";
import { hasGlobal } from "../internal/dom.js";

type Easer = (t: number) => number;

const NAMED_EASINGS: Record<string, readonly [number, number, number, number]> = {
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};

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

function parseEasing(easing: ResolvedAnimation["easing"]): Easer {
  if (easing === "linear") return (t) => t;
  const m = /cubic-bezier\(([^)]+)\)/.exec(easing);
  const parsed = m ? m[1].split(",").map(Number) : null;
  const pts =
    NAMED_EASINGS[easing] ??
    (parsed && parsed.length === 4 && parsed.every(Number.isFinite) ? parsed : NAMED_EASINGS["ease-out"]);
  return cubicBezierEaser(pts[0], pts[1], pts[2], pts[3]);
}

function setClip(el: HTMLElement, path: string): void {
  el.style.clipPath = path;
  el.style.setProperty("-webkit-clip-path", path);
}

const FADE_IN_MS = 50;

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
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const node = bandFor(line.seed);
    if (!node) continue;
    items.push({
      node,
      full: line.clipPath,
      build: line.clipAtFront,
      width: line.box.width,
      minFront: line.minFront,
      startMs: i * stagger,
    });
  }
  return items;
}

function showFull(items: DrawItem[]): void {
  for (const it of items) {
    setClip(it.node, it.full);
    it.node.style.opacity = "";
  }
}

function primeClosed(items: DrawItem[]): void {
  for (const it of items) setClip(it.node, it.build(0));
}

export type DrawOnHandle = Disconnect & {
  retarget: (lines: MarkGeometry[]) => void;
  replay: () => void;
};

export function applyDrawOn(
  container: HTMLElement,
  bandFor: BandFor,
  lines: MarkGeometry[],
  animation: ResolvedAnimation,
  env: RenderEnvironment,
): DrawOnHandle {
  let items = drawItems(bandFor, lines, animation.stagger);
  const inert =
    items.length === 0 ||
    env.prefersReducedMotion ||
    !animation.draw ||
    !hasGlobal("requestAnimationFrame");

  if (inert) {
    showFull(items);
    return Object.assign(() => {}, {
      retarget: (next: MarkGeometry[]) => showFull(drawItems(bandFor, next, animation.stagger)),
      replay: () => showFull(items),
    });
  }

  const ease = parseEasing(animation.easing);
  const duration = Math.max(1, animation.duration);
  const fadeMs = Math.min(FADE_IN_MS, duration * 0.5);
  let raf = 0;
  let startTime = 0;
  let observer: IntersectionObserver | null = null;
  let played = false;

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
      it.node.style.opacity = elapsed >= fadeMs ? "" : (Math.max(0, elapsed) / fadeMs).toFixed(3);
    }
    raf = done ? 0 : requestAnimationFrame(frame);
  }

  function play(): void {
    startTime = 0;
    primeClosed(items);
    raf = requestAnimationFrame(frame);
  }

  function stop(): void {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  if (animation.trigger === "in-view" && hasGlobal("IntersectionObserver")) {
    primeClosed(items);
    observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
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

  return Object.assign(
    () => {
      stop();
      observer?.disconnect();
      observer = null;
      showFull(items);
    },
    {
      retarget(next: MarkGeometry[]): void {
        items = drawItems(bandFor, next, animation.stagger);
        if (raf !== 0) return;
        if (played) showFull(items);
        else primeClosed(items);
      },
      replay(): void {
        stop();
        played = true;
        play();
      },
    },
  );
}
