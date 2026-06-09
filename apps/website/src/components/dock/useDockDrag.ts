import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { animate, useMotionValue, type MotionValue, type Transition } from "framer-motion";
import { prefersReducedMotion } from "../playground/slider-utils.ts";
import { DOCK_H, EDGE_INSET } from "./constants.ts";
import { zones, facingReach } from "./dock-zone-tuning.ts";

// Drag-to-dock state machine. `useDockDrag` owns all pointer math, snap detection, and the
// animated geometry MotionValues so `Dock.tsx` stays declarative: it reads `phase`/`side`/`collapsed`
// /`preview` for the layout swap and binds the MotionValues to the morphing background + marker.
//
// One pen, always moving: the selected pen is carried by a single overlay (CollapsedMarker) that
// glides between the circle centre and the exact slot of whichever dock is being previewed/committed.
// `Dock.tsx` hides the row's selected pen whenever this overlay is the active representation and only
// hands back once fully at rest - so the pen is never a fade between two different SVGs.
export type DockPhase = "bottom" | "top" | "dragging" | "snapping" | "returning" | "side";
export type DockSide = "left" | "right";
// While dragging the collapsed circle, which dock it is previewing (expanded, anchored) - or null
// (a free circle following the pointer).
export type DockTarget = "left" | "right" | "bottom" | "top";

// Top and bottom are the same horizontal capsule (pens upright), just anchored to opposite edges;
// left/right are the rotated vertical pill. The horizontal/side split drives layout + rotation.
const isHorizontal = (t: DockTarget): boolean => t === "bottom" || t === "top";

const CIRCLE = DOCK_H;
// The snap/rotate/lift distances live in dock-zone-tuning.ts so the dev-only ?zones panel can dial
// them live; read via zones() at pointer-time. Its defaults reproduce the shipped values exactly.
// Content opacity crossfade (requirement 2: <=180ms).
const FADE = 0.18;
// Expand (circle -> dock): the carried pen glides to its slot first; the surrounding contents
// (nav, other pens, palette, links) only fade IN after this delay, so the pen visibly lands before
// everything appears. This delay is on the appearing layer's OPACITY only (never on the shape), so
// it preserves "the pen lands before contents appear" without gating the interruptible shape morph.
const EXPAND_FADE = 0.16;
// Collapse (pill -> circle): a physics spring (stiffness/damping), NOT a fixed duration, so an
// interrupted collapse retargets from its current value AND velocity - no zero-velocity restart and
// no stranded half-state if the pointer moves mid-collapse. Critically damped (damping >= 2*sqrt(k))
// so the shape eases to the circle with no overshoot.
const COLLAPSE = { type: "spring", stiffness: 400, damping: 42 } as const;
// Preview morph (circle <-> docked) and the live, anchored transitions.
const MORPH = { type: "spring", stiffness: 460, damping: 42 } as const;
// Commit settle (release -> docked): softer/slower than MORPH so the circle eases in and lands with a
// small, gentle overshoot (~2%) from the slight underdamping. `velocity: 0` makes that overshoot a
// constant designed amount, not one scaling with how hard the release was thrown. Pen rotation + reveal
// stay on MORPH so the marker never over-rotates.
const SETTLE = { type: "spring", stiffness: 300, damping: 27, velocity: 0 } as const;
// Rotation snap: the pen jumps (springs) fully to its docked angle on entering an edge zone, back to
// upright on leaving - it does NOT track the cursor angle.
const ROT_SNAP = { type: "spring", stiffness: 520, damping: 38 } as const;

const layoutFadeTransition = (appearing: boolean) =>
  ({ duration: FADE, ease: "easeInOut" as const, delay: appearing ? EXPAND_FADE : 0 });

