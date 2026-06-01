import { motion } from "framer-motion";
import { CapsuleBackground } from "./CapsuleBackground.tsx";
import { ColorPalette } from "./ColorPalette.tsx";
import { DockButton } from "./DockButton.tsx";
import { MarkerRow } from "./Marker.tsx";
import { BookIcon, HomeIcon, PersonIcon, StarIcon } from "../../icons/sf/index.tsx";
import { useSelectionStyle } from "../../selection-style.tsx";
import { useDockEntrance } from "../../dock-entrance.tsx";
import { DOCK_H } from "./constants.ts";

// Entrance offset: start the whole tray well below the viewport so it rises in
// from the very bottom (it rests 24px off the bottom and is DOCK_H tall, so it's
// fully off-screen with clear margin), then springs up to y:0.
const ENTER_FROM = DOCK_H + 96;

// Entrance states. The tray holds at `hidden` (off-screen, scaled down, blurred,
// transparent) until the page's text has settled, then springs to `shown`.
const ENTRANCE = {
  hidden: { y: ENTER_FROM, scale: 0.98, opacity: 0, filter: "blur(4px)" },
  shown: { y: 0, scale: 1, opacity: 1, filter: "blur(0px)" },
} as const;

/**
 * The PencilKit-style tool tray: a floating squircle capsule holding nav buttons,
 * the three marker pens, the ink well, action buttons, and a drawer grab-handle up
 * top. The selected pen and ink come from the shared selection style, so picking
 * one here drives the document-wide live selection marker in real time (see
 * selection-style.tsx / SelectionMarker).
 *
 * Mounted fixed at the bottom-centre of the viewport (see App). The outer layer is
 * pointer-events:none so clicks pass through the empty margins; only the capsule is
 * interactive.
 */
export function Dock() {
  // Ink + pen come from the shared selection style. MarkerRow crossfades between
  // inks (a clean dissolve) rather than morphing the colour — complementary inks
  // can't morph without a false green or a grey dip (gamut geometry).
  const { style, setColor, setPen } = useSelectionStyle();
  // Hold the entrance until the page's text cascade has landed (dock-entrance.tsx).
  const { ready } = useDockEntrance();
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex select-none justify-center"
      aria-label="Highlighter tray"
    >
      {/* Entrance: the tray holds off-screen until the page's text has finished
          appearing (dock-entrance.tsx → ready), then rises up, scaling 0.98→1 and
          focusing in (blur 4px→0, opacity 0→1) with a slight spring overshoot. The
          fade + focus use smooth ease-out tweens so the blur lands cleanly at 0.
          Plays once; reducedMotion at the App root reduces it to a fade. */}
      <motion.div
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

        {/* Content sits above the capsule. items-center centres the buttons and ink
            well; the markers self-end so their bodies reach the tray floor. */}
        <div className="relative flex h-full items-center gap-[32px]">
          <nav className="flex items-center gap-[12px] pr-[25px] pl-[32px]">
            <DockButton label="Home" dimmed>
              <HomeIcon />
            </DockButton>
            <DockButton label="Library">
              <BookIcon />
            </DockButton>
          </nav>

          <div className="flex h-full items-center gap-[40px]">
            <div className="flex h-full items-end">
              <MarkerRow color={style.color} selected={style.pen} onSelect={setPen} />
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

        {/* Drawer grab-handle. */}
        <div
          aria-hidden
          className="absolute top-[7.5px] left-1/2 -translate-x-1/2 rounded-full bg-[#efeeed]"
          style={{ width: 42.787, height: 5.943 }}
        />
      </motion.div>
    </div>
  );
}
