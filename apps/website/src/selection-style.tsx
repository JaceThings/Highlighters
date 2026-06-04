import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { HighlightOptions, MarkType } from "@highlighters/core";

// The dock's three pens, one per core nib type; shared with SelectionMarker.
export type PenTip = "slant" | "round" | "fine";

// The live, user-chosen selection style the dock controls.
export interface SelectionStyle {
  color: string;
  pen: PenTip;
  /** The active pen's opacity (`opacityByPen[pen]`). */
  opacity: number;
  /** Per-pen ink opacity: each marker keeps its own. */
  opacityByPen: Record<PenTip, number>;
  markType: MarkType;
}

// Matches the dock's default swatch, so dock and paint agree from frame one.
export const DEFAULT_INK = "#6f584c";
export const DEFAULT_OPACITY = 0.58; // keep in sync with BASE_SELECTION_OPTIONS
export const DEFAULT_MARK_TYPE: MarkType = "highlight";
const DEFAULT_OPACITY_BY_PEN: Record<PenTip, number> = {
  slant: DEFAULT_OPACITY,
  round: DEFAULT_OPACITY,
  fine: DEFAULT_OPACITY,
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

/** Holds the dock's selection style so it drives the live SelectionMarker. */
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

// Map a dock pen to its nib, one per core tip type: slant = angled chisel (with per-line
// jitter), round = bullet, fine = fine point.
export function penToTip(pen: PenTip): Pick<HighlightOptions, "tip"> {
  switch (pen) {
    case "round":
      return { tip: { type: "bullet", angle: 0, ...NIB } };
    case "fine":
      return { tip: { type: "fine", angle: 0, ...NIB } };
    case "slant":
    default:
      return { tip: { type: "chisel", angle: 8, angleJitter: 5, ...NIB } };
  }
}

// The colour/nib-independent house style. Shared by the live SelectionMarker and
// the popover previews so previews paint exactly what gets used; the dock layers
// colour, tip, opacity, and markType on top.
export const BASE_SELECTION_OPTIONS: HighlightOptions = {
  markType: "highlight",
  opacity: DEFAULT_OPACITY,
  blendMode: "multiply",
  edge: { waviness: 1, frequency: 30, roughness: 0.12, cap: "round", radius: 3 },
  // feathering 0.12 keeps the low-variance look the (removed) premium quality bundle gave.
  ink: { streakiness: 0.35, dryout: 0.08, startEndBuildup: 0.25, feathering: 0.12 },
  glow: { enabled: false },
  snap: "glyph",
};
