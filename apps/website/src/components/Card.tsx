import { SmoothCorners } from "@lisse/react";
import type { ShadowConfig } from "@lisse/core";
import type { ReactNode } from "react";

// Figma's 5-layer card shadow as Lisse ShadowConfigs, so the lift traces the
// squircle (a CSS box-shadow would be clipped by the clip-path).
const CARD_SHADOW: ShadowConfig[] = [
  { offsetX: 0, offsetY: 0, blur: 0, spread: 1, color: "#777777", opacity: 0.19 },
  { offsetX: 0, offsetY: 0, blur: 0, spread: 0.5, color: "#73574A", opacity: 0.08 },
  { offsetX: 0, offsetY: 1, blur: 1, spread: 0, color: "#73574A", opacity: 0.1 },
  { offsetX: 0, offsetY: 2, blur: 1, spread: -1, color: "#73574A", opacity: 0.05 },
  { offsetX: 0, offsetY: 1, blur: 3, spread: 0, color: "#73574A", opacity: 0.08 },
];

// asChild so the radius + shadow apply to the child, not an extra wrapper.
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
