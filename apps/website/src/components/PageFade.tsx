import { AnimatePresence, m, type Variants } from "framer-motion";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { useRef, type ComponentType } from "react";
import { Home } from "../pages/Home.tsx";
import { Docs } from "../pages/Docs.tsx";

const PAGES: Record<string, ComponentType> = {
  "/": Home,
  "/docs": Docs,
};

const EASE: [number, number, number, number] = [0.2, 0, 0, 1];
const PAUSE_S = 0.05;
const FADE: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.22, ease: EASE, delay: PAUSE_S } },
  exit: { opacity: 0, transition: { duration: 0.16, ease: "easeIn" } },
};

export function PageFade() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
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
        <Page />
      </m.div>
    </AnimatePresence>
  );
}
