/**
 * The fully-resolved baseline that sits at the bottom of the merge chain
 * (defaults → preset → user). Every default is a concrete value with no optionals,
 * so `resolveOptions()` can layer partial overrides on a guaranteed-complete
 * object. Deep-frozen so it can be shared as the merge floor without any consumer
 * mutating it.
 */

import type { ResolvedOptions } from "../types.js";
import { defaultSwatch } from "./palettes.js";

export const DEFAULT_OPTIONS: ResolvedOptions = Object.freeze({
  markType: "highlight",
  color: defaultSwatch("fluorescent"),
  gradient: null,
  opacity: 0.85,
  blendMode: "multiply",
  tip: Object.freeze({
    type: "chisel",
    width: 16,
    thickness: 4,
    angle: 35,
    overshoot: 2,
    overshootJitter: 1,
    angleJitter: 0,
  }),
  ink: Object.freeze({
    flow: 0.5,
    viscosity: 0.5,
    feathering: 0.3,
    streakiness: 0.35,
    dryout: 0.15,
    startEndBuildup: 0.25,
    flowFade: 0.5,
  }),
  // Speed-aware deposit is Beta and off by default; thresholds are px/ms.
  speed: Object.freeze({
    enabled: false,
    sensitivity: 1,
    slowSpeed: 2.5,
    fastSpeed: 10.5,
    minDeposit: 0.4,
    smoothing: 1,
    resolution: 24,
    dryoutBoost: 1,
    streakBoost: 0.08,
    featherReduce: 1,
    poolBoost: 1,
  }),
  edge: Object.freeze({
    waviness: 1.5,
    frequency: 22, // px segmentLength of the wave grid
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
  snap: "line",
  fadeOnClear: true,
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
