import { useEffect, useRef } from "react";
import { DialRoot, useDialKit } from "dialkit";
import "dialkit/styles.css";
import { DEFAULT_ZONES, setDockZones, zones } from "./dock-zone-tuning.ts";

// Dev-only DialKit panel + overlay that visualises the dock's invisible drag zones (mounted with
// ?zones). The bottom/side/rotate/lift dials are live-wired through dock-zone-tuning.ts, so dialing
// them moves the overlay AND changes where the real dock snaps. The marker-hover and grab guides are
// drawn from live DOM measurement (always accurate) and inflated by their X/Y dials as a prototyping
// guide; the real pen buttons and handle are left untouched.
type N4 = [number, number, number, number]; // [default, min, max, step]

interface ZoneStyle {
  key: string;
  color: string;
  label: string;
  dashed?: boolean;
  circle?: boolean;
  /** Pin the label to the box's bottom-left (the pens, so it clears the nib silhouette at the top). */
  labelBottom?: boolean;
}

// One distinct colour per region. Dashed = a soft zone (release/magnetise only, no auto-expand): the
// top safe zone and the side pen-facing bands. Solid = a hard snap that expands the dock while dragging.
const ZONE_STYLES: ZoneStyle[] = [
  { key: "bottom", color: "#14b8a6", label: "bottom snap" },
  { key: "top", color: "#0ea5e9", label: "top safe zone", dashed: true },
  { key: "left", color: "#f97316", label: "left snap" },
  { key: "right", color: "#ec4899", label: "right snap" },
  { key: "rotateLeft", color: "#8b5cf6", label: "pen facing", dashed: true },
  { key: "rotateRight", color: "#8b5cf6", label: "pen facing", dashed: true },
  { key: "lift", color: "#eab308", label: "lift to collapse", circle: true },
  { key: "grab", color: "#ef4444", label: "grab area" },
  { key: "marker0", color: "#22c55e", label: "pen hitbox", labelBottom: true },
  { key: "marker1", color: "#22c55e", label: "pen hitbox", labelBottom: true },
  { key: "marker2", color: "#22c55e", label: "pen hitbox", labelBottom: true },
];

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function DockZones() {
  // Groups read as "what dock, and what you're sliding". The first four reach into the viewport from
  // their edge; "Pen facing" is the band where the carried pen rotates toward a side; "Collapse" is the
  // drag distance before the pill pinches to a circle; the two guides inflate the measured overlays.
  const p = useDialKit("Dock zones", {
    bottomDock: { reach: [DEFAULT_ZONES.bottomZone, 40, 400, 5] as N4 },
    topSafeZone: { reach: [DEFAULT_ZONES.topZone, 40, 400, 5] as N4 },
    sideDocks: { reach: [DEFAULT_ZONES.snapZone, 40, 400, 5] as N4 },
    penFacing: { reach: [DEFAULT_ZONES.rotateDist, 80, 700, 10] as N4, hysteresis: [DEFAULT_ZONES.rotateHyst, 0, 200, 5] as N4 },
    collapse: { liftRadius: [DEFAULT_ZONES.liftDistance, 20, 320, 5] as N4 },
    // Pen hitbox insets are REAL (clip-path on the live buttons), so the green guide is the true hit region.
    penHitbox: { topInset: [DEFAULT_ZONES.penTopInset, 0, 120, 1] as N4, sideInset: [DEFAULT_ZONES.penSideInset, 0, 40, 1] as N4 },
    grabArea: { width: [0, -20, 120, 1] as N4, height: [3, -20, 120, 1] as N4 },
  });

  // Live-wire the behavioural zones + real pen-hit insets into the store (the overlay also reads zones()).
  useEffect(() => {
    setDockZones({
      bottomZone: p.bottomDock.reach,
      topZone: p.topSafeZone.reach,
      snapZone: p.sideDocks.reach,
      rotateDist: p.penFacing.reach,
      rotateHyst: p.penFacing.hysteresis,
      liftDistance: p.collapse.liftRadius,
      penTopInset: p.penHitbox.topInset,
      penSideInset: p.penHitbox.sideInset,
    });
  }, [p.bottomDock.reach, p.topSafeZone.reach, p.sideDocks.reach, p.penFacing.reach, p.penFacing.hysteresis, p.collapse.liftRadius, p.penHitbox.topInset, p.penHitbox.sideInset]);

  // The grab guide stays a visual prototyping inflation (read by the rAF loop without a re-render).
  const guide = useRef({ gx: 0, gy: 0 });
  guide.current = { gx: p.grabArea.width, gy: p.grabArea.height };

  const els = useRef<Record<string, HTMLDivElement | null>>({});

  // Position every overlay div imperatively each frame: the drop zones from the live zone values, the
  // marker/grab guides from the real DOM rects. Imperative (not setState) so visualising the drag never
  // re-renders React mid-gesture.
  useEffect(() => {
    let raf = 0;
    const place = (key: string, box: Box | null) => {
      const el = els.current[key];
      if (!el) return;
      if (!box || box.w <= 0 || box.h <= 0) {
        el.style.display = "none";
        return;
      }
      el.style.display = "block";
      el.style.transform = `translate(${box.x}px, ${box.y}px)`;
      el.style.width = `${box.w}px`;
      el.style.height = `${box.h}px`;
    };
    const rect = (sel: string) => {
      const r = document.querySelector<HTMLElement>(sel)?.getBoundingClientRect();
      return r && r.width > 0 ? r : null;
    };
    const tick = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const z = zones();
      const { gx, gy } = guide.current;

      // Hard snaps in targetFor precedence: the bottom band wins its corners, the side bands run from the
      // top down to it. The top safe zone (dashed) is release-only and overlays the side tops freely.
      const bottomTop = vh - z.bottomZone;
      place("bottom", { x: 0, y: bottomTop, w: vw, h: z.bottomZone });
      place("top", { x: 0, y: 0, w: vw, h: z.topZone });
      place("left", { x: 0, y: 0, w: z.snapZone, h: bottomTop });
      place("right", { x: vw - z.snapZone, y: 0, w: z.snapZone, h: bottomTop });
      place("rotateLeft", { x: 0, y: 0, w: z.rotateDist, h: vh });
      place("rotateRight", { x: vw - z.rotateDist, y: 0, w: z.rotateDist, h: vh });

      // Lift radius: centred on the live tray centre (the rest centre a grab measures lift from).
      const tray = rect("[data-dock-tray]");
      const d = z.liftDistance * 2;
      place(
        "lift",
        tray ? { x: tray.left + tray.width / 2 - z.liftDistance, y: tray.top + tray.height / 2 - z.liftDistance, w: d, h: d } : null,
      );

      // Grab handle and pen hitboxes: real rects inflated by their guide dials. Skip pens inside an
      // inert layer (the hidden bottom/side stack) so only the live hover targets are drawn.
      const grab = rect("[data-dock-grab]");
      place("grab", grab ? { x: grab.left - gx, y: grab.top - gy, w: grab.width + gx * 2, h: grab.height + gy * 2 } : null);
      const pens = [...document.querySelectorAll<HTMLElement>(".dock-pen")].filter((el) => !el.closest("[inert]"));
      for (let i = 0; i < 3; i++) {
        const r = pens[i]?.getBoundingClientRect();
        if (!r || r.width <= 0) {
          place(`marker${i}`, null);
          continue;
        }
        // The true hit region: the button rect clipped by the same top/side insets the buttons apply.
        place(`marker${i}`, {
          x: r.left + z.penSideInset,
          y: r.top + z.penTopInset,
          w: r.width - z.penSideInset * 2,
          h: r.height - z.penTopInset,
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-[60]" aria-hidden>
        {ZONE_STYLES.map((z) => (
          <div
            key={z.key}
            ref={(n) => {
              els.current[z.key] = n;
            }}
            className="absolute top-0 left-0"
            style={{
              display: "none",
              boxSizing: "border-box",
              borderRadius: z.circle ? "9999px" : 6,
              background: z.dashed ? "transparent" : `${z.color}1f`,
              border: `1.5px ${z.dashed ? "dashed" : "solid"} ${z.color}`,
            }}
          >
            <span
              className={`absolute left-0 px-1 py-0.5 text-[10px] leading-none font-semibold text-white ${
                z.labelBottom ? "bottom-0 rounded-tr" : "top-0 rounded-br"
              }`}
              style={{ background: z.color }}
            >
              {z.label}
            </span>
          </div>
        ))}
      </div>
      <DialRoot position="top-left" theme="dark" />
    </>
  );
}
