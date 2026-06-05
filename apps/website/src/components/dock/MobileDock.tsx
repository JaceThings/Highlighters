import { m } from "framer-motion";
import { useRouterState } from "@tanstack/react-router";
import { DockNav, DockLinks } from "./DockButton.tsx";

// The touch dock: the four nav/link buttons (no pens or colour) on a white pill that slides up
// from the bottom on mount - which is once the MobileNotice sheet has been dismissed.
const SHADOW = "0 6px 14px -7px rgba(115, 87, 74, 0.3)";

export function MobileDock() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex select-none justify-center px-3"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
      aria-label="Navigation"
    >
      <m.div
        className="pointer-events-auto relative flex w-full max-w-[460px] items-center justify-between"
        style={{ background: "#fff", borderRadius: 9999, boxShadow: SHADOW, padding: "30px 0 26px" }}
        initial={{ y: "130%" }}
        animate={{ y: 0 }}
        transition={{ type: "spring", duration: 0.7, bounce: 0.28, delay: 0.15 }}
      >
        <div
          aria-hidden
          className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-[#efeeed]"
          style={{ width: 42.787, height: 5.943 }}
        />
        <DockNav pathname={pathname} className="pl-[28px]" />
        <DockLinks className="pr-[28px]" />
      </m.div>
    </div>
  );
}
