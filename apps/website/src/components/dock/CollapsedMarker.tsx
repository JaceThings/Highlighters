import { useCallback, useRef } from "react";
import type { MotionValue } from "framer-motion";
import { Pen } from "./PenSvg.tsx";
import { SVG_W, FRAME_H, REST_TOP, SELECTED_RISE, OpacityReadout } from "./Marker.tsx";
import { useBindMotion, useOpacityBind } from "./bindMotion.ts";
import type { PenTip } from "../../selection-style.tsx";

const CENTER_SHIFT = FRAME_H / 2 - (REST_TOP - SELECTED_RISE + FRAME_H) / 2;
const CIRCLE_DROP = 7;
const CIRCLE_SHIFT = CENTER_SHIFT + CIRCLE_DROP;
const clamp = (v: number, max: number) => (v > max ? max : v < -max ? -max : v);
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
  color: string;
  pct: number;
  rotation: MotionValue<number>;
  offsetX: MotionValue<number>;
  offsetY: MotionValue<number>;
  reveal: MotionValue<number>;
  opacity: MotionValue<number>;
  shapeWidth: MotionValue<number>;
  shapeHeight: MotionValue<number>;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const moveRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);

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
  const applyReveal = useCallback(
    (el: HTMLElement | SVGElement) => {
      el.style.transform = `translateY(${CIRCLE_SHIFT * reveal.get()}px)`;
    },
    [reveal],
  );
  useOpacityBind(outerRef, opacity);
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
          <div style={{ position: "relative", width: SVG_W, height: FRAME_H }}>
            <Pen
              tip={pen}
              color={color}
              width={SVG_W}
              style={{ position: "absolute", left: 0, top: REST_TOP, transform: `translateY(-${SELECTED_RISE}px)` }}
            />
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
