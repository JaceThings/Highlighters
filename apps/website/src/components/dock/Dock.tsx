import { useState } from "react";
import { CapsuleBackground } from "./CapsuleBackground.tsx";
import { ColorPalette } from "./ColorPalette.tsx";
import { DockButton } from "./DockButton.tsx";
import { MarkerRow } from "./Marker.tsx";
import { BookIcon, HomeIcon, PersonIcon, StarIcon } from "../../icons/sf/index.tsx";

// The capsule height (Figma "Toolbar" content = 145). The caps and everything
// inside scale off this; the width is whatever the content needs.
const DOCK_H = 145;

/**
 * The PencilKit-style tool tray: a floating squircle capsule holding nav
 * buttons, the three marker pens, the ink well, and action buttons, with the
 * drawer grab-handle up top. Presentational for now — selecting a pen or colour
 * is local state so the tray feels alive.
 *
 * Mounted fixed at the bottom-centre of the viewport (see App). The outer layer
 * is pointer-events:none so clicks pass through the empty margins; only the
 * capsule itself is interactive.
 */
export function Dock() {
  // Ink picked from the palette (instant). MarkerRow crossfades between inks
  // (a clean dissolve) rather than morphing the colour — complementary inks
  // can't morph without a false green or a grey dip (gamut geometry).
  const [ink, setInk] = useState("#6f584c");
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex select-none justify-center"
      aria-label="Highlighter tray"
    >
      <div
        className="pointer-events-auto relative max-w-[calc(100vw-32px)]"
        style={{ height: DOCK_H }}
      >
        <CapsuleBackground />

        {/* Content sits above the capsule. items-center vertically centres the
            buttons and ink well; the markers self-end so their bodies reach the
            tray floor. */}
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
              <MarkerRow color={ink} />
            </div>
            <ColorPalette value={ink} onChange={setInk} />
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
      </div>
    </div>
  );
}
