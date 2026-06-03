import { createContext, useContext, type ReactNode } from "react";

export interface PlaygroundTuning {
  trackHeight: number;
  trackSmoothing: number;
}

export const DEFAULT_TUNING: PlaygroundTuning = {
  trackHeight: 14,
  trackSmoothing: 0.6,
};

const TuningContext = createContext<PlaygroundTuning>(DEFAULT_TUNING);

export function PlaygroundTuningProvider({
  value,
  children,
}: {
  value: PlaygroundTuning;
  children: ReactNode;
}) {
  return <TuningContext.Provider value={value}>{children}</TuningContext.Provider>;
}

export function usePlaygroundTuning(): PlaygroundTuning {
  return useContext(TuningContext);
}
