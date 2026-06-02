import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { MotionConfig } from "framer-motion";
import { Dock } from "./components/dock/Dock.tsx";
import { FocusRingOverlay } from "./components/FocusRingOverlay.tsx";
import { Layout } from "./components/Layout.tsx";
import { PageFade } from "./components/PageFade.tsx";
import { SelectionMarker } from "./components/SelectionMarker.tsx";
import { SelectionStyleProvider } from "./selection-style.tsx";
import { DockEntranceContext } from "./dock-entrance.tsx";

// Loads the agentation dev-feedback toolbar in dev only.
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

// The persistent app shell. Overlays + dock sit outside PageFade so they never
// re-animate between pages; MotionConfig respects prefers-reduced-motion.
export function RootLayout() {
  // The dock holds its entrance until the page signals (signalReady); the timer is
  // the fallback for routes with no cascade.
  const [dockReady, setDockReady] = useState(false);
  const signalReady = useCallback(() => setDockReady(true), []);
  // Stable provider value so consumers re-render only when `dockReady` flips.
  const dockEntrance = useMemo(() => ({ ready: dockReady, signalReady }), [dockReady, signalReady]);
  useEffect(() => {
    const t = setTimeout(() => setDockReady(true), 2500);
    return () => clearTimeout(t);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      {/* Dock + live marker share one selection style, so picking a swatch or pen
          restyles the selection in real time. */}
      <SelectionStyleProvider>
        <DockEntranceContext.Provider value={dockEntrance}>
          <Layout>
            <PageFade />
          </Layout>
          <FocusRingOverlay />
          {/* Document-global live selection marker (see SelectionMarker.tsx). */}
          <SelectionMarker />
          {/* The PencilKit-style tool tray, fixed at the bottom-centre. */}
          <Dock />
          <DevAgentation />
        </DockEntranceContext.Provider>
      </SelectionStyleProvider>
    </MotionConfig>
  );
}
