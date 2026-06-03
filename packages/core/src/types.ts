/**
 * The complete public + internal type surface for `@highlighters/core`.
 *
 * Two halves: Section 1 (pure config & geometry types) references no DOM lib
 * types and is safe to import from the SSR-safe `@highlighters/core/path` entry;
 * Section 2 references `lib.dom` types and must never be imported from there.
 *
 * Every per-mark random value derives deterministically from a seed via a
 * `sin()`-based hash (no PRNG, no wall-clock), so identical `(geometry, options,
 * seed)` inputs produce byte-identical marks across server and client.
 */

// SECTION 1 - Pure configuration & geometry types (DOM-free, SSR-safe)

/**
 * A CSS color string (`#rgb`, `#rrggbb`, `rgb()`, `hsl()`, named, `currentColor`,
 * or a CSS custom-property reference such as `var(--accent)`).
 */
export type ColorValue = string;

/**
 * The kind of mark drawn. All share one band primitive and the full physics
 * model, differing mainly in vertical position/thickness:
 * - `highlight` - a tall band over the text;
 * - `underline` - a thin band at the baseline;
 * - `overline` - a thin band along the top;
 * - `strike-through` - a thin band centered on the x-height.
 */
export type MarkType =
  | "highlight"
  | "underline"
  | "overline"
  | "strike-through";

/** Alias of {@link MarkType}. `shape` and `markType` are accepted as synonyms. */
export type ShapeType = MarkType;

export type TipType = "chisel" | "bullet" | "fine";

/** End-cap rendering for a band's leading/trailing edge. */
export type EdgeCap = "flat" | "round" | "square";

/**
 * Compositing model for the ink layer. Default `multiply` gives true subtractive
 * ink optics: overlapping marks darken and dark glyphs stay legible.
 */
export type BlendMode =
  | "multiply"
  | "normal"
  | "darken"
  | "screen"
  | "overlay"
  | "color-burn";

/**
 * Boundary-snapping mode. Clamps a mark's start/end to the chosen text boundary
 * so it never overshoots into surrounding whitespace.
 */
export type SnapMode = "none" | "word" | "line" | "glyph";

/**
 * Renderer tier preference. `auto` selects the best supported tier and enables
 * auto-degrade; the others pin a specific tier and disable auto-degrade.
 */
export type RendererTierPreference = "auto" | "svg" | "css" | "highlight-api";

/**
 * The concrete renderer tier in use.
 * - `svg` - per-line SVG band with shared turbulence/displacement filters (default).
 * - `css` - `linear-gradient` band with `box-decoration-break: clone`.
 * - `highlight-api` - CSS Custom Highlight API (`::highlight()`).
 */
export type RendererTier = "svg" | "css" | "highlight-api";

/** Direction a draw-on animation sweeps across each band. */
export type AnimationDirection = "left-to-right" | "right-to-left" | "center-out";

/** When an entrance animation begins. */
export type AnimationTrigger = "immediate" | "in-view";

/**
 * Animation easing - a named CSS timing keyword or any valid CSS easing
 * function string (`cubic-bezier(...)`, `steps(...)`).
 */
export type EasingValue =
  | "linear"
  | "ease"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | (string & {});

/** A single color stop within a gradient, expressed in `[0,1]` offset space. */
export interface GradientStop {
  /** Position along the gradient, `0` (start) to `1` (end). */
  offset: number;
  color: ColorValue;
  /** Stop alpha, `0`–`1`. Defaults to `1` when omitted. */
  opacity?: number;
}

/**
 * A multi-stop linear gradient across the band's length. This config only
 * describes the color ramp; the end-pool stops are sized in absolute px by the
 * renderer (see {@link PoolGradient}).
 */
export interface GradientConfig {
  type: "linear";
  /** Gradient angle in CSS degrees. Defaults to the canonical `85deg` swipe. */
  angle?: number;
  /** Ordered color stops. Two or more required for a visible gradient. */
  stops: GradientStop[];
}

/**
 * Names of the curated, harmonized palette families. Each is tuned so multiple of
 * its colors read coherently together for color-coding. `mild` is the default.
 */
export type PaletteName =
  | "fluorescent"
  | "mild"
  | "vintage"
  | "neutral"
  | "calm";

/** A `{ palette, swatch }` reference the renderer resolves to a {@link ColorValue}. */
export interface PaletteSwatch {
  palette: PaletteName;
  /** Swatch name within the family (e.g. `'yellow'`, `'pink'`). */
  swatch: string;
}

