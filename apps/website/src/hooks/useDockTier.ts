import { useEffect, useState } from "react";
import {
  DOCK_COLORS_MIN,
  DOCK_PENS_MIN,
  DOCK_SIDE_COLORS_MIN,
  DOCK_SIDE_PENS_MIN,
} from "../components/dock/constants.ts";
import type { DockPhase, DockSide, DockTarget } from "../components/dock/useDockDrag.ts";

export interface DockTier {
  showColors: boolean;
  showPens: boolean;
}

type TierAxis = "width" | "height";

const TIER_CONFIG: Record<TierAxis, { colors: number; pens: number }> = {
  width: { colors: DOCK_COLORS_MIN, pens: DOCK_PENS_MIN },
  height: { colors: DOCK_SIDE_COLORS_MIN, pens: DOCK_SIDE_PENS_MIN },
};

function read(axis: TierAxis): DockTier {
  const { colors, pens } = TIER_CONFIG[axis];
  const dim = axis === "width" ? "width" : "height";
  return {
    showColors: window.matchMedia(`(min-${dim}: ${colors}px)`).matches,
    showPens: window.matchMedia(`(min-${dim}: ${pens}px)`).matches,
  };
}

/** Which viewport axis gates content for the dock's current rest/drag/preview state. */
export function dockContentAxis(
  phase: DockPhase,
  side: DockSide | null,
  preview: DockTarget | null,
  collapsed: boolean,
): TierAxis {
  if (preview === "bottom") return "width";
  if (preview === "left" || preview === "right") return "height";
  if (phase === "bottom") return "width";
  if (phase === "side" || phase === "snapping") return "height";
  // Intact-pill lift: still the side layout until collapse; bottom lift uses width tiers.
  if (phase === "dragging" && !collapsed) return side ? "height" : "width";
  return side ? "height" : "width";
}

/** Which dock sections fit: drop colours, then pens, as the viewport shrinks on `axis`. */
export function useDockTier(axis: TierAxis = "width"): DockTier {
  const [tier, setTier] = useState<DockTier>(() =>
    typeof window === "undefined" ? { showColors: true, showPens: true } : read(axis),
  );

  useEffect(() => {
    const { colors, pens } = TIER_CONFIG[axis];
    const dim = axis === "width" ? "width" : "height";
    const colorsMq = window.matchMedia(`(min-${dim}: ${colors}px)`);
    const pensMq = window.matchMedia(`(min-${dim}: ${pens}px)`);
    const update = () => setTier({ showColors: colorsMq.matches, showPens: pensMq.matches });
    colorsMq.addEventListener("change", update);
    pensMq.addEventListener("change", update);
    update();
    return () => {
      colorsMq.removeEventListener("change", update);
      pensMq.removeEventListener("change", update);
    };
  }, [axis]);

  return tier;
}
