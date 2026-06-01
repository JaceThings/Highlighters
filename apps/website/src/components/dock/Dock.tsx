import { motion } from "framer-motion";
import { CapsuleBackground } from "./CapsuleBackground.tsx";
import { ColorPalette } from "./ColorPalette.tsx";
import { DockButton } from "./DockButton.tsx";
import { MarkerRow } from "./Marker.tsx";
import { BookIcon, HomeIcon, PersonIcon, StarIcon } from "../../icons/sf/index.tsx";
import { useSelectionStyle } from "../../selection-style.tsx";
import { DOCK_H } from "./constants.ts";

// Entrance offset: start the whole tray well below the viewport so it rises in
// from the very bottom (it rests 24px off the bottom and is DOCK_H tall, so it's
// fully off-screen with clear margin), then springs up to y:0.
const ENTER_FROM = DOCK_H + 96;

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
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex select-none justify-center"
      aria-label="Highlighter tray"
    >
      {/* Entrance: after a short beat the whole tray rises up from off-screen as
          one solid unit and overshoots slightly (spring bounce). initial/animate
          run only on mount, so re-renders (picking a pen or ink) never replay it;
          reducedMotion at the App root turns it into an instant appear. */}
      <motion.div
        className="pointer-events-auto relative max-w-[calc(100vw-32px)]"
        style={{ height: DOCK_H }}
        initial={{ y: ENTER_FROM }}
        animate={{ y: 0 }}
        transition={{ type: "spring", duration: 0.85, bounce: 0.3, delay: 0.7 }}
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
