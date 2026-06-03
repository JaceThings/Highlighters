// Shared Perfect-Freehand path helpers used by the hand-drawn docs marks (the marker
// underline and the slider scribble): sample an SVG path into points, and turn a getStroke
// outline into a fillable SVG path.

// Evenly sample n points along a path's length (uses a throwaway off-screen SVG). Cached at
// module level so the DOM measurement runs once per unique path string — keeping callers'
// render-time useMemo free of repeat side effects and skipping re-measurement on remount.
const pathCache = new Map<string, [number, number][]>();

export function samplePath(d: string, n: number): [number, number][] {
  const key = `${d}:${n}`;
  const hit = pathCache.get(key);
  if (hit) return hit;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.style.cssText = "position:absolute;visibility:hidden;width:0;height:0";
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", d);
  svg.appendChild(p);
  document.body.appendChild(svg);
  try {
    const len = p.getTotalLength();
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const pt = p.getPointAtLength((i / Math.max(n - 1, 1)) * len);
      pts.push([pt.x, pt.y]);
    }
    pathCache.set(key, pts);
    return pts;
  } finally {
    document.body.removeChild(svg);
  }
}

// getStroke outline → closed SVG path with quadratic midpoints. `p` is the coordinate
// precision (decimals) — a dense outline can drop to 1 to keep the `d` string small.
export function toPath(pts: number[][], p = 2): string {
  if (pts.length < 2) return "";
  const d = [`M ${pts[0][0].toFixed(p)} ${pts[0][1].toFixed(p)}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const c = pts[i];
    const nx = pts[i + 1];
    d.push(`Q ${c[0].toFixed(p)} ${c[1].toFixed(p)} ${((c[0] + nx[0]) / 2).toFixed(p)} ${((c[1] + nx[1]) / 2).toFixed(p)}`);
  }
  d.push("Z");
  return d.join(" ");
}

// Tight bounding box of an outline, as an SVG viewBox string with `pad` units of margin.
export function outlineViewBox(outline: number[][], pad = 1): string {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of outline) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return `${(minX - pad).toFixed(2)} ${(minY - pad).toFixed(2)} ${(maxX - minX + 2 * pad).toFixed(2)} ${(maxY - minY + 2 * pad).toFixed(2)}`;
}
