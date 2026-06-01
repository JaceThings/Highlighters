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

/**
 * Map a dock pen to its highlighter nib (the R12 chisel model). All three share
 * the broad 24×16 nib and differ in shape and slant:
 *  - slant — a chisel held at an angle (the default slanted broad stroke);
 *  - round — a rounded bullet nib;
 *  - flat  — a chisel held square-on (broad, no slant).
 */
export function penToTip(pen: PenTip): Pick<HighlightOptions, "tip"> {
  switch (pen) {
    case "round":
      return { tip: { type: "bullet", width: 24, thickness: 16, angle: 0 } };
    case "flat":
      return { tip: { type: "chisel", width: 24, thickness: 16, angle: 0 } };
    case "slant":
    default:
      return { tip: { type: "chisel", width: 24, thickness: 16, angle: 8 } };
  }
}
