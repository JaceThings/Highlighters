import { useCallback, useRef } from "react";
import type { MotionValue } from "framer-motion";
import { roundedRectPath } from "./roundedRectPath.ts";
import { useBindMotion } from "./bindMotion.ts";

const SHADOW = "0 6px 14px -7px color(display-p3 0.451 0.3412 0.2902 / 0.30)";

export function MorphBackground({
  width,
  height,
  cornerRadius,
}: {
  width: MotionValue<number>;
  height: MotionValue<number>;
  cornerRadius: MotionValue<number>;
}) {
  const shadowRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  const applyShadow = useCallback(
    (el: HTMLElement | SVGElement) => {
      el.style.borderRadius = `${cornerRadius.get()}px`;
    },
    [cornerRadius],
  );
  const applyPath = useCallback(
    (el: HTMLElement | SVGElement) => {
      el.setAttribute("d", roundedRectPath(width.get(), height.get(), cornerRadius.get()));
    },
    [width, height, cornerRadius],
  );
  useBindMotion(shadowRef, [cornerRadius], applyShadow);
  useBindMotion(pathRef, [width, height, cornerRadius], applyPath);

  return (
    <>
      <div
        ref={shadowRef}
        aria-hidden
        style={{ position: "absolute", inset: 0, boxShadow: SHADOW, pointerEvents: "none" }}
      />
      <svg
        aria-hidden
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}
      >
        <path ref={pathRef} d="" fill="#fff" />
      </svg>
    </>
  );
}
