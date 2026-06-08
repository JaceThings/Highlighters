import { useCallback } from "react";
import { useBindMotion, useOpacityBind } from "./bindMotion.ts";
import type { DockGeometry } from "./useDockDrag.ts";
import type { DockRefs } from "./dockRefs.ts";

// Bind the drag hook's animated geometry to the dock DOM imperatively - NOT via `m`-component style
// props, so framer never reads the values back into the externally-owned MotionValues. This is the one
// place every per-frame DOM write lives: the tray box + transform, the morph-radius clip, the feather
// edge, the collapse "content freeze" counter-translate, and the layer/backdrop opacities.
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
  // Clip the contents to the morphing rounded-rect silhouette so faded items never spill outside it.
  const applyClip = useCallback(
    (el: HTMLElement | SVGElement) => {
      (el as HTMLElement).style.borderRadius = `${geometry.cornerRadius.get()}px`;
    },
    [geometry],
  );
  // Feather hugs the morph radius and only shows (opacity) while the shape is transitioning.
  const applyFeather = useCallback(
    (el: HTMLElement | SVGElement) => {
      const s = el as HTMLElement;
      s.style.borderRadius = `${geometry.cornerRadius.get()}px`;
      s.style.opacity = String(geometry.feather.get());
    },
    [geometry],
  );
  // While the contents fade away on collapse, hold them at the on-screen centre they had when the
  // collapse began (counter the morphing tray) so the capsule->circle narrowing never pushes them
  // sideways - they dissolve in place. No transform at every other time, so contents fading IN
  // (preview/return) sit in their normal slots.
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
  const freezeDeps = [geometry.x, geometry.y, geometry.width, geometry.height, geometry.frozen, geometry.freezeCx, geometry.freezeCy];
  useBindMotion(horizontal, freezeDeps, applyContentFreeze);
  useBindMotion(vertical, freezeDeps, applyContentFreeze);
  useOpacityBind(horizontalLayer, geometry.horizontalOpacity);
  useOpacityBind(verticalLayer, geometry.verticalOpacity);
  // Capsule-white disc fades in behind the carried marker as the dock collapses (markerReveal: 0 at a
  // dock slot/preview, 1 in the circle) so the still-fading contents can't ghost around the pen.
  useOpacityBind(backdrop, geometry.markerReveal);
}
