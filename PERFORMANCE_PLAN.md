# Dock Performance & Smoothness Plan

Scope: the desktop highlighter dock (`apps/website/src/components/dock/`) — its drag/collapse/dock
interaction — plus a small set of high-leverage, app-wide wins surfaced during research. The
immediate user-reported defect is that **the collapse "pause/hold" animation gets cut off and looks
broken when the mouse is moved quickly up/down**; making that "fully smooth" is the centerpiece.

This plan is self-contained: every task cites exact files, the concrete change, and how to verify it.
Research provenance is in the Appendix.

---

## Truth Statement — Definition of Done

The work is "done" only when ALL of the following are objectively true:

1. **No broken intermediate frames.** Rapidly moving the pointer up/down across the lift threshold and
   the bottom/side zones for 10+ seconds never produces a stuck or half-rendered state (no
   "full-width pill with faded-out contents", no "half-collapsed circle with half-faded contents").
   The shape, marker, and contents are always in a mutually consistent state.
2. **Continuous, interruptible motion.** Any transition (collapse, expand, preview in/out, snap,
   return) can be interrupted at any instant and redirects from its *current value and velocity*
   without a visible jump or restart. There are **no fixed time delays** (`delay:`) and **no instant
   shape `.set()` jumps** in the interactive morph path.
3. **Per-frame DOM work during a drag is reduced by ≥50%.** Each animation frame performs at most one
   coalesced write per target element (one `style` write for the tray, one `setAttribute("d")` for
   the path, one per layer), verified by counting writes (instrumented or via a Performance trace).
4. **60 fps during a drag** on a mid-tier laptop: no `longtask` > 50 ms and average frame time
   ≤ 16.7 ms across a full grab→collapse→drag→dock→return gesture, measured with a real profiler.
5. **Zero idle cost.** With nothing happening, the page schedules no recurring `requestAnimationFrame`
   work (the only allowed wakeups are passive observers that fire on real events). Verified: no rAF
   callback runs for ≥2 s at rest.
6. **No behavioral or visual regression.** Every behavior validated in prior QA still holds: lift→
   collapse, circle follows pointer, side previews with correct inward rotation and correct slot for
   each of the 3 pens, facing-based commit on release, full pen shown in the circle, feather only
   during morph, handle fade, `prefers-reduced-motion` instant transitions, desktop-only/no-persist.
7. **`pnpm --filter website typecheck` and `pnpm --filter website build` pass; `pnpm size` is within
   the existing budgets** (no dock change should grow shipped bundles).

A measured before/after (frame time + DOM-write count for one canonical gesture) is recorded so the
≥50% / 60 fps claims in (3) and (4) are demonstrable, not asserted.

---

## Phase 0 — Establish measurement (prerequisite; do FIRST)

The browser-profiling research was **blocked**: the Cursor embedded browser cannot reach
`localhost:5173`, so there is currently **no measured baseline**. Fix this before optimizing so every
later claim is verifiable.

0.1. Run the dev server: `pnpm --filter website dev` (serves `http://localhost:5173`).
0.2. Launch a standalone Chrome with remote debugging:
   `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir=/tmp/perfchrome http://localhost:5173`.
0.3. Capture a **baseline** for the canonical gesture (grab handle → lift to circle → drag a lap
   around the screen → dock left → pull back → dock right → return to bottom, ~4 s) using the Chrome
   DevTools Performance panel (or CDP `Profiler`/`Tracing`). Record: average frame time, count of
   long tasks, scripting vs layout vs paint ms, and (via a temporary instrumentation counter in
   `bindMotion.ts`) DOM writes/frame.
0.4. Save the trace as `baseline`. Re-capture as `after` at the end; the truth statement's (3)/(4)
   are checked against these.

Verification of Phase 0: a saved baseline trace + a written down baseline number for frame time and
DOM writes/frame.

---

## Phase 1 — Make the collapse/morph fully smooth (the reported defect)

**Root cause (researched, confirmed against the code):** the collapse is a two-phase, *time-based*
sequence — Phase 1 fades content (`FADE`), Phase 2 pinches the shape after a **fixed `delay: HOLD`
(160 ms)** using a **duration-based spring** `COLLAPSE = {type:"spring", bounce:0, duration:0.5}`.
Additionally, `previewTo(null)` (revert-to-circle) does **instant `width/height/x/y.set()` jumps**.

