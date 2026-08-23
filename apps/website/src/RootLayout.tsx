import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { LazyMotion, MotionConfig } from "framer-motion";
import { Dock } from "./components/dock/Dock.tsx";
import { MobileDock } from "./components/dock/MobileDock.tsx";
import { FocusRingOverlay } from "./components/FocusRingOverlay.tsx";
import { Layout } from "./components/Layout.tsx";
import { MobileNotice, isNoticeDismissed } from "./components/MobileNotice.tsx";
import { PageFade } from "./components/PageFade.tsx";
import { SelectionMarker } from "./components/SelectionMarker.tsx";
import { DynamicFavicon } from "./components/DynamicFavicon.tsx";
import { SelectionStyleProvider } from "./selection-style.tsx";
import { DockEntranceContext } from "./dock-entrance.tsx";
import { useIsTouchDevice } from "./hooks/useIsTouchDevice.ts";
import { useDockTier } from "./hooks/useDockTier.ts";
import { primeMarkerAudio } from "./lib/marker-audio.ts";
import { BROWSER } from "./lib/browser-env.ts";

const loadMotionFeatures = () => import("./lib/motion-features.ts").then((m) => m.default);

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

export function RootLayout() {
  const isTouch = useIsTouchDevice();
  const { showPens } = useDockTier();
  const [mobileDockShown, setMobileDockShown] = useState(isNoticeDismissed);
  const [dockReady, setDockReady] = useState(false);
  const signalReady = useCallback(() => setDockReady(true), []);
  const dockEntrance = useMemo(() => ({ ready: dockReady, signalReady }), [dockReady, signalReady]);
  useEffect(() => {
    const t = setTimeout(() => setDockReady(true), 2500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let primed = false;
    const events = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"] as const;
    const opts = { passive: true, capture: true } as const;
    const stop = () => events.forEach((e) => window.removeEventListener(e, prime, opts));
    function prime() {
      if (primed) return;
      primed = true;
      stop();
      primeMarkerAudio();
    }
    events.forEach((e) => window.addEventListener(e, prime, opts));
    const hasIdle = BROWSER.hasIdleCallback;
    let id: number | undefined;
    const armIdle = () => {
      if (primed) return;
      id = hasIdle ? window.requestIdleCallback(prime, { timeout: 3000 }) : window.setTimeout(prime, 1500);
    };
    if (document.readyState === "complete") armIdle();
    else window.addEventListener("load", armIdle, { once: true });
    return () => {
      stop();
      window.removeEventListener("load", armIdle);
      if (id !== undefined) {
        if (hasIdle) window.cancelIdleCallback(id);
        else clearTimeout(id);
      }
    };
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadMotionFeatures} strict>
        <SelectionStyleProvider>
          <DockEntranceContext.Provider value={dockEntrance}>
            <Layout>
              <PageFade />
            </Layout>
            <FocusRingOverlay />
            <SelectionMarker />
            <DynamicFavicon />
            {!isTouch && (showPens ? <Dock /> : <MobileDock />)}
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
