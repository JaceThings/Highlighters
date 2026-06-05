import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ShadowConfig } from "@lisse/core";
import { SmoothCorners } from "@lisse/react";
import { useIsTouchDevice } from "../hooks/useIsTouchDevice.ts";
import { applyRadiusTokens, detectDeviceRadius } from "../lib/device-radius.ts";

const DISMISSED_KEY = "hl-mobile-notice-dismissed";
// Close to iOS's sheet spring.
const SPRING = "cubic-bezier(0.32, 0.72, 0, 1)";
const EXIT_MS = 420;
// iOS-ish corner smoothing for the squircle top; below the screen-radius floor for flat/non-iPhone.
const SMOOTHING = 0.6;
const RADIUS_FLOOR = 22;
// Lisse ShadowConfig (box-shadow strategy below) so the lift traces the squircle, not a rect.
const DRAWER_SHADOW: ShadowConfig = { offsetX: 0, offsetY: -8, blur: 40, spread: -10, color: "#140e0a", opacity: 0.22 };

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
    applyRadiusTokens(); // sets --device-screen-radius / --device-radius-md on <html>
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
          background: "rgba(20, 14, 10, 0.45)",
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
        shadow={DRAWER_SHADOW}
        shadowStrategy="box-shadow"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Best viewed on desktop"
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 201,
            transform: open ? "translateY(0)" : "translateY(110%)",
            transition: `transform ${EXIT_MS}ms ${SPRING}`,
            background: "var(--color-bg)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)",
          }}
        >
          <div style={{ paddingTop: 10 }}>
            <div
              aria-hidden
              style={{ width: 38, height: 5, borderRadius: 3, margin: "0 auto", background: "rgba(var(--primary-rgb), 0.22)" }}
            />
          </div>

          <div className="flex flex-col gap-3" style={{ padding: "18px 24px 4px" }}>
            <h2 className="m-0" style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--color-text-primary)" }}>
              Best on desktop
            </h2>
            <p className="m-0 text-[0.95rem] leading-6" style={{ color: "var(--color-text-secondary)" }}>
              Highlighters is a live demo: you select text with a pointer and drag a marker over it. On
              a phone that fights the OS, and the pen dock is built for a cursor, so it may not work as
              shown here.
            </p>
            <p className="m-0 text-[0.9rem] leading-6" style={{ color: "var(--color-text-secondary)", opacity: 0.85 }}>
              Open <strong style={{ fontWeight: 600 }}>highlighte.rs</strong> on a desktop for the full
              thing. You can still read everything here.
            </p>
          </div>

          <div style={{ padding: "14px 16px 0" }}>
            <button
              type="button"
              onClick={dismiss}
              className="w-full cursor-pointer border-0 py-3 text-[0.95rem] font-medium"
              style={{ background: "var(--color-text-primary)", color: "#fff", borderRadius: "var(--device-radius-md, 16px)" }}
            >
              Got it
            </button>
          </div>
        </div>
      </SmoothCorners>
    </>,
    document.body,
  );
}
