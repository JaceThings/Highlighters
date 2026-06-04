import { useSyncExternalStore } from "react";
import type { PenTip } from "../../selection-style.tsx";

// Live tuning for the marker focus outlines: per-tip nudge + scale, plus a `preview` pen
// so the outline can be force-shown while dialing (a mouse click on the panel would drop
// keyboard focus and hide it). MarkerOutline reads this in every build - DEFAULT_TUNING
// ships; the dev-only DialKit panel (OutlineDials) writes the rest.
export interface TipTune {
  dx: number;
  dy: number;
  scale: number;
}

export interface OutlineTuning {
  tips: Record<PenTip, TipTune>;
  preview: PenTip | null;
}

// The shipped per-tip offsets (dialed in via the panel): each nib's outline sits a hair
// higher. The single source - OutlineDials seeds its sliders from this.
export const DEFAULT_TUNING: Record<PenTip, TipTune> = {
  slant: { dx: 0, dy: -2, scale: 1 },
  round: { dx: 0, dy: -3, scale: 1 },
  fine: { dx: 0, dy: -2.5, scale: 1 },
};

let state: OutlineTuning = { tips: { ...DEFAULT_TUNING }, preview: null };

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setTipTune(tip: PenTip, patch: Partial<TipTune>): void {
  state = { ...state, tips: { ...state.tips, [tip]: { ...state.tips[tip], ...patch } } };
  emit();
}

export function setPreview(preview: PenTip | null): void {
  state = { ...state, preview };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = (): OutlineTuning => state;

export function useOutlineTuning(): OutlineTuning {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