/** A fully-realized palette family: an ordered, named map of swatches. */
export interface Palette {
  name: PaletteName;
  /** Ordered swatches, keyed by swatch name. Order defines the color-coding cycle. */
  swatches: Record<string, ColorValue>;
}

/**
 * Nib geometry. `angle` drives the chisel slant (the lean baked into each band's
 * clip-path). `width`/`thickness` are part of the option surface but reserved -
 * the default renderer derives the lean from `angle` and band width, not these.
 */
export interface TipOptions {
  /** Nib shape. Default `chisel`. */
  type?: TipType;
  /** Broad-face width of the nib, in px. Reserved - not consumed by the renderer. */
  width?: number;
  /** Narrow-edge thickness of the nib, in px. Reserved - not consumed by the renderer. */
  thickness?: number;
  /** Nib angle relative to the stroke, in degrees (chisel slant). */
  angle?: number;
  /**
   * Signed px each outer end runs past the text edges: positive overshoots,
   * `0` stops flush, negative pulls in short. Inner edges of a wrapped run ignore
   * this - they always overlap to stitch consecutive lines into one swipe. Default `2`.
   */
  overshoot?: number;
  /** Per-end px variance of {@link overshoot} (≥0), deterministic. Default `1`. */
  overshootJitter?: number;
  /** Per-line degrees of variance on the chisel {@link angle} (≥0), deterministic. Default `0`. */
  angleJitter?: number;
}

/**
 * Ink behavior in real-highlighter vocabulary. All fields are normalized `0`–`1`
 * unless noted; the {@link ResolvedOptions} form has concrete defaults.
 */
export interface InkOptions {
  /** Juiciness - deposit amount; raises width, softens edges. */
  flow?: number;
  /** Inverse flow - raises edge sharpness and skip frequency. */
  viscosity?: number;
  /** Capillary lateral edge spread (noise-perturbed, optionally blurred). */
  feathering?: number;
  /** Lengthwise lighter/darker lanes within a stroke (the primary realism tell). */
  streakiness?: number;
  /** Probabilistic alpha gaps (skipping), coupled to {@link viscosity}. */
  dryout?: number;
  /**
   * Deposit variation at stroke ends, `-1`–`1`: positive **pools** ink (wet look),
   * `0` is even, negative engages the anti-pool guardrail that suppresses end
   * darkening (premium-marker look).
   */
  startEndBuildup?: number;
  /**
   * Directional dry-out along each line, `0`–`1`: saturated where the nib touches
   * down, fading drier toward the line end. `0` is even coverage.
   */
  flowFade?: number;
}

/**
 * Speed-aware ink deposit for the LIVE text selection. Beta, off by default. A
 * faster swipe deposits less ink (deposit ∝ dwell-time per unit length), mapped
 * continuously, so within one line a slow→fast→slow drag fades dark→light→dark.
 *
 * Engages only under {@link highlightSelection} during a real fine-pointer drag;
 * a complete no-op (byte-identical output) for static marks, programmatic/keyboard
 * selections, SSR, and whenever `enabled` is `false`.
 */
export interface SpeedDynamicsOptions {
  /** Master enable. Default `false` - a Beta opt-in (engages only on a live fine-pointer drag). */
  enabled?: boolean;
  /** Overall strength, `0`–`1`. `0` disables the effect; `1` is full range. Default `1`. */
  sensitivity?: number;
  /** Swipe speed (px/ms) at/below which ink is wettest (deposit ×1). Default `2.5` - a normal drag stays full. */
  slowSpeed?: number;
  /** Swipe speed (px/ms) at/above which ink is driest (deposit ×`minDeposit`). Default `10.5` - only a fast flick. */
  fastSpeed?: number;
  /** Legibility floor `0`–`1`: the fastest swipe still deposits this fraction. Default `0.4`. */
  minDeposit?: number;
  /** Velocity EMA weight on the newest sample, `0`–`1` (`1` = raw/instant, `0` = heavy lag). Default `1`. */
  smoothing?: number;
  /** Core gradient stops per line - higher resolves finer mid-line variation. Default `24` (clamped `4`–`24`). */
  resolution?: number;
  /** Weight `0`–`1`: how much a fast swipe adds skipping (dryout). Default `1`. */
  dryoutBoost?: number;
  /** Weight `0`–`1`: how much a fast swipe adds railroading (streakiness). Default `0.08`. */
  streakBoost?: number;
  /** Weight `0`–`1`: how much a fast swipe sharpens the edge (less feather). Default `1`. */
  featherReduce?: number;
  /** Weight `0`–`1`: how much deceleration into a line end pools ink there. Default `1`. */
  poolBoost?: number;
}

