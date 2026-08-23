export const BOTTOM_ZONE = 170;
export const TOP_ZONE = 400;
export const SNAP_ZONE = 175;
export const ROTATE_HYST = 65;
export const LIFT_DISTANCE = 75;
export const PEN_TOP_INSET = 22;
export const PEN_SIDE_INSET = 0;

const FACING_PCT = 0.45;
const FACING_MAX = 950;
const FACING_MIN_CENTER = 580;
const FACING_FLOOR = 120;

export function facingReach(vw: number): number {
  return Math.max(FACING_FLOOR, Math.min(vw * FACING_PCT, FACING_MAX, (vw - FACING_MIN_CENTER) / 2));
}
