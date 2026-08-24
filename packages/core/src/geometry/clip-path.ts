import type { Box, EdgeCap, EdgeVertex, ResolvedTip } from "../types.js";

export interface ClipPathOptions {
  box: Box;
  tip: ResolvedTip;
  topEdge: EdgeVertex[];
  bottomEdge: EdgeVertex[];
  cap: EdgeCap;
  radius: number;
  front?: number;
}

const EMPTY_CLIP = 'path("M 0 0 Z")';

function fx(value: number): string {
  return value.toFixed(1);
}

function fy(value: number): string {
  return value.toFixed(2);
}

export function chiselSlant(tip: ResolvedTip, width: number, height: number): number {
  if (tip.type !== "chisel") return 0;
  const norm = Math.min(Math.abs(tip.angle), 90) / 90;
  return Math.min(norm * height * 0.9, width * 0.5);
}

interface SlantAndRadius {
  slant: number;
  r: number;
}

function resolveSlantAndRadius(
  tip: ResolvedTip,
  cap: EdgeCap,
  width: number,
  height: number,
  radius: number,
): SlantAndRadius {
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

function smoothEdge(
  vertices: EdgeVertex[],
  reverse: boolean,
  minX: number,
  maxX: number,
  ex: number,
  ey: number,
): string {
  const step = reverse ? -1 : 1;
  const end = reverse ? -1 : vertices.length;
  let i = reverse ? vertices.length - 1 : 0;
  while (i !== end && (vertices[i].x <= minX || vertices[i].x >= maxX)) i += step;
  if (i === end) return `L ${fx(ex)} ${fy(ey)} `;
  let out = "";
  for (;;) {
    const v = vertices[i];
    let j = i + step;
    while (j !== end && (vertices[j].x <= minX || vertices[j].x >= maxX)) j += step;
    if (j === end) return out + `Q ${fx(v.x)} ${fy(v.y)} ${fx(ex)} ${fy(ey)} `;
    const u = vertices[j];
    out += `Q ${fx(v.x)} ${fy(v.y)} ${fx((v.x + u.x) / 2)} ${fy((v.y + u.y) / 2)} `;
    i = j;
  }
}

export function buildClipPath(opts: ClipPathOptions): string {
  const { box, tip, topEdge, bottomEdge, cap, radius } = opts;
  const ow = box.width;
  const oh = box.height;

  const { slant: sl, r: R } = resolveSlantAndRadius(tip, cap, ow, oh, radius);

  const reqFront = opts.front ?? ow;
  if (reqFront <= 0) return EMPTY_CLIP;
  const minFront = sl + 2 * R;
  const F = Math.max(minFront, Math.min(reqFront, ow));

  const topStartX = sl + R;
  const topEndX = F - R;
  const bottomStartX = F - sl - R;
  const bottomEndX = R;

  return (
    `path("M ${fx(topStartX)} 0 ` +
    smoothEdge(topEdge, false, topStartX, topEndX, topEndX, 0) +
    `Q ${fx(F)} 0 ${fx(F)} ${fy(R)} ` +
    `L ${fx(F - sl)} ${fy(oh - R)} ` +
    `Q ${fx(F - sl)} ${fy(oh)} ${fx(bottomStartX)} ${fy(oh)} ` +
    smoothEdge(bottomEdge, true, bottomEndX, bottomStartX, bottomEndX, oh) +
    `Q 0 ${fy(oh)} 0 ${fy(oh - R)} ` +
    `L ${fx(sl)} ${fy(R)} ` +
    `Q ${fx(sl)} 0 ${fx(topStartX)} 0 Z")`
  );
}