Three properties make this not-smooth on rapid input, each backed by established guidance:
- **Fixed delays/timers are the canonical anti-pattern for interruptible motion.** Apple's
  "Designing Fluid Interfaces" (WWDC18) and WWDC24 "Enhance your UI animations": never gate elastic
  behavior on a timer/duration; respond to motion; a spring "is always moving, ready to move
  somewhere else." Interrupting *during* the `HOLD` delay leaves a discontinuous half-state — exactly
  the screenshot the user reported.
- **Duration-based springs ignore velocity.** Motion's own docs: physics springs
  (`stiffness`/`damping`/`mass`) "incorporate the velocity of any existing gestures or animations";
  duration-based springs (`duration`/`bounce`) "don't incorporate velocity." So interrupting
  `COLLAPSE` restarts from zero velocity → not continuous.
- **`.set()` is a hard jump** (equivalent to `MotionValue.jump()` — "breaks continuity, resets
  velocity"). The revert-to-circle instant sets are visible discontinuities under rapid input.

### Recommended design — single interruptible source of truth

Drive the whole shape/marker transition from one progress value, physics-sprung, with the
"hold-then-glide" beat encoded as a **curve over progress**, not a time delay. (WWDC24 pattern: each
gesture change retargets the same spring; final spring carries continuous velocity.)

Files: `apps/website/src/components/dock/useDockDrag.ts`, `CollapsedMarker.tsx`, `Dock.tsx`.

1.1. Add one `collapse` MotionValue ∈ [0,1] (`0` = current dock/pill shape, `1` = circle). Animate it
   only with a **physics spring** (e.g. `{type:"spring", stiffness:400, damping:40}` — start at
   damping that gives no overshoot, then tune). Never animate it with a duration/delay.
1.2. Derive the morphing properties from `collapse` (and the live pointer center) via `useTransform`,
   not via separate per-property springs:
   - `width`/`height`/`cornerRadius` = interpolate pill↔circle over `collapse`.
   - `markerReveal` = `collapse` (already 0→1 between slot look and full circle pen).
   - `markerOffset` = `slot * (1 - holdCurve(collapse))`, where `holdCurve` stays ≈0 for
     `collapse ∈ [0, 0.4]` then ramps to 1 by `1.0` (a `useTransform` easing array, e.g.
     input `[0,0.4,1]` → output `[1,1,0]` on the slot multiplier). This reproduces "marker holds at
     its slot while everything clears, then glides to centre" **as a shape of the curve**, so it is
     proportional and interruptible at any point — no `HOLD` timer.
   - content `horizontalOpacity`/`verticalOpacity` fade over `collapse ∈ [0, ~0.35]`.
1.3. **Decouple position from shape.** In free-circle mode, `x`/`y` follow the pointer every frame
   (the existing `recenter`), independent of `collapse`. Anchored previews retarget `x`/`y` with the
   physics spring. Because position is always pointer-driven in free mode, reverting a preview no
   longer needs an instant `.set()` jump — delete the instant sets in `previewTo(null)` and instead
   retarget `collapse → 1` (shape) while position continues to follow the pointer. (This is what made
   the instant-set "necessary" before: it was compensating for position being coupled to the morph.)
1.4. Every gesture event **retargets** the same MVs (`animate(collapse, target, physicsSpring)`,
   `animate(x, …)`, etc.). Keep the `genRef`/`stopAll` cleanup for teardown, but rely on physics-spring
   retargeting (current value + velocity) for continuity rather than stop-then-restart-from-zero.
1.5. Reduced motion: when `prefers-reduced-motion`, set `collapse` and positions instantly (existing
   pattern), no springs.

Lower-risk alternative (if 1.1–1.4 is judged too large for one pass — see Self-Criticism): keep the
existing separate MVs but (a) swap `COLLAPSE` to a physics spring, (b) delete `delay: HOLD` and instead
give `markerOffset` a *softer* spring than the shape so it visually lags (an approximate, fully
interruptible "hold"), and (c) replace the `previewTo(null)` instant `.set()`s with physics-spring
retargets plus the position decoupling from 1.3. This captures most of the smoothness with a smaller
diff; escalate to the full single-source model only if measurement/feel still shows seams.

Verification of Phase 1:
- Re-run the rapid up/down stress (truth #1, #2): no stuck/half states; interrupting mid-collapse
  redirects smoothly. Record a screen capture of 10 s of fast up/down and confirm every frame is a
  consistent state.
- Confirm no `delay:` and no `.set()` of `width/height/x/y` remain in the interactive path (grep).
- Re-run the full behavior QA matrix (truth #6).

---

## Phase 2 — Cut per-frame DOM work during drags (dock)

**Root cause:** `useBindMotion(ref, [a,b,c,d], apply)` subscribes each MotionValue independently and
each fires the same `apply`, so when N values animate together, `apply` runs N times/frame. Measured
in research (`bindMotion.ts:18`):
- `applyTray` (`Dock.tsx`) fires 4×/frame and writes layout-invalidating `width`/`height` each time.
- `applyPath` (`MorphBackground.tsx`) fires 3×/frame, each rebuilding the path string + `setAttribute`.
- The `recenter` `width/height` change-subscriptions cascade into extra `applyTray` runs during
  collapse (one width tick → `applyTray` + `applyPath` + `recenter`→`x.set`→`applyTray` + …).
- `CollapsedMarker.applyMove` fires 3×/frame.
Total ≈ 26–35 DOM writes/frame, ~60% redundant.

2.1. **Coalesce `useBindMotion` to one apply per frame.** In `apps/website/src/components/dock/bindMotion.ts`,
   change the subscription so all listed values share a single rAF-scheduled, dirty-flagged `apply`:
   on any value change, set `dirty = true` and `requestAnimationFrame(flush)` if not already
   scheduled; `flush` runs `apply(el)` once and clears the flag. This collapses N fires → 1/frame for
   every binding (tray, path, move, opacities), eliminating the redundant writes and the recenter
   cascade amplification, with no change to call sites. (`useOpacityBind` inherits the fix.)
   - Note: framer already batches MotionValue renders to a frame; this change removes the *duplicate
     apply invocations*, which is the actual waste.
2.2. After 2.1, the `recenter` cascade is naturally coalesced (x/y writes land in the same single
   `applyTray` flush). Confirm `recenter` no longer multiplies `applyTray`.
2.3. Memoize `roundedRectPath` on its last `(w,h,r)` so identical inputs between any residual fires
   skip the string rebuild (`roundedRectPath.ts`). Low priority once 2.1 lands (1 call/frame).

Verification of Phase 2: instrument a counter in the coalesced `flush` (temporary) and confirm ≤1
apply per element per frame; re-capture the trace and confirm DOM writes/frame dropped ≥50% vs the
Phase 0 baseline (truth #3), with frame time ≤16.7 ms (truth #4).

---

## Phase 3 — Idle cost & shadow repaint quick wins

3.1. **FocusRingOverlay permanent rAF (idle-cost HIGH).** `apps/website/src/components/FocusRingOverlay.tsx:201-213`
   runs `requestAnimationFrame(follow)` for the page's entire lifetime even when no ring is visible,
   waking the main thread every 16 ms. Gate the loop: start it in the focus-in/show path, stop it in
   `hide()`. Under `prefers-reduced-motion`, skip the loop and snap position on focus. Fixes truth #5.
3.2. **Shadow blur repaint during morph.** The feather (`Dock.tsx`) is already gated to only render
   during morphs (good). For the morph window, promote the feather and `MorphBackground`'s shadow div
   to their own layer (`will-change: opacity` / `contain: paint`) so animating `border-radius` doesn't
   re-rasterize the Gaussian blur into the parent layer (`MorphBackground.tsx:49`, `Dock.tsx` feather).
3.3. **Cache `prefersReducedMotion()`** (`slider-utils.ts:47`): it calls `window.matchMedia(...)` on
   every invocation (dozens/frame during a drag). Cache the `MediaQueryList` at module scope and read
   `.matches`, updating via one `change` listener. Trivial allocation win.

Verification of Phase 3: at rest, confirm no rAF callback runs for ≥2 s (truth #5) via a temporary
`rAF` counter or the profiler; visually confirm the morph paint area shrank (DevTools paint flashing).

---

## Phase 4 — App-wide render coalescing (OPTIONAL / separate PR; out of primary "dock" scope)

These are high-value but belong to the live-highlighter and playground subsystems, not the dock. List
them so they aren't lost; do them in a **separate** change with their own verification. (Full details
in the Appendix.)
- Coalesce `selectionchange` → one `rAF` per frame in `packages/core/src/render/highlight.ts:378`
  (HIGH); cache the container rect per frame (`highlight.ts:106`).
- Quantize noise-tile knobs so the cache hits at live speed (`mark-space.ts:159` / `noise-tile.ts`).
- Playground `useAnimatedOptions` 17 springs → 1 batched `setState`/frame
  (`options-context.tsx:186`); memoize `planMarks` in `Preview.tsx:68`.
- Remove the unused `motion` dep if it duplicates `framer-motion` (`apps/website/package.json:21-22`;
  verify with `pnpm why motion`).

---

## Self-Criticism (pre-finalization review)

- **Biggest risk: Phase 1 is a rewrite of code we just stabilized through ~15 bug fixes.** A full
  single-source refactor could regress the hard-won behaviors (facing-based commit, analytical side
  slots, instant revert-without-lag, feather-on-morph-only). Mitigation baked into the plan: the
  **lower-risk alternative** path (swap spring type, delete the delay, decouple position) is sequenced
  first; the full single-source model is only escalated to if measurement/feel still shows seams. Do
  Phase 1 incrementally behind the existing QA matrix, not as a big-bang rewrite.
- **The instant `.set()` in `previewTo(null)` exists for a reason** (it was added to kill a fly-to-
  cursor lag and a full-width-pill flash when reverting a bottom preview). Removing it is only sound
  *because* step 1.3 decouples position (pointer-follow) from shape (progress) — without that
  decoupling, deleting the `.set()` would reintroduce the lag. The plan makes that dependency explicit;
  do not delete the `.set()` without 1.3.
- **Phase 0 must come first.** Truth criteria #3 and #4 are quantitative; without the standalone-Chrome
  baseline they can't be proven. The embedded browser cannot measure this (it can't even reach
  localhost), so any "it feels smoother" claim would be unfalsifiable. This is why Phase 0 is a hard
  prerequisite, not a nicety.
- **Scope discipline.** The research surfaced ~30 findings across the whole app. Most (live-highlighter
  coalescing, playground springs, bundle/image tweaks) are NOT the dock and are explicitly demoted to
  Phase 4 / separate PRs so this plan stays executable and reviewable. The only non-dock item promoted
  into the core plan is FocusRingOverlay's permanent rAF (3.1), because it violates the "zero idle
  cost" truth criterion for the whole page and is a tiny, isolated fix.
- **`will-change` caution (3.2).** Over-promoting layers costs memory and can *hurt* if left on
  permanently. The promotion must be scoped to the morph window (added when a transition starts,
  removed at rest) — otherwise it trades a paint win for a permanent memory/compositing cost. Noted so
  the executor doesn't slap `will-change` on statically.
- **Logical soundness of the "hold via curve" (1.2).** The original hold was a 160 ms pause; encoding
  it as `holdCurve` over the *first ~40% of progress* preserves the same read ("contents clear, then
  the marker travels") but ties it to progress so interruption can't strand it. This is behavior-
  preserving in feel while removing the timer — the crux of the fix. Verified by the truth #1/#2 stress
  test, not by eyeballing a single play-through.
- **What I deliberately did NOT plan:** animating the tray via `transform: scale` instead of
  `width`/`height` (research MED-6). It would remove layout cost, but scaling a pill into a circle
  distorts the contents and the SVG path/clip, and would fight the whole "morph the actual rounded-rect"
  architecture the product owner chose. The rAF-coalescing (Phase 2) captures most of the win without
  that distortion risk. Out of scope.

---

## Appendix — Research provenance

- Dock per-frame static analysis (Opus): HIGH = uncoalesced `applyTray`/`applyPath` multi-subscribe +
  layout-triggering width/height writes + recenter cascade; MED = blurred-shadow repaint per frame,
  width/height layout; idle cost effectively zero. "Single highest-leverage fix: coalesce
  `useBindMotion` per-MV subscriptions into one rAF-batched apply."
- Site/core static analysis (Opus): HIGH = `selectionchange` no rAF coalescing, container
  `getBoundingClientRect` forced layout per repaint, noise-tile cache misses at live speed, playground
  17-springs→setState/frame, FocusRingOverlay unconditional rAF; plus MED/LOW render-hygiene, bundle,
  reduced-motion items.
- Live browser profiling (Opus, browser-use): **blocked** — embedded browser could not reach
  `localhost:5173`; recommended standalone Chrome with `--remote-debugging-port` (adopted as Phase 0).
  No measured numbers were obtained; Phase 0 closes this gap.
- Interruptible-motion guidance: Apple WWDC18 "Designing Fluid Interfaces" + WWDC24 "Enhance your UI
  animations" (avoid durations/timers, retarget springs, carry velocity); Motion docs (physics springs
  preserve velocity, duration springs don't; `.set()/.jump()` break continuity; `useTransform` derives
  values without re-renders).
