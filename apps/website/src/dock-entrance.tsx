import { createContext, useContext } from "react";

/** Coordinates the dock's entrance with the page text: the dock waits until the
 *  page signals its cascade has landed (a timer in RootLayout is the fallback). */
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
