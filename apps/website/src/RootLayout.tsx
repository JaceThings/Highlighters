import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { LazyMotion, MotionConfig } from "framer-motion";

// Lazy-load animation features so the initial bundle ships only the light `m` components.
const loadMotionFeatures = () => import("./lib/motion-features.ts").then((m) => m.default);
import { Dock } from "./components/dock/Dock.tsx";
import { MobileDock } from "./components/dock/MobileDock.tsx";
import { FocusRingOverlay } from "./components/FocusRingOverlay.tsx";
import { Layout } from "./components/Layout.tsx";
import { MobileNotice, isNoticeDismissed } from "./components/MobileNotice.tsx";
import { PageFade } from "./components/PageFade.tsx";
import { SelectionMarker } from "./components/SelectionMarker.tsx";
import { SelectionStyleProvider } from "./selection-style.tsx";
import { DockEntranceContext } from "./dock-entrance.tsx";
import { useIsTouchDevice } from "./hooks/useIsTouchDevice.ts";

// The agentation dev-feedback toolbar, dev only.
function DevAgentation() {
  const [Toolbar, setToolbar] = useState<ComponentType | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    import("agentation")
      .then((m) => setToolbar(() => m.PageFeedbackToolbarCSS))
      .catch(() => {});
  }, []);
  return Toolbar ? <Toolbar /> : null;
}

// DialKit panel for tuning marker outlines, dev only (dynamic so dialkit never ships). Opt in with `?dials`.
function DevOutlineDials() {
  const [Dials, setDials] = useState<ComponentType | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!new URLSearchParams(window.location.search).has("dials")) return;
    import("./components/dock/OutlineDials.tsx")
      .then((m) => setDials(() => m.OutlineDials))
      .catch(() => {});
  }, []);
  return Dials ? <Dials /> : null;
}

// The persistent app shell. Overlays + dock sit outside PageFade so they never re-animate between pages.
export function RootLayout() {
  // The marker demo is pointer-driven, so the dock is dropped on touch; MobileNotice explains why.
  const isTouch = useIsTouchDevice();
  // On touch, the trimmed MobileDock appears once MobileNotice is dismissed (or immediately on a return visit).
  const [mobileDockShown, setMobileDockShown] = useState(isNoticeDismissed);
  // The dock holds its entrance until the page signals; the timer is the fallback for routes with no cascade.
  const [dockReady, setDockReady] = useState(false);
  const signalReady = useCallback(() => setDockReady(true), []);
  const dockEntrance = useMemo(() => ({ ready: dockReady, signalReady }), [dockReady, signalReady]);
  useEffect(() => {
    const t = setTimeout(() => setDockReady(true), 2500);
    return () => clearTimeout(t);
  }, []);

  // Decode marker sounds while idle so the first press is instant; the engine singleton carries the buffers across nav.
  useEffect(() => {
    const prime = () => void import("./lib/marker-audio.ts").then((m) => m.primeMarkerAudio()).catch(() => {});
    const hasIdle = typeof window.requestIdleCallback === "function";
    const id = hasIdle ? window.requestIdleCallback(prime, { timeout: 3000 }) : window.setTimeout(prime, 1500);
    return () => {
      if (hasIdle) window.cancelIdleCallback(id);
      else clearTimeout(id);
    };
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadMotionFeatures} strict>
        {/* Dock + live marker share one selection style, so picking a swatch or pen restyles in real time. */}
        <SelectionStyleProvider>
          <DockEntranceContext.Provider value={dockEntrance}>
            <Layout>
              <PageFade />
            </Layout>
            <FocusRingOverlay />
            <SelectionMarker />
            {!isTouch && <Dock />}
            <MobileNotice onDismissed={() => setMobileDockShown(true)} />
            {isTouch && mobileDockShown && <MobileDock />}
            {!isTouch && <DevAgentation />}
            <DevOutlineDials />
          </DockEntranceContext.Provider>
        </SelectionStyleProvider>
      </LazyMotion>
    </MotionConfig>
  );
}
