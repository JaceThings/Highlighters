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
import { useSpringMotionValue } from "../hooks/useSpringNumber.ts";
import { useAnimatedColor } from "../hooks/useAnimatedColor.ts";

function penToTipType(pen: PenTip): TipType {
  if (pen === "round") return "bullet";
  if (pen === "fine") return "fine";
  return "chisel";
}
function tipTypeToPen(type: TipType): PenTip {
  if (type === "bullet") return "round";
  if (type === "fine") return "fine";
  return "slant";
}
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
    shape: "highlight",
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

type OptionPath = string;

interface PlaygroundOptionsContextValue {
  options: PlaygroundOptions;
  set: (path: OptionPath, value: unknown, fromDrag?: boolean) => void;
  merge: (patch: Partial<PlaygroundOptions>) => void;
  setShape: (shape: ShapeType) => void;
  reset: () => void;
}

const PlaygroundOptionsContext =
  createContext<PlaygroundOptionsContextValue | null>(null);

const PlaygroundPreviewContext = createContext<PlaygroundOptions | null>(null);

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

function useAnimatedOptions(
  o: PlaygroundOptions,
  fromDrag: boolean,
): PlaygroundOptions {
  const cfg = { duration: 0.35, ease: STATE_CHANGE_EASE, fromDrag };
  const animatedColor = useAnimatedColor(typeof o.color === "string" ? o.color : DEFAULT_INK, cfg);
  const color = typeof o.color === "string" ? animatedColor : o.color;
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
    (path: OptionPath, value: unknown, drag = false) => {
      setFromDrag(drag);
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

export function usePreviewOptions(): PlaygroundOptions {
  const ctx = use(PlaygroundPreviewContext);
  if (!ctx) {
    throw new Error(
      "usePreviewOptions must be used within a <PlaygroundOptionsProvider>",
    );
  }
  return ctx;
}
