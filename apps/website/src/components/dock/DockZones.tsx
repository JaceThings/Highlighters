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
}

// One distinct colour per region; rotate bands are border-only so they read through the side fills.
const ZONE_STYLES: ZoneStyle[] = [
  { key: "bottom", color: "#14b8a6", label: "bottom dock" },
  { key: "left", color: "#f97316", label: "left dock" },
  { key: "right", color: "#ec4899", label: "right dock" },
  { key: "rotateLeft", color: "#8b5cf6", label: "rotate band", dashed: true },
  { key: "rotateRight", color: "#8b5cf6", label: "rotate band", dashed: true },
  { key: "lift", color: "#eab308", label: "lift to collapse", circle: true },
  { key: "grab", color: "#ef4444", label: "grab" },
  { key: "marker0", color: "#22c55e", label: "pen" },
  { key: "marker1", color: "#22c55e", label: "pen" },
  { key: "marker2", color: "#22c55e", label: "pen" },
];

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function DockZones() {
  const p = useDialKit("Dock zones", {
    bottom: { reach: [DEFAULT_ZONES.bottomZone, 40, 400, 5] as N4 },
    sides: { reach: [DEFAULT_ZONES.snapZone, 40, 400, 5] as N4 },
    rotate: { reach: [DEFAULT_ZONES.rotateDist, 80, 700, 10] as N4, hysteresis: [DEFAULT_ZONES.rotateHyst, 0, 200, 5] as N4 },
    lift: { radius: [DEFAULT_ZONES.liftDistance, 20, 320, 5] as N4 },
    markerGuide: { x: [0, -40, 120, 1] as N4, y: [0, -40, 120, 1] as N4 },
    grabGuide: { x: [0, -20, 120, 1] as N4, y: [0, -20, 120, 1] as N4 },
  });

  // Live-wire the behavioural zones into the drag state machine (and thus the overlay, which reads zones()).
  useEffect(() => {
    setDockZones({
      bottomZone: p.bottom.reach,
      snapZone: p.sides.reach,
      rotateDist: p.rotate.reach,
      rotateHyst: p.rotate.hysteresis,
      liftDistance: p.lift.radius,
    });
  }, [p.bottom.reach, p.sides.reach, p.rotate.reach, p.rotate.hysteresis, p.lift.radius]);

  // Guide inflation for the measured (marker/grab) overlays; read by the rAF loop without a re-render.
  const guide = useRef({ mx: 0, my: 0, gx: 0, gy: 0 });
  guide.current = { mx: p.markerGuide.x, my: p.markerGuide.y, gx: p.grabGuide.x, gy: p.grabGuide.y };

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
      const { mx, my, gx, gy } = guide.current;

      // Drop zones, in targetFor's precedence: the bottom band wins the corners, so the side bands
      // are drawn only above it.
      const bottomTop = vh - z.bottomZone;
      place("bottom", { x: 0, y: bottomTop, w: vw, h: z.bottomZone });
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
        place(`marker${i}`, r && r.width > 0 ? { x: r.left - mx, y: r.top - my, w: r.width + mx * 2, h: r.height + my * 2 } : null);
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
              className="absolute top-0 left-0 rounded-br px-1 py-0.5 text-[10px] leading-none font-semibold text-white"
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
