/**
 * High-level named presets (R19). Each is a *partial* {@link HighlightOptions}
 * expressible as a single string token (`preset: "wet"`), layered over
 * `DEFAULT_OPTIONS` and beneath the `quality` bundle, the colorant axis, and the
 * explicit user options.
 *
 * Pure data, no DOM. `getPreset()` hands back a shallow clone so callers can
 * never mutate the shared constants.
 */

import type { HighlightOptions, PresetName } from "../types.js";

/**
 * The shipped presets.
 *
 * - `classic-yellow` — the archetypal saturated yellow highlighter: opaque-ish
 *   fluorescent dye, juicy flow, a touch of pooling, lively edges.
 * - `mild` — the **default look** (R19). Desaturated Mildliner pastels, low
 *   opacity, `multiply`, word/line snap, slightly soft edges. Maximizes
 *   readability — the look reviewers most consistently call "best".
 * - `wet` — a juicy, freshly-laid-down marker: high flow, heavy feather and
 *   pooling, soft wandering edges.
 * - `dry` — a near-empty marker: low flow, high viscosity, pronounced
 *   streakiness and skipping, crisp but ragged edges.
 * - `premium` — the engineered-against-pooling marker (Pilot Kire-Na): clean
 *   multiply, low variance, anti-pool guardrail via negative `startEndBuildup`.
 * - `minimal` — a restrained underline-style mark: thin, flat, straight-edged,
 *   no animation; for understated emphasis.
 */
export const PRESETS: Record<PresetName, Partial<HighlightOptions>> = {
  "classic-yellow": {
    color: { palette: "fluorescent", swatch: "yellow" },
    opacity: 0.9,
    blendMode: "multiply",
    snap: "word",
    quality: "standard",
    ink: {
      flow: 0.7,
      saturation: 0.85,
      feathering: 0.35,
      streakiness: 0.4,
      startEndBuildup: 0.35,
    },
    edge: { waviness: 2, roughness: 0.35, cap: "round", radius: 4 },
  },

  mild: {
    color: { palette: "mild", swatch: "yellow" },
    opacity: 0.55,
    blendMode: "multiply",
    snap: "word",
    quality: "standard",
    colorant: "pigment",
    ink: {
      flow: 0.45,
      saturation: 0.5,
      feathering: 0.2,
      streakiness: 0.25,
      dryout: 0.1,
      startEndBuildup: 0.1,
    },
    edge: { waviness: 1, roughness: 0.2, cap: "round", radius: 5 },
  },

  wet: {
    opacity: 0.8,
    blendMode: "multiply",
    snap: "line",
    colorant: "dye",
    ink: {
      flow: 0.9,
      viscosity: 0.2,
      saturation: 0.8,
      feathering: 0.7,
      streakiness: 0.3,
      dryout: 0.05,
      startEndBuildup: 0.6,
    },
    paper: { absorbency: 0.6 },
    edge: { waviness: 2.5, roughness: 0.45, cap: "round", radius: 5 },
  },

  dry: {
    opacity: 0.7,
    blendMode: "multiply",
    snap: "word",
    ink: {
      flow: 0.25,
      viscosity: 0.85,
      saturation: 0.6,
      feathering: 0.1,
      streakiness: 0.75,
      dryout: 0.6,
      startEndBuildup: 0.15,
    },
    paper: { absorbency: 0.15 },
    edge: { waviness: 1.5, roughness: 0.6, cap: "flat", radius: 2 },
  },

  premium: {
    opacity: 0.7,
    blendMode: "multiply",
    snap: "word",
    quality: "premium",
    ink: {
      flow: 0.55,
      viscosity: 0.45,
      saturation: 0.7,
      feathering: 0.15,
      streakiness: 0.1,
      dryout: 0.02,
      // Negative engages the anti-pool guardrail (lightens the ends).
      startEndBuildup: -0.4,
    },
    edge: { waviness: 0.75, roughness: 0.1, cap: "round", radius: 6 },
  },

  minimal: {
    markType: "underline",
    opacity: 0.9,
    blendMode: "multiply",
    snap: "word",
    quality: "premium",
    ink: {
      flow: 0.4,
      saturation: 0.85,
      feathering: 0,
      streakiness: 0,
      dryout: 0,
      startEndBuildup: 0,
    },
    edge: { waviness: 0, roughness: 0, cap: "flat", radius: 0 },
    animation: { draw: false },
  },
};

/**
 * Return a **shallow clone** of the named preset. Callers must not mutate the
 * shared constant, so each call yields a fresh top-level object (the namespaced
 * groups are shared by reference — the merge layer treats them as immutable
 * inputs and only ever reads from them).
 */
export function getPreset(name: PresetName): Partial<HighlightOptions> {
  const preset = PRESETS[name];
  if (!preset) {
    throw new Error(`@highlighters: unknown preset "${name}"`);
  }
  return { ...preset };
}
