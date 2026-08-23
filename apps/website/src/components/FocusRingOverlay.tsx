import { useEffect, useRef } from "react";
import {
  animate,
  m,
  useMotionValue,
  useSpring,
  useTransform,
  type AnimationPlaybackControls,
} from "framer-motion";
import { generatePath } from "@lisse/core";
import { useNavModality } from "../hooks/useNavModality.ts";

const RING_SELECTOR = "[data-focus-ring]";
const SECTION_SELECTOR = "[data-focus-section]";
const SPRING = { stiffness: 1100, damping: 60, mass: 0.4 };
const FADE_IN = { duration: 0.18, ease: [0.2, 0, 0, 1] as const };
const FADE_OUT = { duration: 0.18, ease: [0.4, 0, 0.2, 1] as const };

export function FocusRingOverlay({
  radius = 14,
  smoothing = 0.6,
  offsetX = 0,
  offsetY = 0,
  strokeWidth = 2,
}: {
  radius?: number;
  smoothing?: number;
  offsetX?: number;
  offsetY?: number;
  strokeWidth?: number;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const w = useMotionValue(0);
  const h = useMotionValue(0);
  const rad = useMotionValue(radius);

  const xS = useSpring(x, SPRING);
  const yS = useSpring(y, SPRING);
  const wS = useSpring(w, SPRING);
  const hS = useSpring(h, SPRING);
  const radS = useSpring(rad, SPRING);
  const opacity = useMotionValue(0);

  const d = useTransform([wS, hS, radS], ([wv, hv, rv]) => {
    const ww = Math.max(0, wv as number);
    const hh = Math.max(0, hv as number);
    if (ww === 0 || hh === 0) return "";
    const r = Math.min(Math.max(0, rv as number), Math.min(ww, hh) / 2);
    const sm = r >= Math.min(ww, hh) / 2 - 0.5 ? 0 : smoothing;
    return generatePath(ww, hh, { radius: r, smoothing: sm });
  });

  const visible = useRef(false);
  const targetRef = useRef<HTMLElement | null>(null);
  const fadeRef = useRef<AnimationPlaybackControls | null>(null);
  const navKeyboard = useNavModality();

  useEffect(() => {
    let fadingOut = false;
    type Rect = { nx: number; ny: number; nw: number; nh: number; nr: number };
    let pendingTarget: Rect | null = null;

    const measure = (el: HTMLElement): Rect => {
      const r = el.getBoundingClientRect();
      const insetX = Number(el.dataset.focusInsetX) || offsetX;
      const insetY = Number(el.dataset.focusInsetY) || offsetY;
      const nw = r.width + insetX * 2;
      const nh = r.height + insetY * 2;
      const max = Math.min(nw, nh) / 2;
      const inset = Math.min(insetX, insetY);
      const hint = el.dataset.focusRadius;
      const nr =
        hint === "full"
          ? max
          : hint && !Number.isNaN(Number(hint))
            ? Math.min(Number(hint) + inset, max)
            : Math.min(radius + inset, Math.min(nw, nh) / 2.5);
      return {
        nx: r.left + window.scrollX - insetX,
        ny: r.top + window.scrollY - insetY,
        nw,
        nh,
        nr,
      };
    };

    const snap = ({ nx, ny, nw, nh, nr }: Rect) => {
      xS.jump(nx); yS.jump(ny); wS.jump(nw); hS.jump(nh); radS.jump(nr);
      x.set(nx); y.set(ny); w.set(nw); h.set(nh); rad.set(nr);
    };

    const slide = ({ nx, ny, nw, nh, nr }: Rect) => {
      x.set(nx); y.set(ny); w.set(nw); h.set(nh); rad.set(nr);
    };

    const fadeTo = (to: number, opts: typeof FADE_IN | typeof FADE_OUT) => {
      fadeRef.current?.stop();
      fadeRef.current = animate(opacity, to, opts);
    };

    const getSection = (el: HTMLElement | null): string | null =>
      el?.closest(SECTION_SELECTOR)?.getAttribute("data-focus-section") ?? null;

    let rafId = 0;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = mql.matches;

    const startFollow = () => {
      if (rafId || reduced) return;
      rafId = requestAnimationFrame(follow);
    };
    const stopFollow = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    };

    const hide = () => {
      if (!visible.current) return;
      visible.current = false;
      targetRef.current = null;
      fadingOut = false;
      pendingTarget = null;
      stopFollow();
      fadeTo(0, FADE_OUT);
    };

    const onFocusIn = (e: FocusEvent) => {
      const t = (e.target as HTMLElement | null)?.closest(RING_SELECTOR) as HTMLElement | null;
      if (!t) return;
      if (!navKeyboard.current) {
        hide();
        return;
      }
      const dest = measure(t);
      if (fadingOut) {
        pendingTarget = dest;
        targetRef.current = t;
        return;
      }

      if (!visible.current) {
        snap(dest);
        visible.current = true;
        targetRef.current = t;
        startFollow();
        fadeTo(1, FADE_IN);
        return;
      }

      const crossingSections =
        getSection(targetRef.current) !== getSection(t);

      if (crossingSections) {
        targetRef.current = t;
        fadingOut = true;
        pendingTarget = dest;
        fadeRef.current?.stop();
        fadeRef.current = animate(opacity, 0, {
          ...FADE_OUT,
          onComplete: () => {
            const next = pendingTarget;
            fadingOut = false;
            pendingTarget = null;
            if (!next) return;
            snap(next);
            fadeTo(1, FADE_IN);
          },
        });
        return;
      }

      slide(dest);
      targetRef.current = t;
      fadeTo(1, FADE_IN);
    };

    const onFocusOut = () => {
      requestAnimationFrame(() => {
        const active = document.activeElement as HTMLElement | null;
        if (active?.closest(RING_SELECTOR)) return;
        hide();
      });
    };

    const isMidExit = (el: HTMLElement): boolean => {
      let node: HTMLElement | null = el;
      while (node && node !== document.body) {
        const op = parseFloat(getComputedStyle(node).opacity);
        if (Number.isFinite(op) && op < 1) return true;
        node = node.parentElement;
      }
      return false;
    };

    function follow() {
      rafId = 0;
      if (!visible.current) return;
      if (targetRef.current && !fadingOut) {
        const el = targetRef.current;
        if (!el.isConnected || isMidExit(el)) {
          hide();
          return;
        }
        slide(measure(el));
      }
      rafId = requestAnimationFrame(follow);
    }

    const onMotionPref = () => {
      reduced = mql.matches;
      if (reduced) stopFollow();
      else if (visible.current) startFollow();
    };
    mql.addEventListener("change", onMotionPref);

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      stopFollow();
      mql.removeEventListener("change", onMotionPref);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      fadeRef.current?.stop();
    };
  }, [x, y, w, h, rad, xS, yS, wS, hS, radS, opacity, offsetX, offsetY, radius]);

  return (
    <m.svg
      aria-hidden
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        x: xS,
        y: yS,
        width: wS,
        height: hS,
        opacity,
        pointerEvents: "none",
        zIndex: 9999,
        overflow: "visible",
      }}
    >
      <m.path
        d={d}
        fill="none"
        stroke="var(--color-text-primary)"
        strokeWidth={strokeWidth}
      />
    </m.svg>
  );
}
