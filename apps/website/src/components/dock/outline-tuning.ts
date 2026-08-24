import { useSyncExternalStore } from "react";
import type { PenTip } from "../../selection-style.tsx";

export interface TipTune {
  dx: number;
  dy: number;
  scale: number;
}

export interface OutlineTuning {
  tips: Record<PenTip, TipTune>;
  preview: PenTip | null;
}

export const DEFAULT_TUNING = {
  slant: { dx: 0, dy: -2, scale: 1 },
  round: { dx: 0, dy: -3, scale: 1 },
  fine: { dx: 0, dy: -2.5, scale: 1 },
} satisfies Record<PenTip, TipTune>;

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
