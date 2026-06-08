// Matches the preview-square's tween so a preset click settles as one beat.
export const PROP_CHANGE_DURATION = 0.35;
export const PROP_CHANGE_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

// Mirrors the prop-change tween so digits finish as the fill bar settles.
export const READOUT_TRANSITION = { duration: 300 };

export const CLICK_THRESHOLD = 3;

// Magnetic circOut snap to the next integer; the tick lands inside the deceleration.
export const STEP_SNAP_DURATION = 0.08;
export const STEP_SNAP_EASE: [number, number, number, number] = [0.0, 0.55, 0.45, 1.0];

export const fmt2 = (v: number) => v.toFixed(2);
export const fmtPx = (v: number) => `${v.toFixed(0)}px`;

export const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

export const snap = (n: number, step: number) =>
  step > 0 ? Math.round(n / step) * step : n;

// Committed-value floor: the track spans min..max, but values clamp up to `floor`. Shared so Slider and usePointerDrag agree.
export const lowerBound = (min: number, floor?: number) =>
  floor != null ? Math.max(min, floor) : min;

// Widest legal display, so the readout column reserves a stable width (a 99->100 jump doesn't tug the label).
export const reservedChars = (
  min: number,
  max: number,
  step: number,
  format?: (n: number) => string,
  sampleValues?: readonly number[],
): number => {
  const sample = (n: number): string => {
    if (format) return format(n);
    const stepStr = String(step);
    const decimals = stepStr.includes(".") ? stepStr.split(".")[1].length : 0;
    return decimals > 0 ? n.toFixed(decimals) : String(n);
  };
  // Extra samples cover formatted strings wider than both endpoints.
  const lengths = [sample(min).length, sample(max).length];
  if (sampleValues) for (const v of sampleValues) lengths.push(sample(v).length);
  return Math.max(...lengths);
};

// Cache the MediaQueryList at module scope: `matchMedia()` allocates and can force a style flush on
// every call, and this is read dozens of times per frame during a drag. One `change` listener keeps
// the cached `.matches` fresh, so the exported reader is a plain boolean lookup.
const reducedMotionQuery =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
let reducedMotionMatches = reducedMotionQuery?.matches ?? false;
reducedMotionQuery?.addEventListener("change", (e) => {
  reducedMotionMatches = e.matches;
});

export const prefersReducedMotion = (): boolean => reducedMotionMatches;
