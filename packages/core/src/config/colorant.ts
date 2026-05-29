/**
 * The `colorant` master axis (R17b) — one dye↔pigment knob that sets coherent
 * defaults for the correlated physical ink parameters.
 *
 * The real-world tradeoff: dissolved **dye** ink is saturated and bright, wicks
 * and feathers freely, smears and spreads, and overlaps less cleanly; solid
 * **pigment** ink is more muted and translucent, feathers little, layers cleanly
 * via multiply, and resists smear. A single position on `[0, 1]` therefore
 * predicts believable defaults for `saturation`, `feathering`, `streakiness`,
 * `startEndBuildup`, and the `opacity`/`blendMode` overlap cleanliness.
 *
 * The axis sets defaults, not ceilings — it only fills fields the user left
 * unset; an explicit value always wins.
 *
 * Pure, DOM-free.
 */

import type { ColorantValue, HighlightOptions, InkOptions } from "../types.js";

/** Clamp `value` into the inclusive `[0, 1]` range. */
function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0.5;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Linear interpolation from `dye` (axis `0`) to `pigment` (axis `1`).
 */
function lerp(dye: number, pigment: number, t: number): number {
  return dye + (pigment - dye) * t;
}

/**
 * Map a {@link ColorantValue} to a clamped `[0, 1]` axis position.
 * `dye → 0`, `balanced → 0.5`, `pigment → 1`; numbers are clamped.
 */
export function normalizeColorant(value: ColorantValue): number {
  if (typeof value === "number") {
    return clamp01(value);
  }
  switch (value) {
    case "dye":
      return 0;
    case "balanced":
      return 0.5;
    case "pigment":
      return 1;
    default:
      // Unknown string — fall back to the balanced midpoint.
      return 0.5;
  }
}

/**
 * Return a copy of `options` whose unset ink parameters and overlap cleanliness
 * are defaulted from the dye↔pigment position `colorant` (already normalized to
 * `[0, 1]`).
 *
 * Direction (monotonic in `colorant`, V9c):
 * - `saturation`     — high at dye, low at pigment (decreasing).
 * - `feathering`     — high at dye, low at pigment (decreasing).
 * - `streakiness`    — high at dye (more smear/spread), low at pigment (decreasing).
 * - `startEndBuildup`— more pooling at dye, anti-pool at pigment (decreasing).
 * - `opacity`        — denser at dye, more translucent at pigment (decreasing).
 *
 * Only **unset** fields are filled. Explicit user values are preserved verbatim;
 * `blendMode` is defaulted to the clean subtractive `multiply` only when the
 * user left it unset.
 */
export function applyColorantAxis(
  options: HighlightOptions,
  colorant: number,
): HighlightOptions {
  const t = clamp01(colorant);

  const userInk: InkOptions = options.ink ?? {};
  const ink: InkOptions = { ...userInk };

  // dye (t=0) ............................................ pigment (t=1)
  if (ink.saturation === undefined) ink.saturation = lerp(0.9, 0.45, t);
  if (ink.feathering === undefined) ink.feathering = lerp(0.7, 0.1, t);
  if (ink.streakiness === undefined) ink.streakiness = lerp(0.55, 0.15, t);
  if (ink.startEndBuildup === undefined) {
    // Pools at the dye end, neutral mid-axis, anti-pool guardrail at pigment.
    ink.startEndBuildup = lerp(0.6, -0.3, t);
  }

  const next: HighlightOptions = { ...options, ink };

  if (next.opacity === undefined) {
    next.opacity = lerp(0.85, 0.5, t);
  }
  if (next.blendMode === undefined) {
    // Pigment layers cleanest under multiply; dye still composites well there.
    next.blendMode = "multiply";
  }

  return next;
}
