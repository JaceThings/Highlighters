export type ColorValue = string;

export type MarkType =
  | "highlight"
  | "underline"
  | "overline"
  | "strike-through";

export type TipType = "chisel" | "bullet" | "fine";

export type EdgeCap = "flat" | "round" | "square";

export type BlendMode =
  | "multiply"
  | "normal"
  | "darken"
  | "screen"
  | "overlay"
  | "color-burn";

export type SnapMode = "none" | "word" | "line" | "glyph";

export type RendererTierPreference = "auto" | "svg" | "css" | "highlight-api";

export type RendererTier = "svg" | "css" | "highlight-api";

export type AnimationDirection = "left-to-right" | "right-to-left" | "center-out";

export type AnimationTrigger = "immediate" | "in-view";

export type EasingValue =
  | "linear"
  | "ease"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | (string & {});

export interface GradientStop {
  offset: number;
  color: ColorValue;
  opacity?: number;
}

export interface GradientConfig {
  type: "linear";
  angle?: number;
  stops: GradientStop[];
}

export type PaletteName =
  | "fluorescent"
  | "mild"
  | "vintage"
  | "neutral"
  | "calm";

export interface PaletteSwatch {
  palette: PaletteName;
  swatch: string;
}

export interface Palette {
  name: PaletteName;
  swatches: Record<string, ColorValue>;
}

export interface TipOptions {
  type?: TipType;
  width?: number;
  thickness?: number;
  angle?: number;
  overshoot?: number;
  overshootJitter?: number;
  angleJitter?: number;
}

export interface InkOptions {
  flow?: number;
  viscosity?: number;
  feathering?: number;
  streakiness?: number;
  dryout?: number;
  startEndBuildup?: number;
  flowFade?: number;
}

export interface SpeedDynamicsOptions {
  enabled?: boolean;
  sensitivity?: number;
  slowSpeed?: number;
  fastSpeed?: number;
  minDeposit?: number;
  smoothing?: number;
  resolution?: number;
  dryoutBoost?: number;
  streakBoost?: number;
  featherReduce?: number;
  poolBoost?: number;
}

export interface EdgeOptions {
  waviness?: number;
  frequency?: number;
  roughness?: number;
  cap?: EdgeCap;
  radius?: number;
}

export interface PaperOptions {
  absorbency?: number;
}

export interface GlowOptions {
  enabled?: boolean;
  intensity?: number;
  spread?: number;
  color?: ColorValue;
}

export interface AnimationOptions {
  draw?: boolean;
  duration?: number;
  easing?: EasingValue;
  direction?: AnimationDirection;
  stagger?: number;
  trigger?: AnimationTrigger;
  threshold?: number;
  rootMargin?: string;
  repeat?: boolean;
}

export interface HighlightOptions {
  markType?: MarkType;
  color?: ColorValue | PaletteSwatch;
  palette?: PaletteName;
  gradient?: GradientConfig;
  opacity?: number;
  blendMode?: BlendMode;
  vivid?: boolean | "screen";
  tip?: TipOptions;
  ink?: InkOptions;
  speed?: SpeedDynamicsOptions;
  edge?: EdgeOptions;
  paper?: PaperOptions;
  glow?: GlowOptions;
  snap?: SnapMode;
  fadeOnClear?: boolean;
  seed?: number;
  renderer?: RendererTierPreference;
  animation?: AnimationOptions;
  semantic?: boolean;
  contrastBackground?: ColorValue;
}

export interface ResolvedTip {
  type: TipType;
  width: number;
  thickness: number;
  angle: number;
  overshoot: number;
  overshootJitter: number;
  angleJitter: number;
}

export interface ResolvedInk {
  flow: number;
  viscosity: number;
  feathering: number;
  streakiness: number;
  dryout: number;
  startEndBuildup: number;
  flowFade: number;
}

export interface ResolvedSpeedDynamics {
  enabled: boolean;
  sensitivity: number;
  slowSpeed: number;
  fastSpeed: number;
  minDeposit: number;
  smoothing: number;
  resolution: number;
  dryoutBoost: number;
  streakBoost: number;
  featherReduce: number;
  poolBoost: number;
}

