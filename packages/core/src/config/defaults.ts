/**
 * The fully-resolved baseline configuration that sits at the bottom of the merge
 * chain (A7: defaults → preset → quality → colorant → user).
 *
 * Every documented default lives here as a concrete value with no optionals, so
 * `resolveOptions()` can layer partial overrides on top of a guaranteed-complete
 * object. Defaults are chosen in the Japan-Stationery-Award spirit: maximize
 * legibility, minimize what the consumer has to think about — fluorescent yellow
 * ink, subtractive `multiply` optics, soft rounded edges, no glow.
 *
 * Frozen and side-effect-free (no DOM access).
 */

import type { ResolvedOptions } from "../types.js";
import { defaultSwatch } from "./palettes.js";

/**
 * The baseline {@link ResolvedOptions}. Deep-frozen so it can be safely shared as
 * the merge floor without any consumer mutating the shared constant.
 */
export const DEFAULT_OPTIONS: ResolvedOptions = Object.freeze({
  markType: "highlight",
  // Fluorescent yellow — the canonical least-text-obscuring hue (R15).
  color: defaultSwatch("fluorescent"),
  gradient: null,
  opacity: 0.85,
  blendMode: "multiply",
  tip: Object.freeze({
    type: "chisel",
    width: 16,
    thickness: 4,
    angle: 35,
  }),
  ink: Object.freeze({
    flow: 0.5,
    viscosity: 0.5,
    saturation: 0.7,
    feathering: 0.3,
    streakiness: 0.35,
    dryout: 0.15,
    startEndBuildup: 0.25,
  }),
  edge: Object.freeze({
    waviness: 1.5,
    // px segmentLength of the wave grid — width-independent (R22c).
    frequency: 22,
    roughness: 0.3,
    cap: "round",
    radius: 4,
  }),
  paper: Object.freeze({
    absorbency: 0.3,
  }),
  glow: Object.freeze({
    enabled: false,
    intensity: 0.5,
    spread: 4,
    // Empty resolves to a brightened form of the ink color at render time.
    color: "",
  }),
  // Balanced midpoint of the dye↔pigment axis.
  colorant: 0.5,
  quality: "standard",
  snap: "line",
  renderer: "auto",
  animation: Object.freeze({
    draw: true,
    duration: 420,
    easing: "ease-out",
    direction: "left-to-right",
    stagger: 90,
    trigger: "immediate",
    threshold: 0.2,
    rootMargin: "0px",
    repeat: false,
  }),
  semantic: false,
  contrastBackground: null,
  // Null signals each mark must derive its seed from a stable target identity.
  seed: null,
}) as ResolvedOptions;