/**
 * Edge appearance along the straight → frayed continuum. All waviness/roughness
 * at `0` yields clean geometric edges.
 */
export interface EdgeOptions {
  /** Peak wavy-edge displacement, in absolute px (amplitude). */
  waviness?: number;
  /**
   * Wave density as the px `segmentLength` between grid vertices (smaller = more
   * periods per unit length). Width-independent.
   */
  frequency?: number;
  /** High-frequency micro-jitter on top of the base wave, `0`–`1`. */
  roughness?: number;
  /** End-cap style for the band's leading/trailing edges. */
  cap?: EdgeCap;
  /** Corner radius in absolute px (clamped against short marks). */
  radius?: number;
}

/** Paper surface. Multiplies feathering and softens edges. */
export interface PaperOptions {
  /** Absorbency `0`–`1`: higher wicks more, growing feather and softening edges. */
  absorbency?: number;
}

/**
 * Fluorescence / glow. Additive emission over the multiply ink, so an enabled mark
 * may read brighter than its background. Off by default; never reduces legibility.
 */
export interface GlowOptions {
  /** Master enable. Default `false`. */
  enabled?: boolean;
  /** Additive emission strength, `0`–`1`. */
  intensity?: number;
  /** Bloom spread radius, in px. */
  spread?: number;
  /** Emission hue; defaults to a brightened form of the ink color. */
  color?: ColorValue;
}

/**
 * Entrance-animation configuration. All entrance animation is suppressed
 * automatically under `prefers-reduced-motion: reduce`.
 */
export interface AnimationOptions {
  /** Enable the draw-on swipe. Default `true` (subject to reduced-motion gate). */
  draw?: boolean;
  /** Duration of a single band's draw-on, in milliseconds. */
  duration?: number;
  /** Easing for the draw-on sweep. */
  easing?: EasingValue;
  /** Sweep direction across each band. */
  direction?: AnimationDirection;
  /** Per-line / per-mark delay, in milliseconds (sequential pen travel). */
  stagger?: number;
  /** When the animation begins. `in-view` arms an `IntersectionObserver` (R24). */
  trigger?: AnimationTrigger;
  /** `IntersectionObserver` threshold for `in-view`, `0`–`1`. */
  threshold?: number;
  /** `IntersectionObserver` root margin for `in-view` (CSS margin string). */
  rootMargin?: string;
  /** Re-animate every time the mark enters view, vs one-shot. Default `false`. */
  repeat?: boolean;
}

/**
 * The full user-facing options object. Every field is optional; values resolve to
 * {@link ResolvedOptions} via the deep-merge order defaults → user.
 */
export interface HighlightOptions {
  /** Mark kind. Default `highlight`. */
  shape?: ShapeType;
  /** Mark kind. Synonym of {@link shape}; whichever is provided last wins. */
  markType?: MarkType;

  /** Solid ink color, or a `{ palette, swatch }` reference. */
  color?: ColorValue | PaletteSwatch;
  /** Palette family to draw the default swatch from when `color` is unset. */
  palette?: PaletteName;
  /** Multi-stop gradient; overrides `color` when present. */
  gradient?: GradientConfig;
  /** Overall ink alpha, `0`–`1`. */
  opacity?: number;
  /** Ink compositing model. Default `multiply`. */
  blendMode?: BlendMode;

  /** Nib geometry. */
  tip?: TipOptions;
  /** Ink behavior. */
  ink?: InkOptions;
  /** Speed-aware ink deposit for the live selection (live-only; see {@link SpeedDynamicsOptions}). */
  speed?: SpeedDynamicsOptions;
  /** Edge waviness/roughness/cap/radius. */
  edge?: EdgeOptions;
  /** Paper surface. */
  paper?: PaperOptions;
  /** Additive fluorescence/glow. */
  glow?: GlowOptions;

  /** Boundary-snapping mode. Default depends on target (see {@link Target}). */
  snap?: SnapMode;

