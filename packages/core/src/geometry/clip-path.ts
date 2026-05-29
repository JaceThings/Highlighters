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
 * Resolve the slant and corner radius for a given tip type and box.
 *
 * - The chisel slant is the px the top edge shifts right of the bottom edge,
 *   derived from `tip.angle` as `tan(angle) * height` and clamped so it can
 *   never exceed a quarter of the band width (a wider slant would invert the
 *   parallelogram on a short mark). `bullet`/`fine` have no slant.
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
  let slant = 0;
  if (tip.type === "chisel") {
    const raw = Math.tan((tip.angle * Math.PI) / 180) * height;
    const maxSlant = width / 4;
    slant = Math.max(0, Math.min(Math.abs(raw), maxSlant));
  }

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
 * Thread the supplied wave vertices as `L` commands. `topEdge` runs left → right;
 * `bottomEdge` runs right → left, so it is consumed in reverse. Vertices that
 * fall within the corner-arc inset are skipped so a wave point can't kink an arc.
 */
function threadVertices(
  vertices: EdgeVertex[],
  reverse: boolean,
  minX: number,
  maxX: number,
): string {
  let out = "";
  const n = vertices.length;
  for (let k = 0; k < n; k++) {
    const v = reverse ? vertices[n - 1 - k] : vertices[k];
    if (v.x <= minX || v.x >= maxX) continue;
    out += `L ${fx(v.x)} ${fy(v.y)} `;
  }
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

  const { slant: sl, r: R } = resolveSlantAndRadius(tip, cap, ow, oh, radius);

  // Top edge runs from (sl + R, 0) to (ow - R, 0); bottom edge runs from
  // (ow - sl - R, oh) back to (R, oh). The slant biases the top right of the
  // bottom, so the left side leans like a held chisel.
  const topStartX = sl + R;
  const topEndX = ow - R;
  const bottomStartX = ow - sl - R;
  const bottomEndX = R;

  const topThread = threadVertices(topEdge, false, topStartX, topEndX);
  const bottomThread = threadVertices(bottomEdge, true, bottomEndX, bottomStartX);

  return (
    `path("M ${fx(topStartX)} 0 ` +
    // Top edge, left → right, with its wave vertices.
    topThread +
    `L ${fx(topEndX)} 0 ` +
    // Top-right corner arc down to the right cap.
    `Q ${fx(ow)} 0 ${fx(ow)} ${fy(R)} ` +
    // Right cap down to the bottom-right corner (slant pulls the bottom left).
    `L ${fx(ow - sl)} ${fy(oh - R)} ` +
    `Q ${fx(ow - sl)} ${fy(oh)} ${fx(bottomStartX)} ${fy(oh)} ` +
    // Bottom edge, right → left, with its wave vertices.
    bottomThread +
    `L ${fx(bottomEndX)} ${fy(oh)} ` +
    // Bottom-left corner arc up to the left cap.
    `Q 0 ${fy(oh)} 0 ${fy(oh - R)} ` +
    // Left cap up to the top-left corner (slant pushes the top right).
    `L ${fx(sl)} ${fy(R)} ` +
    `Q ${fx(sl)} 0 ${fx(topStartX)} 0 Z")`
  );
}
