import { SmoothCorners } from "@lisse/react";
import type { ShadowConfig } from "@lisse/core";
import type { ReactNode } from "react";

/**
 * Figma's 5-layer card shadow as Lisse `ShadowConfig` objects. Passed
 * via `<SmoothCorners shadow={…}>` so the lift renders as SVG drop-
 * shadows that follow the squircle silhouette — CSS box-shadow would be
 * clipped by the clip-path SmoothCorners applies to the element.
 * Source: Figma file f6JlgIPQFMFIJSpiJbviOG.
 */
const CARD_SHADOW: ShadowConfig[] = [
  { offsetX: 0, offsetY: 0, blur: 0, spread: 1, color: "#777777", opacity: 0.19 },
  { offsetX: 0, offsetY: 0, blur: 0, spread: 0.5, color: "#73574A", opacity: 0.08 },
  { offsetX: 0, offsetY: 1, blur: 1, spread: 0, color: "#73574A", opacity: 0.1 },
  { offsetX: 0, offsetY: 2, blur: 1, spread: -1, color: "#73574A", opacity: 0.05 },
  { offsetX: 0, offsetY: 1, blur: 3, spread: 0, color: "#73574A", opacity: 0.08 },
];

// Wraps via `asChild` so radius, smoothing, and the 5-layer shadow apply
// to the real button/div rather than an extra layer of DOM.
export function Card({ children }: { children: ReactNode }) {
  return (
    <SmoothCorners
      asChild
      autoEffects={false}
      corners={{ radius: 8, smoothing: 0.6 }}
      shadow={CARD_SHADOW}
    >
      {children}
    </SmoothCorners>
  );
}
