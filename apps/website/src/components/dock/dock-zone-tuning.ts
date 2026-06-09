import { useSyncExternalStore } from "react";

// Live-tunable drag zones for the dock. The defaults reproduce the shipped constants exactly, so
// production behaviour is unchanged: the drag state machine reads these via zones() at pointer-time,
// and only the dev-only DockZones panel (mounted with ?zones) ever writes them. The overlay
// subscribes through useDockZones() for redraw.
export interface DockZoneTuning {
  /** Circle-centre within this of the floor previews/commits the bottom dock. */
  bottomZone: number;
  /** Circle-centre within this of the top edge previews/commits the top dock. */
  topZone: number;
  /** Circle-centre within this of a side edge previews/commits that dock. */
  snapZone: number;
  /** A free circle's pen faces the nearer edge within this of it (upright only in the centre band). */
  rotateDist: number;
  /** Hysteresis on rotateDist so the facing never flickers at the boundary. */
  rotateHyst: number;
  /** Drag this far (px) from the rest centre before the intact pill collapses into the circle. */
  liftDistance: number;
}

export const DEFAULT_ZONES: DockZoneTuning = {
  bottomZone: 170,
  topZone: 170,
  snapZone: 175,
  rotateDist: 490,
  rotateHyst: 65,
  liftDistance: 75,
};

let state: DockZoneTuning = { ...DEFAULT_ZONES };

const listeners = new Set<() => void>();

export function setDockZones(patch: Partial<DockZoneTuning>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

/** Current zone values, read synchronously by the drag state machine on every pointer move. */
export const zones = (): DockZoneTuning => state;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDockZones(): DockZoneTuning {
  return useSyncExternalStore(subscribe, zones, zones);
}
