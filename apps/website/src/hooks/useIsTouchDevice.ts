import { useEffect, useState } from "react";

// Touch with no precise pointer (phones, most tablets); not a width check, so a narrow desktop isn't mobile.
const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";

function readMatch(): boolean {
  return typeof window !== "undefined" && window.matchMedia(TOUCH_QUERY).matches;
}

/** True on touch devices. */
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
