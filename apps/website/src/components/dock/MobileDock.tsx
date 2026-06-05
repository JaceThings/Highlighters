import { m } from "framer-motion";
import { useRouterState } from "@tanstack/react-router";
import { DockButton } from "./DockButton.tsx";
import { BookIcon, HomeIcon, PersonIcon, StarIcon } from "../../icons/sf/index.tsx";

// The touch-device dock: just the four nav/link buttons (no pens or colour), behaving exactly like
// the desktop dock's equivalents. A white squircle pill that slides up from the bottom on mount,
// which is after the MobileNotice sheet is dismissed.
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
        <nav className="flex items-center gap-[12px] pl-[28px]">
          <DockButton to="/" label="Home" active={pathname === "/"}>
            <HomeIcon />
          </DockButton>
          <DockButton to="/docs" label="Docs" active={pathname === "/docs"}>
            <BookIcon />
          </DockButton>
        </nav>
        <div className="flex items-center gap-[12px] pr-[28px]">
          <DockButton label="Star" href="https://github.com/JaceThings/highlighters">
            <StarIcon />
          </DockButton>
          <DockButton label="Follow" href="https://ja.mt">
            <PersonIcon />
          </DockButton>
        </div>
      </m.div>
    </div>
  );
}
