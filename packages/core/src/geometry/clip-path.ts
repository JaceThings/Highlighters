import type { Box, EdgeCap, EdgeVertex, ResolvedTip } from "../types.js";

/**
 * Build the `clip-path: path(...)` value for one band, in **absolute-px local
 * coordinates** (anchored-grid doc §4, blueprint R22c).
 *
 * The shape is the chisel parallelogram: a top edge and a bottom edge threaded
 * through the supplied wave {@link EdgeVertex} arrays, joined by rounded corners
 * drawn as quadratic `Q` arcs, with the chisel slant applied as an absolute-px
 * x-shift derived from `tip.angle` (not a percentage), so the corner radius and
 * slant keep their true size at any width. The two other tip types are
 * variations on the same primitive:
 *
 *  - **chisel** — full slant, full corner radius (the default marker shape).
 *  - **bullet** — zero slant, radius widened toward a fully rounded, uniform cap.
 *  - **fine**   — zero slant, small radius (a thin, crisp nib).
 *
 * Because every coordinate is a pure function of the box, the slant, the radius,
 * and the (grid-indexed) edge vertices, identical inputs yield a byte-identical
 * string, and growing the mark only appends `L` commands for the new vertices —
 * the path prefix for the covered region is unchanged (R22d). No DOM access.
 */

/** Options for {@link buildClipPath}. */
export interface ClipPathOptions {
  /** The band's local box. Only `width`/`height` are used (origin is `0,0`). */
  box: Box;
  /** Resolved nib geometry; `type` and `angle` drive slant and radius shaping. */
  tip: ResolvedTip;
  /** Top-edge wave vertices (ascending x), threaded left → right along the top. */
  topEdge: EdgeVertex[];
  /** Bottom-edge wave vertices (ascending x), threaded right → left along the bottom. */
  bottomEdge: EdgeVertex[];
  /** End-cap style for the leading/trailing edges. */
  cap: EdgeCap;
  /** Corner radius in absolute px (clamped against short marks). */
  radius: number;
  /**
   * Advancing-front truncation width in local px (the draw-on). When given, the
   * band is emitted only up to `front`, with the leading tip cap drawn AT the
   * front instead of at `box.width`. As the front grows, the already-emitted
   * prefix (left cap + threaded wave vertices ≤ front) is byte-identical — the
   * mark gains nodes, it never stretches (the anchored-grid invariant, R22d).
   * Defaults to `box.width` (the full mark).
   */
  front?: number;
}

/** Format an x/horizontal coordinate to 1 decimal. */
function fx(value: number): string {
  return value.toFixed(1);
}

/** Format a y/vertical coordinate to 2 decimals. */
function fy(value: number): string {
  return value.toFixed(2);
}

/**
 * The chisel slant in absolute px — how far the top edge leads (shifts right of)
 * the bottom edge. Grows linearly with `tip.angle` across the whole 0–90° range
 * (a taller band leans further in px), capped at half the band width so it can
 * never invert the parallelogram on a short mark. `bullet`/`fine` have no slant.
 *
 * Exported so the draw-on wipe can angle its reveal front to the same tip slant
 * (the marker's tip IS the boundary that lays the ink), and so the value is
 * computed in exactly one place.
 */
export function chiselSlant(tip: ResolvedTip, width: number, height: number): number {
  if (tip.type !== "chisel") return 0;
  const norm = Math.min(Math.abs(tip.angle), 90) / 90;
  return Math.min(norm * height * 0.9, width * 0.5);
}

/**
 * Resolve the slant and corner radius for a given tip type and box.
 *
 * - The chisel slant is {@link chiselSlant} — the px the top edge leads the
 *   bottom. `bullet`/`fine` have no slant.
 * - The corner radius is the requested px, clamped so the four arcs always fit:
 *   never more than half the (slant-reduced) width or half the height. `bullet`
 *   pushes the radius toward that maximum (uniform rounded cap); `fine` keeps it
 *   small for a crisp thin nib; `flat`/`square` caps zero it out.
 */
function resolveSlantAndRadius(
  tip: ResolvedTip,
  cap: EdgeCap,
  width: number,
  height: number,
  radius: number,
): { slant: number; r: number } {
  const slant = chiselSlant(tip, width, height);

  // The usable horizontal span for corner arcs is the top edge minus the slant.
  const usableWidth = Math.max(0, width - slant);
  const maxByWidth = usableWidth / 2;
  const maxByHeight = height / 2;
  const radiusCeil = Math.max(0, Math.min(maxByWidth, maxByHeight));

  let r: number;
  if (cap === "flat" || cap === "square") {
    // Square/flat ends: no rounding (the corners stay sharp).
    r = 0;
  } else if (tip.type === "bullet") {
    // Uniform rounded cap: take the radius as large as the box allows.
    r = radiusCeil;
  } else if (tip.type === "fine") {
    // Thin crisp nib: keep the rounding small.
    r = Math.min(radius, radiusCeil, height * 0.25);
  } else {
    r = Math.min(Math.max(0, radius), radiusCeil);
  }
  return { slant, r };
}