// One useState whose latest value is also mirrored to a ref, so the stable pointer handlers can read it
// synchronously (state lags a render; the ref doesn't). Returns [value, ref, set]; `set` updates both.
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
// Pen facing for a free circle centered at `cx`: faces the nearer edge (inward) within a generous
// band, upright only in the centre. Hysteresis (`current`) keeps it sticky so a side dock grabbed
// into a circle holds its facing until dragged well toward the middle. Left -> +90, right -> -90.
const rotationTarget = (cx: number, vw: number, current: number): number => {
  const reach = facingReach(vw);
  const { rotateHyst } = zones();
  const dl = cx;
  const dr = vw - cx;
  const exit = reach + rotateHyst;
  if (current === 90) return dl <= exit ? 90 : dr <= reach ? -90 : 0;
  if (current === -90) return dr <= exit ? -90 : dl <= reach ? 90 : 0;
  if (dl <= reach) return 90;
  if (dr <= reach) return -90;
  return 0;
};

// Latest measured layout sizes, fed in from the component so the hook reads fresh numbers during a
// drag without re-subscribing. `vertical.height` drives the side pill length; `horizontal.width`
// the bottom capsule length.
export interface DockSizes {
  horizontal: { width: number; height: number };
  vertical: { width: number; height: number };
  viewport: { width: number; height: number };
}

// The animated geometry contract consumed by Dock.tsx and its presenters.
export interface DockGeometry {
  /** Tray top-left in fixed (viewport) coordinates. */
  x: MotionValue<number>;
  y: MotionValue<number>;
  /** Tray box size; the background path is generated from these. */
  width: MotionValue<number>;
  height: MotionValue<number>;
  cornerRadius: MotionValue<number>;
  /** Selected pen rotation in degrees (snaps to the inward docked angle near an edge). */
  penRotation: MotionValue<number>;
  /** Carried pen offset from the tray center (px): 0 at the circle centre, the slot in each dock. */
  markerOffsetX: MotionValue<number>;
  markerOffsetY: MotionValue<number>;
  /** Carried pen reveal: 0 = clipped/aligned at a dock slot, 1 = full pen centred in the circle. */
  markerReveal: MotionValue<number>;
  /** Feathered mask-edge opacity: >0 only while the shape is morphing, 0 at every settled state. */
  feather: MotionValue<number>;
  /** Horizontal (bottom) layout visibility. */
  horizontalOpacity: MotionValue<number>;
  /** Vertical (side) layout visibility. */
  verticalOpacity: MotionValue<number>;
  /** Carried single-pen overlay visibility. */
  markerOpacity: MotionValue<number>;
  /** Frozen on-screen centre the fading contents hold during a collapse, and the 0/1 gate for it. */
  freezeCx: MotionValue<number>;
  freezeCy: MotionValue<number>;
  frozen: MotionValue<number>;
}

export interface DockDrag {
  phase: DockPhase;
  side: DockSide | null;
  /** Resting at the top dock (vs bottom). The grab handle stays top-centred either way (matches the bottom dock). */
  atTop: boolean;
  /** True once a drag has pinched the pill into the circle (drives handle hiding). */
  collapsed: boolean;
  /** Which dock the collapsed circle is currently previewing (expanded), or null for a free circle. */
  preview: DockTarget | null;
  geometry: DockGeometry;
  /** Bind to the grab handle's onPointerDown. */
  onHandlePointerDown: (e: ReactPointerEvent) => void;
  /** Keep the hook's view of layout/viewport sizes current; repositions the resting tray. */
  syncSizes: (sizes: DockSizes) => void;
}

interface DragSession {
  pointerId: number;
  // Pointer offset from the tray center at grab time, so the pill/circle follows the pointer 1:1.
  grabX: number;
  grabY: number;
  // Rest center at grab time, used to measure lift distance.
  startCenterX: number;
  startCenterY: number;
  // Live center, kept current on move; read on release to pick the snap target.
  centerX: number;
  centerY: number;
  // Where the drag began, so a release before collapse restores it (incl. top vs bottom).
  originTarget: DockTarget;
}

// The tray's rest rectangle for a dock target (top-left + size + corner radius).
interface TrayBox {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
}