  /** Fade the live selection out on clear instead of removing instantly.
   *  Live-selection only ({@link highlightSelection}); static {@link highlight}
   *  ignores it. Default `true`. */
  fadeOnClear?: boolean;

  /** Explicit deterministic seed; derived from target identity when omitted. */
  seed?: number;

  /** Renderer tier preference / pin. Default `auto`. */
  renderer?: RendererTierPreference;

  /** Entrance animation. */
  animation?: AnimationOptions;

  /**
   * Wrap each targeted run in a real `<mark>` element for semantics, alongside the
   * decorative overlay. Opt-in, fully reversible by `remove()`. Default `false`.
   */
  semantic?: boolean;

  /** Background the mark composites against; drives only the dev-time WCAG-contrast
   *  warning. Not rendered. */
  contrastBackground?: ColorValue;
}

/** {@link TipOptions} with every field resolved. */
export interface ResolvedTip {
  type: TipType;
  width: number;
  thickness: number;
  angle: number;
  overshoot: number;
  overshootJitter: number;
  angleJitter: number;
}

/** {@link InkOptions} with every field resolved. */
export interface ResolvedInk {
  flow: number;
  viscosity: number;
  feathering: number;
  streakiness: number;
  dryout: number;
  startEndBuildup: number;
  flowFade: number;
}

/** {@link SpeedDynamicsOptions} with every field resolved. */
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

/**
 * A per-line speed read, computed live from the selection's swipe velocity and
 * injected into {@link buildMarkGeometry} as plain data (so geometry stays pure
 * and SSR-safe). Absent for static marks and when no drag velocity was sampled.
 */
export interface LineSpeedProfile {
  /**
   * Deposit multiplier in `[minDeposit, 1]` at fraction `f ∈ [0,1]` along the band
   * - `1` where the swipe was slow (wet), `minDeposit` where it was fast (dry).
   */
  depositAt: (fraction: number) => number;
  /** Normalized mean swipe speed across the line, `0`–`1`. */
  meanNorm: number;
  /** Deceleration into the line end, `0`–`1` - drives extra end pooling. */
  decel: number;
}

/** {@link EdgeOptions} with every field resolved. `frequency` is px `segmentLength`. */
export interface ResolvedEdge {
  waviness: number;
  frequency: number;
  roughness: number;
  cap: EdgeCap;
  radius: number;
}

/** {@link PaperOptions} with every field resolved. */
export interface ResolvedPaper {
  absorbency: number;
}

/** {@link GlowOptions} with every field resolved. `color` resolves to concrete. */
export interface ResolvedGlow {
  enabled: boolean;
  intensity: number;
  spread: number;
  color: ColorValue;
}

/** {@link AnimationOptions} with every field resolved. */
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

/**
 * A fully-resolved configuration with no optionals - the single source of truth
 * handed to geometry and renderers, produced by `resolveOptions()`.
 */
export interface ResolvedOptions {
  markType: MarkType;
  color: ColorValue;
  /** `null` when no gradient is configured (solid `color` is used). */
  gradient: GradientConfig | null;
  opacity: number;
  blendMode: BlendMode;
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
  /** Resolved background for contrast checking, or `null` if none supplied. */
  contrastBackground: ColorValue | null;
  /** Explicit seed, else `null` to signal each mark must derive one from a stable target identity. */
  seed: number | null;
}

/** An axis-aligned box in absolute (resolution-independent) px. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A single visual line's rectangle, measured via `Range.getClientRects()`.
 * `top - anchorTop` is the seed source because it stays invariant under scroll and
 * forward/backward drag-extension.
 */
export interface LineRect {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Stable per-line seed, `round((top - anchorTop) * 7)`. */
  seed: number;
  /** First visual line of the mark - controls leading overshoot. */
  isFirst: boolean;
  /** Last visual line of the mark - controls trailing overshoot. */
  isLast: boolean;
}

/**
 * The reference point all per-line seeds are measured against. For static marks
 * derived from the target's stable identity (not a live selection top), preserving
 * SSR determinism.
 */
export interface Anchor {
  top: number;
  /** Retained for layout offset math; excluded from the seed. */
  left: number;
}

/** A single vertex on the fixed wave grid: `x = gridIndex * segmentLength`. */
export interface EdgeVertex {
  x: number;
  /** `baseY + hashJitter(seed + gridIndex * k) * amplitude`. */
  y: number;
  /** Grid index `i` this vertex was seeded from (for prefix-stability tests). */
  gridIndex: number;
}

