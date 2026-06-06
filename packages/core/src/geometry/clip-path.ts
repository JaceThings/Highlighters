import type { Box, EdgeCap, EdgeVertex, ResolvedTip } from "../types.js";

/**
 * Build the `clip-path: path(...)` value for one band, in absolute-px local coordinates.
 *
 * The shape is the chisel parallelogram, edges threaded through the wave vertices and
 * joined by rounded `Q`-arc corners. Slant is an absolute-px x-shift (not a percentage)
 * so radius and slant keep their true size at any width. Every coordinate is a pure
 * function of the inputs, so growing the mark only appends commands and the covered prefix
 * stays byte-identical.
 */

export interface ClipPathOptions {
  /** The band's local box. Only `width`/`height` are used (origin is `0,0`). */
  box: Box;
  tip: ResolvedTip;
  /** Top-edge wave vertices (ascending x), threaded left → right. */
  topEdge: EdgeVertex[];
  /** Bottom-edge wave vertices (ascending x), threaded right → left. */
  bottomEdge: EdgeVertex[];
  cap: EdgeCap;
  /** Corner radius in absolute px (clamped against short marks). */
  radius: number;
  /** Advancing-front truncation width in local px (the draw-on); the emitted prefix stays byte-identical as it grows. Defaults to `box.width`. */
  front?: number;
}

function fx(value: number): string {
  return value.toFixed(1);
}

function fy(value: number): string {
  return value.toFixed(2);
}

/** The chisel slant in absolute px: how far the top edge leads the bottom. Capped at half the width so it can't invert the parallelogram. */
export function chiselSlant(tip: ResolvedTip, width: number, height: number): number {
  if (tip.type !== "chisel") return 0;
  const norm = Math.min(Math.abs(tip.angle), 90) / 90;
  return Math.min(norm * height * 0.9, width * 0.5);
}

/** Resolve slant and corner radius for a tip type and box. Radius is clamped so the four arcs always fit. */
function resolveSlantAndRadius(
  tip: ResolvedTip,
  cap: EdgeCap,
  width: number,
  height: number,
  radius: number,
): { slant: number; r: number } {
  const slant = chiselSlant(tip, width, height);

  const usableWidth = Math.max(0, width - slant);
  const maxByWidth = usableWidth / 2;
  const maxByHeight = height / 2;
  const radiusCeil = Math.max(0, Math.min(maxByWidth, maxByHeight));

  let r: number;
  if (cap === "flat" || cap === "square") {
    r = 0;
  } else if (tip.type === "bullet") {
    r = radiusCeil;
  } else if (tip.type === "fine") {
    r = Math.min(radius, radiusCeil, height * 0.25);
  } else {
    r = Math.min(Math.max(0, radius), radiusCeil);
  }
  return { slant, r };
}

/** The smallest visible front (local px): the touchdown width where the leading cap's arcs just meet (`slant + 2·radius`). Below it the parallelogram inverts. */
export function minVisibleFront(
  tip: ResolvedTip,
  cap: EdgeCap,
  width: number,
  height: number,
  radius: number,
): number {
  const { slant, r } = resolveSlantAndRadius(tip, cap, width, height, radius);
  return slant + 2 * r;
}

interface Pt {
  x: number;
  y: number;
}

/** Collect wave vertices strictly inside the corner-arc inset so a wave point can't kink a corner arc. `reverse` consumes right to left (the bottom edge). */
function collectVertices(
  vertices: EdgeVertex[],
  reverse: boolean,
  minX: number,
  maxX: number,
): Pt[] {
  const out: Pt[] = [];
  const n = vertices.length;
  for (let k = 0; k < n; k++) {
    const v = reverse ? vertices[n - 1 - k] : vertices[k];
    if (v.x <= minX || v.x >= maxX) continue;
    out.push({ x: v.x, y: v.y });
  }
  return out;
}

/** Emit a smooth edge through the wave vertices as quadratic Béziers (midpoint smoothing) so corners round instead of kinking. No vertices yields a straight `L`. */
function smoothEdge(sx: number, sy: number, verts: Pt[], ex: number, ey: number): string {
  if (verts.length === 0) return `L ${fx(ex)} ${fy(ey)} `;
  const pts: Pt[] = [{ x: sx, y: sy }, ...verts, { x: ex, y: ey }];
  let out = "";
  for (let i = 1; i < pts.length - 2; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    out += `Q ${fx(pts[i].x)} ${fy(pts[i].y)} ${fx(mx)} ${fy(my)} `;
  }
  const c = pts[pts.length - 2];
  out += `Q ${fx(c.x)} ${fy(c.y)} ${fx(ex)} ${fy(ey)} `;
  return out;
}

/** Build the bare `path(...)` clip-path value, walking the parallelogram clockwise with a `Q` arc at each corner. */
export function buildClipPath(opts: ClipPathOptions): string {
  const { box, tip, topEdge, bottomEdge, cap, radius } = opts;
  const ow = box.width;
  const oh = box.height;

  // Resolve slant/radius from the FULL box, never the current front, so the leading cap shape is identical from first frame to last.
  const { slant: sl, r: R } = resolveSlantAndRadius(tip, cap, ow, oh, radius);

  // `front <= 0` is the empty state. Clamp into [minFront, ow] so the band starts at a tip-shaped touchdown and never inverts.
  const reqFront = opts.front ?? ow;
  if (reqFront <= 0) return 'path("M 0 0 Z")';
  const minFront = sl + 2 * R;
  const F = Math.max(minFront, Math.min(reqFront, ow));

  // Only the leading (right) cap rides the front `F`; the left cap is fixed.
  const topStartX = sl + R;
  const topEndX = F - R;
  const bottomStartX = F - sl - R;
  const bottomEndX = R;

  const topVerts = collectVertices(topEdge, false, topStartX, topEndX);
  const bottomVerts = collectVertices(bottomEdge, true, bottomEndX, bottomStartX);

  return (
    `path("M ${fx(topStartX)} 0 ` +
    smoothEdge(topStartX, 0, topVerts, topEndX, 0) +
    `Q ${fx(F)} 0 ${fx(F)} ${fy(R)} ` +
    `L ${fx(F - sl)} ${fy(oh - R)} ` +
    `Q ${fx(F - sl)} ${fy(oh)} ${fx(bottomStartX)} ${fy(oh)} ` +
    smoothEdge(bottomStartX, oh, bottomVerts, bottomEndX, oh) +
    `Q 0 ${fy(oh)} 0 ${fy(oh - R)} ` +
    `L ${fx(sl)} ${fy(R)} ` +
    `Q ${fx(sl)} 0 ${fx(topStartX)} 0 Z")`
  );
}
