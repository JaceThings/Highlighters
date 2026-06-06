import { useEffect, useRef } from "react";
import { type MarkHandle, highlightSelection } from "@highlighters/core";
import {
  BASE_SELECTION_OPTIONS,
  DEFAULT_INK,
  penToTip,
  useSelectionStyle,
} from "../selection-style.tsx";
import { useAnimatedColor } from "../hooks/useAnimatedColor.ts";

// Document-global live selection marker: paints selectable text instead of the native blue band;
// the dock drives colour/pen/opacity/mark via update(). READY_CLASS gates the native-selection
// suppression in global.css, so the blue band survives if JS never loads.
const READY_CLASS = "selection-marker-ready";

// Glide the ink in OKLCH (useAnimatedColor) so a swatch swap morphs the selection in place; the renderer recolours each frame, no geometry reseed.
const COLOR_TWEEN = { duration: 0.35, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] };

export function SelectionMarker(): null {
  const { style } = useSelectionStyle();
  const handleRef = useRef<MarkHandle | null>(null);
  const color = useAnimatedColor(style.color, COLOR_TWEEN);

  // Defaults match the dock so the first paint agrees.
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

  useEffect(() => {
    handleRef.current?.update({
      color,
      opacity: style.opacity,
      markType: style.markType,
      ...penToTip(style.pen),
    });
  }, [color, style.pen, style.opacity, style.markType]);

  return null;
}
