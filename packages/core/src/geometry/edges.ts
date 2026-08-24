import type { EdgeVertex } from "../types.js";
import { hashJitter } from "./rng.js";

const BASE_WAVE_OFFSET = 17;
const ROUGHNESS_OFFSET = 911;

export interface EdgeBuildOptions {
  startX: number;
  endX: number;
  baseY: number;
  segmentLength: number;
  amplitude: number;
  roughness: number;
  seed: number;
}

export function buildEdge(opts: EdgeBuildOptions): EdgeVertex[] {
  const { startX, endX, baseY, segmentLength, amplitude, roughness, seed } = opts;

  if (!(segmentLength > 0)) return [];

  const lo = Math.min(startX, endX);
  const hi = Math.max(startX, endX);

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
