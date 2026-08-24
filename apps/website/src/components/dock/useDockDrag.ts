import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { animate, useMotionValue, type MotionValue, type Transition } from "framer-motion";
import { prefersReducedMotion } from "../playground/slider-utils.ts";
import { DOCK_H, EDGE_INSET } from "./constants.ts";
import { BOTTOM_ZONE, TOP_ZONE, SNAP_ZONE, ROTATE_HYST, LIFT_DISTANCE, facingReach } from "./dock-zones.ts";

export type DockPhase = "bottom" | "top" | "dragging" | "snapping" | "returning" | "side";
export type DockSide = "left" | "right";
export type DockTarget = "left" | "right" | "bottom" | "top";

const isHorizontal = (t: DockTarget): t is "bottom" | "top" => t === "bottom" || t === "top";

const CIRCLE = DOCK_H;
const FADE = 0.18;
const EXPAND_FADE = 0.16;
const COLLAPSE = { type: "spring", stiffness: 400, damping: 42 } as const;
const MORPH = { type: "spring", stiffness: 460, damping: 42 } as const;
const SETTLE = { type: "spring", stiffness: 300, damping: 27, velocity: 0 } as const;
const ROT_SNAP = { type: "spring", stiffness: 520, damping: 38 } as const;

const layoutFadeTransition = (appearing: boolean) =>
  ({ duration: FADE, ease: "easeInOut" as const, delay: appearing ? EXPAND_FADE : 0 });

function useStateRef<T>(initial: T) {
  const [value, setValue] = useState(initial);
  const ref = useRef(value);
  const set = useCallback((next: T) => {
    ref.current = next;
    setValue(next);
  }, []);
  return [value, ref, set] as const;
}

const sideRotation = (s: DockSide): number => (s === "left" ? 90 : -90);
const targetFromRotation = (deg: number): DockTarget =>
  deg === 90 ? "left" : deg === -90 ? "right" : "bottom";
const rotationTarget = (cx: number, vw: number, current: number): number => {
  const reach = facingReach(vw);
  const dl = cx;
  const dr = vw - cx;
  const exit = reach + ROTATE_HYST;
  if (current === 90) return dl <= exit ? 90 : dr <= reach ? -90 : 0;
  if (current === -90) return dr <= exit ? -90 : dl <= reach ? 90 : 0;
  if (dl <= reach) return 90;
  if (dr <= reach) return -90;
  return 0;
};

export interface DockSizes {
  horizontal: { width: number; height: number };
  vertical: { width: number; height: number };
  viewport: { width: number; height: number };
}

export interface DockGeometry {
  x: MotionValue<number>;
  y: MotionValue<number>;
  width: MotionValue<number>;
  height: MotionValue<number>;
  cornerRadius: MotionValue<number>;
  penRotation: MotionValue<number>;
  markerOffsetX: MotionValue<number>;
  markerOffsetY: MotionValue<number>;
  markerReveal: MotionValue<number>;
  feather: MotionValue<number>;
  horizontalOpacity: MotionValue<number>;
  verticalOpacity: MotionValue<number>;
  markerOpacity: MotionValue<number>;
  freezeCx: MotionValue<number>;
  freezeCy: MotionValue<number>;
  frozen: MotionValue<number>;
}

export interface DockDrag {
  phase: DockPhase;
  side: DockSide | null;
  atTop: boolean;
  collapsed: boolean;
  preview: DockTarget | null;
  geometry: DockGeometry;
  onHandlePointerDown: (e: ReactPointerEvent) => void;
  syncSizes: (sizes: DockSizes) => void;
}

interface DragSession {
  pointerId: number;
  grabX: number;
  grabY: number;
  startCenterX: number;
  startCenterY: number;
  centerX: number;
  centerY: number;
  originTarget: DockTarget;
}

interface TrayBox {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
}

interface Cancelable {
  stop: () => void;
  finished: Promise<unknown>;
}

