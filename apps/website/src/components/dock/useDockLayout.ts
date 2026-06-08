import { useCallback, useLayoutEffect } from "react";
import { STEP, PEN_ORDER } from "./Marker.tsx";
import { DOCK_H } from "./constants.ts";
import type { DockTarget, DockSizes } from "./useDockDrag.ts";
import type { DockRefs } from "./dockRefs.ts";
import type { PenTip } from "../../selection-style.tsx";

const rectCenter = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

// Carried-pen slot offset from tray centre. Measure the row/column (not the inset-0 layer): both carry
// the collapse freeze transform, so the difference cancels it on release.
export function useSlotOffset({ horizontal, penBox, tray }: DockRefs, pen: PenTip) {
  return useCallback(
    (target: DockTarget) => {
      const trayRect = tray.current?.getBoundingClientRect();
      if (!trayRect) return { x: 0, y: 0 };
      const tc = rectCenter(trayRect);

      if (target === "bottom") {
        const row = horizontal.current;
        const sel = row?.querySelector<HTMLElement>('.dock-pen[aria-pressed="true"]');
        if (!row || !sel) return { x: 0, y: 0 };
        const pc = rectCenter(sel.getBoundingClientRect());
        return { x: pc.x - tc.x, y: pc.y - tc.y };
      }
      // Side preview lags row rotation in React; derive slot from the pen-box centre + along-row offset.
      const box = penBox.current;
      if (!box) return { x: 0, y: 0 };
      const bc = rectCenter(box.getBoundingClientRect());
      const d = (Math.max(0, PEN_ORDER.indexOf(pen)) - 1) * STEP;
      return { x: bc.x - tc.x, y: bc.y - tc.y + (target === "left" ? d : -d) };
    },
    [horizontal, penBox, tray, pen],
  );
}

/** Read the dock content stacks' natural sizes + viewport (synchronous layout read). */
export function readDockSizes({ horizontal, vertical }: DockRefs): DockSizes {
  const h = horizontal.current;
  const v = vertical.current;
  return {
    horizontal: h ? { width: h.offsetWidth, height: h.offsetHeight } : { width: 0, height: DOCK_H },
    vertical: v ? { width: v.offsetWidth, height: v.offsetHeight } : { width: DOCK_H, height: 0 },
    viewport: { width: window.innerWidth, height: window.innerHeight },
  };
}

/** Sync layout sizes into the drag hook (ResizeObserver + rAF + fonts.ready). */
export function useDockMeasure(
  refs: DockRefs,
  syncSizes: (sizes: DockSizes) => void,
): () => DockSizes {
  const measure = useCallback(() => {
    syncSizes(readDockSizes(refs));
  }, [refs, syncSizes]);

  useLayoutEffect(() => {
    measure();
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(() => measure());
    if (refs.horizontal.current) ro.observe(refs.horizontal.current);
    if (refs.vertical.current) ro.observe(refs.vertical.current);
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, refs]);

  return useCallback(() => readDockSizes(refs), [refs]);
}
