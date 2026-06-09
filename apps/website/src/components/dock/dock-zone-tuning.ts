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
  /** A free circle's pen faces the nearer edge within `facingReach(vw)` of it (upright only in the
   *  centre band). The reach is a fraction of the viewport width so the upright band stays proportional
   *  on any screen (a fixed px reach leaves no upright band on a narrow window). */
  rotateFacingPct: number;
  /** Cap (px) on the facing reach so an ultrawide doesn't get a massive facing band; above
   *  `max / pct` the reach holds at this and the upright band simply grows. */
  rotateFacingMax: number;
  /** Hysteresis (px) on the facing reach so the facing never flickers at the boundary. */
  rotateHyst: number;
  /** Drag this far (px) from the rest centre before the intact pill collapses into the circle. */
  liftDistance: number;
  /** Px shaved off the TOP of each pen's hit region (clip-path), so the grab handle band above the pens
   *  no longer steals their hover/click. The pen art sits well below this, so it is never clipped. */
  penTopInset: number;
  /** Px shaved off each SIDE of a pen's hit region. */
  penSideInset: number;
}

export const DEFAULT_ZONES: DockZoneTuning = {
  bottomZone: 170,
  topZone: 400,
  snapZone: 175,
  rotateFacingPct: 0.35,
  rotateFacingMax: 600,
  rotateHyst: 65,
  liftDistance: 75,
  penTopInset: 22,
  penSideInset: 0,
};

// A small floor so a very narrow window (below the dock's min anyway) still gets a usable facing band.
const FACING_MIN = 120;

/** The pen-facing reach in px for a viewport `vw`: a % of width, floored and capped (fluid-with-a-cap). */
export function facingReach(vw: number): number {
  const z = state;
  return Math.max(FACING_MIN, Math.min(vw * z.rotateFacingPct, z.rotateFacingMax));
}

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
