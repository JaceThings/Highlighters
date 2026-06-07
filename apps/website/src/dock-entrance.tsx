import { createContext, use, useEffect, useRef } from "react";

/** Coordinates the dock's entrance with the page text (a timer in RootLayout is the fallback). */
interface DockEntrance {
  /** True once the page's text has settled and the dock may enter. */
  ready: boolean;
  /** Called by the page's last entrance block when its text has landed. */
  signalReady: () => void;
}

export const DockEntranceContext = createContext<DockEntrance>({
  ready: true,
  signalReady: () => {},
});

export function useDockEntrance(): DockEntrance {
  return use(DockEntranceContext);
}

// Whether the dock has already played its entrance this session. Crossing the responsive tiers
// remounts the dock (Dock <-> MobileDock), so the freshly-mounted one skips the slide-up and just
// appears in place. Set once, by the first dock to mount.
let entered = false;

/** True if a dock already entered this session (this instance should skip its entrance). Marks entered on mount. */
export function useSkipDockEntrance(): boolean {
  const skip = useRef(entered);
  useEffect(() => {
    entered = true;
  }, []);
  return skip.current;
}
