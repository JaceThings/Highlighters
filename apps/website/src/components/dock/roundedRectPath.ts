const r2 = (n: number) => Math.round(n * 100) / 100;

export function roundedRectPath(width: number, height: number, radius: number): string {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  if (w === 0 || h === 0) return "";
  const r = r2(Math.max(0, Math.min(radius, w / 2, h / 2)));
  const right = r2(w);
  const bottom = r2(h);
  return [
    `M ${r} 0`,
    `H ${r2(right - r)}`,
    `A ${r} ${r} 0 0 1 ${right} ${r}`,
    `V ${r2(bottom - r)}`,
    `A ${r} ${r} 0 0 1 ${r2(right - r)} ${bottom}`,
    `H ${r}`,
    `A ${r} ${r} 0 0 1 0 ${r2(bottom - r)}`,
    `V ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    "Z",
  ].join(" ");
}
