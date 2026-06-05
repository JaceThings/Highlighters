// device-radius: device-aware screen corner radius for iPhones.
//
// Apple never exposes the model or its private display corner radius to the web, so we infer it
// from three signals: the iPhone UA + iOS version, the logical viewport (screen.width/height), and
// devicePixelRatio. Several viewports map to multiple models with different radii; when they
// disagree we return the lower value and flag confidence "low". Radii are in CSS px, which equal
// points on iOS, so no conversion is needed.
//
// Zero dependencies. See README.md for the ambiguity table and the squircle caveat.

export type RadiusTier =
  | "flat"
  | "rounded"
  | "rounder"
  | "rounder-max"
  | "very-round"
  | "most-round"
  | "unknown";

export type Confidence = "exact" | "high" | "low";

export interface DeviceRadiusResult {
  isIphone: boolean;
  screenCornerRadius: number; // CSS px (= pt on iOS)
  confidence: Confidence;
  tier: RadiusTier;
  iosVersion: number | null;
  viewport: { w: number; h: number; dpr: number };
  note?: string;
}

declare global {
  interface Window {
    /** Set by the demo to test detection on a desktop browser; forces an iPhone result. */
    __simulatedViewport?: { w: number; h: number; dpr: number; ios?: number };
  }
}

interface Entry {
  w: number;
  h: number;
  dpr: number;
  minIOS?: number;
  maxIOS?: number;
  radius: number;
  tier: RadiusTier;
  confidence: Confidence;
  note?: string;
}

// Plain data, grouped by radius era. `w` is always the SHORTER side (portrait-normalized).
// Entries for one viewport that disagree on radius are resolved at match time (see compute).
const TABLE: Entry[] = [
  // Flat era (0pt) - square display edge: SE (all), 6, 7, 8.
  { w: 320, h: 568, dpr: 2, radius: 0, tier: "flat", confidence: "exact", note: "SE (1st gen)" },
  { w: 375, h: 667, dpr: 2, radius: 0, tier: "flat", confidence: "exact", note: "6 / 7 / 8 / SE 2 / SE 3" },
  { w: 414, h: 736, dpr: 3, radius: 0, tier: "flat", confidence: "exact", note: "6+ / 7+ / 8+" },

  // Rounded era (~39pt) - the X generation.
  { w: 375, h: 812, dpr: 3, maxIOS: 16, radius: 39, tier: "rounded", confidence: "high", note: "X / XS / 11 Pro" },
  { w: 414, h: 896, dpr: 2, radius: 39, tier: "rounded", confidence: "exact", note: "XR / 11" },
  { w: 414, h: 896, dpr: 3, radius: 39, tier: "rounded", confidence: "exact", note: "XS Max / 11 Pro Max" },

  // Rounder era (47.33pt) - 12/13/14, the minis, and 16e.
  { w: 375, h: 812, dpr: 3, minIOS: 14, radius: 47.33, tier: "rounder", confidence: "high", note: "12 mini / 13 mini" },
  { w: 390, h: 844, dpr: 3, radius: 47.33, tier: "rounder", confidence: "high", note: "12 / 13 / 14 / 16e" },

  // Rounder-max era (53.33pt) - the older Plus / Pro Max bodies.
  { w: 428, h: 926, dpr: 3, radius: 53.33, tier: "rounder-max", confidence: "exact", note: "12 / 13 Pro Max, 14 Plus" },

  // Very-round era (55pt) - 14 Pro through the non-Pro 16. Note the 390x844 collision below.
  { w: 390, h: 844, dpr: 3, minIOS: 17, radius: 55, tier: "very-round", confidence: "low", note: "15 / 16 (shares 390x844 with 12/13/14)" },
  { w: 393, h: 852, dpr: 3, radius: 55, tier: "very-round", confidence: "high", note: "14 Pro / 15 / 15 Pro / 16" },
  { w: 430, h: 932, dpr: 3, radius: 55, tier: "very-round", confidence: "high", note: "14 Pro Max / 15 Plus / 15 Pro Max / 16 Plus" },

  // Most-round era (62pt) - 16 Pro and the 17 line.
  { w: 402, h: 874, dpr: 3, radius: 62, tier: "most-round", confidence: "high", note: "16 Pro / 17 / 17 Pro" },
  { w: 440, h: 956, dpr: 3, radius: 62, tier: "most-round", confidence: "high", note: "16 Pro Max / 17 Pro Max / 17 Air" },
];

const TIER_SCALE: Record<RadiusTier, { sm: number; md: number }> = {
  flat: { sm: 8, md: 12 },
  rounded: { sm: 12, md: 18 },
  rounder: { sm: 14, md: 20 },
  "rounder-max": { sm: 16, md: 22 },
  "very-round": { sm: 18, md: 24 },
  "most-round": { sm: 20, md: 28 },
  unknown: { sm: 14, md: 20 },
};

