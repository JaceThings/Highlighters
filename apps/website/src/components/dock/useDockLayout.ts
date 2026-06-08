import { useCallback, useLayoutEffect } from "react";
import { STEP, PEN_ORDER } from "./Marker.tsx";
import { DOCK_H } from "./constants.ts";
import type { DockTarget, DockSizes } from "./useDockDrag.ts";
import type { DockRefs } from "./dockRefs.ts";
import type { PenTip } from "../../selection-style.tsx";

// Selected pen centre offset from the tray centre within a dock layout, so the carried overlay lands
// exactly on the (hidden) row pen. Measured against the ROW/COLUMN (not the inset-0 layer): those carry
// the collapse "content freeze" transform, and so does the pen inside them, so the difference cancels it.
// (Measuring against the untransformed layer made the slot wrong by the freeze offset on release - the
// marker sprang to the wrong place then snapped.) The row/column is flex-centred, so its centre IS the
// tray centre at rest.
export function useSlotOffset({ horizontal, penBox, tray }: DockRefs, pen: PenTip) {
  return useCallback(
    (target: DockTarget) => {
      const trayRect = tray.current?.getBoundingClientRect();
      if (!trayRect) return { x: 0, y: 0 };
      const tcx = trayRect.left + trayRect.width / 2;
      const tcy = trayRect.top + trayRect.height / 2;

      if (target === "bottom") {
        const row = horizontal.current;
        const sel = row?.querySelector<HTMLElement>('.dock-pen[aria-pressed="true"]');
        if (!row || !sel) return { x: 0, y: 0 };
        const p = sel.getBoundingClientRect();
        return {
          x: p.left + p.width / 2 - tcx,
          y: p.top + p.height / 2 - tcy,
        };
      }
      // Side rows are rotated, and that rotation lags React state during a live preview - so measuring
      // the rotated pen reads a stale orientation. Derive it: the rotation-independent pen-box centre
      // plus the pen's along-row offset, rotated by the target angle (left +90, right -90).
      const box = penBox.current;
      if (!box) return { x: 0, y: 0 };
      const b = box.getBoundingClientRect();
      const bx = b.left + b.width / 2 - tcx;
      const by = b.top + b.height / 2 - tcy;
      const d = (Math.max(0, PEN_ORDER.indexOf(pen)) - 1) * STEP;
      return { x: bx, y: by + (target === "left" ? d : -d) };
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

// Feed the drag hook the natural layout sizes + viewport so it can place the resting/side tray. A
// ResizeObserver tracks tier/content changes; a deferred rAF pass + fonts.ready cover late layout.
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
