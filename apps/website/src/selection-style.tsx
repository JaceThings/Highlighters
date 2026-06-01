import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { HighlightOptions } from "@highlighters/core";

// The dock's three pens, by nib geometry. Shared between the dock (which sets the
// active pen) and SelectionMarker (which maps it onto highlighter tip options).
export type PenTip = "slant" | "round" | "flat";

// The live, user-chosen selection style the dock controls.
export interface SelectionStyle {
  /** Ink colour (hex), straight from the palette swatch. */
  color: string;
  /** The selected pen / nib. */
  pen: PenTip;
}

// Default ink matches the dock's default-selected swatch (ColorPalette "brown"),
// so the dock and the painted selection agree from the very first frame.
export const DEFAULT_INK = "#6f584c";

interface SelectionStyleContextValue {
  style: SelectionStyle;
  setColor: (color: string) => void;
  setPen: (pen: PenTip) => void;
}

const SelectionStyleContext = createContext<SelectionStyleContextValue | null>(
  null,
);

/**
 * Holds the ink colour and pen the dock exposes, so the dock drives the
 * document-wide live selection marker (SelectionMarker) in real time. Wraps the
 * app shell in RootLayout, above both the dock and the marker.
 */
export function SelectionStyleProvider({ children }: { children: ReactNode }) {
  const [color, setColor] = useState(DEFAULT_INK);
  const [pen, setPen] = useState<PenTip>("slant");
  const value = useMemo<SelectionStyleContextValue>(
    () => ({ style: { color, pen }, setColor, setPen }),
    [color, pen],
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

// End overshoot for the live selection: every line end runs PAST the text (never
// short of it) by a random 7-10px — overshoot 8.5 ± jitter 1.5, the two ends
// seeded independently so left and right overrun by different amounts.
const END_SWING = { overshoot: 8.5, overshootJitter: 1.5 } as const;

// The broad nib every pen shares: 24×16 dimensions plus the end overshoot.
const NIB = { width: 24, thickness: 16, ...END_SWING } as const;

/**
 * Map a dock pen to its highlighter nib (the R12 chisel model). All three share
 * the broad {@link NIB}, differing in shape and slant:
 *  - slant — a chisel held at an angle, with a per-line angleJitter so it leans a
 *    touch differently on every line;
 *  - round — a rounded bullet nib;
 *  - flat  — a chisel held square-on (broad, no slant).
 */
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
