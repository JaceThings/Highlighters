import { Children, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

// A single-column CSS grid on a 24px baseline. Each child is wrapped in a grid cell that a
// ResizeObserver snaps to a whole number of 24px rows (grid-row: span N), so the column always lands
// on the ruled 24px grid whatever the content height, no per-block height math. Pair with a content
// origin on the grid (a 24px-multiple top pad) so the rows register with the ruled-paper background.
export const ROW = 24;

export function RowGrid({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid) return;
    const cells = Array.from(grid.children) as HTMLElement[];
    // -0.5 absorbs sub-pixel rendering so an exact multiple stays N rows, a real overflow gets N+1.
    const snap = (el: HTMLElement, h: number) => {
      el.style.gridRow = `span ${Math.max(1, Math.ceil((h - 0.5) / ROW))}`;
    };
    cells.forEach((el) => snap(el, el.getBoundingClientRect().height)); // pre-paint, no flash
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const h = e.borderBoxSize?.[0]?.blockSize ?? (e.target as HTMLElement).getBoundingClientRect().height;
        snap(e.target as HTMLElement, h);
      }
    });
    cells.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{ display: "grid", gridTemplateColumns: "1fr", gridAutoRows: `${ROW}px`, alignContent: "start", ...style }}
    >
      {Children.map(children, (child) => (
        <div style={{ alignSelf: "start", minWidth: 0 }}>{child}</div>
      ))}
    </div>
  );
}
