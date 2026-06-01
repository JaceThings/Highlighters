import { useEffect, useState, type ComponentType } from "react";
import { MotionConfig } from "framer-motion";
import { Outlet } from "@tanstack/react-router";
import { Dock } from "./components/dock/Dock.tsx";
import { FocusRingOverlay } from "./components/FocusRingOverlay.tsx";
import { Layout } from "./components/Layout.tsx";
import { SelectionMarker } from "./components/SelectionMarker.tsx";

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
  return (
    <MotionConfig reducedMotion="user">
      <Layout>
        <Outlet />
      </Layout>
      <FocusRingOverlay />
      {/* Document-global brown selection marker (see SelectionMarker.tsx). */}
      <SelectionMarker />
      {/* The PencilKit-style tool tray, fixed at the bottom-centre. */}
      <Dock />
      <DevAgentation />
    </MotionConfig>
  );
}
