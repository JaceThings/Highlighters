import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { HighlightOptions, MarkType } from "@highlighters/core";

// The dock's three pens, by nib geometry; shared with SelectionMarker.
export type PenTip = "slant" | "round" | "flat";

// The live, user-chosen selection style the dock controls.
export interface SelectionStyle {
  /** Ink colour (hex), straight from the palette swatch. */
  color: string;
  /** The selected pen / nib. */
  pen: PenTip;
  /** The active pen's ink opacity (0–1) — i.e. `opacityByPen[pen]`. */
  opacity: number;
  /** Per-pen ink opacity: each marker keeps its own, set from the popover slider. */
  opacityByPen: Record<PenTip, number>;
  /** Mark kind — highlight band, under/overline, or strike-through. */
  markType: MarkType;
}

// Matches the dock's default swatch, so dock and paint agree from frame one.
export const DEFAULT_INK = "#6f584c";
// Mirror BASE_SELECTION_OPTIONS in SelectionMarker.
export const DEFAULT_OPACITY = 0.58;
export const DEFAULT_MARK_TYPE: MarkType = "highlight";
// Every marker starts at the same opacity but keeps its own from then on.
const DEFAULT_OPACITY_BY_PEN: Record<PenTip, number> = {
  slant: DEFAULT_OPACITY,
  round: DEFAULT_OPACITY,
  flat: DEFAULT_OPACITY,
};

interface SelectionStyleContextValue {
  style: SelectionStyle;
  setColor: (color: string) => void;
  setPen: (pen: PenTip) => void;
  setOpacity: (opacity: number) => void;
  setMarkType: (markType: MarkType) => void;
}

const SelectionStyleContext = createContext<SelectionStyleContextValue | null>(
  null,
);

/** Holds the dock's selection style so it drives the live SelectionMarker. Wraps
 *  the app shell in RootLayout, above both the dock and the marker. */
export function SelectionStyleProvider({ children }: { children: ReactNode }) {
  const [color, setColor] = useState(DEFAULT_INK);
  const [pen, setPen] = useState<PenTip>("slant");
  const [opacityByPen, setOpacityByPen] =
    useState<Record<PenTip, number>>(DEFAULT_OPACITY_BY_PEN);
  const [markType, setMarkType] = useState<MarkType>(DEFAULT_MARK_TYPE);
  // The slider edits the active pen's opacity, leaving the others untouched.
  const setOpacity = useCallback(
    (next: number) => setOpacityByPen((m) => ({ ...m, [pen]: next })),
    [pen],
  );
  const value = useMemo<SelectionStyleContextValue>(
    () => ({
      style: { color, pen, opacity: opacityByPen[pen], opacityByPen, markType },
      setColor,
      setPen,
      setOpacity,
      setMarkType,
    }),
    [color, pen, opacityByPen, markType, setOpacity],
  );
  return (
    <SelectionStyleContext.Provider value={value}>
      {children}
    </SelectionStyleContext.Provider>
  );
}

export function useSelectionStyle(): SelectionStyleContextValue {
  const ctx = useContext(SelectionStyleContext);
  if (!ctx) {
    throw new Error(
      "useSelectionStyle must be used within a SelectionStyleProvider",
    );
  }
  return ctx;
}

// Every line end overshoots the text by 7–10px (8.5 ± 1.5), ends seeded separately.
const END_SWING = { overshoot: 8.5, overshootJitter: 1.5 } as const;

// The broad nib every pen shares.
const NIB = { width: 24, thickness: 16, ...END_SWING } as const;

// Map a dock pen to its nib: slant = angled chisel (with per-line jitter), round =
// bullet, flat = square chisel.
export function penToTip(pen: PenTip): Pick<HighlightOptions, "tip"> {
  switch (pen) {
    case "round":
      return { tip: { type: "bullet", angle: 0, ...NIB } };
    case "flat":
      return { tip: { type: "chisel", angle: 0, ...NIB } };
    case "slant":
    default:
      return { tip: { type: "chisel", angle: 8, angleJitter: 5, ...NIB } };
  }
}

// The colour/nib-independent house style — translucent multiply, pigment axis, wavy
// edge, light streak/pool texture. Shared by the live SelectionMarker and the
// popover's mark-type previews so the previews paint exactly what gets used. The
// dock layers colour, tip, opacity, and markType on top.
export const BASE_SELECTION_OPTIONS: HighlightOptions = {
  markType: "highlight",
  opacity: DEFAULT_OPACITY,
  blendMode: "multiply",
  colorant: "pigment",
  edge: { waviness: 1, frequency: 30, roughness: 0.12, cap: "round", radius: 3 },
  ink: { streakiness: 0.35, dryout: 0.08, startEndBuildup: 0.25 },
  glow: { enabled: false },
  snap: "glyph",
  quality: "premium",
};