export function useDockDrag({
  onDragStart,
  getSlotOffset,
  measureSizes,
}: {
  onDragStart?: () => void;
  getSlotOffset?: (target: DockTarget) => { x: number; y: number };
  measureSizes?: () => DockSizes;
} = {}): DockDrag {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const width = useMotionValue(0);
  const height = useMotionValue(DOCK_H);
  const cornerRadius = useMotionValue(DOCK_H / 2);
  const penRotation = useMotionValue(0);
  const markerOffsetX = useMotionValue(0);
  const markerOffsetY = useMotionValue(0);
  const markerReveal = useMotionValue(0);
  const feather = useMotionValue(0);
  const horizontalOpacity = useMotionValue(1);
  const verticalOpacity = useMotionValue(0);
  const markerOpacity = useMotionValue(0);
  const freezeCx = useMotionValue(0);
  const freezeCy = useMotionValue(0);
  const frozen = useMotionValue(0);

  const [phase, phaseRef, setPhase] = useStateRef<DockPhase>("bottom");
  const [side, sideRef, setSide] = useStateRef<DockSide | null>(null);
  const [atTop, atTopRef, setAtTop] = useStateRef(false);
  const [collapsed, collapsedRef, setCollapsed] = useStateRef(false);
  const [preview, previewRef, setPreview] = useStateRef<DockTarget | null>(null);

  const followRef = useRef(true);
  const disarmedRef = useRef<DockTarget | null>(null);
  const topMagnetRef = useRef(false);
  const sessionRef = useRef<DragSession | null>(null);
  const recenterUnsubs = useRef<Array<() => void>>([]);
  const rotateUnsubs = useRef<Array<() => void>>([]);
  const rotateTargetRef = useRef(0);
  const animsRef = useRef<Cancelable[]>([]);
  const genRef = useRef(0);
  const freeMorphRef = useRef(false);
  const freePosCtrls = useRef<Cancelable[]>([]);
  const slotFollowCtrls = useRef<Cancelable[]>([]);
  const slotOffsetRef = useRef<typeof getSlotOffset>(getSlotOffset);
  slotOffsetRef.current = getSlotOffset;
  const measureSizesRef = useRef(measureSizes);
  measureSizesRef.current = measureSizes;
  const slotFor = useCallback(
    (target: DockTarget) => slotOffsetRef.current?.(target) ?? { x: 0, y: 0 },
    [],
  );
  const initialSizes: DockSizes = {
    horizontal: { width: 0, height: DOCK_H },
    vertical: { width: DOCK_H, height: 0 },
    viewport: { width: 0, height: 0 },
  };
  const sizesRef = useRef<DockSizes>(initialSizes);
  const [sizesState, setSizesState] = useState<DockSizes>(initialSizes);

  const track = useCallback(<T extends Cancelable>(c: T): T => {
    animsRef.current.push(c);
    return c;
  }, []);
  const stopSlotFollow = () => {
    slotFollowCtrls.current.forEach((c) => c.stop());
    slotFollowCtrls.current = [];
  };
  const stopAll = useCallback(() => {
    genRef.current += 1;
    animsRef.current.forEach((c) => c.stop());
    animsRef.current = [];
    stopSlotFollow();
    rotateUnsubs.current.forEach((u) => u());
    rotateUnsubs.current = [];
  }, []);

  const isCircle = useCallback(
    () => Math.abs(width.get() - height.get()) < 2 && Math.abs(width.get() - CIRCLE) < 3,
    [width, height],
  );
  const runWhen = useCallback(
    (watch: MotionValue<number>[], predicate: () => boolean, cb: () => void) => {
      if (predicate()) {
        cb();
        return;
      }
      const gen = genRef.current;
      let done = false;
      const unsub = () => unsubs.forEach((u) => u());
      const check = () => {
        if (done) return;
        if (gen !== genRef.current) {
          done = true;
          unsub();
          return;
        }
        if (predicate()) {
          done = true;
          unsub();
          cb();
        }
      };
      const unsubs = watch.map((mv) => mv.on("change", check));
      rotateUnsubs.current.push(unsub);
    },
    [],
  );
  const rotateWhenCircular = useCallback(
    (target: number, transition: Transition) => {
      rotateTargetRef.current = target;
      if (penRotation.get() === target) return;
      const apply = prefersReducedMotion()
        ? () => penRotation.set(target)
        : () => track(animate(penRotation, target, transition));
      runWhen([width, height], isCircle, apply);
    },
    [runWhen, isCircle, track, penRotation, width, height],
  );

  useEffect(() => {
    const SPEED_FULL = 900;
    let raf = 0;
    let cur = 0;
    let idleFrames = 0;
    const tick = () => {
      const ph = phaseRef.current;
      const gated = (!sessionRef.current && (ph === "bottom" || ph === "top" || ph === "side")) || prefersReducedMotion();
      const speed = gated ? 0 : Math.abs(width.getVelocity()) + Math.abs(height.getVelocity());
      const target = Math.min(1, speed / SPEED_FULL);
      cur += (target - cur) * (target > cur ? 0.4 : 0.09);
      if (cur < 0.003 && target === 0) {
        cur = 0;
        feather.set(0);
        if (++idleFrames > 4) {
          raf = 0;
          return;
        }
      } else {
        feather.set(cur);
        idleFrames = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!raf) {
        idleFrames = 0;
        raf = requestAnimationFrame(tick);
      }
    };
    const unsubs = [width, height].map((mv) => mv.on("change", start));
    start();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      unsubs.forEach((u) => u());
    };
  }, [width, height, feather]);

  const boxFor = useCallback((target: DockTarget): TrayBox => {
    const sizes = measureSizesRef.current?.() ?? sizesRef.current;
    sizesRef.current = sizes;
    const { horizontal, vertical, viewport } = sizes;
    if (isHorizontal(target)) {
      const w = horizontal.width;
      const h = DOCK_H;
      const y = target === "top" ? EDGE_INSET : viewport.height - h - EDGE_INSET;
      return { w, h, radius: h / 2, x: (viewport.width - w) / 2, y };
    }
    const w = DOCK_H;
    const h = vertical.height;
    const tx = target === "left" ? EDGE_INSET : viewport.width - EDGE_INSET - w;
    return { w, h, radius: w / 2, x: tx, y: (viewport.height - h) / 2 };
  }, []);

  const place = useCallback(
    (target: DockTarget) => {
      stopAll();
      const b = boxFor(target);
      const horizontal = isHorizontal(target);
      const rot = horizontal ? 0 : sideRotation(target);
      width.set(b.w);
      height.set(b.h);
      cornerRadius.set(b.radius);
      x.set(b.x);
      y.set(b.y);
      horizontalOpacity.set(horizontal ? 1 : 0);
      verticalOpacity.set(horizontal ? 0 : 1);
      markerOpacity.set(0);
      penRotation.set(rot);
      rotateTargetRef.current = rot;
      markerOffsetX.set(0);
      markerOffsetY.set(0);
      markerReveal.set(0);
      frozen.set(0);
    },
    [stopAll, boxFor, width, height, cornerRadius, x, y, horizontalOpacity, verticalOpacity, markerOpacity, penRotation, markerOffsetX, markerOffsetY, markerReveal, frozen],
  );

  const syncSizes = useCallback((sizes: DockSizes) => {
    sizesRef.current = sizes;
    setSizesState((prev) =>
      prev.horizontal.width === sizes.horizontal.width &&
      prev.horizontal.height === sizes.horizontal.height &&
      prev.vertical.width === sizes.vertical.width &&
      prev.vertical.height === sizes.vertical.height &&
      prev.viewport.width === sizes.viewport.width &&
      prev.viewport.height === sizes.viewport.height
        ? prev
        : sizes,
    );
  }, []);

  useEffect(() => {
    if (phase === "bottom") place("bottom");
    else if (phase === "top") place("top");
    else if (phase === "side" && side) place(side);
  }, [sizesState, phase, side, place]);

  const settle = useCallback(
    (
      geom: [MotionValue<number>, number, Transition?][],
      fades: [MotionValue<number>, number][],
      done: () => void,
    ) => {
      stopAll();
      frozen.set(0);
      if (prefersReducedMotion()) {
        [...geom, ...fades].forEach(([mv, v]) => mv.set(v));
        feather.set(0);
        done();
        return;
      }
      const gen = genRef.current;
      const controls = geom.map(([mv, v, tr]) => track(animate(mv, v, tr ?? SETTLE)));
      const fadeControls = fades.map(([mv, v]) => track(animate(mv, v, layoutFadeTransition(v > 0))));
      Promise.allSettled([...controls, ...fadeControls].map((c) => c.finished)).then(() => {
        if (gen === genRef.current) done();
      });
    },
    [stopAll, track, feather, frozen],
  );

  const recenter = useCallback(() => {
    const s = sessionRef.current;
    if (!s || !followRef.current) return;
    x.set(s.centerX - width.get() / 2);
    y.set(s.centerY - height.get() / 2);
  }, [x, y, width, height]);

  const retargetFreePos = useCallback(
    (cx: number, cy: number) => {
      freePosCtrls.current.forEach((c) => c.stop());
      freePosCtrls.current = [
        track(animate(x, cx - CIRCLE / 2, MORPH)),
        track(animate(y, cy - CIRCLE / 2, MORPH)),
      ];
    },
    [track, x, y],
  );

  const targetFor = useCallback((cx: number, cy: number): DockTarget | null => {
    const { width: vw, height: vh } = sizesRef.current.viewport;
    if (cy >= vh - BOTTOM_ZONE && disarmedRef.current !== "bottom") return "bottom";
    if (cx <= SNAP_ZONE && disarmedRef.current !== "left") return "left";
    if (cx >= vw - SNAP_ZONE && disarmedRef.current !== "right") return "right";
    return null;
  }, []);

  const animateToCircle = useCallback(
    (transition: Transition): Cancelable => {
      const wCtrl = track(animate(width, CIRCLE, transition));
      track(animate(height, CIRCLE, transition));
      track(animate(cornerRadius, CIRCLE / 2, transition));
      track(animate(markerOffsetX, 0, transition));
      track(animate(markerOffsetY, 0, transition));
      track(animate(markerReveal, 1, transition));
      return wCtrl;
    },
    [track, width, height, cornerRadius, markerOffsetX, markerOffsetY, markerReveal],
  );

  const retargetSlot = useCallback(
    (target: DockTarget, snap: boolean) => {
      const slot = slotFor(target);
      stopSlotFollow();
      if (snap) {
        markerOffsetX.set(slot.x);
        markerOffsetY.set(slot.y);
        return;
      }
      slotFollowCtrls.current = [
        track(animate(markerOffsetX, slot.x, MORPH)),
        track(animate(markerOffsetY, slot.y, MORPH)),
      ];
    },
    [slotFor, track, markerOffsetX, markerOffsetY],
  );
  const bindSlotFollow = useCallback(
    (target: DockTarget, snap = false) => {
      retargetSlot(target, snap);
      const sync = () => retargetSlot(target, snap);
      const unsubs = [width, height, x, y, horizontalOpacity, verticalOpacity].map((mv) =>
        mv.on("change", sync),
      );
      const cleanup = () => {
        unsubs.forEach((u) => u());
        stopSlotFollow();
      };
      rotateUnsubs.current.push(cleanup);
    },
    [retargetSlot, width, height, x, y, horizontalOpacity, verticalOpacity],
  );

  const previewTo = useCallback(
    (target: DockTarget | null, s: DragSession) => {
      const prevPreview = previewRef.current;
      stopAll();
      frozen.set(0);
      freeMorphRef.current = false;
      freePosCtrls.current = [];
      setPreview(target);
      followRef.current = false;
      if (target !== null) {
        const b = boxFor(target);
        const isSide = !isHorizontal(target);
        const rot = isSide ? sideRotation(target) : 0;
        rotateTargetRef.current = rot;
        const rowShowing =
          isSide &&
          (prevPreview === "left" || prevPreview === "right" || verticalOpacity.get() > 0.1);
        const hTarget = isHorizontal(target) ? 1 : 0;
        const vTarget = isHorizontal(target) ? 0 : 1;
        const expand = () => {
          bindSlotFollow(target, rowShowing);
          track(animate(width, b.w, MORPH));
          track(animate(height, b.h, MORPH));
          track(animate(cornerRadius, b.radius, MORPH));
          track(animate(x, b.x, MORPH));
          track(animate(y, b.y, MORPH));
          track(animate(markerReveal, 0, MORPH));
          track(animate(horizontalOpacity, hTarget, layoutFadeTransition(hTarget > 0)));
          track(animate(verticalOpacity, vTarget, layoutFadeTransition(vTarget > 0)));
        };
        if (rowShowing || !isSide) {
          if (rowShowing) penRotation.set(rot);
          else track(animate(penRotation, 0, MORPH));
          expand();
          return;
        }
        track(animate(penRotation, rot, ROT_SNAP));
        runWhen([penRotation], () => Math.abs(penRotation.get() - rot) < 6, expand);
        return;
      }
      const rot = rotationTarget(s.centerX, sizesRef.current.viewport.width, rotateTargetRef.current);
      rotateTargetRef.current = rot;
      if (prefersReducedMotion()) {
        followRef.current = true;
        width.set(CIRCLE);
        height.set(CIRCLE);
        cornerRadius.set(CIRCLE / 2);
        markerOffsetX.set(0);
        markerOffsetY.set(0);
        markerReveal.set(1);
        penRotation.set(rot);
        x.set(s.centerX - CIRCLE / 2);
        y.set(s.centerY - CIRCLE / 2);
        horizontalOpacity.set(0);
        verticalOpacity.set(0);
        feather.set(0);
        return;
      }
      followRef.current = false;
      freeMorphRef.current = true;
      const wCtrl = animateToCircle(MORPH);
      rotateWhenCircular(rot, ROT_SNAP);
      track(animate(horizontalOpacity, 0, { duration: FADE, ease: "easeInOut" }));
      track(animate(verticalOpacity, 0, { duration: FADE, ease: "easeInOut" }));
      retargetFreePos(s.centerX, s.centerY);
      const gen = genRef.current;
      Promise.allSettled([wCtrl.finished]).then(() => {
        if (gen !== genRef.current) return;
        freeMorphRef.current = false;
        freePosCtrls.current.forEach((c) => c.stop());
        freePosCtrls.current = [];
        followRef.current = true;
        recenter();
      });
    },
    [stopAll, track, setPreview, boxFor, bindSlotFollow, runWhen, rotateWhenCircular, animateToCircle, width, height, cornerRadius, x, y, penRotation, markerOffsetX, markerOffsetY, markerReveal, feather, frozen, horizontalOpacity, verticalOpacity, retargetFreePos, recenter],
  );

  const collapse = useCallback(
    () => {
      stopAll();
      freeMorphRef.current = false;
      freePosCtrls.current = [];
      setCollapsed(true);
      setPreview(null);
      followRef.current = true;
      freezeCx.set(x.get() + width.get() / 2);
      freezeCy.set(y.get() + height.get() / 2);
      frozen.set(1);
      if (prefersReducedMotion()) {
        width.set(CIRCLE);
        height.set(CIRCLE);
        cornerRadius.set(CIRCLE / 2);
        markerOffsetX.set(0);
        markerOffsetY.set(0);
        markerReveal.set(1);
        horizontalOpacity.set(0);
        verticalOpacity.set(0);
        feather.set(0);
        recenter();
        return;
      }
      track(animate(horizontalOpacity, 0, { duration: FADE, ease: "easeOut" }));
      track(animate(verticalOpacity, 0, { duration: FADE, ease: "easeOut" }));
      animateToCircle(COLLAPSE);
    },
    [stopAll, track, setCollapsed, setPreview, animateToCircle, markerOffsetX, markerOffsetY, markerReveal, width, height, cornerRadius, x, y, freezeCx, freezeCy, frozen, feather, horizontalOpacity, verticalOpacity, recenter],
  );

  const onMove = useCallback(
    (e: PointerEvent) => {
      const s = sessionRef.current;
      if (!s || e.pointerId !== s.pointerId) return;
      s.centerX = e.clientX - s.grabX;
      s.centerY = e.clientY - s.grabY;
      recenter();
      if (!collapsedRef.current) {
        const dist = Math.hypot(s.centerX - s.startCenterX, s.centerY - s.startCenterY);
        if (dist > LIFT_DISTANCE) collapse();
        return;
      }
      const { width: vw, height: vh } = sizesRef.current.viewport;
      const dr = disarmedRef.current;
      if (dr === "left" && s.centerX > SNAP_ZONE) disarmedRef.current = null;
      else if (dr === "right" && s.centerX < vw - SNAP_ZONE) disarmedRef.current = null;
      else if (dr === "bottom" && s.centerY < vh - BOTTOM_ZONE) disarmedRef.current = null;
      else if (dr === "top" && s.centerY > TOP_ZONE) disarmedRef.current = null;
      const target = targetFor(s.centerX, s.centerY);
      topMagnetRef.current = target === null && s.centerY <= TOP_ZONE;
      if (target !== previewRef.current) previewTo(target, s);
      else if (freeMorphRef.current && target === null) retargetFreePos(s.centerX, s.centerY);
      if (followRef.current) {
        const rot = rotationTarget(s.centerX, vw, rotateTargetRef.current);
        if (rot !== rotateTargetRef.current) rotateWhenCircular(rot, ROT_SNAP);
      }
    },
    [recenter, collapse, targetFor, previewTo, rotateWhenCircular, retargetFreePos],
  );

  const commitTo = useCallback(
    (target: DockTarget) => {
      const horizontal = isHorizontal(target);
      setSide(horizontal ? null : target);
      setAtTop(target === "top");
      const restPhase: DockPhase = isHorizontal(target) ? target : "side";
      setPhase(horizontal ? "returning" : "snapping");
      const b = boxFor(target);
      const rot = horizontal ? 0 : sideRotation(target);
      settle(
        [
          [width, b.w],
          [height, b.h],
          [cornerRadius, b.radius],
          [x, b.x],
          [y, b.y],
          [penRotation, rot, MORPH],
        ],
        [
          [horizontalOpacity, horizontal ? 1 : 0],
          [verticalOpacity, horizontal ? 0 : 1],
        ],
        () => setPhase(restPhase),
      );
      bindSlotFollow(target);
      track(animate(markerReveal, 0, MORPH));
    },
    [setSide, setAtTop, setPhase, settle, boxFor, bindSlotFollow, track, width, height, cornerRadius, x, y, penRotation, markerReveal, horizontalOpacity, verticalOpacity],
  );

  const onUp = useCallback(
    (e: PointerEvent) => {
      const s = sessionRef.current;
      if (!s || e.pointerId !== s.pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      recenterUnsubs.current.forEach((u) => u());
      recenterUnsubs.current = [];
      const wasCollapsed = collapsedRef.current;
      const target = previewRef.current;
      const origin = s.originTarget;
      sessionRef.current = null;
      followRef.current = true;
      freeMorphRef.current = false;
      freePosCtrls.current = [];
      setCollapsed(false);
      setPreview(null);
      if (wasCollapsed) {
        const dest: DockTarget =
          target ??
          (topMagnetRef.current && rotateTargetRef.current === 0
            ? "top"
            : targetFromRotation(rotateTargetRef.current));
        commitTo(dest);
      } else {
        commitTo(origin);
      }
    },
    [onMove, commitTo, setCollapsed, setPreview],
  );

  const onHandlePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const ph = phaseRef.current;
      if (ph !== "bottom" && ph !== "top" && ph !== "side") return;
      e.preventDefault();
      onDragStart?.();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
      }
      stopAll();
      const cx = x.get() + width.get() / 2;
      const cy = y.get() + height.get() / 2;
      const originTarget: DockTarget = sideRef.current ?? (atTopRef.current ? "top" : "bottom");
      const slot = slotFor(originTarget);
      sessionRef.current = {
        pointerId: e.pointerId,
        grabX: e.clientX - cx,
        grabY: e.clientY - cy,
        startCenterX: cx,
        startCenterY: cy,
        centerX: cx,
        centerY: cy,
        originTarget,
      };
      followRef.current = true;
      freeMorphRef.current = false;
      freePosCtrls.current = [];
      disarmedRef.current = originTarget;
      topMagnetRef.current = false;
      setCollapsed(false);
      setPreview(null);
      setPhase("dragging");
      const originRot = sideRef.current ? sideRotation(sideRef.current) : 0;
      markerOffsetX.set(slot.x);
      markerOffsetY.set(slot.y);
      markerReveal.set(0);
      penRotation.set(originRot);
      rotateTargetRef.current = originRot;
      markerOpacity.set(1);
      frozen.set(0);
      recenterUnsubs.current = [width.on("change", recenter), height.on("change", recenter)];
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [onDragStart, slotFor, stopAll, x, y, width, height, markerOpacity, markerOffsetX, markerOffsetY, markerReveal, penRotation, frozen, recenter, setCollapsed, setPreview, setPhase, onMove, onUp],
  );

  useEffect(() => {
    return () => {
      if (!sessionRef.current) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      recenterUnsubs.current.forEach((u) => u());
      recenterUnsubs.current = [];
      sessionRef.current = null;
    };
  }, [onMove, onUp]);

  return {
    phase,
    side,
    atTop,
    collapsed,
    preview,
    geometry: {
      x,
      y,
      width,
      height,
      cornerRadius,
      penRotation,
      markerOffsetX,
      markerOffsetY,
      markerReveal,
      feather,
      horizontalOpacity,
      verticalOpacity,
      markerOpacity,
      freezeCx,
      freezeCy,
      frozen,
    },
    onHandlePointerDown,
    syncSizes,
  };
}
