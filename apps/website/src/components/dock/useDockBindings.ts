import { useCallback } from "react";
import { useBindMotion, useOpacityBind } from "./bindMotion.ts";
import type { DockGeometry } from "./useDockDrag.ts";
import type { DockRefs } from "./dockRefs.ts";

// Imperative MotionValue → DOM bindings (avoids framer reading values back into our MotionValues).
export function useDockBindings(geometry: DockGeometry, refs: DockRefs) {
  const { tray, clip, feather, backdrop, horizontal, vertical, horizontalLayer, verticalLayer } = refs;

  const applyTray = useCallback(
    (el: HTMLElement | SVGElement) => {
      el.style.width = `${geometry.width.get()}px`;
      el.style.height = `${geometry.height.get()}px`;
      el.style.transform = `translate3d(${geometry.x.get()}px, ${geometry.y.get()}px, 0)`;
    },
    [geometry],
  );
  const applyClip = useCallback(
    (el: HTMLElement | SVGElement) => {
      (el as HTMLElement).style.borderRadius = `${geometry.cornerRadius.get()}px`;
    },
    [geometry],
  );
  const applyFeather = useCallback(
    (el: HTMLElement | SVGElement) => {
      const s = el as HTMLElement;
      s.style.borderRadius = `${geometry.cornerRadius.get()}px`;
      s.style.opacity = String(geometry.feather.get());
    },
    [geometry],
  );
  // Counter-translate contents during collapse so they dissolve in place instead of sliding sideways.
  const applyContentFreeze = useCallback(
    (el: HTMLElement | SVGElement) => {
      const s = el as HTMLElement;
      if (geometry.frozen.get() < 0.5) {
        s.style.transform = "";
        return;
      }
      const cx = geometry.x.get() + geometry.width.get() / 2;
      const cy = geometry.y.get() + geometry.height.get() / 2;
      s.style.transform = `translate(${geometry.freezeCx.get() - cx}px, ${geometry.freezeCy.get() - cy}px)`;
    },
    [geometry],
  );

  useBindMotion(tray, [geometry.x, geometry.y, geometry.width, geometry.height], applyTray);
  useBindMotion(clip, [geometry.cornerRadius], applyClip);
  useBindMotion(feather, [geometry.cornerRadius, geometry.feather], applyFeather);
  const freeze = [geometry.x, geometry.y, geometry.width, geometry.height, geometry.frozen, geometry.freezeCx, geometry.freezeCy];
  useBindMotion(horizontal, freeze, applyContentFreeze);
  useBindMotion(vertical, freeze, applyContentFreeze);
  useOpacityBind(horizontalLayer, geometry.horizontalOpacity);
  useOpacityBind(verticalLayer, geometry.verticalOpacity);
  useOpacityBind(backdrop, geometry.markerReveal);
}
