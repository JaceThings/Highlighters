import { useCallback, useRef } from "react";
import type { MotionValue } from "framer-motion";
import { Pen } from "./PenSvg.tsx";
import { SVG_W, FRAME_H, REST_TOP, SELECTED_RISE, OpacityReadout } from "./Marker.tsx";
import { useBindMotion, useOpacityBind } from "./bindMotion.ts";
import type { PenTip } from "../../selection-style.tsx";

// The carried pen is the *exact* dock pen art (full SVG at REST_TOP, raised by SELECTED_RISE) with NO
// clip of its own - the dock's morphing shape clip (clipRef in Dock) masks it. So at a dock slot it's
// cut at the flat floor (identical to the row's selected pen -> seamless hand-off), and in the circle
// it's masked by the circle's curve (the pen clipped to the round shape, not a flat cut). It is never
// shrunk. `reveal` (0 slot, 1 circle) just nudges it up so the masked pen sits centred in the circle.
const CENTER_SHIFT = FRAME_H / 2 - (REST_TOP - SELECTED_RISE + FRAME_H) / 2;
// ...then drop it a few px below dead-centre, which reads better (nib has more headroom) in the circle.
const CIRCLE_DROP = 7;
const CIRCLE_SHIFT = CENTER_SHIFT + CIRCLE_DROP;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, max: number) => (v > max ? max : v < -max ? -max : v);
// Keep the carried pen's frame centre this far inside the shape's edge, so its visible body never
// clips down to nothing while it's pinned to a shrinking edge. The marker frame is screen-aligned
// (offsets translate after the rotate), so clamping the bounding box per-axis is exact at the centre
// line where the side pen actually lives (and conservative for the rotated, narrower side pen).
const CLAMP_INSET = 28;

export function CollapsedMarker({
  pen,
  color,
  pct,
  rotation,
  offsetX,
  offsetY,
  reveal,
  opacity,
  shapeWidth,
  shapeHeight,
}: {
  pen: PenTip;
  /** oklch() ink string, as PenSvg expects. */
  color: string;
  /** Selected pen's opacity percentage, so the readout travels with the carried pen. */
  pct: number;
  rotation: MotionValue<number>;
  offsetX: MotionValue<number>;
  offsetY: MotionValue<number>;
  /** 0 = sits at the dock slot; 1 = same clipped pen, nudged to sit centred in the circle. */
  reveal: MotionValue<number>;
  opacity: MotionValue<number>;
  /** Live shape box (= clip box): the offset is clamped within it so the pen never leaves the shape. */
  shapeWidth: MotionValue<number>;
  shapeHeight: MotionValue<number>;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const moveRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);

  // translate carries the frame from its slot to centre; rotate (about the frame centre) swings it to
  // the docked angle. One transform = rotate then translate in screen space, so they compose here.
  //
  // The marker shares the dock's clip box (clipRef). Offset and shape collapse in LOCKSTEP (same spring),
  // so the pen stays well inside the shrinking shape on its own. The clamp is a safety net: it pins the
  // frame centre within the live half-extents (minus an inset) should the offset ever lag the shape, so
  // the pen can never be left clipped to an empty disc. It normally doesn't bind.
  const applyMove = useCallback(
    (el: HTMLElement | SVGElement) => {
      const maxX = Math.max(0, shapeWidth.get() / 2 - CLAMP_INSET);
      const maxY = Math.max(0, shapeHeight.get() / 2 - CLAMP_INSET);
      const ox = clamp(offsetX.get(), maxX);
      const oy = clamp(offsetY.get(), maxY);
      el.style.transform = `translate(${ox}px, ${oy}px) rotate(${rotation.get()}deg)`;
    },
    [offsetX, offsetY, rotation, shapeWidth, shapeHeight],
  );
  // Nudge the clipped unit up to sit (a touch below) centred in the circle (no shrink, no un-clip).
  const applyReveal = useCallback(
    (el: HTMLElement | SVGElement) => {
      el.style.transform = `translateY(${lerp(0, CIRCLE_SHIFT, reveal.get())}px)`;
    },
    [reveal],
  );
  useOpacityBind(outerRef, opacity);
  // width/height are subscribed too: the clamp must re-evaluate every frame the shape shrinks, not
  // only when the offset itself changes, so the marker stays pinned to the moving edge.
  useBindMotion(moveRef, [offsetX, offsetY, rotation, shapeWidth, shapeHeight], applyMove);
  useBindMotion(revealRef, [reveal], applyReveal);

  return (
    <div
      ref={outerRef}
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: 0,
        pointerEvents: "none",
      }}
    >
      <div ref={moveRef} style={{ transformOrigin: "center" }}>
        <div ref={revealRef}>
          {/* The full pen SVG, no own clip: the dock's morphing shape (clipRef) masks it - flat at a
              dock slot, the round circle in collapse - so the circle rounds the barrel, not a flat cut. */}
          <div style={{ position: "relative", width: SVG_W, height: FRAME_H }}>
            <Pen
              tip={pen}
              color={color}
              width={SVG_W}
              style={{ position: "absolute", left: 0, top: REST_TOP, transform: `translateY(-${SELECTED_RISE}px)` }}
            />
            {/* The opacity readout, positioned exactly as in the row so it travels with the pen. */}
            <span
              aria-hidden
              className="pointer-events-none absolute"
              style={{ left: 0, top: REST_TOP, width: SVG_W, transform: `translateY(-${SELECTED_RISE}px)` }}
            >
              <OpacityReadout pct={pct} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
