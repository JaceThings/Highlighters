import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { LazyMotion, MotionConfig } from "framer-motion";

// Lazy-load the animation features so the initial bundle ships only the light `m`
// components; the feature chunk (motion-features.ts) loads on demand.
const loadMotionFeatures = () => import("./lib/motion-features.ts").then((m) => m.default);
import { Dock } from "./components/dock/Dock.tsx";
import { FocusRingOverlay } from "./components/FocusRingOverlay.tsx";
import { Layout } from "./components/Layout.tsx";
import { MobileNotice } from "./components/MobileNotice.tsx";
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

// DialKit panel for tuning the marker outlines, dev only (dynamic so dialkit never ships).
function DevOutlineDials() {
  const [Dials, setDials] = useState<ComponentType | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    import("./components/dock/OutlineDials.tsx")
      .then((m) => setDials(() => m.OutlineDials))
      .catch(() => {});
  }, []);
  return Dials ? <Dials /> : null;
}

// The persistent app shell. Overlays + dock sit outside PageFade so they never
// re-animate between pages; MotionConfig respects prefers-reduced-motion.
export function RootLayout() {
  // The marker demo (the dock + select-to-paint) is pointer-driven, so the dock is dropped on
  // touch devices; the MobileNotice sheet explains why.
  const isTouch = useIsTouchDevice();
  // The dock holds its entrance until the page signals; the timer is the fallback
  // for routes with no cascade.
  const [dockReady, setDockReady] = useState(false);
  const signalReady = useCallback(() => setDockReady(true), []);
  const dockEntrance = useMemo(() => ({ ready: dockReady, signalReady }), [dockReady, signalReady]);
  useEffect(() => {
    const t = setTimeout(() => setDockReady(true), 2500);
    return () => clearTimeout(t);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadMotionFeatures} strict>
        {/* Dock + live marker share one selection style, so picking a swatch or pen
            restyles the selection in real time. */}
        <SelectionStyleProvider>
          <DockEntranceContext.Provider value={dockEntrance}>
            <Layout>
              <PageFade />
            </Layout>
            <FocusRingOverlay />
            <SelectionMarker />
            {!isTouch && <Dock />}
            <MobileNotice />
            <DevAgentation />
            <DevOutlineDials />
          </DockEntranceContext.Provider>
        </SelectionStyleProvider>
      </LazyMotion>
    </MotionConfig>
  );
}
