import { Children, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

// A single-column CSS grid on a 24px baseline. Each child is wrapped in a grid cell that a
// ResizeObserver snaps to a whole number of 24px rows (grid-row: span N), so the column always lands
// on the ruled 24px grid whatever the content height, no per-block height math. The rows register with
// the ruled-paper background because Layout's top padding puts the content on the same phase.
const ROW = 24;

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
    // -0.5 absorbs sub-pixel rendering so an exact multiple stays N rows, a real overflow gets N+1.
    const snap = (el: HTMLElement, h: number) => {
      el.style.gridRow = `span ${Math.max(1, Math.ceil((h - 0.5) / ROW))}`;
    };
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const h = e.borderBoxSize?.[0]?.blockSize ?? (e.target as HTMLElement).getBoundingClientRect().height;
        snap(e.target as HTMLElement, h);
      }
    });
    // Read every height first, then write spans + observe, so the pass never interleaves reads and
    // writes (no forced relayout per cell).
    const sync = () => {
      const cells = Array.from(grid.children) as HTMLElement[];
      const heights = cells.map((el) => el.getBoundingClientRect().height);
      cells.forEach((el, i) => {
        snap(el, heights[i]);
        ro.observe(el); // observing an already-observed cell is a no-op
      });
    };
    sync(); // initial pass runs pre-paint, so no flash
    // Re-sync when cells are added/removed; the ResizeObserver already covers size changes.
    const mo = new MutationObserver(sync);
    mo.observe(grid, { childList: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
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
