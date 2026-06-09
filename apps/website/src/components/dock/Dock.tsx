import { useCallback, useRef } from "react";
import { m } from "framer-motion";
import { useRouterState } from "@tanstack/react-router";
import { MorphBackground } from "./MorphBackground.tsx";
import { CollapsedMarker } from "./CollapsedMarker.tsx";
import { ColorPalette } from "./ColorPalette.tsx";
import { DockNav, DockLinks } from "./DockButton.tsx";
import { MarkerRow } from "./Marker.tsx";
import { DockHandle } from "./DockHandle.tsx";
import { DockPopover } from "./DockPopover.tsx";
import { useDockPopover } from "./useDockPopover.ts";
import { useDockBindings } from "./useDockBindings.ts";
import { readDockSizes, useSlotOffset, useDockMeasure } from "./useDockLayout.ts";
import { hexToOklch, oklchToCss } from "./oklch.ts";
import { useSelectionStyle, type PenTip } from "../../selection-style.tsx";
import { useDockEntrance, useSkipDockEntrance } from "../../dock-entrance.tsx";
import { dockContentAxis, useDockTier } from "../../hooks/useDockTier.ts";
import { useDockDrag } from "./useDockDrag.ts";
import type { DockRefs } from "./dockRefs.ts";
import { DOCK_H, ROW_W, ROW_H } from "./constants.ts";

// Start fully below the viewport so the tray rises in from the bottom.
const ENTER_FROM = DOCK_H + 96;

const ENTRANCE = {
  hidden: { y: ENTER_FROM, scale: 0.98, opacity: 0, filter: "blur(4px)" },
  shown: { y: 0, scale: 1, opacity: 1, filter: "blur(0px)" },
} as const;