// Minimal shape of framer's animation handle we hold onto so we can hard-cancel in-flight tweens.
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
  /** Selected pen center offset from the tray center for a dock layout, so the overlay glides to the
   *  exact slot in each layout (carry the real pen rather than crossfade between two SVGs). */
  getSlotOffset?: (target: DockTarget) => { x: number; y: number };
  /** Synchronous layout read before preview/snap so cross-layout morphs use the right stack size. */
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
  // Feathered mask edge strength: 1 only while the shape is actively morphing (so content dissolving
  // past the clip is softened), 0 at every settled state (bottom, side, stable circle, anchored preview).
  const feather = useMotionValue(0);
  const horizontalOpacity = useMotionValue(1);
  const verticalOpacity = useMotionValue(0);
  const markerOpacity = useMotionValue(0);
  // Content freeze: while the contents dissolve on collapse they HOLD the on-screen centre they had at
  // collapse-start instead of tracking the morphing container - so the capsule narrowing to a circle
  // never pushes them left/right; they just fade in place while the selected pen carries to centre.
  // freezeCx/Cy = that frozen centre (viewport px); frozen = 1 only during the collapse fade. Dock
  // counter-translates the content rows by (freeze - live centre) when frozen.
  const freezeCx = useMotionValue(0);
  const freezeCy = useMotionValue(0);
  const frozen = useMotionValue(0);

  // State + a ref mirror for each (the pointer handlers read the refs synchronously; see useStateRef).
  const [phase, phaseRef, setPhase] = useStateRef<DockPhase>("bottom");
  const [side, sideRef, setSide] = useStateRef<DockSide | null>(null);
  // Resting at the top dock (vs bottom). Set synchronously at commit so the grab handle sits on the
  // correct inner edge through the return animation, not just once `phase` flips to "top".
  const [atTop, atTopRef, setAtTop] = useStateRef(false);
  const [collapsed, collapsedRef, setCollapsed] = useStateRef(false);
  const [preview, previewRef, setPreview] = useStateRef<DockTarget | null>(null);

  // When true the circle tracks the pointer; false while a preview/transition owns x/y (anchored).
  const followRef = useRef(true);
  // The drag's origin dock stays disarmed (won't re-preview/snap) until the circle leaves that dock's
  // zone, so grabbing a dock yields a forgiving free circle instead of instantly re-docking. Crucially
  // this includes the BOTTOM: grabbing the bottom dock disarms the bottom band, so a horizontal drag
  // along the floor becomes a pointer-following circle (iPadOS-style) instead of snapping to centre.
  const disarmedRef = useRef<DockTarget | null>(null);
  // The collapsed circle is over the top safe zone: a release commits to the top dock (when upright),
  // but dragging through it never previews/expands - the soft, non-forcing counterpart to the side snap.
  const topMagnetRef = useRef(false);
  const sessionRef = useRef<DragSession | null>(null);
  // Live subscriptions that recenter the circle during the collapse spring; torn down on release.
  const recenterUnsubs = useRef<Array<() => void>>([]);
  // Deferred-rotation subscriptions: a pen rotation (or a shape expansion gated on rotation) only fires
  // once a predicate holds (the shape is a circle / the rotation has landed). Cleared by `stopAll` so a
  // newer transition cancels any pending one. See `runWhen` / "rotate only while a circle".
  const rotateUnsubs = useRef<Array<() => void>>([]);
  // Current snapped rotation target (deg); only re-springs when the cursor crosses a zone boundary.
  const rotateTargetRef = useRef(0);
  // Every in-flight tween, so a new transition (or reaching rest) can hard-cancel the previous ones -
  // including delayed ones - instead of leaving stray animations to fire late and wedge the dock.
  const animsRef = useRef<Cancelable[]>([]);
  // Bumped on every cancel; a settle's deferred `done` only runs if its generation is still current.
  const genRef = useRef(0);
  // The revert (anchored dock -> free circle) decouples position from shape: the SHAPE springs
  // pill->circle in place while the POSITION springs to a circle centred on the live pointer. This is
  // true only for that (interruptible) morph window; onMove retargets the position spring to the live
  // pointer while it's set, and the shape's settle hands back to 1:1 hard-follow. `freePosCtrls` holds
  // the live position springs so they can be hard-stopped at hand-off (a bare `.set()` wouldn't stop them).
  const freeMorphRef = useRef(false);
  const freePosCtrls = useRef<Cancelable[]>([]);
  // Live slot-follow springs (retargeted as the tray morphs); hard-stopped in `stopAll`.
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
  // A state mirror of the sizes so resting placement runs as a reactive effect (deterministic after
  // commit, unlike an imperative set during the mount measure which raced framer's subscription).
  const [sizesState, setSizesState] = useState<DockSizes>(initialSizes);

  // Register a tween so it can be cancelled later. `stopAll` cancels every tracked tween and bumps the
  // generation, invalidating any pending settle `done`. Called at the start of every transition and on
  // reaching rest, so the dock can never be left in a half-finished state by rapid input.
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

  // True when the tray is (essentially) the collapsed circle: square and ~CIRCLE-sized. The pen is only
  // ever allowed to ROTATE in this state, so it never tilts to a partial angle inside an oval/pill.
  const isCircle = useCallback(
    () => Math.abs(width.get() - height.get()) < 2 && Math.abs(width.get() - CIRCLE) < 3,
    [width, height],
  );
  // Run `cb` as soon as `predicate` holds: immediately if already true, else on the next change of any
  // watched MotionValue (gen-guarded + self-cleaning, registered for `stopAll` teardown). The backbone
  // of "rotate only while a circle" (watch width/height) and "expand only after the rotation has landed"
  // (watch penRotation).
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
  // Spring the pen to `target`, but only while the shape is the circle - if it's mid-morph (oval/pill),
  // hold the current angle and wait until it rounds out. Snaps under reduced motion.
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

  // Feather controller: the soft mask edge is driven by the shape's SPEED, not events/timers. Each frame
  // it eases the feather toward (width+height velocity)/SPEED_FULL. Velocity is 0 at rest and decays as
  // the spring settles, so the feather rises with the motion and fades AS it slows - never a flash or a
  // settle-timer linger. Asymmetric easing (quick rise, gentle fall) keeps the dissolve soft. The loop
  // self-pauses when idle and re-arms on the next box change; at-rest `.set()`s (place, resize) are gated out.
  useEffect(() => {
    const SPEED_FULL = 900; // combined |dW|+|dH| (px/s) at which the feather is fully on
    let raf = 0;
    let cur = 0;
    let idleFrames = 0;
    const tick = () => {
      const ph = phaseRef.current;
      const gated = (!sessionRef.current && (ph === "bottom" || ph === "top" || ph === "side")) || prefersReducedMotion();
      const speed = gated ? 0 : Math.abs(width.getVelocity()) + Math.abs(height.getVelocity());
      const target = Math.min(1, speed / SPEED_FULL);
      // Quick to rise with the motion, gentle to fall so the dissolve reads softly and brief
      // decelerations between chained morphs don't dip it.
      cur += (target - cur) * (target > cur ? 0.4 : 0.09);
      if (cur < 0.003 && target === 0) {
        cur = 0;
        feather.set(0);
        if (++idleFrames > 4) {
          raf = 0;
          return; // settled: pause the loop until the next box change re-arms it
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

  // The single source of tray sizing/placement: bottom capsule (full width, anchored bottom-centre)
  // or a side pill (DOCK_H wide, full height, anchored to its edge). Used for both the instant rest
  // placement and the animated preview/snap targets.
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

  // Snap the geometry to a target's rest box (bottom capsule or side pill). Instant: only called at rest
  // / on resize. The feather is owned by the motion controller (it eases out once the shape stops), so
  // placement never touches it - hard-zeroing it here is what produced the mask pop.
  const place = useCallback(
    (target: DockTarget) => {
      stopAll();
      const b = boxFor(target);
      const horizontal = isHorizontal(target);
      const rot = horizontal ? 0 : sideRotation(target as DockSide);
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

  // Reposition the resting tray whenever sizes/phase settle. Skipped mid-drag and during the
  // snap/return animations (which own the values until they finish and flip phase here).
  useEffect(() => {
    if (phase === "bottom") place("bottom");
    else if (phase === "top") place("top");
    else if (phase === "side" && side) place(side);
  }, [sizesState, phase, side, place]);

  // Animate `geom` (spring; per-entry transition, default the bouncy SETTLE) + `fades` (tween) to
  // targets, then run `done`. Reduced motion: jump.
  const settle = useCallback(
    (
      geom: [MotionValue<number>, number, Transition?][],
      fades: [MotionValue<number>, number][],
      done: () => void,
    ) => {
      stopAll();
      // The contents fade IN to their normal positions on a settle, so release the collapse freeze.
      frozen.set(0);
      if (prefersReducedMotion()) {
        [...geom, ...fades].forEach(([mv, v]) => mv.set(v));
        feather.set(0);
        done();
        return;
      }
      const gen = genRef.current;
      const controls = geom.map(([mv, v, tr]) => track(animate(mv, v, tr ?? SETTLE)));
      // Expand timing: let the carried pen land in its slot before the contents arrive. The appearing
      // layer (target 1) fades in after EXPAND_FADE; the layer fading OUT (target 0) is not delayed.
      const fadeControls = fades.map(([mv, v]) => track(animate(mv, v, layoutFadeTransition(v > 0))));
      // allSettled (not all) so an interrupted tween still resolves; the gen guard drops it if a newer
      // transition has since taken over, so `done` (the phase flip) fires exactly once, for this settle.
      // Gate on the fades too: the rest-place reset that `done` triggers would otherwise snap the
      // delayed contents to full opacity early, popping them in before the fade-in finishes.
      Promise.allSettled([...controls, ...fadeControls].map((c) => c.finished)).then(() => {
        if (gen === genRef.current) done();
      });
    },
    [stopAll, track, feather, frozen],
  );

  // Keep the (shrinking) circle centered on the live pointer-tracked center. No-op while a preview
  // owns the position (followRef false), so the docked preview stays anchored to its edge.
  const recenter = useCallback(() => {
    const s = sessionRef.current;
    if (!s || !followRef.current) return;
    x.set(s.centerX - width.get() / 2);
    y.set(s.centerY - height.get() / 2);
  }, [x, y, width, height]);

  // Spring the tray position to a circle centred on the live pointer (cx, cy), retargeting on each
  // move so a revert tracks the cursor (no fly-to-cursor lag) while the shape springs to the circle.
  // `MotionValue.start()` stops the prior animation, so repeated retargets carry velocity cleanly; we
  // keep the handles so the settle can hard-stop them when 1:1 follow resumes.
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

  // Which dock the collapsed circle should preview for a center at (cx, cy), or null for a free circle.
  // The bottom band wins FIRST (incl. the bottom corners): the side zones are only the edges ABOVE it, so
  // dragging along the floor previews the bottom dock instead of flipping to a side pill that snaps up to
  // mid-screen. (The bottom corners overlap both zones; without this they'd read as a side dock.)
  // The dock the circle should preview (expand into, anchored) while dragging. The top is deliberately
  // absent: it is a soft "safe zone" that only commits on release (topMagnet), so dragging near the top
  // never auto-expands the pill and forces your hand. The bottom band still wins its corners.
  const targetFor = useCallback((cx: number, cy: number): DockTarget | null => {
    const { width: vw, height: vh } = sizesRef.current.viewport;
    const { bottomZone, snapZone } = zones();
    if (cy >= vh - bottomZone && disarmedRef.current !== "bottom") return "bottom";
    if (cx <= snapZone && disarmedRef.current !== "left") return "left";
    if (cx >= vw - snapZone && disarmedRef.current !== "right") return "right";
    return null;
  }, []);

  // Animate the tray box + carried pen to the centred circle on `transition`. Shared by the lift
  // collapse (COLLAPSE spring) and the docked->free-circle revert (MORPH spring): the box/pen targets
  // are identical, only the transition differs. Returns the width control so a caller can await the morph.
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

  // Spring the carried pen toward the selected row pen as the tray morphs. Slot reads track the live
  // DOM (flex-centred contents inside the growing pill); each retarget carries velocity so cross-layout
  // moves (bottom<->side) glide instead of hard-snapping. Side<->side crossings snap to avoid a doubled
  // marker while the row rotation flips instantly.
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

  // Morph the collapsed circle to/from a previewed dock as it enters/leaves an edge zone. The carried
  // pen glides to the dock's slot (or back to centre) - it stays the same visible pen the whole time.
  const previewTo = useCallback(
    (target: DockTarget | null, s: DragSession) => {
      // The preview we're leaving (read before setPreview overwrites the ref below): used to tell a
      // side<->side crossing (row already on screen) from a fresh circle->side entry (row still hidden).
      const prevPreview = previewRef.current;
      stopAll();
      // Previewing a dock fades a layout IN to its normal slots, so release the collapse freeze.
      frozen.set(0);
      freeMorphRef.current = false;
      freePosCtrls.current = [];
      setPreview(target);
      followRef.current = false;
      if (target !== null) {
        const b = boxFor(target);
        const isSide = !isHorizontal(target);
        const rot = isSide ? sideRotation(target as DockSide) : 0;
        rotateTargetRef.current = rot;
        // The row's rotation + slot snap INSTANTLY (penDeg is a plain re-render, no tween). So when the
        // side row is already on screen - crossing side-to-side, or reversing before a brief free-circle
        // dip faded it out - the carried pen must SNAP its rotation/slot to match; springing them would
        // leave it lagging at the old angle while the row sits at the new one (the doubled marker). A
        // genuine circle->side entry (row still hidden) gets the rotate-in-circle-then-expand below.
        const rowShowing =
          isSide &&
          (prevPreview === "left" || prevPreview === "right" || verticalOpacity.get() > 0.1);
        // Same expand timing as `settle`: the appearing layer (target 1) waits EXPAND_FADE so the
        // carried pen reaches its slot first; the layer fading OUT (target 0) is not delayed.
        const hTarget = isHorizontal(target) ? 1 : 0;
        const vTarget = isHorizontal(target) ? 0 : 1;
        // Expand the circle into the dock's box (shape, position, slot, contents). The pen rotation is
        // handled separately so it can be confined to the circle phase.
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
          // Side<->side crossing: snap rotation/slot to the new side (no partial-angle tween). Bottom:
          // no rotation at all (pen stays upright). Either way the shape can expand immediately.
          if (rowShowing) penRotation.set(rot);
          else track(animate(penRotation, 0, MORPH));
          expand();
          return;
        }
        // Genuine circle -> side: the shape is a circle right now. Rotate the pen to the docked angle
        // WHILE it stays a circle, and only grow into the pill once the rotation has essentially landed
        // - so the pen is never caught at a partial angle inside an oval (requirement: rotate only in a
        // circle). If the user leaves the edge first, stopAll cancels this pending expand.
        track(animate(penRotation, rot, ROT_SNAP));
        runWhen([penRotation], () => Math.abs(penRotation.get() - rot) < 6, expand);
        return;
      }
      // Back to a free circle on the pointer. Decouple position from shape so this is a smooth,
      // interruptible morph - never the old instant `.set()` snap. The SHAPE springs pill->circle IN
      // PLACE while the POSITION springs to a circle centred on the live pointer (retargeted every move
      // in onMove until the shape settles, then 1:1 hard-follow resumes). Because both spring together
      // there's no full-width-pill flash at the cursor and no fly-to-cursor lag; reversing back into a
      // zone just retargets the same springs from their current value + velocity (no restart-from-zero).
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
      // Hard-follow stays OFF for the morph window so recenter can't snap x/y onto the cursor while the
      // shape is still wide (that was the "full-width pill flash"); the morph owns position until it settles.
      followRef.current = false;
      freeMorphRef.current = true;
      const wCtrl = animateToCircle(MORPH);
      // Hold the pen at its current (docked) angle while the pill collapses; only swing it to the free-
      // circle facing once the shape has actually rounded into the circle - never tilt inside the oval.
      rotateWhenCircular(rot, ROT_SNAP);
      track(animate(horizontalOpacity, 0, { duration: FADE, ease: "easeInOut" }));
      track(animate(verticalOpacity, 0, { duration: FADE, ease: "easeInOut" }));
      retargetFreePos(s.centerX, s.centerY);
      // Hand back to 1:1 hard-follow once the shape has reached the circle (gen-guarded, so an
      // interrupting preview / collapse / release cancels it). The position has been tracking the live
      // pointer via its spring, so this hand-off is a sub-pixel correction, never a jump.
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

  // Pinch the (lifted) pill into the circle: spring-driven collapse, fade the contents out, carry the
  // selected pen overlay from its slot to centre. Triggered once lift passes LIFT_DISTANCE.
  const collapse = useCallback(
    () => {
      stopAll();
      freeMorphRef.current = false;
      freePosCtrls.current = [];
      setCollapsed(true);
      setPreview(null);
      followRef.current = true;
      // Freeze the fading contents at their current on-screen centre so the capsule->circle narrowing
      // doesn't push them sideways - they dissolve in place while the selected pen carries to centre.
      freezeCx.set(x.get() + width.get() / 2);
      freezeCy.set(y.get() + height.get() / 2);
      frozen.set(1);
      // The carried overlay is ALREADY at the selected pen's slot (seeded on grab) at its docked facing,
      // so collapse just glides it to centre as the shape pinches - no opacity flip or offset jump on the
      // first grab (the "jumping pen"). Rotation is left to onMove's rotateWhenCircular, so the pen only
      // un-rotates once it's actually a circle.
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
      // Fade the rest of the contents out. The shape + marker springs below start from zero velocity,
      // so they ramp up gently and the contents visibly clear before the pinch reads as "moving".
      track(animate(horizontalOpacity, 0, { duration: FADE, ease: "easeOut" }));
      track(animate(verticalOpacity, 0, { duration: FADE, ease: "easeOut" }));
      // Pinch to the circle, carrying the pen to centre on the SAME spring as the shape (lockstep). The
      // pen offset shrinks faster than the shape's half-width, so the pen stays well inside every frame -
      // never stranded on the shrinking edge or clipped to an empty disc on a long side-dock offset. The
      // fast contents fade (FADE) clears them before the slower pinch reads as "moving" ("contents clear,
      // then the marker glides to centre"). All retarget from current value+velocity.
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
        // Lift phase: drag the whole pill; only collapse once lifted past the threshold.
        const dist = Math.hypot(s.centerX - s.startCenterX, s.centerY - s.startCenterY);
        if (dist > zones().liftDistance) collapse();
        return;
      }
      const { width: vw, height: vh } = sizesRef.current.viewport;
      const { snapZone, bottomZone, topZone } = zones();
      // Re-arm a dock's preview/snap once the circle has left that zone (so the origin re-arms). The
      // bottom re-arms by lifting clear of the floor band, so the floor only re-docks on a deliberate
      // return — a horizontal drag stays a free circle until then.
      const dr = disarmedRef.current;
      if (dr === "left" && s.centerX > snapZone) disarmedRef.current = null;
      else if (dr === "right" && s.centerX < vw - snapZone) disarmedRef.current = null;
      else if (dr === "bottom" && s.centerY < vh - bottomZone) disarmedRef.current = null;
      else if (dr === "top" && s.centerY > topZone) disarmedRef.current = null;
      // Collapsed: preview the dock at whatever edge/bottom the circle is over (or stay a free circle).
      const target = targetFor(s.centerX, s.centerY);
      // Top safe zone: a free circle here releases to the top (no preview/expand while dragging).
      topMagnetRef.current = target === null && s.centerY <= topZone;
      if (target !== previewRef.current) previewTo(target, s);
      // Mid-revert (free-circle morph): keep the position spring aimed at the live pointer so the shrink
      // tracks the cursor instead of landing at a stale point and snapping when 1:1 follow resumes.
      else if (freeMorphRef.current && target === null) retargetFreePos(s.centerX, s.centerY);
      // While a free circle, the pen faces the nearer edge over a forgiving band, upright only mid-screen.
      // rotateWhenCircular makes this a no-wait swing in the (already-circular) free circle, but if we're
      // still mid-collapse from a side (oval), it holds the docked angle until the shape rounds out.
      if (followRef.current) {
        const rot = rotationTarget(s.centerX, vw, rotateTargetRef.current);
        if (rot !== rotateTargetRef.current) rotateWhenCircular(rot, ROT_SNAP);
      }
    },
    [recenter, collapse, targetFor, previewTo, rotateWhenCircular, retargetFreePos],
  );

  // Settle the released drag onto a target dock: spring the shape/slot home and crossfade the layouts.
  // Marker opacity stays 1 through the settle; the rest-place (place) hands it back to the row pen.
  const commitTo = useCallback(
    (target: DockTarget) => {
      const horizontal = isHorizontal(target);
      setSide(horizontal ? null : (target as DockSide));
      setAtTop(target === "top");
      // Horizontal docks (bottom/top) animate via "returning"; sides via "snapping". The rest phase
      // is "bottom"/"top"/"side"; place() then keys off it (and atTop is already set for the handle).
      const restPhase: DockPhase = target === "bottom" ? "bottom" : target === "top" ? "top" : "side";
      setPhase(horizontal ? "returning" : "snapping");
      const b = boxFor(target);
      const rot = horizontal ? 0 : sideRotation(target as DockSide);
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
        // Commit whatever was previewed; else an upright circle in the top safe zone goes to the top,
        // a circle facing a side commits there, and any other upright circle returns to the bottom.
        const dest: DockTarget =
          target ??
          (topMagnetRef.current && rotateTargetRef.current === 0
            ? "top"
            : targetFromRotation(rotateTargetRef.current));
        commitTo(dest);
      } else {
        // Released during the lift, before collapse: settle back to where it came from.
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
      // Suppress text selection so the live canvas marker never paints during a dock drag.
      e.preventDefault();
      onDragStart?.();
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture is best-effort; window listeners below still drive the drag.
      }
      // Cancel any settle still finishing from a previous gesture so this drag starts from a clean slate.
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
      // Keep the dock we came from from instantly re-docking until we leave its zone (bottom included,
      // so a horizontal drag off the floor becomes a free circle instead of snapping back to centre).
      disarmedRef.current = originTarget;
      topMagnetRef.current = false;
      setCollapsed(false);
      setPreview(null);
      setPhase("dragging");
      // Lift phase: keep the intact pill following the pointer (onMove) until lifted past LIFT_DISTANCE.
      // Seed the carried overlay NOW at the selected pen's slot + docked facing, standing in for the row
      // pen (hidden atomically via markerOpacity). So when collapse fires the overlay is already at the
      // slot and just springs to centre - no opacity flip / offset jump on the first grab (the "jumping
      // pen"), making the first collapse identical to the smooth in-grab circle<->dock morph.
      const originRot = sideRef.current ? sideRotation(sideRef.current) : 0;
      markerOffsetX.set(slot.x);
      markerOffsetY.set(slot.y);
      markerReveal.set(0);
      penRotation.set(originRot);
      rotateTargetRef.current = originRot;
      markerOpacity.set(1);
      // The intact pill follows the pointer during the lift; contents aren't frozen yet (only on collapse).
      frozen.set(0);
      recenterUnsubs.current = [width.on("change", recenter), height.on("change", recenter)];
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [onDragStart, slotFor, stopAll, x, y, width, height, markerOpacity, markerOffsetX, markerOffsetY, markerReveal, penRotation, frozen, recenter, setCollapsed, setPreview, setPhase, onMove, onUp],
  );

  // onHandlePointerDown adds the window listeners and width/height subscriptions imperatively,
  // outside React's tree, so an unmount mid-gesture would leak them. onMove/onUp are referentially
  // stable, so this cleanup only fires on a real unmount, never mid-drag.
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
