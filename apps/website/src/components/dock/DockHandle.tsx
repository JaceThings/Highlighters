import { m } from "framer-motion";
import type { CSSProperties, PointerEvent } from "react";
import type { DockPhase, DockSide } from "./useDockDrag.ts";

// Grab handle: a small nub at the tray's top-centre in the bottom layout, on the inner-edge centre when
// side-docked. Grabbable at rest and while lifting the intact pill; fades out once collapsed.
export function DockHandle({
  phase,
  side,
  visible,
  onPointerDown,
}: {
  phase: DockPhase;
  side: DockSide | null;
  visible: boolean;
  onPointerDown: (e: PointerEvent) => void;
}) {
  const sideDocked = side !== null;
  const position: CSSProperties = sideDocked
    ? {
        position: "absolute",
        top: "50%",
        transform: "translateY(-50%)",
        width: 16,
        height: 64,
        ...(side === "left" ? { right: 2 } : { left: 2 }),
      }
    : { position: "absolute", top: 2, left: "50%", transform: "translateX(-50%)", width: 64, height: 16 };
  const pill: CSSProperties = sideDocked
    ? { width: 5.943, height: 42.787 }
    : { width: 42.787, height: 5.943 };

  return (
    <m.div
      aria-hidden
      onPointerDown={onPointerDown}
      className="flex items-center justify-center"
      style={{
        ...position,
        cursor: phase === "dragging" ? "grabbing" : "grab",
        touchAction: "none",
        pointerEvents: visible ? "auto" : "none",
      }}
      initial={false}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <span className="rounded-full bg-[#efeeed]" style={pill} />
    </m.div>
  );
}
