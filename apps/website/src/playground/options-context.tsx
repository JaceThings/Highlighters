import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_OPTIONS, resolveOptions } from "@highlighters/core";
import type {
  BlendMode,
  HighlightOptions,
  PresetName,
  ResolvedOptions,
  ShapeType,
} from "@highlighters/core";
import { STATE_CHANGE_EASE } from "../components/playground/springs.ts";
import { useSpringNumber } from "../hooks/useSpringNumber.ts";

/**
 * THE STACK CONFIG SURFACE (phase-1 addition).
 *
 * The core's tip group now natively carries the two end knobs `tip.overshoot` /
 * `tip.overshootJitter` (how far each mark runs past the text edges, and how much
 * that randomly varies per end), so they flow straight through to the renderer.
 * The only field the playground adds on top of the core's user-facing
 * {@link HighlightOptions} is `stack`: do overlapping marks darken like real
 * translucent ink, or merge into one cohesive flat colour?
 *
 * {@link toCoreOptions} is the single funnel that lowers that superset into
 * exactly what the core pipeline consumes — `stack` is expressed through the ink
 * compositing model (`stack: true` ⇒ `multiply`, the subtractive optic where
 * overlaps darken; `stack: false` ⇒ `normal`, where overlapping same-colour
 * marks merge into one cohesive colour with no darkening). The blend-mode is
 * therefore no longer a user-facing knob — `stack` owns it.
 */

/**
 * The playground's live options: the full core {@link HighlightOptions} plus the
 * phase-1 `stack` boolean. This is the shape the control sections read and write;
 * it is lowered to core options by {@link toCoreOptions} before it ever reaches
 * the renderer.
 */
export interface PlaygroundOptions extends HighlightOptions {
  /**
   * Do overlapping marks stack (darken, like real translucent ink) or lie flat
   * (merge into one cohesive colour with no darkening where they cross)?
   * Default `true`.
   */
  stack?: boolean;
}

/**
 * The core defaults for the phase-1 knobs, sourced so every control opens on the
 * canonical baseline rather than a hard-coded literal. `stack` defaults true (the
 * subtractive-ink default mirrors {@link DEFAULT_OPTIONS}'s `multiply`); the
 * overshoot baseline is a hair of overrun with a touch of per-end variance.
 */
export const STACK_DEFAULT = DEFAULT_OPTIONS.blendMode === "multiply";
export const TIP_OVERSHOOT_DEFAULT = 2;
export const TIP_OVERSHOOT_JITTER_DEFAULT = 1;

/**
 * Lower the playground's superset to exactly what `@highlighters/core` consumes:
 * translate `stack` into the ink compositing model and drop the playground-only
 * `stack` field. The `tip` group (overshoot knobs included) is a native core
 * group, so it flows straight through.
 *
 * `stack: true` ⇒ `multiply` (overlaps darken — real translucent ink).
 * `stack: false` ⇒ `normal` (same-colour overlaps merge into one cohesive
 * colour, no darkening).
 */
export function toCoreOptions(opts: PlaygroundOptions): HighlightOptions {
  const { stack, ...rest } = opts;
  const blendMode: BlendMode =
    stack === false ? "normal" : stack === true ? "multiply" : (rest.blendMode ?? "multiply");
  return { ...rest, blendMode };
}

/**
 * The single source of truth for the live playground. Every Section reads and
 * writes this context; the {@link Preview} consumes the value and feeds it
 * straight into `@highlighters` so the sample text re-highlights in real time.
 *
 * MENTAL MODEL: the playground is BUILD-YOUR-OWN. The state is one explicit
 * {@link HighlightOptions} object the user is *building* with the individual
 * control sections — there is no notion of a "currently selected preset". The
 * shipped presets are exposed (in RecommendedLooks) only as one-shot starting
 * points you can COPY into this state via {@link applyRecipe}; after applying,
 * every control is freely editable and nothing stays "locked" to a recipe.
 */

/**
 * The explicit DEFAULT highlighter the playground opens on — a sensible
 * classic-yellow-ish build the user can immediately tweak. Every control reads
 * a concrete starting value from this object (no `undefined` knobs), and there
 * is deliberately NO `preset` field: the state is a hand-built config, not a
 * named look. `shape` + `markType` are written in lockstep (the library reads
 * them as last-wins synonyms; setShape keeps both aligned).
 */
