import { createContext, use, useEffect, useRef } from "react";

interface DockEntrance {
  ready: boolean;
  signalReady: () => void;
}

export const DockEntranceContext = createContext<DockEntrance>({
  ready: true,
  signalReady: () => {},
});

export function useDockEntrance(): DockEntrance {
  return use(DockEntranceContext);
}

let entered = false;

export function useSkipDockEntrance(): boolean {
  const skip = useRef(entered);
  useEffect(() => {
    entered = true;
  }, []);
  return skip.current;
}
