import { useCallback, useLayoutEffect } from "react";
import { STEP, PEN_ORDER } from "./Marker.tsx";
import { DOCK_H } from "./constants.ts";
import type { DockTarget, DockSizes } from "./useDockDrag.ts";
import type { DockRefs } from "./dockRefs.ts";
import type { PenTip } from "../../selection-style.tsx";

const rectCenter = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

export function useSlotOffset({ horizontal, penBox, tray }: DockRefs, pen: PenTip) {
  return useCallback(
    (target: DockTarget) => {
      const trayRect = tray.current?.getBoundingClientRect();
      if (!trayRect) return { x: 0, y: 0 };
      const tc = rectCenter(trayRect);

      if (target === "bottom" || target === "top") {
        const row = horizontal.current;
        const sel = row?.querySelector<HTMLElement>('.dock-pen[aria-pressed="true"]');
        if (!row || !sel) return { x: 0, y: 0 };
        const pc = rectCenter(sel.getBoundingClientRect());
        return { x: pc.x - tc.x, y: pc.y - tc.y };
      }
      const box = penBox.current;
      if (!box) return { x: 0, y: 0 };
      const bc = rectCenter(box.getBoundingClientRect());
      const d = (Math.max(0, PEN_ORDER.indexOf(pen)) - 1) * STEP;
      return { x: bc.x - tc.x, y: bc.y - tc.y + (target === "left" ? d : -d) };
    },
    [horizontal, penBox, tray, pen],
  );
}

export function readDockSizes({ horizontal, vertical }: DockRefs): DockSizes {
  const h = horizontal.current;
  const v = vertical.current;
  return {
    horizontal: h ? { width: h.offsetWidth, height: h.offsetHeight } : { width: 0, height: DOCK_H },
    vertical: v ? { width: v.offsetWidth, height: v.offsetHeight } : { width: DOCK_H, height: 0 },
    viewport: { width: window.innerWidth, height: window.innerHeight },
  };
}

export function useDockMeasure(
  refs: DockRefs,
  syncSizes: (sizes: DockSizes) => void,
): () => DockSizes {
  const measure = useCallback(() => {
    syncSizes(readDockSizes(refs));
  }, [refs, syncSizes]);

  useLayoutEffect(() => {
    let raf = 0;
    let disposed = false;
    const schedule = () => {
      if (disposed || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        measure();
      });
    };
    measure();
    schedule();
    const ro = new ResizeObserver(schedule);
    if (refs.horizontal.current) ro.observe(refs.horizontal.current);
    if (refs.vertical.current) ro.observe(refs.vertical.current);
    window.addEventListener("resize", schedule);
    document.fonts?.ready.then(schedule).catch(() => {});
    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [measure, refs]);

  return useCallback(() => readDockSizes(refs), [refs]);
}
