import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SmoothCorners } from "@lisse/react";
import { useIsTouchDevice } from "../hooks/useIsTouchDevice.ts";
import { detectDeviceRadius } from "../lib/device-radius.ts";

const DISMISSED_KEY = "hl-mobile-notice-dismissed";

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
  }
}

const SPRING = "cubic-bezier(0.32, 0.72, 0, 1)";
const EXIT_MS = 420;
const SMOOTHING = 0.6;
const RADIUS_FLOOR = 22;
const SHEET_SHADOW = "drop-shadow(0 -5px 18px rgba(20, 14, 10, 0.18))";

export function MobileNotice({ onDismissed }: { onDismissed?: () => void }) {
  const isTouch = useIsTouchDevice();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!isTouch || isNoticeDismissed()) return;
    setMounted(true);
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, [isTouch]);

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

  const radius = Math.max(detectDeviceRadius().screenCornerRadius, RADIUS_FLOOR);

  const dismiss = () => {
    markNoticeDismissed();
    setOpen(false);
    exitTimer.current = setTimeout(() => {
      setMounted(false);
      onDismissed?.();
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
          <img
            src="/mac-mockup.png"
            alt=""
            aria-hidden
            draggable={false}
            style={{ display: "block", width: "100%", height: "auto" }}
          />

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
