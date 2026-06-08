import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { AnimatePresence, m } from "framer-motion";
import { useRouterState } from "@tanstack/react-router";
import { MorphBackground } from "./MorphBackground.tsx";
import { CollapsedMarker } from "./CollapsedMarker.tsx";
import { ColorPalette } from "./ColorPalette.tsx";
import { ColorPickerPopover } from "./ColorPickerPopover.tsx";
import { DockNav, DockLinks } from "./DockButton.tsx";
import { MarkerRow, STEP, PEN_ORDER } from "./Marker.tsx";
import { MarkerPopover } from "./MarkerPopover.tsx";
import { hexToOklch, oklchToCss } from "./oklch.ts";
import { playMenuOpen, playMenuClose } from "../../lib/marker-audio.ts";
import { useSelectionStyle, type PenTip } from "../../selection-style.tsx";
import { useDockEntrance, useSkipDockEntrance } from "../../dock-entrance.tsx";
import { useDockTier } from "../../hooks/useDockTier.ts";
import { useDockDrag, type DockTarget } from "./useDockDrag.ts";
import { useBindMotion, useOpacityBind } from "./bindMotion.ts";
import { DOCK_H } from "./constants.ts";

// Start fully below the viewport so the tray rises in from the bottom.
const ENTER_FROM = DOCK_H + 96;

// Both popovers are this wide; clamps them inside the tray.
const POPOVER_W = 320;

// MarkerRow's natural box (3 pens x 71px - one gap, full DOCK_H tall). The vertical layout rotates
// the row 90deg, so its wrapper swaps these to reserve the rotated bounding box.
const ROW_W = 187;
const ROW_H = DOCK_H;

const ENTRANCE = {
  hidden: { y: ENTER_FROM, scale: 0.98, opacity: 0, filter: "blur(4px)" },
  shown: { y: 0, scale: 1, opacity: 1, filter: "blur(0px)" },
} as const;

interface Popover {
  kind: "marker" | "color";
  /** Activating button's center relative to the tray (x clamped for the bottom layout). */
  x: number;
  y: number;
}

