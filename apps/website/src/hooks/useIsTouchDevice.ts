import { useEffect, useState } from "react";

// A touch device with no precise pointer: phones and most tablets. Not a width check, so a narrow
// desktop window is never treated as mobile.
const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";

function readMatch(): boolean {
  return typeof window !== "undefined" && window.matchMedia(TOUCH_QUERY).matches;
}

/** True on touch devices. Resolved synchronously at mount (SPA), then kept in sync. */
export function useIsTouchDevice(): boolean {
  const [touch, setTouch] = useState(readMatch);
  useEffect(() => {
    const mq = window.matchMedia(TOUCH_QUERY);
    const onChange = () => setTouch(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return touch;
}