/** The tool tray. The outer layer is pointer-events:none so only the capsule is interactive. */
export function Dock() {
  const { style, setColor, setPen, setOpacity, setMarkType } = useSelectionStyle();
  // Hold the entrance until the page's text cascade has landed.
  const { ready } = useDockEntrance();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Each stack measures against its own axis so bottom<->side morphs never read a stale height/width.
  const widthTier = useDockTier("width");
  const heightTier = useDockTier("height");
  const skipEntrance = useSkipDockEntrance();

  const refs: DockRefs = {
    tray: useRef<HTMLDivElement>(null),
    clip: useRef<HTMLDivElement>(null),
    feather: useRef<HTMLDivElement>(null),
    backdrop: useRef<HTMLDivElement>(null),
    horizontal: useRef<HTMLDivElement>(null),
    vertical: useRef<HTMLDivElement>(null),
    penBox: useRef<HTMLDivElement>(null),
    horizontalLayer: useRef<HTMLDivElement>(null),
    verticalLayer: useRef<HTMLDivElement>(null),
  };

  const getSlotOffset = useSlotOffset(refs, style.pen);
  // Popover close is wired into drag-start after useDockPopover runs; ref avoids a TDZ on showColors.
  const closePopoverRef = useRef<() => void>(() => {});
  const dock = useDockDrag({
    onDragStart: () => closePopoverRef.current(),
    getSlotOffset,
    measureSizes: () => readDockSizes(refs),
  });
  const { phase, side, collapsed, preview, geometry, onHandlePointerDown, syncSizes } = dock;
  useDockMeasure(refs, syncSizes);
  useDockBindings(geometry, refs);

  const vertical = dockContentAxis(phase, side, preview, collapsed) === "height";
  const activeTier = vertical ? heightTier : widthTier;

  const {
    popover: activePopover,
    close: closePopover,
    handleActivate,
    handleActivateCustom,
    handleCustomColor,
    handleSelectColor,
  } = useDockPopover({ trayRef: refs.tray, color: style.color, setColor, showColors: activeTier.showColors });
  closePopoverRef.current = closePopover;
  // Live side `preview` wins over committed `side` so cross-side drags flip orientation immediately.
  const shownSide = preview === "left" || preview === "right" ? preview : side;
  const handleVisible = !collapsed;
  const penColor = oklchToCss(hexToOklch(style.color));
  // Pens lie sideways with nibs pointing inward, toward the canvas (left dock -> +90, right -> -90).
  const penDeg = shownSide === "right" ? -90 : 90;
  const handleSide = shownSide === "left" || shownSide === "right" ? shownSide : null;

  // Switching to a different pen closes the popover (it belongs to the prior pen).
  const handleSelectPen = useCallback(
    (pen: PenTip) => {
      setPen(pen);
      closePopover();
    },
    [setPen, closePopover],
  );

  // Identical wiring for the pen row + palette in both layouts, bundled so the two can't drift apart.
  const markerRowProps = {
    color: style.color,
    selected: style.pen,
    opacityByPen: style.opacityByPen,
    onSelect: handleSelectPen,
    onActivate: handleActivate,
    hideSelected: geometry.markerOpacity,
  };
  const paletteProps = {
    value: style.color,
    onChange: handleSelectColor,
    onActivateCustom: handleActivateCustom,
  };

  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 select-none overflow-hidden"
      aria-label="Highlighter tray"
    >
      <div
        ref={refs.tray}
        data-dock-tray
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

          <div ref={refs.clip} className="absolute inset-0 overflow-hidden">
            <div
              ref={refs.horizontalLayer}
              inert={phase !== "bottom" && phase !== "top"}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div
                ref={refs.horizontal}
                className="relative flex shrink-0 items-center gap-[32px]"
                style={{ width: "max-content", height: DOCK_H }}
              >
                <DockNav pathname={pathname} className="pr-[25px] pl-[32px]" />
                <div className="flex h-full items-center gap-[40px]">
                  <div className="flex h-full items-end">
                    <MarkerRow {...markerRowProps} />
                  </div>
                  {widthTier.showColors && <ColorPalette {...paletteProps} />}
                </div>
                <DockLinks className="pr-[32px]" />
              </div>
            </div>

            {/* Side layout: nav → pens → colours → links; spacing mirrors the bottom capsule rotated 90°. */}
            <div
              ref={refs.verticalLayer}
              inert={phase !== "side"}
              className="absolute inset-0 flex items-center justify-center"
              style={{ opacity: 0 }}
            >
              <div
                ref={refs.vertical}
                className="flex shrink-0 flex-col items-center gap-[32px] py-[32px]"
                style={{ width: "max-content" }}
              >
                <DockNav pathname={pathname} className="flex-col pb-[25px]" />
                {(heightTier.showPens || heightTier.showColors) && (
                  <div className="flex flex-col items-center gap-[40px]">
                    {heightTier.showPens && (
                      <div ref={refs.penBox} style={{ position: "relative", width: ROW_H, height: ROW_W }}>
                        <div
                          style={{
                            position: "absolute",
                            top: "50%",
                            left: "50%",
                            transform: `translate(-50%, -50%) rotate(${penDeg}deg)`,
                          }}
                        >
                          <MarkerRow {...markerRowProps} />
                        </div>
                      </div>
                    )}
                    {heightTier.showColors && (
                      <ColorPalette {...paletteProps} columns={2} mirror={shownSide === "left"} />
                    )}
                  </div>
                )}
                <DockLinks className="flex-col" />
              </div>
            </div>

            <div
              ref={refs.feather}
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ boxShadow: "inset 0 0 16px 5px #fff", opacity: 0 }}
            />

            <div
              ref={refs.backdrop}
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-white"
              style={{ opacity: 0 }}
            />

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

          <DockHandle
            phase={phase}
            side={handleSide}
            visible={handleVisible}
            onPointerDown={onHandlePointerDown}
          />
        </m.div>

        <DockPopover
          popover={activePopover}
          vertical={vertical}
          side={side}
          style={style}
          onCustomColor={handleCustomColor}
          onOpacity={setOpacity}
          onMarkType={setMarkType}
        />
      </div>
    </div>
  );
}