function buildInitialOptions(): PlaygroundOptions {
  return {
    shape: "highlight",
    markType: "highlight",
    // Classic yellow, picked as a concrete swatch so the ColorSection swatch
    // picker shows it selected from the start.
    color: { palette: "fluorescent", swatch: "yellow" },
    opacity: 0.5,
    // Stack on by default — overlapping marks darken like real translucent ink.
    // `toCoreOptions` lowers this to the `multiply` compositing model.
    stack: STACK_DEFAULT,
    // Balanced dye↔pigment ink as the neutral starting point.
    colorant: "balanced",
    quality: "standard",
    snap: "word",
    tip: {
      type: "chisel",
      width: 16,
      thickness: 4,
      angle: 35,
      overshoot: TIP_OVERSHOOT_DEFAULT,
      overshootJitter: TIP_OVERSHOOT_JITTER_DEFAULT,
    },
    ink: {
      flow: 0.5,
      viscosity: 0.5,
      saturation: 0.7,
      feathering: 0.3,
      streakiness: 0.35,
      dryout: 0.15,
      startEndBuildup: 0.25,
    },
    edge: { waviness: 1.5, frequency: 22, roughness: 0.3, cap: "round", radius: 4 },
    paper: { absorbency: 0.3 },
    glow: { enabled: false, intensity: 0.5, spread: 4 },
    animation: { draw: true, duration: 420, easing: "ease-out", stagger: 90 },
    renderer: "auto",
  };
}

/**
 * A dotted path into {@link HighlightOptions}, one or two levels deep. Top-level
 * keys (`"opacity"`, `"markType"`, …) and one nested group level
 * (`"ink.flow"`, `"edge.waviness"`, `"animation.duration"`, …) are supported —
 * which is every knob the playground exposes. Kept as a `string` for ergonomics;
 * `set()` validates the depth at runtime.
 */
export type OptionPath = string;

export interface PlaygroundOptionsContextValue {
  /**
   * The live options object (the playground superset). Lower it with
   * {@link toCoreOptions} before passing to `highlight()` / `<Highlight>`.
   */
  options: PlaygroundOptions;

  /** The spring-animated options the Preview renders (eased toward `options`). */
  previewOptions: PlaygroundOptions;

  /**
   * Replace the value at a dotted `path`. Supports one level of nesting:
   *
   * ```ts
   * set("opacity", 0.6);          // top-level scalar
   * set("markType", "underline"); // top-level union
   * set("ink.flow", 0.9);         // nested group field
   * set("edge.cap", "round");     // nested group field
   * ```
   *
   * Nested writes are immutable: the parent group is shallow-cloned so React
   * sees a new `options` reference and the Preview re-renders.
   */
  set: (path: OptionPath, value: unknown, fromDrag?: boolean) => void;

  /**
   * Merge a partial {@link PlaygroundOptions} over the current state (one shallow
   * level deep per group). A low-level escape hatch; most code uses `set`.
   */
  merge: (patch: Partial<PlaygroundOptions>) => void;

  /**
   * COPY a named preset's concrete values into the live build (R19 presets).
   *
   * This is a one-shot apply, *not* a mode: the preset is fully resolved (via
   * `resolveOptions`, so even the values it doesn't mention become concrete) and
   * flattened into a {@link HighlightOptions} patch, then merged so EVERY
   * individual control jumps to reflect it. No `preset` field is stored and
   * nothing stays "selected" — after applying, the user freely tweaks any knob.
   */
  applyRecipe: (name: PresetName) => void;

  /** Convenience setter for the mark kind (`shape`/`markType` synonym). */
  setShape: (shape: ShapeType) => void;

  /** Reset everything back to the initial DEFAULT build. */
  reset: () => void;
}

const PlaygroundOptionsContext =
  createContext<PlaygroundOptionsContextValue | null>(null);

