import type { EdgeVertex } from "../types.js";
import { hashJitter } from "./rng.js";

/**
 * Wavy-edge vertices on a fixed spatial grid.
 *
 * Vertices live at `x = gridIndex * segmentLength` on a global px grid, jitter
 * seeded by that grid index, so wavelength and per-x phase are width-independent
 * and growing the extent only appends vertices, never shifting the existing ones.
 * (Interpolating by current width and seeding by loop index would make the wobble swim during a drag.)
 */

/** Per-role seed offsets so independent jitter draws never move in lockstep. */
const BASE_WAVE_OFFSET = 17;
const ROUGHNESS_OFFSET = 911;

export interface EdgeBuildOptions {
  /** One endpoint in absolute px (lower or higher x; either order). */
  startX: number;
  /** The other endpoint in absolute px. May be less than `startX` (reversed edge). */
  endX: number;
  /** The edge's baseline y in absolute px; vertices jitter around this. */
  baseY: number;
  /** Wave wavelength: the px spacing between adjacent grid vertices. */
  segmentLength: number;
  /** Peak wave displacement from `baseY`, in absolute px. */
  amplitude: number;
  /** High-frequency micro-jitter on the base wave, `0`-`1` (up to ~30% of `amplitude`) so the edge reads frayed rather than sinusoidal. */
  roughness: number;
  /** Base seed for this edge (e.g. line seed + a top/bottom offset). */
  seed: number;
}

/**
 * Generate wave vertices on the fixed global grid for one edge, ascending in `x`.
 * @returns Vertices ascending in `x`; empty for a sub-`segmentLength` span (caller draws straight).
 */
export function buildEdge(opts: EdgeBuildOptions): EdgeVertex[] {
  const { startX, endX, baseY, segmentLength, amplitude, roughness, seed } = opts;

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
