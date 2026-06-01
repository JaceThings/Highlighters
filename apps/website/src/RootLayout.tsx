import { useEffect, useRef, useState, type ComponentType } from "react";
import { LayoutGroup, MotionConfig, motion } from "framer-motion";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { Dock } from "./components/dock/Dock.tsx";
import { FocusRingOverlay } from "./components/FocusRingOverlay.tsx";
import { Header } from "./components/Header.tsx";
import { Layout } from "./components/Layout.tsx";
import { SelectionMarker } from "./components/SelectionMarker.tsx";
import { Stagger } from "./components/Stagger.tsx";
import { Footer } from "./components/playground/Footer.tsx";
import {
  CANONICAL_PATHS,
  ROUTE_META,
  SITE_ORIGIN,
  type CanonicalPath,
} from "./lib/route-meta.ts";

// Routes are eager: lazy + Suspense creates a suspend/resume cycle
// that collapses the footer mid-transition.

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

// Three-stage transition: body fades out → footer slides to its new Y
// while body stays at opacity 0 → new body fades in. Body's invisible
// during the footer slide so footer never overlaps body content, and
// the body container's height changes instantly (no height animation,
// no clipping/mask artifacts) — only the footer's translateY animates.
const FADE_MS = 250;
const FOOTER_SLIDE_MS = 350;
const EASE = [0.4, 0, 0.2, 1] as const;

function setMeta(selector: string, attr: string, value: string) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

// Mirror per-route metadata (route-meta.ts) into the document head on
// SPA navigation — index.html's static tags only cover the landing
// route. Unknown paths fall back to home meta before the router's
// catch-all redirects them.
function RouteHeadUpdater() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    const path = (
      CANONICAL_PATHS.has(pathname) ? pathname : "/"
    ) as CanonicalPath;
    const meta = ROUTE_META[path];
    const url = `${SITE_ORIGIN}${path}`;

    document.title = meta.title;
    setMeta('link[rel="canonical"]', "href", url);
    setMeta('meta[name="description"]', "content", meta.description);
    setMeta('meta[property="og:title"]', "content", meta.title);
    setMeta('meta[property="og:description"]', "content", meta.description);
    setMeta('meta[property="og:url"]', "content", url);
    setMeta('meta[name="twitter:title"]', "content", meta.title);
    setMeta('meta[name="twitter:description"]', "content", meta.description);
  }, [pathname]);
  return null;
}

function AnimatedBody() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // First app mount has no preceding footer to slide; subsequent route
  // changes delay the body fade-in by the slide duration so the new body
  // only starts becoming visible after the footer has settled.
  const isFirstMount = useRef(true);
  useEffect(() => {
    isFirstMount.current = false;
  }, []);
  const enterDelay = isFirstMount.current ? 0 : FOOTER_SLIDE_MS / 1000;

  // Clean keyed fade-IN of the Outlet rather than AnimatePresence pinning:
  // TanStack's <Outlet/> already renders the NEW match, so a pinned exiting
  // copy would show the new route's content. Keying on pathname remounts the
  // wrapper each navigation, so initial opacity 0 → animate 1 fades the new
  // body in (after the footer slide) with no flicker.
  return (
    <motion.div
      key={pathname}
      className="w-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: FADE_MS / 1000, ease: EASE, delay: enterDelay }}
    >
      <Outlet />
    </motion.div>
  );
}

// LayoutGroup is required: without it framer-motion never sees that a
// sibling's size changed and the footer's translateY never animates.
function PersistentFooter() {
  return (
    <motion.footer
      layout="position"
      transition={{
        layout: { duration: FOOTER_SLIDE_MS / 1000, ease: EASE },
      }}
      className="w-full"
    >
      <Stagger index={14}>
        <Footer />
      </Stagger>
    </motion.footer>
  );
}

// The persistent app SHELL — everything that survives route changes. The
// matched page renders through <Outlet/> inside AnimatedBody; the router
// (router.tsx) mounts this as the root route's component.
export function RootLayout() {
  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        <Layout>
          <Header staggerFrom={0} />
          <AnimatedBody />
          <PersistentFooter />
        </Layout>
      </LayoutGroup>
      <RouteHeadUpdater />
      <FocusRingOverlay />
      {/* Document-global default selection style: paints the brown Lisse
          marker over any selected non-exhibit text (exhibits are select-none,
          so they're never touched). Mounted once, covers Home AND Playground. */}
      <SelectionMarker />
      {/* The PencilKit-style tool tray: fixed at the bottom-centre, persists
          across routes like the other root-level overlays. */}
      <Dock />
      <DevAgentation />
    </MotionConfig>
  );
}
