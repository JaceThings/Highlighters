// Matches the preview-square's tween so a preset click settles as one beat.
export const PROP_CHANGE_DURATION = 0.35;
export const PROP_CHANGE_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

// Mirrors the prop-change tween so digits finish as the fill bar settles.
export const READOUT_TRANSITION = { duration: 300 };

export const CLICK_THRESHOLD = 3;

// Snap-between-steps ease (circOut) — a magnetic snap to the next integer, with the
// tick landing inside the deceleration so buffer latency hides under motion.
export const STEP_SNAP_DURATION = 0.08;
export const STEP_SNAP_EASE: [number, number, number, number] = [0.0, 0.55, 0.45, 1.0];

// Shared readout formatters: two-decimal for 0–1 knobs, whole-pixel for px.
export const fmt2 = (v: number) => v.toFixed(2);
export const fmtPx = (v: number) => `${v.toFixed(0)}px`;

export const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

export const snap = (n: number, step: number) =>
  step > 0 ? Math.round(n / step) * step : n;

// Widest legal display, so the readout column reserves a stable width and a
// digit-count change (99→100) doesn't tug the label sideways.
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

export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