/**
 * The absolute-px end-pool gradient. Stops are fixed px from each end with
 * `min`/`max` clamps so a short mark cannot over-pool - never a percentage of
 * stroke length.
 */
export interface PoolGradient {
  /** CSS gradient angle in degrees (the canonical `85deg`). */
  angle: number;
  startInsetPx: number;
  /** Leading pool plateau clamp: `min(corePx, corePct%)`. */
  startCorePx: number;
  startCorePct: number;
  /** Trailing pool plateau clamp: `max(len - corePx, corePct%)`. */
  endCorePx: number;
  endCorePct: number;
  endInsetPx: number;
  stops: GradientStop[];
  /**
   * Live-speed path only. Count of interior core stops between the two pool ends;
   * absent on the legacy 4-stop gradient (every static mark + no-drag paint).
   */
  coreStopCount?: number;
  /** Live-speed path only. Pre-computed px position of each core stop (length === {@link coreStopCount}). */
  coreStopsPositionsPx?: number[];
  /**
   * Live-speed path only. Scales layer opacity to encode the line's ABSOLUTE
   * deposit (≤ 1): the stops carry only relative shape (normalized to the brightest
   * stop), so a uniformly-fast line must dim here or normalization cancels the
   * dry-out. Absent → renderer uses `1`.
   */
  layerScale?: number;
}

/**
 * A fixed-pixel, seamlessly-stitched (`stitchTiles="stitch"`) noise tile. Applied
 * at fixed px size and repeated; per-line variety comes from offsetting the sample
 * window, never from rescaling the texture.
 */
export interface NoiseTile {
  /** A `data:` URL of the dual-`feTurbulence` SVG tile. */
  dataUrl: string;
  width: number;
  height: number;
}

/** Per-line texture sample window - an offset, never a scale. */
export interface MaskOffset {
  /** `-((seed * 37) mod tileW)`. */
  x: number;
  /** `-((seed * 13) mod tileH)`. */
  y: number;
}

/**
 * The complete, resolution-independent geometry for one visual line, produced by
 * `buildMarkGeometry()`. Each renderer tier may ignore parts it cannot express
 * (degrade is fidelity-only). Computed once per geometry and reused until reflow.
 */
export interface MarkGeometry {
  /** The line's box in absolute px (band footprint, incl. overshoot). */
  box: Box;
  /** The seed every value in this geometry derives from. */
  seed: number;
  /** `clip-path: path(...)` string in absolute-px coordinates. */
  clipPath: string;
  /**
   * Rebuild the `clip-path` truncated to an advancing `front` (local px), with the
   * leading tip cap drawn AT the front - the draw-on grows the band by appending
   * grid nodes (never stretching). `clipAtFront(box.width)` equals {@link clipPath}.
   * Pure; safe to call per animation frame.
   */
  clipAtFront: (front: number) => string;
  /** Chisel slant in px - how far the top edge leads the bottom (0 for bullet/fine). */
  slant: number;
  /**
   * Smallest visible front (local px) - the tip touchdown width below which the cap
   * would invert, so {@link clipAtFront} clamps up to it. The draw-on starts here
   * (progress `0→1` maps to `minFront → box.width`) so the band touches down at its
   * tip and immediately drags rather than popping to this width and pausing.
   */
  minFront: number;
  topEdge: EdgeVertex[];
  bottomEdge: EdgeVertex[];
  /** Fixed-px noise tile sampled by {@link maskOffset} (shared per mark). */
  noiseTile: NoiseTile;
  maskOffset: MaskOffset;
  pool: PoolGradient;
}

// SECTION 2 - DOM-touching types (NOT importable from the `/path` entry)

/**
 * A whole-page (or sub-tree) target with surgical exclusions. Everything textual
 * under `root` is highlighted except subtrees matching `exclude`; exclusion takes
 * precedence over inclusion at every level.
 */
export interface PageTarget {
  /** Root to scan. Defaults to `document.body`. */
  root?: Element | Document;
  /** Selectors whose subtrees are additionally *included* (page-then-include). */
  include?: string[];
  /** Selectors whose subtrees are excluded; precedence over inclusion (R7). */
  exclude?: string[];
}

/**
 * A text-search target: every match of `text` (exact string or `RegExp`) within
 * `root`, including matches spanning inline element boundaries.
 */
