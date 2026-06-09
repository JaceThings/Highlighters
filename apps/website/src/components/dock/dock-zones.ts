// Dock drag-zone geometry, tuned interactively (the dev visualiser is in git history) and baked here.
// Read by useDockDrag (snap/lift/facing) and Marker (pen hit insets).

/** Circle-centre within this of the floor commits the bottom dock (px). */
export const BOTTOM_ZONE = 170;
/** Circle-centre within this of the top edge releases to the top dock (a soft zone: commit on release,
 *  never an auto-expand while dragging). */
export const TOP_ZONE = 400;
/** Circle-centre within this of a side edge previews/commits that dock (px). */
export const SNAP_ZONE = 175;
/** Hysteresis (px) on the facing reach so the pen's facing never flickers at the boundary. */
export const ROTATE_HYST = 65;
/** Drag this far (px) from the rest centre before the intact pill collapses into the circle. */
export const LIFT_DISTANCE = 75;
/** Px shaved off the TOP of each pen's hit region (clip-path), so the grab-handle band above the pens
 *  can't steal their hover/click. The pen art sits well below this, so it is never clipped. */
export const PEN_TOP_INSET = 22;
/** Px shaved off each SIDE of a pen's hit region. */
export const PEN_SIDE_INSET = 0;

// Pen-facing reach: a fraction of viewport width, capped so an ultrawide doesn't get a massive band,
// and held back on small screens so the central upright band stays >= FACING_MIN_CENTER. The net effect
// is an effective % that eases down as the viewport shrinks (a fixed px reach leaves no upright band on
// a narrow window).
const FACING_PCT = 0.45;
const FACING_MAX = 950;
const FACING_MIN_CENTER = 580;
const FACING_FLOOR = 120;

/** The pen-facing reach in px for a viewport width `vw`. */
export function facingReach(vw: number): number {
  return Math.max(FACING_FLOOR, Math.min(vw * FACING_PCT, FACING_MAX, (vw - FACING_MIN_CENTER) / 2));
}
