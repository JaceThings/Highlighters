import { m } from "framer-motion";
import type { CSSProperties, PointerEvent } from "react";
import { GRABBER_SAFETY_STRIP } from "./constants.ts";
import type { DockPhase, DockSide } from "./useDockDrag.ts";

// Grab handle: a small nub at the tray's top-centre in the bottom layout, on the inner-edge centre when
// side-docked. Grabbable at rest and while lifting the intact pill; fades out once collapsed.
export function DockHandle({
  phase,
  side,
  atTop,
  visible,
  onPointerDown,
}: {
  phase: DockPhase;
  side: DockSide | null;
  /** Top-docked: the inner edge is the bottom, so the nub sits there instead of the top. */
  atTop?: boolean;
  visible: boolean;
  onPointerDown: (e: PointerEvent) => void;
}) {
  const sideDocked = side !== null;
  const pe = visible ? "auto" : "none";
  const innerEdge: CSSProperties | undefined = sideDocked
    ? side === "left"
      ? { right: 0 }
      : { left: 0 }
    : undefined;
  const position: CSSProperties = sideDocked
    ? {
        position: "absolute",
        top: "50%",
        transform: "translateY(-50%)",
        width: 16,
        height: 64,
        ...(side === "left" ? { right: 2 } : { left: 2 }),
      }
    : { position: "absolute", left: "50%", transform: "translateX(-50%)", width: 64, height: 16, ...(atTop ? { bottom: 2 } : { top: 2 }) };
  const pill: CSSProperties = sideDocked
    ? { width: 5.943, height: 42.787 }
    : { width: 42.787, height: 5.943 };

  return (
    <>
      {sideDocked && (
        <div
          aria-hidden
          className="absolute inset-y-0"
          style={{ width: GRABBER_SAFETY_STRIP, zIndex: 1, pointerEvents: pe, ...innerEdge }}
        />
      )}
      <m.div
        aria-hidden
        data-dock-grab
        onPointerDown={onPointerDown}
        className="flex items-center justify-center"
        style={{
          ...position,
          zIndex: 2,
          cursor: phase === "dragging" ? "grabbing" : "grab",
          touchAction: "none",
          pointerEvents: pe,
        }}
        initial={false}
        animate={{ opacity: visible ? 1 : 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        <span className="rounded-full bg-[#efeeed]" style={pill} />
      </m.div>
    </>
  );
}