export interface TextTarget {
  text: string | RegExp;
  /** Root to search within. Defaults to `document.body`. */
  root?: Element | Document;
}

/**
 * The full union of targeting inputs. Every variant normalizes to DOM `Range`s,
 * then per-visual-line rectangles, then the active renderer tier.
 *
 * - `Element` - that element's text content.
 * - `string`  - a CSS selector resolved to elements.
 * - `Range`   - an explicit range.
 * - `Selection` - the current selection's ranges.
 * - {@link TextTarget} - every match of a text query.
 * - {@link PageTarget}  - whole page/sub-tree with include/exclude.
 */
export type Target =
  | Element
  | string
  | Range
  | Selection
  | TextTarget
  | PageTarget;

/**
 * A handle to a single mark covering one target. `remove()` restores the DOM to
 * its pre-highlight state (no orphaned nodes, attributes, or observers).
 * `update()` re-resolves options through the merge chain without re-seeding
 * stable geometry.
 */
export interface MarkHandle {
  /** Reveal the mark (re-animates only on first show or explicit re-show). */
  show(): void;
  /** Hide the mark without tearing down geometry or observers. */
  hide(): void;
  /** Merge `opts` over the current configuration and re-render. */
  update(opts: Partial<HighlightOptions>): void;
  /** Remove the mark, restore the DOM, and disconnect observers. */
  remove(): void;
  isShowing(): boolean;
  /** The concrete renderer tier in use. */
  readonly tier: RendererTier;
}

/**
 * A grouping primitive that shows/hides multiple handles together and animates
 * them in sequence (choreography).
 */
export interface GroupHandle {
  /** Show all members, staggered in array order for sequential draw-on. */
  show(): void;
  hide(): void;
  /** Remove all members and restore the DOM. */
  remove(): void;
  /** The member handles, in choreography order. */
  readonly marks: MarkHandle[];
}

/** Capability + preference snapshot consumed by `selectTier()`. */
export interface RenderEnvironment {
  /** Tier A: `clip-path`, `mask-image`, SVG filters available. */
  supportsSvgFilters: boolean;
  /** Tier B: `mix-blend-mode` + `box-decoration-break` available. */
  supportsCssBlend: boolean;
  /** Tier C: the CSS Custom Highlight API is available. */
  supportsHighlightApi: boolean;
  prefersReducedMotion: boolean;
  prefersReducedData: boolean;
  /** Coarse pointer (touch) - gates live-selection mode's native fallback. */
  coarsePointer: boolean;
  /** Mark count above which Tier A auto-degrades to Tier B for the perf budget. */
  degradeThreshold: number;
}

/**
 * One renderer tier's implementation contract. A renderer owns the DOM/paint for
 * a single mark, applies updates without re-seeding stable geometry, and fully
 * tears down on `unmount`. Filters are never recomputed on scroll.
 */
export interface Renderer {
  readonly tier: RendererTier;
  /** Create and attach overlay nodes for the mark's per-line geometry. */
  mount(context: RenderContext): void;
  /** Re-render with new geometry/options; preserve byte-identical stable regions. */
  update(context: RenderContext): void;
  /** Detach all nodes and release shared resources; leave the DOM pristine. */
  unmount(): void;
  /**
   * The per-line wrapper element for a line's stable seed - the surface the draw-on
   * clips. `null` for an unmounted line or tiers with no overlay DOM (Tier C).
   * Keyed by seed, not index: marks sharing one overlay container MUST NOT find
   * each other's wrappers.
   */
  bandFor(seed: number): HTMLElement | null;
}

/**
 * Everything a {@link Renderer} needs to paint one mark for a single update.
 */
export interface RenderContext {
  /** The positioned overlay host (absolutely positioned, `aria-hidden`). */
  container: HTMLElement;
  options: ResolvedOptions;
  /** One {@link MarkGeometry} per visual line, in document order. */
  lines: MarkGeometry[];
  /** The originating ranges, for Tier C (native `::highlight()`) painting. */
  ranges: Range[];
}

/** Callback fired (rAF-batched) when observed targets reflow. */
export type ReflowCallback = () => void;

/** Callback fired (debounced) when the observed root's subtree mutates. */
export type MutationCallback = (records: MutationRecord[]) => void;

/** Disconnects an observer/listener set; idempotent and leak-free. */
export type Disconnect = () => void;
