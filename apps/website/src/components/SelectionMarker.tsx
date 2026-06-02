import { useEffect, useRef } from "react";
import { type MarkHandle, highlightSelection } from "@highlighters/core";
import {
  BASE_SELECTION_OPTIONS,
  DEFAULT_INK,
  penToTip,
  useSelectionStyle,
} from "../selection-style.tsx";

/**
 * Document-global live text-selection marker. Wires the user's selection into
 * @highlighters core so any selectable text is painted with the marker instead of
 * the native blue band; the dock drives colour/pen/opacity/mark via update(). The
 * `selection-marker-ready` class gates the native-selection suppression in
 * global.css, so the blue band survives if JS never loads. Exhibits (Preview.tsx)
 * are select-none, so this never touches them. The house style lives in
 * selection-style.tsx (shared with the popover previews).
 */

const READY_CLASS = "selection-marker-ready";

export function SelectionMarker(): null {
  const { style } = useSelectionStyle();
  const handleRef = useRef<MarkHandle | null>(null);

  // Wire the live selection once; defaults match the dock so the first paint agrees.
  useEffect(() => {
    const handle = highlightSelection({
      ...BASE_SELECTION_OPTIONS,
      color: DEFAULT_INK,
      ...penToTip("slant"),
    });
    handleRef.current = handle;
    document.documentElement.classList.add(READY_CLASS);
    return () => {
      handle.remove();
      handleRef.current = null;
      document.documentElement.classList.remove(READY_CLASS);
    };
  }, []);

  // Repaint the live selection when colour/pen/opacity/mark type changes.
  useEffect(() => {
    handleRef.current?.update({
      color: style.color,
      opacity: style.opacity,
      markType: style.markType,
      ...penToTip(style.pen),
    });
  }, [style.color, style.pen, style.opacity, style.markType]);

  return null;
}
