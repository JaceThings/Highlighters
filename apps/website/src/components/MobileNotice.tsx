import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SmoothCorners } from "@lisse/react";
import { useIsTouchDevice } from "../hooks/useIsTouchDevice.ts";
import { detectDeviceRadius } from "../lib/device-radius.ts";

const DISMISSED_KEY = "hl-mobile-notice-dismissed";

/** Whether the notice has been dismissed before (persisted; safe in private mode). */
export function isNoticeDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function markNoticeDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // private mode: a non-persisted dismissal is fine for this session
  }
}

// Close to iOS's sheet spring.
const SPRING = "cubic-bezier(0.32, 0.72, 0, 1)";
const EXIT_MS = 420;
const SMOOTHING = 0.6;
const RADIUS_FLOOR = 22;
// drop-shadow, not box-shadow, so the lift follows the squircle clip-path.
const SHEET_SHADOW = "drop-shadow(0 -5px 18px rgba(20, 14, 10, 0.18))";

// MacBook-screen visual built in the DOM (not a baked PNG) so it stays sharp at any DPR.
function MacScreen() {
  return (
    <div
      aria-hidden
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "389 / 100",
        borderRadius: "11px 11px 0 0",
        overflow: "hidden",
        borderTop: "3px solid #16151a",
        borderInline: "3px solid #16151a",
        boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.22)",
      }}
    >
      <div style={{ position: "absolute", inset: 0, backgroundImage: "url(/mac-wallpaper.webp)", backgroundSize: "cover", backgroundPosition: "50% 16%" }} />
      <div
        style={{
          position: "absolute",
          insetInline: 0,
          top: 0,
          height: "12%",
          minHeight: 9,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 3.5%",
          background: "rgba(28, 24, 20, 0.3)",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
          color: "rgba(255, 255, 255, 0.92)",
          fontSize: 7,
          lineHeight: 1,
        }}
      >
        <span style={{ fontWeight: 700 }}>Finder</span>
        <span style={{ opacity: 0.9 }}>9:41</span>
      </div>
      <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "16%", height: 6, background: "#000", borderBottomLeftRadius: 5, borderBottomRightRadius: 5 }} />
    </div>
  );
}

// One-time dismissible heads-up on touch devices: the live demo needs a desktop pointer. Top corners follow the device screen radius.
export function MobileNotice({ onDismissed }: { onDismissed?: () => void }) {
  const isTouch = useIsTouchDevice();
  const [mounted, setMounted] = useState(false); // present in the DOM through enter/exit
  const [open, setOpen] = useState(false); // animation target
  const exitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!isTouch || isNoticeDismissed()) return;
    setMounted(true);
    const id = requestAnimationFrame(() => setOpen(true)); // next frame: slide up
    return () => cancelAnimationFrame(id);
  }, [isTouch]);

  // Lock background scroll while the sheet is up; clear a pending exit timer on unmount.
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      clearTimeout(exitTimer.current);
    };
  }, [mounted]);

  if (!mounted) return null;

  // True screen radius (floored for flat screens), as a Lisse squircle so the curve matches iOS, not a circular CSS arc.
  const radius = Math.max(detectDeviceRadius().screenCornerRadius, RADIUS_FLOOR);

  const dismiss = () => {
    markNoticeDismissed();
    setOpen(false);
    exitTimer.current = setTimeout(() => {
      setMounted(false);
      onDismissed?.(); // hand off to the mobile dock once the sheet has slid away
    }, EXIT_MS);
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
          <MacScreen />

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