/** The tool tray. The outer layer is pointer-events:none so only the capsule is interactive. */
export function Dock() {
  const { style, setColor, setPen, setOpacity, setMarkType } = useSelectionStyle();
  // Hold the entrance until the page's text cascade has landed.
  const { ready } = useDockEntrance();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Shed the colour palette as the window narrows (below the pen tier RootLayout swaps to MobileDock).
  const { showColors } = useDockTier();
  const skipEntrance = useSkipDockEntrance();

  const trayRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const featherRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const horizontalRef = useRef<HTMLDivElement>(null);
  const verticalRef = useRef<HTMLDivElement>(null);
  // The vertical layout's rotated marker-row box; its position is rotation-independent, so the slot
  // math reads it (not the lagging rotated pen) for the side docks.
  const penBoxRef = useRef<HTMLDivElement>(null);
  // Layer wrappers whose opacity is driven by the drag (the measured content sits inside them).
  const horizontalLayerRef = useRef<HTMLDivElement>(null);
  const verticalLayerRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<Popover | null>(null);
  const open = popover !== null;

  // Selected pen center offset from the tray center within a dock layout, so the carried overlay lands
  // exactly on the (hidden) row pen. Measured against the ROW/COLUMN (horizontalRef / verticalRef), not
  // the inset-0 layer: those carry the collapse "content freeze" transform, and so does the pen inside
  // them, so the difference cancels it. (Measuring against the layer, which has no freeze transform, made
  // the slot wrong by the freeze offset on release - the marker sprang to the wrong place then snapped.)
  // The row/column is flex-centred in its layer, so its centre IS the tray centre at rest.
  const getSlotOffset = useCallback(
    (target: DockTarget) => {
      if (target === "bottom") {
        // Bottom row isn't rotated; measure the selected pen directly.
        const row = horizontalRef.current;
        const pen = row?.querySelector<HTMLElement>('.dock-pen[aria-pressed="true"]');
        if (!row || !pen) return { x: 0, y: 0 };
        const p = pen.getBoundingClientRect();
        const r = row.getBoundingClientRect();
        return {
          x: p.left + p.width / 2 - (r.left + r.width / 2),
          y: p.top + p.height / 2 - (r.top + r.height / 2),
        };
      }
      // Side rows are rotated, and that rotation lags React state during a live preview - so measuring
      // the rotated pen reads a stale orientation. Derive it instead: the row-box centre (rotation-
      // independent) plus the pen's along-row offset rotated by the target angle (left +90, right -90).
      const col = verticalRef.current;
      const box = penBoxRef.current;
      if (!col || !box) return { x: 0, y: 0 };
      const b = box.getBoundingClientRect();
      const c = col.getBoundingClientRect();
      const bx = b.left + b.width / 2 - (c.left + c.width / 2);
      const by = b.top + b.height / 2 - (c.top + c.height / 2);
      const d = (Math.max(0, PEN_ORDER.indexOf(style.pen)) - 1) * STEP;
      return { x: bx, y: by + (target === "left" ? d : -d) };
    },
    [style.pen],
  );

  // The drag-to-dock state machine; closing the popover on drag start satisfies requirement 13.
  const dock = useDockDrag({ onDragStart: () => setPopover(null), getSlotOffset });
  const { phase, side, collapsed, preview, geometry, onHandlePointerDown, syncSizes } = dock;
  const vertical = phase === "side" || phase === "snapping";
  // The vertical layout's orientation follows the side being shown. A live side `preview` wins over the
  // committed `side`: dragging straight from one side dock to the other never clears `side`, so honouring
  // it would keep the row facing the origin (e.g. left) during the opposite (right) preview and only flip
  // on release. Fall back to `side` when there's no side preview (at rest, or previewing bottom/free).
  const shownSide =
    preview === "left" || preview === "right" ? preview : side;
  // The handle is grabbable at rest and while lifting the intact pill; it hides once collapsed.
  const handleVisible = phase === "bottom" || phase === "side" || (phase === "dragging" && !collapsed);
  // Handle/pill orientation follows the docked side (so lifting a side dock keeps it on the inner edge).
  const sideDocked = side !== null;

  // Feed the hook the natural layout sizes + viewport so it can place the resting/side tray.
  const measure = useCallback(() => {
    const h = horizontalRef.current;
    const v = verticalRef.current;
    syncSizes({
      horizontal: h ? { width: h.offsetWidth, height: h.offsetHeight } : { width: 0, height: DOCK_H },
      vertical: v ? { width: v.offsetWidth, height: v.offsetHeight } : { width: DOCK_H, height: 0 },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
  }, [syncSizes]);

  useLayoutEffect(() => {
    measure();
    // A ResizeObserver tracks tier/content changes; a deferred pass covers late layout (fonts,
    // first paint) so the resting capsule lands at its measured width without a manual resize.
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(() => measure());
    if (horizontalRef.current) ro.observe(horizontalRef.current);
    if (verticalRef.current) ro.observe(verticalRef.current);
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // Bloop on appear (open or switch kind); reversed bloop on close.
  const prevPopoverKind = useRef<string | null>(null);
  useEffect(() => {
    const kind = popover?.kind ?? null;
    const prev = prevPopoverKind.current;
    if (kind && kind !== prev) playMenuOpen();
    else if (!kind && prev) playMenuClose();
    prevPopoverKind.current = kind;
  }, [popover]);
  // Last custom ink, so reopening the picker returns to it from a preset swatch.
  const lastCustom = useRef("#a855f7");

  // Centre of `button` relative to the tray. x is clamped so a centred bottom popover stays inside.
  const centerOf = useCallback((button: HTMLButtonElement) => {
    const tray = trayRef.current;
    if (!tray) return null;
    const a = button.getBoundingClientRect();
    const b = tray.getBoundingClientRect();
    const half = POPOVER_W / 2;
    const rawX = a.left + a.width / 2 - b.left;
    const x = Math.max(half, Math.min(b.width - half, rawX));
    const y = a.top + a.height / 2 - b.top;
    return { x, y };
  }, []);

  const handleActivate = useCallback(
    (button: HTMLButtonElement) => {
      const c = centerOf(button);
      if (!c) return;
      setPopover((prev) => (prev?.kind === "marker" ? null : { kind: "marker", ...c }));
    },
    [centerOf],
  );

  const handleActivateCustom = useCallback(
    (button: HTMLButtonElement) => {
      const c = centerOf(button);
      if (!c) return;
      setPopover((prev) => (prev?.kind === "color" ? null : { kind: "color", ...c }));
      // Seed the picker from the remembered custom ink when leaving a preset.
      if (style.color !== lastCustom.current) setColor(lastCustom.current);
    },
    [centerOf, setColor, style.color],
  );

  const handleCustomColor = useCallback(
    (hex: string) => {
      lastCustom.current = hex;
      setColor(hex);
    },
    [setColor],
  );

  // Switching to a different pen closes the popover (it belongs to the prior pen).
  const handleSelectPen = useCallback(
    (pen: PenTip) => {
      setPen(pen);
      setPopover(null);
    },
    [setPen],
  );

  // A preset swatch closes the picker; it replaces the custom ink.
  const handleSelectColor = useCallback(
    (color: string) => {
      setColor(color);
      setPopover((prev) => (prev?.kind === "color" ? null : prev));
    },
    [setColor],
  );

  // If a shrink hides the colour palette, close its popover.
  useEffect(() => {
    if (!showColors) setPopover((prev) => (prev?.kind === "color" ? null : prev));
  }, [showColors]);

  // Close on Escape or a press outside the tray. The popover is a tray DOM child, so clicks on it keep it open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!trayRef.current?.contains(e.target as Node)) setPopover(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopover(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const penColor = oklchToCss(hexToOklch(style.color));
  // Pens lie sideways with nibs pointing inward, toward the canvas (left dock -> +90, right -> -90).
  const penDeg = shownSide === "right" ? -90 : 90;

  // Geometry is applied to plain DOM (not `m`-component style) so framer never reads it back.
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
  // Feather follows the morph radius and only shows (opacity) while the shape is transitioning.
  const applyFeather = useCallback(
    (el: HTMLElement | SVGElement) => {
      const s = el as HTMLElement;
      s.style.borderRadius = `${geometry.cornerRadius.get()}px`;
      s.style.opacity = String(geometry.feather.get());
    },
    [geometry],
  );
  useBindMotion(trayRef, [geometry.x, geometry.y, geometry.width, geometry.height], applyTray);
  useBindMotion(clipRef, [geometry.cornerRadius], applyClip);

  // The feather overlay hugs the morph radius and only fades in while the shape is actively morphing.
  useBindMotion(featherRef, [geometry.cornerRadius, geometry.feather], applyFeather);
  // While the contents fade away on collapse, hold them at the on-screen centre they had when the
  // collapse began (counter the morphing tray) so the capsule->circle narrowing never pushes them
  // sideways - they dissolve in place. Off (no transform) at every other time, so contents fading IN
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
  const freezeDeps = [geometry.x, geometry.y, geometry.width, geometry.height, geometry.frozen, geometry.freezeCx, geometry.freezeCy];
  useBindMotion(horizontalRef, freezeDeps, applyContentFreeze);
  useBindMotion(verticalRef, freezeDeps, applyContentFreeze);
  useOpacityBind(horizontalLayerRef, geometry.horizontalOpacity);
  useOpacityBind(verticalLayerRef, geometry.verticalOpacity);
  // Backdrop opacity tracks the collapse state via markerReveal (0 at a dock slot/preview, 1 in the
  // circle): a clean capsule-white disc fades in behind the carried marker as the dock collapses, so
  // the still-fading nav/pens/palette can't ghost around the selected pen; it fades back out on expand.
  useOpacityBind(backdropRef, geometry.markerReveal);

  // Grab handle: top-centre in the bottom layout, inner-edge centre when side-docked.
  const handleStyle: CSSProperties = sideDocked
    ? {
        position: "absolute",
        top: "50%",
        transform: "translateY(-50%)",
        width: 16,
        height: 64,
        ...(side === "left" ? { right: 2 } : { left: 2 }),
      }
    : {
        position: "absolute",
        top: 2,
        left: "50%",
        transform: "translateX(-50%)",
        width: 64,
        height: 16,
      };
  const pillStyle: CSSProperties = sideDocked
    ? { width: 5.943, height: 42.787 }
    : { width: 42.787, height: 5.943 };

  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 select-none overflow-hidden"
      aria-label="Highlighter tray"
    >
      <div
        ref={trayRef}
        className="pointer-events-auto absolute"
        style={{ top: 0, left: 0, width: 0, height: DOCK_H, willChange: "transform, width, height" }}
      >
        <m.div
          className="absolute inset-0"
          variants={ENTRANCE}
          initial={skipEntrance ? false : "hidden"}
          animate={skipEntrance || ready ? "shown" : "hidden"}
          transition={{
            type: "spring",
            duration: 0.85,
            bounce: 0.3,
            delay: 0.12,
            opacity: { duration: 0.5, ease: "easeOut", delay: 0.12 },
            filter: { duration: 0.6, ease: "easeOut", delay: 0.12 },
          }}
        >
          <MorphBackground
            width={geometry.width}
            height={geometry.height}
            cornerRadius={geometry.cornerRadius}
          />

          {/* Clips the controls to the morphing shape so fades never spill outside it. Always on; the
              carried pen is NOT inside this clip (it rides above with its own gradual clip), so the
              full-size marker can extend past the circle with no overflow toggle and no flash. */}
          <div ref={clipRef} className="absolute inset-0 overflow-hidden">

          {/* Horizontal (bottom) layout. inert keeps the hidden layout out of the tab order. */}
          <div
            ref={horizontalLayerRef}
            inert={phase !== "bottom"}
            className="absolute inset-0 flex items-center justify-center"
            style={{
              opacity: 1,
              pointerEvents: phase === "bottom" ? "auto" : "none",
            }}
          >
            <div
              ref={horizontalRef}
              className="relative flex shrink-0 items-center gap-[32px]"
              style={{ width: "max-content", height: DOCK_H }}
            >
              <DockNav pathname={pathname} className="pr-[25px] pl-[32px]" />
              <div className="flex h-full items-center gap-[40px]">
                <div className="flex h-full items-end">
                  <MarkerRow
                    color={style.color}
                    selected={style.pen}
                    opacityByPen={style.opacityByPen}
                    onSelect={handleSelectPen}
                    onActivate={handleActivate}
                    hideSelected={geometry.markerOpacity}
                  />
                </div>
                {showColors && (
                  <ColorPalette
                    value={style.color}
                    onChange={handleSelectColor}
                    onActivateCustom={handleActivateCustom}
                  />
                )}
              </div>
              <DockLinks className="pr-[32px]" />
            </div>
          </div>

          {/* Vertical (side-docked) layout: nav -> pens -> colors -> links, pens rotated inward. */}
          <div
            ref={verticalLayerRef}
            inert={phase !== "side"}
            className="absolute inset-0 flex items-center justify-center"
            style={{
              opacity: 0,
              pointerEvents: phase === "side" ? "auto" : "none",
            }}
          >
            {/* Spacing mirrors the bottom capsule exactly (rotated 90deg): 32px edges (py-32),
                nav->pens 57px (nav pb-25 + the 32 gap), pens->colours 40px (the inner group), and
                colours->links 32px (the gap). Keeps the rhythm identical between the two orientations. */}
            <div
              ref={verticalRef}
              className="flex shrink-0 flex-col items-center gap-[32px] py-[32px]"
              style={{ width: "max-content" }}
            >
              <DockNav pathname={pathname} className="flex-col pb-[25px]" />
              <div className="flex flex-col items-center gap-[40px]">
                <div ref={penBoxRef} style={{ position: "relative", width: ROW_H, height: ROW_W }}>
                  <div
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: `translate(-50%, -50%) rotate(${penDeg}deg)`,
                    }}
                  >
                    <MarkerRow
                      color={style.color}
                      selected={style.pen}
                      opacityByPen={style.opacityByPen}
                      onSelect={handleSelectPen}
                      onActivate={handleActivate}
                      hideSelected={geometry.markerOpacity}
                    />
                  </div>
                </div>
                {showColors && (
                  <ColorPalette
                    value={style.color}
                    onChange={handleSelectColor}
                    onActivateCustom={handleActivateCustom}
                    columns={2}
                    mirror={shownSide === "left"}
                  />
                )}
              </div>
              <DockLinks className="flex-col" />
            </div>
          </div>

          {/* Feathered mask edge: a soft white inset (the capsule colour) over the content so items
              dissolve into the capsule near the boundary instead of meeting the clip as a hard cut.
              Only shown (opacity) while the shape is morphing; invisible at rest and in the circle. */}
          <div
            ref={featherRef}
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ boxShadow: "inset 0 0 16px 5px #fff", opacity: 0 }}
          />

          {/* Capsule-white backdrop behind the carried marker: sits ABOVE the content layers (masking
              the still-fading nav/pens/palette so they can't ghost around the selected pen) and BELOW
              the carried marker (which paints on top). It's clipped by the same morphing shape (clipRef),
              so it never shows outside the circle. Its opacity is markerReveal: invisible at a dock
              slot/preview (the full dock layout shows + the marker->row hand-off stays seamless), fully
              white in the circle, fading in/out as the dock collapses/expands. */}
          <div
            ref={backdropRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-white"
            style={{ opacity: 0 }}
          />

          {/* The carried pen lives INSIDE the content clip, so the morphing shape masks it: a flat
              floor at a dock slot, the round circle in collapse - it's clipped to the shape (the pen
              SVG masked by the circle's curve), not a flat horizontal cut. The clip never toggles
              (always overflow:hidden), so there's no flash entering/leaving the circle. */}
          <CollapsedMarker
            pen={style.pen}
            color={penColor}
            pct={Math.round(style.opacity * 100)}
            rotation={geometry.penRotation}
            offsetX={geometry.markerOffsetX}
            offsetY={geometry.markerOffsetY}
            reveal={geometry.markerReveal}
            opacity={geometry.markerOpacity}
            shapeWidth={geometry.width}
            shapeHeight={geometry.height}
          />
          </div>

          {/* Grab handle: shown at rest + while lifting; fades out once collapsed into the circle. */}
          <m.div
            aria-hidden
            onPointerDown={onHandlePointerDown}
            className="flex items-center justify-center"
            style={{
              ...handleStyle,
              cursor: phase === "dragging" ? "grabbing" : "grab",
              touchAction: "none",
              pointerEvents: handleVisible ? "auto" : "none",
            }}
            initial={false}
            animate={{ opacity: handleVisible ? 1 : 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <span className="rounded-full bg-[#efeeed]" style={pillStyle} />
          </m.div>
        </m.div>

        <AnimatePresence>
          {open && popover && (
            <m.div
              key={popover.kind === "color" ? "color-popover" : "marker-popover"}
              className="absolute"
              style={
                vertical
                  ? {
                      top: popover.y,
                      transformOrigin: side === "left" ? "left center" : "right center",
                      ...(side === "left"
                        ? { left: "calc(100% + 14px)" }
                        : { right: "calc(100% + 14px)" }),
                    }
                  : {
                      left: popover.x,
                      bottom: "calc(100% + 14px)",
                      transformOrigin: "bottom center",
                    }
              }
              initial={
                vertical
                  ? { opacity: 0, scale: 0.96, x: side === "left" ? -6 : 6, y: "-50%" }
                  : { opacity: 0, scale: 0.96, y: 6, x: "-50%" }
              }
              animate={
                vertical
                  ? { opacity: 1, scale: 1, x: 0, y: "-50%" }
                  : { opacity: 1, scale: 1, y: 0, x: "-50%" }
              }
              exit={
                vertical
                  ? { opacity: 0, scale: 0.97, x: side === "left" ? -4 : 4, y: "-50%" }
                  : { opacity: 0, scale: 0.97, y: 4, x: "-50%" }
              }
              transition={{ type: "spring", duration: 0.3, bounce: 0 }}
            >
              {popover.kind === "color" ? (
                <ColorPickerPopover color={style.color} onChange={handleCustomColor} />
              ) : (
                <MarkerPopover
                  inkColor={style.color}
                  pen={style.pen}
                  opacity={style.opacity}
                  markType={style.markType}
                  onOpacity={setOpacity}
                  onMarkType={setMarkType}
                />
              )}
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