/**
 * The smallest visible front (in local px) for a tip — the touchdown width where
 * the leading cap's two corner arcs just meet over the slant (`slant + 2·radius`).
 * Below this the parallelogram would invert, so {@link buildClipPath} clamps any
 * smaller `front` up to it. The draw-on uses this as the START of its travel
 * (mapping progress `0→1` onto front `minVisibleFront → width`) so the band touches
 * down at its tip and immediately drags — instead of popping to this width and then
 * sitting frozen while progress catches up (the start-of-draw "pause").
 *
 * @returns The minimum drawable front in px for the resolved tip/cap/box.
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

/** A point on an edge curve. */
interface Pt {
  x: number;
  y: number;
}

/**
 * Collect the wave vertices that fall within the corner-arc inset `(minX, maxX)`.
 * `topEdge` runs left → right; `bottomEdge` runs right → left, so it is consumed
 * in reverse. Vertices on or past the inset are skipped so a wave point can't kink
 * a corner arc.
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
 * Emit a SMOOTH edge from the current point `(sx, sy)` through the wave vertices
 * to `(ex, ey)`, as quadratic Béziers. Each vertex is used as a control point and
 * the curve passes through the midpoints between consecutive vertices — the
 * standard "smooth polyline" construction — so every wave corner is rounded
 * instead of a sharp `L` kink. With no vertices it is a straight `L` to the end.
 */
function smoothEdge(sx: number, sy: number, verts: Pt[], ex: number, ey: number): string {
  if (verts.length === 0) return `L ${fx(ex)} ${fy(ey)} `;
  const pts: Pt[] = [{ x: sx, y: sy }, ...verts, { x: ex, y: ey }];
  let out = "";
  // Each interior vertex is a control point; the curve passes through the
  // midpoint to the next, rounding the corner at the vertex.
  for (let i = 1; i < pts.length - 2; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    out += `Q ${fx(pts[i].x)} ${fy(pts[i].y)} ${fx(mx)} ${fy(my)} `;
  }
  // Final segment: last vertex as control, ending exactly on the end anchor.
  const c = pts[pts.length - 2];
  out += `Q ${fx(c.x)} ${fy(c.y)} ${fx(ex)} ${fy(ey)} `;
  return out;
}

/**
 * Build the bare `path(...)` clip-path value (no `clip-path:` prefix).
 *
 * Walks the parallelogram clockwise from the top-left arc end: across the top
 * edge (threading top wave vertices), down the right cap with a rounded corner,
 * back across the bottom edge (threading bottom wave vertices in reverse), and
 * up the left cap, each corner an absolute-px quadratic `Q` arc. The chisel slant
 * shifts the top edge right relative to the bottom by `slant` px.
 */
export function buildClipPath(opts: ClipPathOptions): string {
  const { box, tip, topEdge, bottomEdge, cap, radius } = opts;
  const ow = box.width;
  const oh = box.height;

  // Resolve slant/radius from the FULL box, never the current front — the cap
  // shape is PLANNED once and only TRANSLATED to the front as the band grows, so
  // the leading cap is identical from the first frame to the last (no shape/lean
  // snap at the end) and the whole future path is deterministic.
  const { slant: sl, r: R } = resolveSlantAndRadius(tip, cap, ow, oh, radius);

  // The advancing front (draw-on). `front <= 0` is the pre-ink state (empty). The
  // smallest visible front is the touchdown where the two caps just meet
  // (`sl + 2R`, always ≤ ow since R ≤ (ow - sl)/2); clamp into [minFront, ow] so
  // the band starts at a tip-shaped touchdown and grows — never inverting.
  const reqFront = opts.front ?? ow;
  if (reqFront <= 0) return 'path("M 0 0 Z")';
  const minFront = sl + 2 * R;
  const F = Math.max(minFront, Math.min(reqFront, ow));

  // Top edge runs from (sl + R, 0) to (F - R, 0); bottom edge runs from
  // (F - sl - R, oh) back to (R, oh). The slant biases the top right of the
  // bottom, so the leading edge leans like a held chisel. The LEFT cap is fixed;
  // only the RIGHT (leading) cap rides the front `F` — at the planned slant/radius.
  const topStartX = sl + R;
  const topEndX = F - R;
  const bottomStartX = F - sl - R;
  const bottomEndX = R;

  const topVerts = collectVertices(topEdge, false, topStartX, topEndX);
  const bottomVerts = collectVertices(bottomEdge, true, bottomEndX, bottomStartX);

  return (
    `path("M ${fx(topStartX)} 0 ` +
    // Top edge, left → right, threaded as a SMOOTH wave (rounded corners).
    smoothEdge(topStartX, 0, topVerts, topEndX, 0) +
    // Top-right corner arc down to the leading cap (at the front F).
    `Q ${fx(F)} 0 ${fx(F)} ${fy(R)} ` +
    // Leading cap down to the bottom-right corner (slant pulls the bottom left).
    `L ${fx(F - sl)} ${fy(oh - R)} ` +
    `Q ${fx(F - sl)} ${fy(oh)} ${fx(bottomStartX)} ${fy(oh)} ` +
    // Bottom edge, right → left, threaded as a SMOOTH wave (rounded corners).
    smoothEdge(bottomStartX, oh, bottomVerts, bottomEndX, oh) +
    // Bottom-left corner arc up to the left cap.
    `Q 0 ${fy(oh)} 0 ${fy(oh - R)} ` +
    // Left cap up to the top-left corner (slant pushes the top right).
    `L ${fx(sl)} ${fy(R)} ` +
    `Q ${fx(sl)} 0 ${fx(topStartX)} 0 Z")`
  );
}
