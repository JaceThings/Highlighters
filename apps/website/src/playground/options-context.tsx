import {
  createContext,
  useCallback,
  use,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { MotionValue } from "framer-motion";
import { DEFAULT_OPTIONS, resolveSwatch } from "@highlighters/core";
import type {
  BlendMode,
  ColorValue,
  HighlightOptions,
  MarkType,
  PaletteSwatch,
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
import { useSpringMotionValue } from "../hooks/useSpringNumber.ts";
import { useAnimatedColor } from "../hooks/useAnimatedColor.ts";

function penToTipType(pen: PenTip): TipType {
  if (pen === "round") return "bullet";
  if (pen === "fine") return "fine";
  return "chisel";
}
function tipTypeToPen(type: TipType | undefined): PenTip {
  if (type === "bullet") return "round";
  if (type === "fine") return "fine";
  return "slant";
}

type ParsedColor =
  | { kind: "hex"; hex: ColorValue }
  | { kind: "swatch"; swatch: PaletteSwatch }
  | { kind: "unset" };

function parseColor(color: PlaygroundOptions["color"]): ParsedColor {
  if (color === undefined) return { kind: "unset" };
  if (color instanceof Object) return { kind: "swatch", swatch: color };
  return { kind: "hex", hex: color };
}

export function colorToHex(color: PlaygroundOptions["color"], fallback = DEFAULT_INK): string {
  const parsed = parseColor(color);
  if (parsed.kind === "hex") return parsed.hex;
  if (parsed.kind === "unset") return fallback;
  try {
    return resolveSwatch(parsed.swatch);
  } catch {
    return fallback;
  }
}

export interface PlaygroundOptions extends HighlightOptions {
  stack?: boolean;
}

const STACK_DEFAULT = DEFAULT_OPTIONS.blendMode === "multiply";
const TIP_OVERSHOOT_DEFAULT = 2;
const TIP_OVERSHOOT_JITTER_DEFAULT = 1;

export function toCoreOptions(opts: PlaygroundOptions): HighlightOptions {
  const { stack, ...rest } = opts;
  const blendMode: BlendMode =
    stack === false ? "normal" : stack === true ? "multiply" : (rest.blendMode ?? "multiply");
  return { ...rest, blendMode };
}

function buildInitialOptions(): PlaygroundOptions {
  return {
    markType: "highlight",
    color: { palette: "fluorescent", swatch: "yellow" },
    opacity: 0.5,
    stack: STACK_DEFAULT,
    snap: "word",
    tip: {
      type: "chisel",
      width: 16,
      thickness: 4,
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

type OptionGroupKey = {
  [K in keyof PlaygroundOptions]-?: NonNullable<PlaygroundOptions[K]> extends object
    ? K
    : never;
}[keyof PlaygroundOptions];

type OptionGroupFlags = { [K in OptionGroupKey]: true };

const OPTION_GROUPS: OptionGroupFlags = {
  gradient: true,
  tip: true,
  ink: true,
  speed: true,
  edge: true,
  paper: true,
  glow: true,
  animation: true,
};

function isOptionGroup(key: string): key is OptionGroupKey {
  return key in OPTION_GROUPS;
}

type NestedOptionPath = {
  [K in OptionGroupKey]: `${K & string}.${keyof NonNullable<PlaygroundOptions[K]> & string}`;
}[OptionGroupKey];

export type OptionPath = (keyof PlaygroundOptions & string) | NestedOptionPath;

export type ValueAtPath<P extends OptionPath> = P extends keyof PlaygroundOptions
  ? PlaygroundOptions[P]
  : P extends `${infer G}.${infer F}`
    ? G extends OptionGroupKey
      ? F extends keyof NonNullable<PlaygroundOptions[G]>
        ? NonNullable<PlaygroundOptions[G]>[F]
        : never
      : never
    : never;

export type OptionPathOf<Value> = {
  [P in OptionPath]: NonNullable<ValueAtPath<P>> extends Value ? P : never;
}[OptionPath];

const EMPTY_OPTIONS: PlaygroundOptions = {};

interface PlaygroundOptionsContextValue {
  options: PlaygroundOptions;
  set: <P extends OptionPath>(path: P, value: ValueAtPath<P>, fromDrag?: boolean) => void;
  merge: (patch: Partial<PlaygroundOptions>) => void;
  setMarkType: (markType: MarkType) => void;
  reset: () => void;
}

const PlaygroundOptionsContext =
  createContext<PlaygroundOptionsContextValue | null>(null);

const PlaygroundPreviewContext = createContext<PlaygroundOptions | null>(null);

function mergeOptionsShallow(
  base: PlaygroundOptions,
  patch: Partial<PlaygroundOptions>,
): PlaygroundOptions {
  const next: PlaygroundOptions = { ...base, ...patch };
  const baseColor = parseColor(base.color);
  const patchColor = parseColor(patch.color);
  if (baseColor.kind === "swatch" && patchColor.kind === "swatch") {
    next.color = { ...baseColor.swatch, ...patchColor.swatch };
  }
  if (base.gradient && patch.gradient) next.gradient = { ...base.gradient, ...patch.gradient };
  if (base.tip && patch.tip) next.tip = { ...base.tip, ...patch.tip };
  if (base.ink && patch.ink) next.ink = { ...base.ink, ...patch.ink };
  if (base.speed && patch.speed) next.speed = { ...base.speed, ...patch.speed };
  if (base.edge && patch.edge) next.edge = { ...base.edge, ...patch.edge };
  if (base.paper && patch.paper) next.paper = { ...base.paper, ...patch.paper };
  if (base.glow && patch.glow) next.glow = { ...base.glow, ...patch.glow };
  if (base.animation && patch.animation) {
    next.animation = { ...base.animation, ...patch.animation };
  }
  return next;
}

function setAtPath<P extends OptionPath>(
  base: PlaygroundOptions,
  path: P,
  value: ValueAtPath<P>,
): PlaygroundOptions {
  const segments = path.split(".");
  if (segments.length === 1) {
    return { ...base, [segments[0]]: value };
  }
  if (segments.length === 2) {
    const [group, field] = segments;
    const existingGroup = isOptionGroup(group) ? base[group] : undefined;
    return { ...base, [group]: { ...existingGroup, [field]: value } };
  }
  throw new Error(
    `@highlighters playground: unsupported option path "${path}" (max depth 2)`,
  );
}

function useAnimatedOptions(
  o: PlaygroundOptions,
  fromDrag: boolean,
): PlaygroundOptions {
  const cfg = { duration: 0.35, ease: STATE_CHANGE_EASE, fromDrag };
  const parsedColor = parseColor(o.color);
  const animatedColor = useAnimatedColor(
    parsedColor.kind === "hex" ? parsedColor.hex : DEFAULT_INK,
    cfg,
  );
  const color = parsedColor.kind === "hex" ? animatedColor : o.color;
  const opacity = useSpringMotionValue(o.opacity ?? 0.5, cfg);
  const angle = useSpringMotionValue(o.tip?.angle ?? 35, cfg);
  const overshoot = useSpringMotionValue(o.tip?.overshoot ?? 2, cfg);
  const overshootJitter = useSpringMotionValue(o.tip?.overshootJitter ?? 1, cfg);
  const flow = useSpringMotionValue(o.ink?.flow ?? 0.5, cfg);
  const viscosity = useSpringMotionValue(o.ink?.viscosity ?? 0.5, cfg);
  const feathering = useSpringMotionValue(o.ink?.feathering ?? 0.3, cfg);
  const streakiness = useSpringMotionValue(o.ink?.streakiness ?? 0.35, cfg);
  const dryout = useSpringMotionValue(o.ink?.dryout ?? 0.15, cfg);
  const startEndBuildup = useSpringMotionValue(o.ink?.startEndBuildup ?? 0.25, cfg);
  const waviness = useSpringMotionValue(o.edge?.waviness ?? 1.5, cfg);
  const frequency = useSpringMotionValue(o.edge?.frequency ?? 22, cfg);
  const roughness = useSpringMotionValue(o.edge?.roughness ?? 0.3, cfg);
  const radius = useSpringMotionValue(o.edge?.radius ?? 4, cfg);
  const absorbency = useSpringMotionValue(o.paper?.absorbency ?? 0.3, cfg);
  const glowIntensity = useSpringMotionValue(o.glow?.intensity ?? 0.5, cfg);
  const glowSpread = useSpringMotionValue(o.glow?.spread ?? 4, cfg);

  const springs: MotionValue<number>[] = [
    opacity, angle, overshoot, overshootJitter,
    flow, viscosity, feathering, streakiness, dryout, startEndBuildup,
    waviness, frequency, roughness, radius,
    absorbency, glowIntensity, glowSpread,
  ];
  const [nums, setNums] = useState<number[]>(() => springs.map((m) => m.get()));

  useEffect(() => {
    let raf = 0;
    const flush = () => {
      raf = 0;
      setNums(springs.map((m) => m.get()));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const unsubs = springs.map((m) => m.on("change", schedule));
    return () => {
      if (raf) cancelAnimationFrame(raf);
      unsubs.forEach((u) => u());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- springs is rebuilt each render but element-equal
  }, springs);

  const [
    opacityV, angleV, overshootV, overshootJitterV,
    flowV, viscosityV, featheringV, streakinessV, dryoutV, startEndBuildupV,
    wavinessV, frequencyV, roughnessV, radiusV,
    absorbencyV, glowIntensityV, glowSpreadV,
  ] = nums;

  return useMemo<PlaygroundOptions>(
    () => ({
      ...o,
      color,
      opacity: opacityV,
      tip: { ...o.tip, angle: angleV, overshoot: overshootV, overshootJitter: overshootJitterV },
      ink: {
        ...o.ink,
        flow: flowV,
        viscosity: viscosityV,
        feathering: featheringV,
        streakiness: streakinessV,
        dryout: dryoutV,
        startEndBuildup: startEndBuildupV,
      },
      edge: { ...o.edge, waviness: wavinessV, frequency: frequencyV, roughness: roughnessV, radius: radiusV },
      paper: { ...o.paper, absorbency: absorbencyV },
      glow: { ...o.glow, intensity: glowIntensityV, spread: glowSpreadV },
    }),
    [o, color, opacityV, angleV, overshootV, overshootJitterV, flowV, viscosityV, featheringV, streakinessV, dryoutV, startEndBuildupV, wavinessV, frequencyV, roughnessV, radiusV, absorbencyV, glowIntensityV, glowSpreadV],
  );
}

export function PlaygroundOptionsProvider({ children }: { children: ReactNode }) {
  const sel = useSelectionStyle();
  const [options, setOptions] = useState<PlaygroundOptions>(buildInitialOptions);
  const [fromDrag, setFromDrag] = useState(false);

  useEffect(() => {
    const type = penToTipType(sel.style.pen);
    setOptions((prev) => (prev.tip?.type === type ? prev : setAtPath(prev, "tip.type", type)));
  }, [sel.style.pen]);

  const set = useCallback(
    <P extends OptionPath>(path: P, value: ValueAtPath<P>, drag = false) => {
      setFromDrag(drag);
      const parsed = setAtPath(EMPTY_OPTIONS, path, value);
      if (path === "color") return sel.setColor(colorToHex(parsed.color));
      if (path === "opacity") return sel.setOpacity(parsed.opacity ?? DEFAULT_OPACITY);
      if (path === "markType") return sel.setMarkType(parsed.markType ?? DEFAULT_MARK_TYPE);
      if (path === "tip.type") {
        sel.setPen(tipTypeToPen(parsed.tip?.type));
        setOptions((prev) => setAtPath(prev, "tip.type", parsed.tip?.type));
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

  const setMarkType = useCallback((markType: MarkType) => sel.setMarkType(markType), [sel]);

  const reset = useCallback(() => {
    setFromDrag(false);
    setOptions(buildInitialOptions());
    sel.setColor(DEFAULT_INK);
    sel.setPen("slant");
    sel.setMarkType(DEFAULT_MARK_TYPE);
    sel.setOpacity(DEFAULT_OPACITY);
  }, [sel]);

  const merged = useMemo<PlaygroundOptions>(
    () => ({
      ...options,
      color: sel.style.color,
      opacity: sel.style.opacity,
      markType: sel.style.markType,
    }),
    [options, sel.style.color, sel.style.opacity, sel.style.markType],
  );

  const previewOptions = useAnimatedOptions(merged, fromDrag);

  const value = useMemo<PlaygroundOptionsContextValue>(
    () => ({ options: merged, set, merge, setMarkType, reset }),
    [merged, set, merge, setMarkType, reset],
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

export function usePreviewOptions(): PlaygroundOptions {
  const ctx = use(PlaygroundPreviewContext);
  if (!ctx) {
    throw new Error(
      "usePreviewOptions must be used within a <PlaygroundOptionsProvider>",
    );
  }
  return ctx;
}
