import { useEffect, useId, useLayoutEffect, useMemo, useRef } from "react";
import { useMotionValueEvent, type MotionValue } from "framer-motion";
import { makeZigzag, pointsUpTo, pointsBetween, smoothStrokePath } from "./scribble-render.ts";
import { IS_WEBKIT } from "./is-webkit.ts";
import { BROWSER } from "../../lib/browser-env.ts";

const useIso = BROWSER.hasWindow ? useLayoutEffect : useEffect;

const VIEW_W = 472;
const VIEW_H = 10;
const TRACK_BG = "rgba(126,117,108,0.12)";
const INK = "#7e756c";
const PEN_BLUE = "#91b4ff";
const STROKE_W = 2.3;
const BG_WAVE = 1.3;

const ZIG = { width: VIEW_W, height: VIEW_H, meanStep: 2.4, toothHeight: 8, jitterX: 1.2, jitterY: 0.55 };

export function ScribbleFill({
  seed,
  reported,
  min,
  max,
  floor,
}: {
  seed: number;
  reported: MotionValue<number>;
  min: number;
  max: number;
  floor?: number;
}) {
  const pathRef = useRef<SVGPathElement>(null);
  const floorRef = useRef<SVGPathElement>(null);
  const waveId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const pts = useMemo(() => makeZigzag({ ...ZIG, seed }), [seed]);
  const floorPts = useMemo(() => makeZigzag({ ...ZIG, seed: seed + 9973 }), [seed]);
  const span = max - min === 0 ? 1 : max - min;
  const floorFrac = floor != null ? Math.max(0, Math.min(1, (floor - min) / span)) : 0;

  const draw = (v: number) => {
    const el = pathRef.current;
    if (!el) return;
    const f = Math.max(0, Math.min(1, (v - min) / span));
    const seg = floor != null ? pointsBetween(pts, floorFrac, f) : pointsUpTo(pts, f);
    el.setAttribute("d", smoothStrokePath(seg));
  };
  useIso(() => {
    draw(reported.get());
    if (floor != null && floorRef.current) {
      floorRef.current.setAttribute("d", smoothStrokePath(pointsUpTo(floorPts, floorFrac)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, floorPts, floorFrac]);
  useMotionValueEvent(reported, "change", draw);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      aria-hidden
      className="absolute inset-0 h-full w-full"
      style={{ overflow: "visible" }}
    >
      {!IS_WEBKIT && (
        <defs>
          <filter id={waveId} x="-2%" y="-50%" width="104%" height="200%">
            <feTurbulence type="fractalNoise" baseFrequency="0.04 0.12" numOctaves="2" seed="11" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={BG_WAVE} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      )}
      <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill={TRACK_BG} filter={IS_WEBKIT ? undefined : `url(#${waveId})`} />
      <path ref={pathRef} fill="none" stroke={INK} strokeWidth={STROKE_W} strokeLinecap="round" strokeLinejoin="round" />
      {floor != null ? (
        <path ref={floorRef} fill="none" stroke={PEN_BLUE} strokeWidth={STROKE_W} strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
    </svg>
  );
}
