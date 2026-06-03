import type { Box, EdgeCap, EdgeVertex, ResolvedTip } from "../types.js";

/**
 * Build the `clip-path: path(...)` value for one band, in absolute-px local
 * coordinates.
 *
 * The shape is the chisel parallelogram: top and bottom edges threaded through
 * the wave {@link EdgeVertex} arrays, joined by rounded `Q`-arc corners, with the
 * chisel slant as an absolute-px x-shift derived from `tip.angle` (not a
 * percentage) so radius and slant keep their true size at any width. The other
 * tip types are variations on the same primitive: bullet has zero slant and a
 * radius widened toward a uniform rounded cap; fine has zero slant and a small
 * radius.
 *
 * Every coordinate is a pure function of the box, slant, radius, and grid-indexed
 * vertices, so identical inputs yield a byte-identical string and growing the mark
 * only appends `L` commands — the covered-region prefix is unchanged (R22d).
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
  /**
   * Advancing-front truncation width in local px (the draw-on). The band is
   * emitted only up to `front`, with the leading cap drawn AT the front; the
   * already-emitted prefix stays byte-identical as the front grows (R22d).
   * Defaults to `box.width`.
   */
  front?: number;
}

function fx(value: number): string {
  return value.toFixed(1);
}

function fy(value: number): string {
  return value.toFixed(2);
}

/**
 * The chisel slant in absolute px — how far the top edge leads (shifts right of)
 * the bottom edge. Grows linearly with `tip.angle` over 0–90°, capped at half the
 * width so it can never invert the parallelogram on a short mark. Exported so the
 * draw-on wipe can angle its reveal front to the same slant, computed in one place.
 */
export function chiselSlant(tip: ResolvedTip, width: number, height: number): number {
  if (tip.type !== "chisel") return 0;
  const norm = Math.min(Math.abs(tip.angle), 90) / 90;
  return Math.min(norm * height * 0.9, width * 0.5);
}

/**
 * Resolve the slant and corner radius for a given tip type and box. The radius is
 * clamped so the four arcs always fit: never more than half the (slant-reduced)
 * width or half the height. bullet maxes it out, fine keeps it small, flat/square
 * caps zero it.
 */
function resolveSlantAndRadius(
  tip: ResolvedTip,
  cap: EdgeCap,
  width: number,
  height: number,
  radius: number,
): { slant: number; r: number } {
  const slant = chiselSlant(tip, width, height);

  // Usable horizontal span for corner arcs is the top edge minus the slant.
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

/**
 * The smallest visible front (local px) for a tip — the touchdown width where the
 * leading cap's two corner arcs just meet over the slant (`slant + 2·radius`).
 * Below this the parallelogram inverts, so {@link buildClipPath} clamps smaller
 * fronts up to it. The draw-on uses it as the START of its travel (progress `0→1`
 * maps onto front `minVisibleFront → width`) so the band touches down at its tip
 * and immediately drags rather than popping to this width and sitting frozen.
 */
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

/**
 * Collect the wave vertices strictly inside the corner-arc inset `(minX, maxX)` —
 * vertices on or past the inset are skipped so a wave point can't kink a corner
 * arc. `reverse` consumes the array right → left (the bottom edge).
 */
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

/**
 * Emit a smooth edge from `(sx, sy)` through the wave vertices to `(ex, ey)` as
 * quadratic Béziers: each vertex is a control point and the curve passes through
 * the midpoints between consecutive vertices (the "smooth polyline" construction),
 * so wave corners round instead of kinking. No vertices → a straight `L`.
 */
function smoothEdge(sx: number, sy: number, verts: Pt[], ex: number, ey: number): string {
  if (verts.length === 0) return `L ${fx(ex)} ${fy(ey)} `;
  const pts: Pt[] = [{ x: sx, y: sy }, ...verts, { x: ex, y: ey }];
  let out = "";
  for (let i = 1; i < pts.length - 2; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    out += `Q ${fx(pts[i].x)} ${fy(pts[i].y)} ${fx(mx)} ${fy(my)} `;
  }
  // Final segment ends exactly on the end anchor.
  const c = pts[pts.length - 2];
  out += `Q ${fx(c.x)} ${fy(c.y)} ${fx(ex)} ${fy(ey)} `;
  return out;
}

/**
 * Build the bare `path(...)` clip-path value (no `clip-path:` prefix). Walks the
 * parallelogram clockwise from the top-left arc end: top edge, right cap, bottom
 * edge (vertices reversed), left cap, each corner a `Q` arc. The chisel slant
 * shifts the top edge right of the bottom by `slant` px.
 */
export function buildClipPath(opts: ClipPathOptions): string {
  const { box, tip, topEdge, bottomEdge, cap, radius } = opts;
  const ow = box.width;
  const oh = box.height;

  // Resolve slant/radius from the FULL box, never the current front — the cap
  // shape is planned once and only translated to the front as the band grows, so
  // the leading cap is identical from first frame to last (no shape/lean snap at
  // the end) and the whole future path is deterministic.
  const { slant: sl, r: R } = resolveSlantAndRadius(tip, cap, ow, oh, radius);

  // `front <= 0` is the pre-ink (empty) state. The smallest visible front is the
  // touchdown where the two caps just meet (`sl + 2R`, always ≤ ow); clamp into
  // [minFront, ow] so the band starts at a tip-shaped touchdown and never inverts.
  const reqFront = opts.front ?? ow;
  if (reqFront <= 0) return 'path("M 0 0 Z")';
  const minFront = sl + 2 * R;
  const F = Math.max(minFront, Math.min(reqFront, ow));

  // Only the RIGHT (leading) cap rides the front `F`; the LEFT cap is fixed.
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
