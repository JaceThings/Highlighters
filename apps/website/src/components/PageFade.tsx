import { AnimatePresence, m, type Variants } from "framer-motion";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { useRef, type ComponentType } from "react";
import { Home } from "../pages/Home.tsx";
import { Docs } from "../pages/Docs.tsx";
import { EntranceEpoch } from "./Stagger.tsx";

// Cross-fades the page text on navigation; the shell stays mounted outside the fade.
//
// Pages come from a map, not <Outlet/>: the exiting copy must keep showing the OLD page,
// but <Outlet/> snaps to the new route mid-fade in this router version. Unmapped routes
// fall back to a plain Outlet.
const PAGES: Record<string, ComponentType> = {
  "/": Home,
  "/docs": Docs,
};

// Sequential fade (mode="wait"): out, a short empty hold (the enter `delay`), then in.
// Kept brisk so navigation feels immediate rather than waiting on a long cross-fade.
const EASE: [number, number, number, number] = [0.2, 0, 0, 1];
const PAUSE_S = 0.05;
const FADE: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.22, ease: EASE, delay: PAUSE_S } },
  exit: { opacity: 0, transition: { duration: 0.16, ease: "easeIn" } },
};

export function PageFade() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Skip the wrapper fade on cold load so the page's Stagger cascade owns the
  // entrance. `initial={false}` goes on the m.div, NOT <AnimatePresence> -
  // there it propagates a PresenceContext that suppresses the nested cascade.
  const firstRef = useRef(true);
  const isFirst = firstRef.current;
  firstRef.current = false;

  const Page = PAGES[pathname];
  if (!Page) return <Outlet />;
  return (
    <AnimatePresence mode="wait">
      <m.div
        key={pathname}
        variants={FADE}
        initial={isFirst ? false : "initial"}
        animate="animate"
        exit="exit"
      >
        {/* Fresh cascade anchor per navigation, so each page staggers in on arrival. */}
        <EntranceEpoch>
          <Page />
        </EntranceEpoch>
      </m.div>
    </AnimatePresence>
  );
}
