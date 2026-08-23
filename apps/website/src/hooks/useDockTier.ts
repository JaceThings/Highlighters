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
  return {
    showColors: window.matchMedia(`(min-${axis}: ${colors}px)`).matches,
    showPens: window.matchMedia(`(min-${axis}: ${pens}px)`).matches,
  };
}

export function dockContentAxis(
  phase: DockPhase,
  side: DockSide | null,
  preview: DockTarget | null,
  collapsed: boolean,
): TierAxis {
  if (preview === "bottom" || preview === "top") return "width";
  if (preview === "left" || preview === "right") return "height";
  if (phase === "bottom" || phase === "top") return "width";
  if (phase === "side" || phase === "snapping") return "height";
  if (phase === "dragging" && !collapsed) return side ? "height" : "width";
  return side ? "height" : "width";
}

export function useDockTier(axis: TierAxis = "width"): DockTier {
  const [tier, setTier] = useState<DockTier>(() =>
    typeof window === "undefined" ? { showColors: true, showPens: true } : read(axis),
  );

  useEffect(() => {
    const { colors, pens } = TIER_CONFIG[axis];
    const colorsMq = window.matchMedia(`(min-${axis}: ${colors}px)`);
    const pensMq = window.matchMedia(`(min-${axis}: ${pens}px)`);
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
