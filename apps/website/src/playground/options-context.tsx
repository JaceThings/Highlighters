import {
  createContext,
  useCallback,
  use,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_OPTIONS, resolveSwatch } from "@highlighters/core";
import type {
  BlendMode,
  HighlightOptions,
  MarkType,
  ShapeType,
  TipType,
} from "@highlighters/core";
import {
  DEFAULT_INK,
  DEFAULT_MARK_TYPE,
  DEFAULT_OPACITY,
  useSelectionStyle,
  type PenTip,
} from "../selection-style.tsx";
import { STATE_CHANGE_EASE } from "../components/playground/springs.ts";
import { useSpringNumber } from "../hooks/useSpringNumber.ts";
import { useAnimatedColor } from "../hooks/useAnimatedColor.ts";

// Playground shares colour / opacity / markType / tip with the dock's live marker via one
// SelectionStyle. Nibs map: slant <-> chisel, round <-> bullet, fine <-> fine.
function penToTipType(pen: PenTip): TipType {
  if (pen === "round") return "bullet";
  if (pen === "fine") return "fine";
  return "chisel"; // slant
}
function tipTypeToPen(type: TipType): PenTip {
  if (type === "bullet") return "round";
  if (type === "fine") return "fine";
  return "slant"; // chisel
}
// Resolve any colour value to hex; `fallback` for an unresolvable swatch or missing colour.
export function colorToHex(color: PlaygroundOptions["color"], fallback = DEFAULT_INK): string {
  if (typeof color === "string") return color;
  if (color && typeof color === "object" && "swatch" in color) {
    try {
      return resolveSwatch(color);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/** Core {@link HighlightOptions} plus a `stack` boolean. Lowered by {@link toCoreOptions} for the renderer. */
export interface PlaygroundOptions extends HighlightOptions {
  /** Overlaps darken (multiply) vs. merge flat (normal). Default `true`. */
  stack?: boolean;
}

const STACK_DEFAULT = DEFAULT_OPTIONS.blendMode === "multiply";
const TIP_OVERSHOOT_DEFAULT = 2;
const TIP_OVERSHOOT_JITTER_DEFAULT = 1;

/** Lower to core options: `stack` true ⇒ `multiply`, false ⇒ `normal`. */
export function toCoreOptions(opts: PlaygroundOptions): HighlightOptions {
  const { stack, ...rest } = opts;
  const blendMode: BlendMode =
    stack === false ? "normal" : stack === true ? "multiply" : (rest.blendMode ?? "multiply");
  return { ...rest, blendMode };
}

// The default the playground opens on; every knob concrete (no `undefined`). `shape`/`markType` are
// last-wins synonyms, written in lockstep.
function buildInitialOptions(): PlaygroundOptions {
  return {
    shape: "highlight",
    markType: "highlight",
    // Concrete swatch (not a string) so the picker shows it selected.
    color: { palette: "fluorescent", swatch: "yellow" },
    opacity: 0.5,
    stack: STACK_DEFAULT,
    snap: "word",
    tip: {
      type: "chisel",
      width: 16,
      thickness: 4,
      // Matches the live marker's chisel slant, so the slant demo and the real tool agree.
      angle: 8,
      overshoot: TIP_OVERSHOOT_DEFAULT,
      overshootJitter: TIP_OVERSHOOT_JITTER_DEFAULT,
    },
    ink: {
      flow: 0.5,
      viscosity: 0.5,
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

/** A dotted path into the options, one or two levels deep (e.g. `"opacity"`, `"ink.flow"`). */
type OptionPath = string;

interface PlaygroundOptionsContextValue {
  /** The live options. Lower with {@link toCoreOptions} before the renderer. */
  options: PlaygroundOptions;
  /** Replace the value at a one- or two-segment dotted `path`. */
  set: (path: OptionPath, value: unknown, fromDrag?: boolean) => void;
  /** Merge a partial patch over the current state (one shallow level per group). */
  merge: (patch: Partial<PlaygroundOptions>) => void;
  /** Set the mark kind (`shape`/`markType` synonym). */
  setShape: (shape: ShapeType) => void;
  reset: () => void;
}

const PlaygroundOptionsContext =
  createContext<PlaygroundOptionsContextValue | null>(null);

// `previewOptions` changes every spring frame, so it lives in its OWN context: only <Preview>
// re-renders per frame, not the control sections.
const PlaygroundPreviewContext = createContext<PlaygroundOptions | null>(null);

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

// Spring the numeric leaves toward their targets so the Preview eases into a new look.
// `fromDrag` bypasses the spring (pointer input is already smooth). Non-numeric fields pass through.
function useAnimatedOptions(
  o: PlaygroundOptions,
  fromDrag: boolean,
): PlaygroundOptions {
  const cfg = { duration: 0.35, ease: STATE_CHANGE_EASE, fromDrag };
  // Ink colour glides in OKLCH (useAnimatedColor); swatch objects pass through untouched.
  const animatedColor = useAnimatedColor(typeof o.color === "string" ? o.color : DEFAULT_INK, cfg);
  const color = typeof o.color === "string" ? animatedColor : o.color;
  const opacity = useSpringNumber(o.opacity ?? 0.5, cfg);
  const angle = useSpringNumber(o.tip?.angle ?? 35, cfg);
  const overshoot = useSpringNumber(o.tip?.overshoot ?? 2, cfg);
  const overshootJitter = useSpringNumber(o.tip?.overshootJitter ?? 1, cfg);
  const flow = useSpringNumber(o.ink?.flow ?? 0.5, cfg);
  const viscosity = useSpringNumber(o.ink?.viscosity ?? 0.5, cfg);
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
      color,
      opacity,
      tip: { ...o.tip, angle, overshoot, overshootJitter },
      ink: {
        ...o.ink,
        flow,
        viscosity,
        feathering,
        streakiness,
        dryout,
        startEndBuildup,
      },
      edge: { ...o.edge, waviness, frequency, roughness, radius },
      paper: { ...o.paper, absorbency },
      glow: { ...o.glow, intensity: glowIntensity, spread: glowSpread },
    }),
    [o, color, opacity, angle, overshoot, overshootJitter, flow, viscosity, feathering, streakiness, dryout, startEndBuildup, waviness, frequency, roughness, radius, absorbency, glowIntensity, glowSpread],
  );
}

export function PlaygroundOptionsProvider({ children }: { children: ReactNode }) {
  // Colour / opacity / markType / tip shared with the dock via SelectionStyle; the rest is playground-only.
  const sel = useSelectionStyle();
  const [options, setOptions] = useState<PlaygroundOptions>(buildInitialOptions);
  const [fromDrag, setFromDrag] = useState(false);

  // Dock pen -> tip.type. The change guard keeps the playground->pen write below from echoing into a loop.
  useEffect(() => {
    const type = penToTipType(sel.style.pen);
    setOptions((prev) => (prev.tip?.type === type ? prev : setAtPath(prev, "tip.type", type)));
  }, [sel.style.pen]);

  const set = useCallback(
    (path: OptionPath, value: unknown, drag = false) => {
      setFromDrag(drag);
      // Shared fields write to SelectionStyle (dock + live marker read/write it too).
      if (path === "color") return sel.setColor(colorToHex(value as PlaygroundOptions["color"]));
      if (path === "opacity") return sel.setOpacity(value as number);
      if (path === "markType") return sel.setMarkType(value as MarkType);
      if (path === "tip.type") {
        sel.setPen(tipTypeToPen(value as TipType));
        setOptions((prev) => setAtPath(prev, "tip.type", value));
        return;
      }
      setOptions((prev) => setAtPath(prev, path, value));
    },
    [sel],
  );

  const merge = useCallback((patch: Partial<PlaygroundOptions>) => {
    setFromDrag(false);
    setOptions((prev) => mergeOptionsShallow(prev, patch));
  }, []);

  const setShape = useCallback(
    (shape: ShapeType) => sel.setMarkType(shape as MarkType),
    [sel],
  );

  const reset = useCallback(() => {
    setFromDrag(false);
    setOptions(buildInitialOptions());
    sel.setColor(DEFAULT_INK);
    sel.setPen("slant");
    sel.setMarkType(DEFAULT_MARK_TYPE);
    sel.setOpacity(DEFAULT_OPACITY);
  }, [sel]);

  // Overlay shared fields onto local options; tip.type already tracks the pen above.
  const merged = useMemo<PlaygroundOptions>(
    () => ({
      ...options,
      color: sel.style.color,
      opacity: sel.style.opacity,
      markType: sel.style.markType,
      shape: sel.style.markType,
    }),
    [options, sel.style.color, sel.style.opacity, sel.style.markType],
  );

  const previewOptions = useAnimatedOptions(merged, fromDrag);

  // previewOptions is deliberately NOT in this value: it rides PlaygroundPreviewContext so sections
  // don't re-render every spring frame.
  const value = useMemo<PlaygroundOptionsContextValue>(
    () => ({ options: merged, set, merge, setShape, reset }),
    [merged, set, merge, setShape, reset],
  );

  return (
    <PlaygroundPreviewContext.Provider value={previewOptions}>
      <PlaygroundOptionsContext.Provider value={value}>
        {children}
      </PlaygroundOptionsContext.Provider>
    </PlaygroundPreviewContext.Provider>
  );
}

export function usePlaygroundOptions(): PlaygroundOptionsContextValue {
  const ctx = use(PlaygroundOptionsContext);
  if (!ctx) {
    throw new Error(
      "usePlaygroundOptions must be used within a <PlaygroundOptionsProvider>",
    );
  }
  return ctx;
}

/** The spring-animated options {@link Preview} renders, on a separate context to spare the sections. */
export function usePreviewOptions(): PlaygroundOptions {
  const ctx = use(PlaygroundPreviewContext);
  if (!ctx) {
    throw new Error(
      "usePreviewOptions must be used within a <PlaygroundOptionsProvider>",
    );
  }
  return ctx;
}
