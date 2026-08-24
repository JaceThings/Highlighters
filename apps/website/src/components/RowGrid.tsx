import { Children, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

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
    const snap = (el: HTMLElement, h: number) => {
      el.style.gridRow = `span ${Math.max(1, Math.ceil((h - 0.5) / ROW))}`;
    };
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cell = e.target;
        if (!(cell instanceof HTMLElement)) continue;
        const h = e.borderBoxSize?.[0]?.blockSize ?? cell.getBoundingClientRect().height;
        snap(cell, h);
      }
    });
    const sync = () => {
      const cells = Array.from(grid.children).filter((el) => el instanceof HTMLElement);
      const heights = cells.map((el) => el.getBoundingClientRect().height);
      cells.forEach((el, i) => {
        snap(el, heights[i]);
        ro.observe(el);
      });
    };
    sync();
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