export interface LineSpeedProfile {
  depositAt: (fraction: number) => number;
  meanNorm: number;
  decel: number;
}

export interface ResolvedEdge {
  waviness: number;
  frequency: number;
  roughness: number;
  cap: EdgeCap;
  radius: number;
}

export interface ResolvedPaper {
  absorbency: number;
}

export interface ResolvedGlow {
  enabled: boolean;
  intensity: number;
  spread: number;
  color: ColorValue;
}

export interface ResolvedAnimation {
  draw: boolean;
  duration: number;
  easing: EasingValue;
  direction: AnimationDirection;
  stagger: number;
  trigger: AnimationTrigger;
  threshold: number;
  rootMargin: string;
  repeat: boolean;
}

export interface ResolvedOptions {
  markType: MarkType;
  color: ColorValue;
  gradient: GradientConfig | null;
  opacity: number;
  blendMode: BlendMode;
  vivid: boolean | "screen";
  tip: ResolvedTip;
  ink: ResolvedInk;
  speed: ResolvedSpeedDynamics;
  edge: ResolvedEdge;
  paper: ResolvedPaper;
  glow: ResolvedGlow;
  snap: SnapMode;
  fadeOnClear: boolean;
  renderer: RendererTierPreference;
  animation: ResolvedAnimation;
  semantic: boolean;
  contrastBackground: ColorValue | null;
  seed: number | null;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LineRect {
  left: number;
  top: number;
  width: number;
  height: number;
  seed: number;
  isFirst: boolean;
  isLast: boolean;
}

export interface Anchor {
  top: number;
  left: number;
}

export interface EdgeVertex {
  x: number;
  y: number;
  gridIndex: number;
}

export interface PoolGradient {
  angle: number;
  startInsetPx: number;
  startCorePx: number;
  startCorePct: number;
  endCorePx: number;
  endCorePct: number;
  endInsetPx: number;
  stops: GradientStop[];
  coreStopCount?: number;
  coreStopsPositionsPx?: number[];
  layerScale?: number;
}

export interface NoiseTile {
  dataUrl: string;
  width: number;
  height: number;
}

export interface MaskOffset {
  x: number;
  y: number;
}

export interface MarkGeometry {
  box: Box;
  seed: number;
  clipPath: string;
  clipAtFront: (front: number) => string;
  slant: number;
  minFront: number;
  topEdge: EdgeVertex[];
  bottomEdge: EdgeVertex[];
  noiseTile: NoiseTile;
  maskOffset: MaskOffset;
  pool: PoolGradient;
}

export interface PageTarget {
  root?: Element | Document;
  include?: string[];
  exclude?: string[];
}

export interface TextTarget {
  text: string | RegExp;
  root?: Element | Document;
}

export type Target =
  | Element
  | string
  | Range
  | Selection
  | TextTarget
  | PageTarget;

export interface MarkHandle {
  show(): void;
  hide(): void;
  update(opts: Partial<HighlightOptions>): void;
  remove(): void;
  isShowing(): boolean;
  readonly tier: RendererTier;
}

export interface GroupHandle {
  show(): void;
  hide(): void;
  remove(): void;
  readonly marks: MarkHandle[];
}

export interface RenderEnvironment {
  supportsSvgFilters: boolean;
  supportsCssBlend: boolean;
  supportsHighlightApi: boolean;
  prefersReducedMotion: boolean;
  prefersReducedData: boolean;
  coarsePointer: boolean;
  degradeThreshold: number;
}

export interface Renderer {
  readonly tier: RendererTier;
  mount(context: RenderContext): void;
  update(context: RenderContext): void;
  unmount(): void;
  bandFor(seed: number): HTMLElement | null;
}

export interface RenderContext {
  container: HTMLElement;
  options: ResolvedOptions;
  lines: MarkGeometry[];
  ranges: Range[];
}

export type ReflowCallback = () => void;

export type MutationCallback = (records: MutationRecord[]) => void;

export type Disconnect = () => void;
