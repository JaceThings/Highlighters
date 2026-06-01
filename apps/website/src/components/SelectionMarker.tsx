import { useEffect, useRef } from "react";
import {
  type HighlightOptions,
  type MarkHandle,
  highlightSelection,
} from "@highlighters/core";
import { DEFAULT_INK, penToTip, SPEED_DEFAULTS, useSelectionStyle } from "../selection-style.tsx";

/**
 * Document-global live text-selection marker for the site.
 *
 * On mount it wires the user's live selection into @highlighters core via
 * {@link highlightSelection}, so any selectable text — anywhere on any route —
 * gets painted with the marker instead of the native blue band. Renders `null`
 * and paints nothing until a selection exists.
 *
 * The ink colour and nib are driven by the dock (see selection-style.tsx):
 * picking a swatch or a pen calls the handle's `update()`, which re-resolves the
 * options and repaints the current selection in place.
 *
 * The companion `selection-marker-ready` class on `<html>` gates the
 * native-selection suppression in global.css (`::selection { background:
 * transparent }`) on JS having loaded — if this never mounts, the browser's
 * own blue selection still works as a fallback.
 *
 * SEPARATION FROM THE EXHIBITS. The demonstration exhibits (Preview.tsx) are
 * `select-none`, so the browser never creates a selection range inside them —
 * this document-wide marker never touches their prose, and their pre-highlighted,
 * live-updating marks are left entirely alone.
 */

// Colour- and nib-independent base. The dock supplies `color` + `tip` on top of
// this (see penToTip / the update effect below).
const BASE_SELECTION_OPTIONS: HighlightOptions = {
  markType: "highlight",

  // Intensity ~0.58 with multiply keeps the ink translucent so the text reads
  // through the band rather than being covered.
  opacity: 0.58,
  blendMode: "multiply",

  // Pigment-leaning master axis: muted, translucent, clean multiply — sets sane
  // low-variance defaults for the texture knobs below.
  colorant: "pigment",

  // edgeWave { segmentLength: 30, amplitude: 1.0 } maps 1:1 — same anchored-grid
  // semantics (waviness = px amplitude, frequency = px segmentLength). radius 3 is
  // the tip corner; roughness adds the pressure-patch micro-jitter.
  edge: {
    waviness: 1,
    frequency: 30,
    roughness: 0.12,
    cap: "round",
    radius: 3,
  },

  // Endpoint pooling: both ends darken (~1.5×) → a modest startEndBuildup.
  // streakiness recreates the horizontal striation; a touch of dryout adds the
  // patchy pressure variation.
  ink: {
    streakiness: 0.35,
    dryout: 0.08,
    startEndBuildup: 0.25,
  },

  // Non-fluorescent ink — no additive emission.
  glow: { enabled: false },

  // Track the selection character by character — trim only leading/trailing
  // whitespace, never expand out to whole-word boundaries — so the band follows
  // the cursor exactly.
  snap: "glyph",

  // Premium tier matches the low-variance, controlled pooling of the original.
  quality: "premium",
};

const READY_CLASS = "selection-marker-ready";

export function SelectionMarker(): null {
  const { style, speed } = useSelectionStyle();
  const handleRef = useRef<MarkHandle | null>(null);

  // Wire the live selection once. The initial colour, nib, and speed config match
  // the defaults, so the first paint already agrees with the controls (the update
  // effect below then keeps them in sync).
  useEffect(() => {
    const handle = highlightSelection({
      ...BASE_SELECTION_OPTIONS,
      color: DEFAULT_INK,
      ...penToTip("slant"),
      speed: SPEED_DEFAULTS,
    });
    handleRef.current = handle;
    document.documentElement.classList.add(READY_CLASS);
    return () => {
      handle.remove();
      handleRef.current = null;
      document.documentElement.classList.remove(READY_CLASS);
    };
  }, []);

  // Re-style the live selection whenever the colour, pen, or speed-dynamics config
  // changes; the handle re-resolves options and repaints in place. Speed dynamics
  // is live-only, so it only shows once the user actually drags a selection.
  useEffect(() => {
    handleRef.current?.update({ color: style.color, ...penToTip(style.pen), speed });
  }, [style.color, style.pen, speed]);

  return null;
}
