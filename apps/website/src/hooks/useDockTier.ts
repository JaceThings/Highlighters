import { useEffect, useState } from "react";
import { DOCK_COLORS_MIN, DOCK_PENS_MIN } from "../components/dock/constants.ts";

interface DockTier {
  showColors: boolean;
  showPens: boolean;
}

const read = (): DockTier => ({
  showColors: window.matchMedia(`(min-width: ${DOCK_COLORS_MIN}px)`).matches,
  showPens: window.matchMedia(`(min-width: ${DOCK_PENS_MIN}px)`).matches,
});

/** Which dock sections fit at the current width: drop colours, then pens, as the viewport narrows. */
export function useDockTier(): DockTier {
  const [tier, setTier] = useState<DockTier>(() =>
    typeof window === "undefined" ? { showColors: true, showPens: true } : read(),
  );

  useEffect(() => {
    const colors = window.matchMedia(`(min-width: ${DOCK_COLORS_MIN}px)`);
    const pens = window.matchMedia(`(min-width: ${DOCK_PENS_MIN}px)`);
    const update = () => setTier({ showColors: colors.matches, showPens: pens.matches });
    colors.addEventListener("change", update);
    pens.addEventListener("change", update);
    return () => {
      colors.removeEventListener("change", update);
      pens.removeEventListener("change", update);
    };
  }, []);

  return tier;
}
