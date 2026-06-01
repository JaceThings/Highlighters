import { createContext, useContext } from "react";

/**
 * Coordinates the dock's entrance with the page's text. The dock waits to fly in
 * until the page signals its entrance cascade has fully landed, so the tray never
 * competes with the text still appearing (see Stagger / Dock / RootLayout). A page
 * with no cascade falls back to a timer in RootLayout.
 */
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
  return useContext(DockEntranceContext);
}
