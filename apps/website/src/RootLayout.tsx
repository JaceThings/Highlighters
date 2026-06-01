import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { MotionConfig } from "framer-motion";
import { Outlet } from "@tanstack/react-router";
import { Dock } from "./components/dock/Dock.tsx";
import { FocusRingOverlay } from "./components/FocusRingOverlay.tsx";
import { Layout } from "./components/Layout.tsx";
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

// The persistent app shell: the ruled-paper Layout hosts the routed page via
// <Outlet/>, alongside the always-on overlays and the floating dock. The page
// content is intentionally a blank canvas for now (the routed pages render
// nothing) — a fresh slate pending a new design. MotionConfig stays so the
// dock's entrance respects prefers-reduced-motion.
export function RootLayout() {
  // The dock holds its entrance until the page's text has settled (see
  // dock-entrance.tsx). The page signals via signalReady; the timer is a fallback
  // for any route that never signals (no entrance cascade), so the dock still
  // arrives on its own after a beat.
  const [dockReady, setDockReady] = useState(false);
  const signalReady = useCallback(() => setDockReady(true), []);
  // Memoized so the provider value is stable across renders — consumers only
  // re-render when `dockReady` actually flips, not on every RootLayout render.
  const dockEntrance = useMemo(() => ({ ready: dockReady, signalReady }), [dockReady, signalReady]);
  useEffect(() => {
    const t = setTimeout(() => setDockReady(true), 2500);
    return () => clearTimeout(t);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      {/* The dock and the live selection marker share one ink/pen state, so
          picking a swatch or pen restyles the selection in real time. */}
      <SelectionStyleProvider>
        <DockEntranceContext.Provider value={dockEntrance}>
          <Layout>
            <Outlet />
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