/** Shallow-merge `patch` onto `base`, deep-merging one level for object groups. */
function mergeOptionsShallow(
  base: PlaygroundOptions,
  patch: Partial<PlaygroundOptions>,
): PlaygroundOptions {
  const next: PlaygroundOptions = { ...base };
  for (const key of Object.keys(patch) as (keyof PlaygroundOptions)[]) {
    const value = patch[key];
    const existing = base[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === "object" &&
      !Array.isArray(existing)
    ) {
      // Merge one level (e.g. ink, edge, animation groups).
      (next as Record<string, unknown>)[key] = {
        ...(existing as object),
        ...(value as object),
      };
    } else {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return next;
}

/** Immutably write `value` at a one- or two-segment dotted `path`. */
function setAtPath(
  base: PlaygroundOptions,
  path: OptionPath,
  value: unknown,
): PlaygroundOptions {
  const segments = path.split(".");
  if (segments.length === 1) {
    return { ...base, [segments[0]]: value } as PlaygroundOptions;
  }
  if (segments.length === 2) {
    const [group, field] = segments;
    const existingGroup = (base as Record<string, unknown>)[group];
    const nextGroup = {
      ...(existingGroup && typeof existingGroup === "object"
        ? (existingGroup as object)
        : {}),
      [field]: value,
    };
    return { ...base, [group]: nextGroup } as PlaygroundOptions;
  }
  throw new Error(
    `@highlighters playground: unsupported option path "${path}" (max depth 2)`,
  );
}

/**
 * Flatten a fully-resolved {@link ResolvedOptions} into a {@link PlaygroundOptions}
 * patch the playground controls can read. Every knob the playground exposes is
 * carried across as a concrete value, so applying a recipe makes every control
 * jump to the recipe's look. `shape` is written alongside `markType` so the
 * ShapeSection pill (which reads either) reflects it.
 *
 * The recipe's resolved `blendMode` is lifted back into the playground's `stack`
 * boolean (`multiply` ⇒ stacked, anything else ⇒ flat) so the Stack control —
 * which replaced the raw blend-mode picker — reflects the recipe. The tip
 * overshoot knobs reset to the canonical baseline since presets don't carry them.
 */
function resolvedToPatch(r: ResolvedOptions): PlaygroundOptions {
  return {
    shape: r.markType,
    markType: r.markType,
    // `color` resolves to a concrete CSS string here. The ColorSection treats a
    // string as a custom color (no swatch ring), which is correct — a recipe is
    // a built look, not a swatch selection.
    color: r.color,
    opacity: r.opacity,
    stack: r.blendMode === "multiply",
    colorant: r.colorant,
    quality: r.quality,
    snap: r.snap,
    renderer: r.renderer,
    tip: {
      ...r.tip,
      overshoot: TIP_OVERSHOOT_DEFAULT,
      overshootJitter: TIP_OVERSHOOT_JITTER_DEFAULT,
    },
    ink: { ...r.ink },
    edge: { ...r.edge },
    paper: { ...r.paper },
    glow: { ...r.glow },
    animation: { ...r.animation },
  };
}

/**
 * Spring the numeric, visually-animatable leaves of the live options toward
 * their committed targets, so the Preview EASES into a new look on tap /
 * keyboard / preset changes instead of snapping (matching the playground's
 * overall motion). A continuous drag passes `fromDrag`, which bypasses the
 * spring — the pointer input is already smooth and a trailing spring would lag
 * it. Non-numeric fields (tip type, colour, stack, caps, …) pass straight
 * through and change instantly.
 */
function useAnimatedOptions(
  o: PlaygroundOptions,
  fromDrag: boolean,
): PlaygroundOptions {
  const cfg = { duration: 0.35, ease: STATE_CHANGE_EASE, fromDrag };
  const opacity = useSpringNumber(o.opacity ?? 0.5, cfg);
  const angle = useSpringNumber(o.tip?.angle ?? 35, cfg);
  const overshoot = useSpringNumber(o.tip?.overshoot ?? 2, cfg);
  const overshootJitter = useSpringNumber(o.tip?.overshootJitter ?? 1, cfg);
  const flow = useSpringNumber(o.ink?.flow ?? 0.5, cfg);
  const viscosity = useSpringNumber(o.ink?.viscosity ?? 0.5, cfg);
  const saturation = useSpringNumber(o.ink?.saturation ?? 0.7, cfg);
  const feathering = useSpringNumber(o.ink?.feathering ?? 0.3, cfg);
  const streakiness = useSpringNumber(o.ink?.streakiness ?? 0.35, cfg);
  const dryout = useSpringNumber(o.ink?.dryout ?? 0.15, cfg);
  const startEndBuildup = useSpringNumber(o.ink?.startEndBuildup ?? 0.25, cfg);
  const waviness = useSpringNumber(o.edge?.waviness ?? 1.5, cfg);
  const frequency = useSpringNumber(o.edge?.frequency ?? 22, cfg);
  const roughness = useSpringNumber(o.edge?.roughness ?? 0.3, cfg);
  const radius = useSpringNumber(o.edge?.radius ?? 4, cfg);
  const absorbency = useSpringNumber(o.paper?.absorbency ?? 0.3, cfg);
  const glowIntensity = useSpringNumber(o.glow?.intensity ?? 0.5, cfg);
  const glowSpread = useSpringNumber(o.glow?.spread ?? 4, cfg);

  return useMemo<PlaygroundOptions>(
    () => ({
      ...o,
      opacity,
      tip: { ...o.tip, angle, overshoot, overshootJitter },
      ink: {
        ...o.ink,
        flow,
        viscosity,
        saturation,
        feathering,
        streakiness,
        dryout,
        startEndBuildup,
      },
      edge: { ...o.edge, waviness, frequency, roughness, radius },
      paper: { ...o.paper, absorbency },
      glow: { ...o.glow, intensity: glowIntensity, spread: glowSpread },
    }),
    [o, opacity, angle, overshoot, overshootJitter, flow, viscosity, saturation, feathering, streakiness, dryout, startEndBuildup, waviness, frequency, roughness, radius, absorbency, glowIntensity, glowSpread],
  );
}

export function PlaygroundOptionsProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<PlaygroundOptions>(buildInitialOptions);
  const [fromDrag, setFromDrag] = useState(false);

  const set = useCallback((path: OptionPath, value: unknown, drag = false) => {
    setFromDrag(drag);
    setOptions((prev) => setAtPath(prev, path, value));
  }, []);

  const merge = useCallback((patch: Partial<PlaygroundOptions>) => {
    setFromDrag(false);
    setOptions((prev) => mergeOptionsShallow(prev, patch));
  }, []);

  const applyRecipe = useCallback((name: PresetName) => {
    setFromDrag(false);
    // Resolve the preset to concrete values, then copy them over the live
    // build so every control reflects the recipe. We do NOT keep a `preset`
    // field — this is a one-shot copy, never a sticky mode.
    const patch = resolvedToPatch(resolveOptions({ preset: name }));
    setOptions((prev) => mergeOptionsShallow(prev, patch));
  }, []);

  const setShape = useCallback((shape: ShapeType) => {
    setFromDrag(false);
    // Write both synonyms so neither a stale `shape` nor `markType` lingers and
    // overrides the other in the library's last-wins merge.
    setOptions((prev) => ({ ...prev, shape, markType: shape }));
  }, []);

  const reset = useCallback(() => {
    setFromDrag(false);
    setOptions(buildInitialOptions());
  }, []);

  const previewOptions = useAnimatedOptions(options, fromDrag);

  const value = useMemo<PlaygroundOptionsContextValue>(
    () => ({ options, previewOptions, set, merge, applyRecipe, setShape, reset }),
    [options, previewOptions, set, merge, applyRecipe, setShape, reset],
  );

  return (
    <PlaygroundOptionsContext.Provider value={value}>
      {children}
    </PlaygroundOptionsContext.Provider>
  );
}

/**
 * Read the live playground options + setters. Must be called under a
 * {@link PlaygroundOptionsProvider}.
 */
export function usePlaygroundOptions(): PlaygroundOptionsContextValue {
  const ctx = useContext(PlaygroundOptionsContext);
  if (!ctx) {
    throw new Error(
      "usePlaygroundOptions must be used within a <PlaygroundOptionsProvider>",
    );
  }
  return ctx;
}
