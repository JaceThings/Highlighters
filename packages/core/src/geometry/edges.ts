import type { EdgeVertex } from "../types.js";
import { hashJitter } from "./rng.js";

/**
 * Wavy-edge vertex generation on a **fixed spatial grid** — the core of the
 * anchored-grid method (doc §2, blueprint R22c/R22d).
 *
 * A naïve highlighter interpolates edge vertices as a fraction of the current
 * width (`x = startX + (k/segs) * len`) and seeds the jitter by the loop index
 * `k`. Both depend on width, so widening the mark slides every vertex *and*
 * re-shuffles every seed — the wobble visibly "swims" during a drag.
 *
 * The fix: vertices live at `x = gridIndex * segmentLength` on a global px grid,
 * and the jitter is seeded by that **grid index**, never by a normalized
 * fraction. Wavelength (`segmentLength`) and per-x phase are therefore constant
 * regardless of mark width, and growing the extent only **appends** vertices at
 * fresh grid x's — everything already emitted stays byte-identical (R22d).
 */

/** Per-role seed offsets so independent jitter draws never move in lockstep. */
const BASE_WAVE_OFFSET = 17;
const ROUGHNESS_OFFSET = 911;

/** Options for {@link buildEdge}. */
export interface EdgeBuildOptions {
  /** One endpoint of the edge in absolute px (the lower or higher x; either order). */
  startX: number;
  /** The other endpoint in absolute px. May be less than `startX` (reversed edge). */
  endX: number;
  /** The edge's baseline y in absolute px; vertices jitter around this. */
  baseY: number;
  /** Wave wavelength: the px spacing between adjacent grid vertices. */
  segmentLength: number;
  /** Peak wave displacement from `baseY`, in absolute px. */
  amplitude: number;
  /**
   * High-frequency micro-jitter on top of the base wave, `0`–`1`. Adds a small
   * decorrelated nudge (up to ~30% of `amplitude`) so the edge reads frayed
   * rather than cleanly sinusoidal. `0` yields the pure base wave.
   */
  roughness: number;
  /** Base seed for this edge (e.g. line seed + a top/bottom offset). */
  seed: number;
}

/**
 * Generate wave vertices on the fixed global grid for one long edge.
 *
 * The grid index range is computed with a **half-px epsilon** at each end so the
 * first/last grid point can never land exactly on a corner arc and kink it:
 *
 * ```
 * firstIdx = ceil((lo + 0.5) / segmentLength)
 * lastIdx  = floor((hi - 0.5) / segmentLength)
 * ```
 *
 * For each grid index `i` in `[firstIdx, lastIdx]`, the vertex is
 * `x = i * segmentLength`, `y = baseY + hashJitter(seed + i*17) * amplitude`
 * plus an optional `roughness` micro-jitter drawn at a decorrelated offset.
 *
 * Vertices are returned in **ascending grid-index order** (left → right). For a
 * reversed edge (`endX < startX`, e.g. the bottom edge of a clip path that runs
 * right → left) the caller reverses the array; because each vertex's `x`/`y` is a
 * pure function of its grid index, reversing preserves byte-identical geometry —
 * the same grid point has the same coordinates whichever direction it's visited.
 *
 * @returns The vertices, ascending in `x`. May be empty for a sub-`segmentLength`
 *   span (the caller then draws a straight edge between the corners).
 */
export function buildEdge(opts: EdgeBuildOptions): EdgeVertex[] {
  const { startX, endX, baseY, segmentLength, amplitude, roughness, seed } = opts;

  // A non-positive grid spacing has no well-defined vertex grid; emit none so
  // the caller falls back to a straight edge.
  if (!(segmentLength > 0)) return [];

  const lo = Math.min(startX, endX);
  const hi = Math.max(startX, endX);

  // Half-px epsilon keeps the extreme grid points clear of the corner arcs.
  const firstIdx = Math.ceil((lo + 0.5) / segmentLength);
  const lastIdx = Math.floor((hi - 0.5) / segmentLength);

  const vertices: EdgeVertex[] = [];
  const roughAmp = amplitude * 0.3 * roughness;
  for (let i = firstIdx; i <= lastIdx; i++) {
    const x = i * segmentLength;
    let y = baseY + hashJitter(seed + i * BASE_WAVE_OFFSET) * amplitude;
    if (roughAmp !== 0) {
      y += hashJitter(seed + i * BASE_WAVE_OFFSET + ROUGHNESS_OFFSET) * roughAmp;
    }
    vertices.push({ x, y, gridIndex: i });
  }
  return vertices;
}
