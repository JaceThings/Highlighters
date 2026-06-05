import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SmoothCorners } from "@lisse/react";
import { useIsTouchDevice } from "../hooks/useIsTouchDevice.ts";
import { detectDeviceRadius } from "../lib/device-radius.ts";

const DISMISSED_KEY = "hl-mobile-notice-dismissed";
// Close to iOS's sheet spring.
const SPRING = "cubic-bezier(0.32, 0.72, 0, 1)";
const EXIT_MS = 420;
// iOS-ish corner smoothing for the squircle top; below the screen-radius floor for flat/non-iPhone.
const SMOOTHING = 0.6;
const RADIUS_FLOOR = 22;
// drop-shadow (not box-shadow) so the lift follows the squircle clip-path instead of being clipped.
const SHEET_SHADOW = "drop-shadow(0 -5px 18px rgba(20, 14, 10, 0.18))";

// A one-time, Apple-sheet-style heads-up on touch devices: the live demo (select-to-paint + the
// pen dock) is built for a desktop pointer. The sheet's top corners follow the device's own screen
// corner radius (see device-radius) so the curve language matches the hardware. Dismissal persists.
export function MobileNotice() {
  const isTouch = useIsTouchDevice();
  const [mounted, setMounted] = useState(false); // present in the DOM (through enter/exit)
  const [open, setOpen] = useState(false); // animation target

  useEffect(() => {
    if (!isTouch) return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      // private mode: treat as not dismissed
    }
    if (dismissed) return;
    setMounted(true);
    const id = requestAnimationFrame(() => setOpen(true)); // next frame: slide up
    return () => cancelAnimationFrame(id);
  }, [isTouch]);

  // Lock background scroll while the sheet is up.
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  if (!mounted) return null;

  // The device's true screen radius (floored for flat/non-iPhone screens), rendered as a Lisse
  // squircle so the curve shape matches iOS, not a circular CSS arc.
  const radius = Math.max(detectDeviceRadius().screenCornerRadius, RADIUS_FLOOR);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // ignore
    }
    setOpen(false);
    setTimeout(() => setMounted(false), EXIT_MS);
  };

  return createPortal(
    <>
      <div
        aria-hidden
        onClick={dismiss}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          background: "rgba(20, 14, 10, 0.32)",
          opacity: open ? 1 : 0,
          transition: `opacity ${EXIT_MS}ms ${SPRING}`,
        }}
      />
      <SmoothCorners
        asChild
        autoEffects={false}
        corners={{
          topLeft: { radius, smoothing: SMOOTHING },
          topRight: { radius, smoothing: SMOOTHING },
          bottomLeft: 0,
          bottomRight: 0,
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Best viewed on desktop"
          className="flex flex-col"
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 201,
            gap: 20,
            padding: 20,
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
            transform: open ? "translateY(0)" : "translateY(110%)",
            transition: `transform ${EXIT_MS}ms ${SPRING}`,
            background: "var(--color-bg)",
            filter: SHEET_SHADOW,
            color: "var(--color-text-primary)",
            fontWeight: 500,
            letterSpacing: "-0.25px",
          }}
        >
          {/* A baked MacBook screen (menu bar + notch + wallpaper): the "go to a desktop" cue. */}
          <img src="/mac-mask.png" alt="" aria-hidden draggable={false} className="block w-full select-none" />

          <div className="flex flex-col" style={{ gap: 8, padding: "0 4px", lineHeight: "24px" }}>
            <h2 className="m-0" style={{ fontSize: 16 }}>
              Best on desktop
            </h2>
            <p className="m-0" style={{ fontSize: 14 }}>
              This is a hands-on demo: select text and drag a nib over it with a pointer. Touch can't
              really do that, so the marker tools are off here.
            </p>
            <p className="m-0" style={{ fontSize: 14, opacity: 0.5, textAlign: "justify" }}>
              Open highlighters on a computer for the full experience.
            </p>
          </div>

          <button
            type="button"
            onClick={dismiss}
            className="w-full cursor-pointer border-0"
            style={{
              background: "var(--color-text-primary)",
              color: "var(--color-bg)",
              fontSize: 14,
              fontWeight: 500,
              lineHeight: "24px",
              padding: "12px 0",
              borderRadius: 9999,
            }}
          >
            Got It
          </button>
        </div>
      </SmoothCorners>
    </>,
    document.body,
  );
}
