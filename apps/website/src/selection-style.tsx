import {
  createContext,
  useCallback,
  use,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { HighlightOptions, MarkType } from "@highlighters/core";

export type PenTip = "slant" | "round" | "fine";

export interface SelectionStyle {
  color: string;
  pen: PenTip;
  opacity: number;
  opacityByPen: Record<PenTip, number>;
  markType: MarkType;
}

export const DEFAULT_INK = "#6f584c";
export const DEFAULT_OPACITY = 0.58;
export const DEFAULT_MARK_TYPE: MarkType = "highlight";
const DEFAULT_OPACITY_BY_PEN = {
  slant: DEFAULT_OPACITY,
  round: DEFAULT_OPACITY,
  fine: DEFAULT_OPACITY,
} satisfies Record<PenTip, number>;

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

export function SelectionStyleProvider({ children }: { children: ReactNode }) {
  const [color, setColor] = useState(DEFAULT_INK);
  const [pen, setPen] = useState<PenTip>("slant");
  const [opacityByPen, setOpacityByPen] =
    useState<Record<PenTip, number>>(DEFAULT_OPACITY_BY_PEN);
  const [markType, setMarkType] = useState<MarkType>(DEFAULT_MARK_TYPE);
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
  const ctx = use(SelectionStyleContext);
  if (!ctx) {
    throw new Error(
      "useSelectionStyle must be used within a SelectionStyleProvider",
    );
  }
  return ctx;
}

const END_SWING = { overshoot: 8.5, overshootJitter: 1.5 } as const;

const NIB = { width: 24, thickness: 16, ...END_SWING } as const;

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

export const BASE_SELECTION_OPTIONS: HighlightOptions = {
  markType: "highlight",
  opacity: DEFAULT_OPACITY,
  blendMode: "multiply",
  edge: { waviness: 1, frequency: 30, roughness: 0.12, cap: "round", radius: 3 },
  ink: { streakiness: 0.35, dryout: 0.08, startEndBuildup: 0.25, feathering: 0.12 },
  glow: { enabled: false },
  snap: "glyph",
};
