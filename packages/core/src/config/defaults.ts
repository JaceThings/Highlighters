/** The fully-resolved baseline at the bottom of the merge chain. Deep-frozen so it can be shared as the merge floor without mutation. */

import type { ResolvedOptions } from "../types.js";
import { defaultSwatch } from "./palettes.js";

export const DEFAULT_OPTIONS: ResolvedOptions = Object.freeze({
  markType: "highlight",
  color: defaultSwatch("mild"),
  gradient: null,
  opacity: 0.55,
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
    flow: 0.45,
    viscosity: 0.5,
    feathering: 0.2,
    streakiness: 0.25,
    dryout: 0.1,
    startEndBuildup: 0.1,
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
    waviness: 1,
    frequency: 22, // px segment length of the wave grid
    roughness: 0.2,
    cap: "round",
    radius: 5,
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
  snap: "word",
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
