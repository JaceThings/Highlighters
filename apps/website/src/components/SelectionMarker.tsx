import { useEffect } from "react";
import { type HighlightOptions, highlightSelection } from "@highlighters/core";

/**
 * Document-global DEFAULT text-selection style for the site.
 *
 * On mount it wires the user's live selection into @highlighters core via
 * {@link highlightSelection}, so any selectable text — anywhere on any route —
 * gets painted with the brown {@link BROWN_SELECTION_OPTIONS} marker instead of
 * the native blue band. Renders `null` and paints nothing until a selection
 * exists.
 *
 * The companion `selection-marker-ready` class on `<html>` gates the
 * native-selection suppression in global.css (`::selection { background:
 * transparent }`) on JS having loaded — if this never mounts, the browser's
 * own blue selection still works as a fallback.
 *
 * SEPARATION FROM THE EXHIBITS. The demonstration boxes (Preview.tsx and the
 * Home hero) are `select-none`, so the browser never creates a selection range
 * inside them — this document-wide marker never touches their prose, and their
 * pre-highlighted, live-updating marks are left entirely alone.
 */

// ── Lisse brown selection, mapped onto @highlighters ──────────────────────
export const BROWN_SELECTION_OPTIONS: HighlightOptions = {
  markType: "highlight",

  // Lisse `--primary-rgb` = rgb(115, 87, 74)
  color: "#73574a",

  // Intensity 0.6 × gradient alphas (~0.46–0.72) lands in the mid-0.5s.
  // multiply keeps the brown translucent so text reads through the band.
  opacity: 0.58,
  blendMode: "multiply",

  // Pigment-leaning master axis: muted, translucent, clean multiply —
  // matches the desaturated "float a brown band over text" look and sets
  // sane low-variance defaults for the texture knobs below.
  colorant: "pigment",

  // CHISEL tip. Lisse slant is 2–5 px of top-edge shear over a ~24 px band
  // (atan(3.5/24) ≈ 8°). width/thickness describe a broad nib held slanted.
  tip: {
    type: "chisel",
    width: 24,
    thickness: 16,
    angle: 8,
  },

  // edgeWave { segmentLength: 30, amplitude: 1.0 } maps 1:1 — same
  // anchored-grid semantics (waviness = px amplitude, frequency = px
  // segmentLength). tipRadius: 3 → radius: 3. roughness adds the
  // pressure-patch micro-jitter from the second feTurbulence layer.
  edge: {
    waviness: 1,
    frequency: 30,
    roughness: 0.12,
    cap: "round",
    radius: 3,
  },

  // Endpoint pooling: Lisse darkens both ends (alpha 0.72 vs ~0.47 mid,
  // ~1.5×) → a positive (but modest) startEndBuildup. streakiness recreates
  // the horizontal striation feTurbulence; a touch of dryout adds the
  // patchy pressure variation.
  ink: {
    streakiness: 0.35,
    dryout: 0.08,
    startEndBuildup: 0.25,
  },

  // Non-fluorescent brown — no additive emission.
  glow: { enabled: false },

  // Hug the selection like the Lisse per-line coverage extension hugs
  // character width.
  snap: "word",

  // Premium tier matches the low-variance, controlled pooling of the
  // hand-tuned original.
  quality: "premium",
};

const READY_CLASS = "selection-marker-ready";

export function SelectionMarker(): null {
  useEffect(() => {
    const handle = highlightSelection(BROWN_SELECTION_OPTIONS);
    document.documentElement.classList.add(READY_CLASS);
    return () => {
      handle.remove();
      document.documentElement.classList.remove(READY_CLASS);
    };
  }, []);

  return null;
}