function getViewport(): { w: number; h: number; dpr: number } {
  const sim = typeof window !== "undefined" ? window.__simulatedViewport : undefined;
  if (sim) return { w: Math.min(sim.w, sim.h), h: Math.max(sim.w, sim.h), dpr: sim.dpr };
  // Orientation-agnostic: always treat the shorter dimension as width.
  const sw = screen.width;
  const sh = screen.height;
  return { w: Math.min(sw, sh), h: Math.max(sw, sh), dpr: window.devicePixelRatio || 1 };
}

function iosInRange(ios: number | null, e: Entry): boolean {
  if (ios == null) return true; // unknown iOS can't narrow; lean conservative downstream
  if (e.minIOS != null && ios < e.minIOS) return false;
  if (e.maxIOS != null && ios > e.maxIOS) return false;
  return true;
}

function compute(): DeviceRadiusResult {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { isIphone: false, screenCornerRadius: 0, confidence: "exact", tier: "flat", iosVersion: null, viewport: { w: 0, h: 0, dpr: 1 } };
  }
  const ua = navigator.userAgent;
  const sim = window.__simulatedViewport;
  const isIphone = sim ? true : /iPhone/.test(ua);
  const vp = getViewport();
  const iosMatch = /iPhone OS (\d+)_/.exec(ua);
  const iosVersion = sim?.ios ?? (iosMatch ? Number(iosMatch[1]) : null);

  if (!isIphone) {
    return { isIphone: false, screenCornerRadius: 0, confidence: "exact", tier: "flat", iosVersion, viewport: vp };
  }

  const candidates = TABLE.filter(
    (e) => e.w === vp.w && e.h === vp.h && e.dpr === vp.dpr && iosInRange(iosVersion, e),
  );

  if (candidates.length === 0) {
    return {
      isIphone: true,
      screenCornerRadius: 47,
      confidence: "low",
      tier: "rounder",
      iosVersion,
      viewport: vp,
      note: "Unknown iPhone viewport; using a safe rounded default (47pt).",
    };
  }

  const radii = [...new Set(candidates.map((c) => c.radius))];
  if (radii.length === 1) {
    const best = candidates[0];
    const confidence: Confidence =
      candidates.length === 1 ? best.confidence : candidates.some((c) => c.confidence === "exact") ? "exact" : "high";
    return { isIphone: true, screenCornerRadius: best.radius, confidence, tier: best.tier, iosVersion, viewport: vp, note: best.note };
  }

  // Ambiguous: viewport + iOS still map to differing radii. Take the conservative lower value.
  const min = Math.min(...radii);
  const lowest = candidates.find((c) => c.radius === min)!;
  const models = candidates.map((c) => c.note).filter(Boolean).join("; ");
  return {
    isIphone: true,
    screenCornerRadius: min,
    confidence: "low",
    tier: lowest.tier,
    iosVersion,
    viewport: vp,
    note: `${vp.w}×${vp.h} @${vp.dpr} maps to models with different radii (${radii.join(" / ")}pt). Using the conservative lower value. Candidates: ${models}.`,
  };
}

let cached: DeviceRadiusResult | null = null;

/** Detect the device's screen corner radius. Memoized, except while a simulated viewport is set. */
export function detectDeviceRadius(): DeviceRadiusResult {
  if (typeof window !== "undefined" && window.__simulatedViewport) return compute();
  if (cached) return cached;
  cached = compute();
  return cached;
}

/**
 * Border-radius for a UI element inset from the screen edge, so its curve stays concentric with
 * the screen's. `innerRadius(55, 16)` -> 39.
 */
export function innerRadius(screenRadius: number, inset: number): number {
  return Math.max(0, screenRadius - inset);
}

/**
 * Write the radius tokens onto `root` (default <html>). Safe to call in <head> before paint to
 * avoid a flash of the wrong radius. `--device-radius-drawer` subtracts an optional `--drawer-inset`.
 */
export function applyRadiusTokens(root: HTMLElement = document.documentElement): void {
  const r = detectDeviceRadius();
  const scale = TIER_SCALE[r.tier] ?? TIER_SCALE.unknown;
  root.style.setProperty("--device-screen-radius", `${r.screenCornerRadius}px`);
  root.style.setProperty("--device-radius-sm", `${scale.sm}px`);
  root.style.setProperty("--device-radius-md", `${scale.md}px`);
  root.style.setProperty("--device-radius-drawer", "calc(var(--device-screen-radius) - var(--drawer-inset, 0px))");
  root.style.setProperty("--device-radius-confidence", r.confidence);
}
