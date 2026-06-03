import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouterState } from "@tanstack/react-router";
import { CapsuleBackground } from "./CapsuleBackground.tsx";
import { ColorPalette } from "./ColorPalette.tsx";
import { DockButton } from "./DockButton.tsx";
import { MarkerRow } from "./Marker.tsx";
import { MarkerPopover } from "./MarkerPopover.tsx";
import { BookIcon, HomeIcon, PersonIcon, StarIcon } from "../../icons/sf/index.tsx";
import { useSelectionStyle, type PenTip } from "../../selection-style.tsx";
import { useDockEntrance } from "../../dock-entrance.tsx";
import { DOCK_H } from "./constants.ts";

// Start the tray fully below the viewport so it rises in from the bottom.
const ENTER_FROM = DOCK_H + 96;

const ENTRANCE = {
  hidden: { y: ENTER_FROM, scale: 0.98, opacity: 0, filter: "blur(4px)" },
  shown: { y: 0, scale: 1, opacity: 1, filter: "blur(0px)" },
} as const;

/** The tool tray. The outer layer is pointer-events:none so only the capsule is
 *  interactive. */
export function Dock() {
  const { style, setColor, setPen, setOpacity, setMarkType } = useSelectionStyle();
  // Hold the entrance until the page's text cascade has landed.
  const { ready } = useDockEntrance();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // `popoverX` = the active pen's centre relative to the tray (null = closed).
  const trayRef = useRef<HTMLDivElement>(null);
  const [popoverX, setPopoverX] = useState<number | null>(null);
  const open = popoverX !== null;

  const handleActivate = useCallback((button: HTMLButtonElement) => {
    setPopoverX((prev) => {
      if (prev !== null) return null;
      const tray = trayRef.current;
      if (!tray) return null;
      const a = button.getBoundingClientRect();
      const b = tray.getBoundingClientRect();
      return a.left + a.width / 2 - b.left;
    });
  }, []);

  // Switching to a different pen closes the popover (it belongs to the prior pen).
  const handleSelectPen = useCallback(
    (pen: PenTip) => {
      setPen(pen);
      setPopoverX(null);
    },
    [setPen],
  );

  // Close on Escape or a press outside the tray. The popover is a DOM child of the
  // tray, so clicks on it (or the palette) keep it open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!trayRef.current?.contains(e.target as Node)) setPopoverX(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopoverX(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex select-none justify-center"
      aria-label="Highlighter tray"
    >
      <motion.div
        ref={trayRef}
        className="pointer-events-auto relative max-w-[calc(100vw-32px)]"
        style={{ height: DOCK_H }}
        variants={ENTRANCE}
        initial="hidden"
        animate={ready ? "shown" : "hidden"}
        transition={{
          type: "spring",
          duration: 0.85,
          bounce: 0.3,
          delay: 0.12,
          opacity: { duration: 0.5, ease: "easeOut", delay: 0.12 },
          filter: { duration: 0.6, ease: "easeOut", delay: 0.12 },
        }}
      >
        <CapsuleBackground />

        <div className="relative flex h-full items-center gap-[32px]">
          <nav className="flex items-center gap-[12px] pr-[25px] pl-[32px]">
            <DockButton to="/" label="Home" active={pathname === "/"}>
              <HomeIcon />
            </DockButton>
            <DockButton to="/docs" label="Docs" active={pathname === "/docs"}>
              <BookIcon />
            </DockButton>
          </nav>

          <div className="flex h-full items-center gap-[40px]">
            <div className="flex h-full items-end">
              <MarkerRow
                color={style.color}
                selected={style.pen}
                opacityByPen={style.opacityByPen}
                onSelect={handleSelectPen}
                onActivate={handleActivate}
              />
            </div>
            <ColorPalette value={style.color} onChange={setColor} />
          </div>

          <div className="flex items-center gap-[12px] pr-[32px]">
            <DockButton label="Star" href="https://github.com/JaceThings/highlighters">
              <StarIcon />
            </DockButton>
            <DockButton label="Follow" href="https://ja.mt">
              <PersonIcon />
            </DockButton>
          </div>
        </div>

        <div
          aria-hidden
          className="absolute top-[7.5px] left-1/2 -translate-x-1/2 rounded-full bg-[#efeeed]"
          style={{ width: 42.787, height: 5.943 }}
        />

        <AnimatePresence>
          {open && (
            <motion.div
              key="marker-popover"
              className="absolute"
              style={{
                left: popoverX ?? 0,
                bottom: "calc(100% + 14px)",
                transformOrigin: "bottom center",
              }}
              initial={{ opacity: 0, scale: 0.96, y: 6, x: "-50%" }}
              animate={{ opacity: 1, scale: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, scale: 0.97, y: 4, x: "-50%" }}
              transition={{ type: "spring", duration: 0.3, bounce: 0 }}
            >
              <MarkerPopover
                inkColor={style.color}
                pen={style.pen}
                opacity={style.opacity}
                markType={style.markType}
                onOpacity={setOpacity}
                onMarkType={setMarkType}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
