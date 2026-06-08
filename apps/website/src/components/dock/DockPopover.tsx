import { AnimatePresence, m } from "framer-motion";
import type { MarkType } from "@highlighters/core";
import { ColorPickerPopover } from "./ColorPickerPopover.tsx";
import { MarkerPopover } from "./MarkerPopover.tsx";
import type { Popover } from "./useDockPopover.ts";
import type { DockSide } from "./useDockDrag.ts";
import type { SelectionStyle } from "../../selection-style.tsx";

// The marker / colour popover that rises from the activating button. Positioning + enter/exit flip
// with orientation: above the tray in the bottom layout, off the inner edge when side-docked.
export function DockPopover({
  popover,
  vertical,
  side,
  style,
  onCustomColor,
  onOpacity,
  onMarkType,
}: {
  popover: Popover | null;
  vertical: boolean;
  side: DockSide | null;
  style: SelectionStyle;
  onCustomColor: (hex: string) => void;
  onOpacity: (opacity: number) => void;
  onMarkType: (markType: MarkType) => void;
}) {
  return (
    <AnimatePresence>
      {popover && (
        <m.div
          key={popover.kind === "color" ? "color-popover" : "marker-popover"}
          className="absolute"
          style={
            vertical
              ? {
                  top: popover.y,
                  transformOrigin: side === "left" ? "left center" : "right center",
                  ...(side === "left" ? { left: "calc(100% + 14px)" } : { right: "calc(100% + 14px)" }),
                }
              : { left: popover.x, bottom: "calc(100% + 14px)", transformOrigin: "bottom center" }
          }
          initial={
            vertical
              ? { opacity: 0, scale: 0.96, x: side === "left" ? -6 : 6, y: "-50%" }
              : { opacity: 0, scale: 0.96, y: 6, x: "-50%" }
          }
          animate={
            vertical
              ? { opacity: 1, scale: 1, x: 0, y: "-50%" }
              : { opacity: 1, scale: 1, y: 0, x: "-50%" }
          }
          exit={
            vertical
              ? { opacity: 0, scale: 0.97, x: side === "left" ? -4 : 4, y: "-50%" }
              : { opacity: 0, scale: 0.97, y: 4, x: "-50%" }
          }
          transition={{ type: "spring", duration: 0.3, bounce: 0 }}
        >
          {popover.kind === "color" ? (
            <ColorPickerPopover color={style.color} onChange={onCustomColor} />
          ) : (
            <MarkerPopover
              inkColor={style.color}
              pen={style.pen}
              opacity={style.opacity}
              markType={style.markType}
              onOpacity={onOpacity}
              onMarkType={onMarkType}
            />
          )}
        </m.div>
      )}
    </AnimatePresence>
  );
}
