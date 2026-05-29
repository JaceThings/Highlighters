/**
 * The complete public + internal type surface for `@highlighters/core`.
 *
 * The file is deliberately split into two halves:
 *
 *  1. **Configuration & geometry types** (the top portion) are pure data — they
 *     describe options, resolved options, presets, palettes, and the absolute-px
 *     geometry produced by the anchored-grid method (see
 *     `docs/the-anchored-grid-method.md`). They reference no DOM lib types and are therefore
 *     safe to import from the SSR / DOM-free `@highlighters/core/path` entry.
 *
 *  2. **DOM-touching types** (the bottom portion, after the divider) describe
 *     targeting inputs, handles, renderers, and observers. They reference `lib.dom`
 *     types (`Element`, `Range`, `Selection`, …) and must never be imported by the
 *     pure path entry.
 *
 * Every per-mark random value is derived deterministically from a seed via a
 * `sin()`-based hash (no platform pseudo-random generator, no wall-clock time), so
 * identical `(geometry, options, seed)` inputs always produce byte-identical marks
 * across server and client. See the anchored-grid doc for the invariants.
 */

// ============================================================================
// SECTION 1 — Pure configuration & geometry types (DOM-free, SSR-safe)
// ============================================================================

// --- Scalars and small unions -----------------------------------------------

/**
 * A CSS color string (`#rgb`, `#rrggbb`, `rgb()`, `hsl()`, named, `currentColor`,
 * or a CSS custom-property reference such as `var(--accent)`).
 */
export type ColorValue = string;

/**
 * The kind of mark drawn. All three share one band primitive and the full
 * physics model — they differ only in vertical position and thickness:
 * `highlight` is a tall band, `underline` a thin low band, `strike-through` a
 * thin centered band.
 */
export type MarkType = "highlight" | "underline" | "strike-through";

/**
 * Alias of {@link MarkType}. `shape` and `markType` are accepted as synonyms on
 * the options object for ergonomic parity with RoughNotation's `type`.
 */
export type ShapeType = MarkType;

/** Highlighter nib geometry. Drives the chisel stroke-width model (R12). */
export type TipType = "chisel" | "bullet" | "fine";

/** End-cap rendering for a band's leading/trailing edge. */
export type EdgeCap = "flat" | "round" | "square";

/**
 * Compositing model for the ink layer. Default `multiply` gives true subtractive
 * ink optics: overlapping marks darken and dark glyphs stay legible (R14).
 */
export type BlendMode =
  | "multiply"
  | "normal"
  | "darken"
  | "screen"
  | "overlay"
  | "color-burn";

/**
 * Boundary-snapping mode (the "window tip", R22b). Clamps a mark's start/end to
 * the chosen text boundary so it never overshoots into surrounding whitespace.
 */
export type SnapMode = "none" | "word" | "line" | "glyph";

/**
 * Manufacturing-quality axis. Bundles ink/edge variance into a coherent look:
 * `premium` = low variance, suppressed end-pooling (anti-pool guardrails);
 * `cheap` = high variance, frequent skipping, pronounced pooling (R18).
 */
export type QualityTier = "premium" | "standard" | "cheap";

/**
 * Renderer tier. `auto` selects the best supported tier and enables
 * auto-degrade; the others pin a specific tier and disable auto-degrade (R27).
 */
export type RendererTierPreference = "auto" | "svg" | "css" | "highlight-api";

/**
 * The concrete renderer tier actually selected and in use. Reported on the
 * handle so consumers can observe degradation (R27/R28).
 *
 * - `svg`  — Tier A: per-line SVG band with shared turbulence/displacement
 *   filters (realistic, default).
 * - `css`  — Tier B: `linear-gradient` band with `box-decoration-break: clone`.
 * - `highlight-api` — Tier C: CSS Custom Highlight API (`::highlight()`).
 */
export type RendererTier = "svg" | "css" | "highlight-api";

/** Direction a draw-on animation sweeps across each band. */
export type AnimationDirection = "left-to-right" | "right-to-left" | "center-out";

/** When an entrance animation begins. */
export type AnimationTrigger = "immediate" | "in-view";

/**
 * Animation easing — a named CSS timing keyword or any valid CSS easing
 * function string (`cubic-bezier(...)`, `steps(...)`).
 */
export type EasingValue =
  | "linear"
  | "ease"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | (string & {});

// --- Color, gradient, palettes, presets -------------------------------------

/** A single color stop within a gradient, expressed in `[0,1]` offset space. */
export interface GradientStop {
  /** Position along the gradient, `0` (start) to `1` (end). */
  offset: number;
  /** Stop color. */
  color: ColorValue;
  /** Stop alpha, `0`–`1`. Defaults to `1` when omitted. */
  opacity?: number;
}

/**
 * A multi-stop linear gradient across the band's length. Used for the
 * pressure-pooled endpoint look; the actual end-pool stops are sized in
 * absolute px by the renderer (see {@link PoolGradient}), this config only
 * describes the color ramp.
 */
export interface GradientConfig {
  type: "linear";
  /** Gradient angle in CSS degrees. Defaults to the canonical `85deg` swipe. */
  angle?: number;
  /** Ordered color stops. Two or more required for a visible gradient. */
  stops: GradientStop[];
}

/**
 * Names of the curated, harmonized palette families (R15). Each family is
 * designed so multiple of its colors read coherently together for color-coding.
 * `mild` is the default look (desaturated Mildliner-style pastels).
 */
export type PaletteName =
  | "fluorescent"
  | "mild"
  | "vintage"
  | "neutral"
  | "calm";

/**
 * A named swatch within a palette family. The renderer resolves
 * `{ palette, swatch }` to a concrete {@link ColorValue}.
 */
export interface PaletteSwatch {
  /** Palette family the swatch belongs to. */
  palette: PaletteName;
  /** Swatch name within the family (e.g. `'yellow'`, `'pink'`). */
  swatch: string;
}

/** A fully-realized palette family: an ordered, named map of swatches. */
export interface Palette {
  /** Family identifier. */
  name: PaletteName;
  /** Ordered swatches, keyed by swatch name. Order defines color-coding cycle. */
  swatches: Record<string, ColorValue>;
}

/**
 * High-level named presets, each a partial configuration expressible as a single
 * string option (R19). The default preset is `mild` — the look reviewers most
 * consistently call "best" because it maximizes readability.
 */
export type PresetName =
  | "classic-yellow"
  | "mild"
  | "wet"
  | "dry"
  | "premium"
  | "minimal";

/**
 * The `colorant` master axis (R17b): a single dye↔pigment knob that sets coherent
 * defaults for the correlated physical parameters. Accepts a number in `[0,1]`
 * (`0` = full dye: saturated, feathery, smeary; `1` = full pigment: muted,
 * translucent, clean multiply) or a named anchor. Individual parameters still
 * override the axis (it sets defaults, not ceilings).
 */
export type ColorantValue = number | "dye" | "balanced" | "pigment";

// --- Namespaced option groups (all optional on input) -----------------------

/**
 * Nib geometry. Tip `type` drives the chisel stroke-width model: the effective
 * stroke width interpolates between {@link TipOptions.thickness | thickness} and
 * {@link TipOptions.width | width} as a function of the stroke-vs-tip angle (R12).
 */
export interface TipOptions {
  /** Nib shape. Default `chisel`. */
  type?: TipType;
  /** Broad-face width of the nib, in px. */
  width?: number;
  /** Narrow-edge thickness of the nib, in px. */
  thickness?: number;
  /** Nib angle relative to the stroke, in degrees (chisel slant). */
  angle?: number;
}

/**
 * Ink behavior in real-highlighter vocabulary (R17). All fields are normalized
 * `0`–`1` unless noted; the {@link ResolvedOptions} form has concrete defaults.
 */
export interface InkOptions {
  /** Juiciness — deposit amount; raises width, softens edges. */
  flow?: number;
  /** Inverse flow — raises edge sharpness and skip frequency. */
  viscosity?: number;
  /** Per-pass alpha / intensity of the deposited ink. */
  saturation?: number;
  /** Capillary lateral edge spread (noise-perturbed, optionally blurred). */
  feathering?: number;
  /** Lengthwise lighter/darker lanes within a stroke (the primary realism tell). */
  streakiness?: number;
  /** Probabilistic alpha gaps (skipping), coupled to {@link viscosity}. */
  dryout?: number;
  /**
   * Bidirectional deposit variation at stroke ends and direction changes (R17):
   * positive values **pool** ink (cheap/wet look), `0` is even, and **negative**
   * values engage the explicit anti-pool / "guardrail" behavior that *suppresses*
   * end darkening (the premium-marker look). Range `-1`–`1`.
   */
  startEndBuildup?: number;
}

/**
 * Edge appearance along the perfectly-straight → highly-frayed continuum (R13).
 * Setting all waviness/roughness to `0` yields clean geometric edges.
 */
export interface EdgeOptions {
  /** Peak wavy-edge displacement, in absolute px (amplitude). */
  waviness?: number;
  /**
   * Wave density expressed as the px `segmentLength` between grid vertices.
   * Smaller = more periods per unit length. Width-independent (R22c).
   */
  frequency?: number;
  /** High-frequency micro-jitter on top of the base wave, `0`–`1`. */
  roughness?: number;
  /** End-cap style for the band's leading/trailing edges. */
  cap?: EdgeCap;
  /** Corner radius in absolute px (clamped against short marks). */
  radius?: number;
}

/** Paper surface (R17). Multiplies feathering and softens edges. */
export interface PaperOptions {
  /** Absorbency `0`–`1`: higher wicks more, growing feather and softening edges. */
  absorbency?: number;
}

/**
 * Fluorescence / glow (R16). Modeled as **additive** emission layered over the
 * multiply ink, so an enabled mark may read brighter/more saturated than its
 * background. Off by default; must never reduce text legibility.
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
 * Entrance-animation configuration (R23–R25). All entrance animation is
 * suppressed automatically under `prefers-reduced-motion: reduce`.
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

// --- The HighlightOptions input object --------------------------------------

/**
 * The full user-facing options object (A7). Every field is optional; values are
 * resolved into {@link ResolvedOptions} through the deep-merge order
 * defaults → preset → quality → colorant → user. `update()` accepts the same
 * shape via `Partial<HighlightOptions>`.
 *
 * Three altitudes of access over one schema: a string {@link preset}, the coarse
 * {@link quality} axis, and individual namespaced parameters.
 */
export interface HighlightOptions {
  /** A named preset applied as a base layer before other options. Default `mild`. */
  preset?: PresetName;

  /** Mark kind. Default `highlight`. Synonym of {@link markType}. */
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
  /** Edge waviness/roughness/cap/radius. */
  edge?: EdgeOptions;
  /** Paper surface. */
  paper?: PaperOptions;
  /** Additive fluorescence/glow. */
  glow?: GlowOptions;

  /** Dye↔pigment master axis (R17b). Sets defaults for correlated ink params. */
  colorant?: ColorantValue;
  /** Manufacturing-quality bundle. Default `standard`. */
  quality?: QualityTier;

  /** Boundary-snapping mode. Default depends on target (see {@link Target}). */
  snap?: SnapMode;

  /** Explicit deterministic seed; derived from target identity when omitted (A5). */
  seed?: number;

  /** Renderer tier preference / pin. Default `auto`. */
  renderer?: RendererTierPreference;

  /** Entrance animation. */
  animation?: AnimationOptions;

  /**
   * Wrap each targeted element/selector run in a real `<mark>` element for
   * semantics (R30), in addition to the decorative overlay. Opt-in and fully
   * reversible by `remove()`. Default `false`.
   */
  semantic?: boolean;

  /**
   * Background color the mark composites against, used only to drive the
   * development-time WCAG-contrast warning (R30). Not rendered.
   */
  contrastBackground?: ColorValue;
}

// --- Resolved (fully-defaulted) options -------------------------------------

/** {@link TipOptions} with every field resolved. */
export interface ResolvedTip {
  type: TipType;
  width: number;
  thickness: number;
  angle: number;
}

/** {@link InkOptions} with every field resolved. */
export interface ResolvedInk {
  flow: number;
  viscosity: number;
  saturation: number;
  feathering: number;
  streakiness: number;
  dryout: number;
  startEndBuildup: number;
}

/** {@link EdgeOptions} with every field resolved. */
export interface ResolvedEdge {
  waviness: number;
  /** Resolved px `segmentLength` of the wave grid. */
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
 * A fully-resolved configuration with **no optionals** — the single source of
 * truth handed to geometry and renderers. Produced by `resolveOptions()` via the
 * merge order defaults → preset → quality → colorant → user (A7). `color`,
 * `gradient`, and `seed` are concrete here; `colorant` is normalized to a number.
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
  edge: ResolvedEdge;
  paper: ResolvedPaper;
  glow: ResolvedGlow;
  /** Normalized dye↔pigment position, `0` (dye) – `1` (pigment). */
  colorant: number;
  quality: QualityTier;
  snap: SnapMode;
  renderer: RendererTierPreference;
  animation: ResolvedAnimation;
  semantic: boolean;
  /** Resolved background for contrast checking, or `null` if none supplied. */
  contrastBackground: ColorValue | null;
  /**
   * The explicit seed when provided, else `null` to signal that each mark must
   * derive its seed from a stable target identity (A5/A14 §5).
   */
  seed: number | null;
}

// --- Geometry (absolute-px mark-space) --------------------------------------

/**
 * An axis-aligned box in absolute px. Used both for layout rects and for
 * mark-space dimensions. All coordinates are resolution-independent (R22c).
 */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A single visual line's rectangle, measured via `Range.getClientRects()` and
 * carried with its anchor-relative seed. `top - anchorTop` is the seed source
 * because it is invariant under scroll and forward/backward drag-extension (A14 §5).
 */
export interface LineRect {
  /** Left edge in viewport/document px. */
  left: number;
  /** Top edge in viewport/document px. */
  top: number;
  /** Width in px. */
  width: number;
  /** Height in px. */
  height: number;
  /** Stable per-line seed, `round((top - anchorTop) * 7)`. */
  seed: number;
  /** Is this the first visual line of the mark? (controls leading overshoot). */
  isFirst: boolean;
  /** Is this the last visual line of the mark? (controls trailing overshoot). */
  isLast: boolean;
}

/**
 * The reference point all per-line seeds are measured against. For static marks
 * this is derived from the target's stable identity rather than a live selection
 * top, preserving SSR determinism (A5/A14 §5).
 */
export interface Anchor {
  /** Anchor top in the same coordinate space as {@link LineRect.top}. */
  top: number;
  /** Anchor left, retained for layout offset math (excluded from the seed). */
  left: number;
}

/** A single vertex on the fixed wave grid: `x = gridIndex * segmentLength`. */
export interface EdgeVertex {
  /** Absolute-px x on the global grid (integer multiple of `segmentLength`). */
  x: number;
  /** Absolute-px y, `baseY + hashJitter(seed + gridIndex * k) * amplitude`. */
  y: number;
  /** The grid index `i` this vertex was seeded from (for prefix-stability tests). */
  gridIndex: number;
}

/**
 * The absolute-px end-pool gradient (A14 §3). Stops are fixed px from each end
 * with `min`/`max` clamps so a short mark cannot over-pool — never a percentage
 * of stroke length. Resolution-independent (R22c).
 */
export interface PoolGradient {
  /** CSS gradient angle in degrees (the canonical `85deg`). */
  angle: number;
  /** Inset of the leading pool stop from the start, in px (e.g. `2`). */
  startInsetPx: number;
  /** Clamp for the leading pool plateau: `min(corePx, corePct%)`. */
  startCorePx: number;
  startCorePct: number;
  /** Clamp for the trailing pool plateau: `max(len - corePx, corePct%)`. */
  endCorePx: number;
  endCorePct: number;
  /** Inset of the trailing pool stop from the end, in px. */
  endInsetPx: number;
  /** Resolved color stops the pool ramps between. */
  stops: GradientStop[];
}

/**
 * A fixed-pixel, seamlessly-stitched (`stitchTiles="stitch"`) noise tile (A14 §1).
 * Applied at a fixed px size and repeated; per-line variety comes from offsetting
 * the sample window, never from rescaling the texture.
 */
export interface NoiseTile {
  /** A `data:` URL of the dual-`feTurbulence` SVG tile. */
  dataUrl: string;
  /** Fixed tile width in px (e.g. `256`). */
  width: number;
  /** Fixed tile height in px (e.g. `64`). */
  height: number;
}

/** Per-line texture sample window — an *offset*, never a scale (A14 §1). */
export interface MaskOffset {
  /** Horizontal sample offset in px: `-((seed * 37) mod tileW)`. */
  x: number;
  /** Vertical sample offset in px: `-((seed * 13) mod tileH)`. */
  y: number;
}

/**
 * The complete, resolution-independent geometry for one visual line, produced by
 * `buildMarkGeometry()`. Each renderer tier consumes this and may ignore the
 * parts it cannot express (degrade is fidelity-only, R28). Computed once per
 * geometry and reused until reflow (R32).
 */
export interface MarkGeometry {
  /** The line's box in absolute px (the band's footprint, incl. overshoot). */
  box: Box;
  /** The seed every value in this geometry derives from. */
  seed: number;
  /** `clip-path: path(...)` string in absolute-px coordinates (chisel/bullet/fine). */
  clipPath: string;
  /** Top-edge wave vertices on the fixed grid. */
  topEdge: EdgeVertex[];
  /** Bottom-edge wave vertices on the fixed grid. */
  bottomEdge: EdgeVertex[];
  /** The fixed-px noise tile sampled by {@link maskOffset} (shared per mark). */
  noiseTile: NoiseTile;
  /** This line's texture sample offset (never a scale). */
  maskOffset: MaskOffset;
  /** The absolute-px end-pool gradient. */
  pool: PoolGradient;
}

// ============================================================================
// SECTION 2 — DOM-touching types (NOT importable from the `/path` entry)
// ============================================================================

/**
 * A whole-page (or sub-tree) target with surgical exclusions (R6d). Everything
 * textual under `root` is highlighted except subtrees matching `exclude`;
 * exclusion takes precedence over inclusion at every level (R7).
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
 * A text-search target (R6c): every match of `text` (exact string or `RegExp`)
 * within `root`, including matches spanning inline element boundaries.
 */
export interface TextTarget {
  /** Exact string or pattern to find. */
  text: string | RegExp;
  /** Root to search within. Defaults to `document.body`. */
  root?: Element | Document;
}

/**
 * The full union of targeting inputs (A2). Every variant normalizes internally
 * to a set of DOM `Range`s, then to per-visual-line rectangles, then to the
 * active renderer tier — one pipeline, many front doors.
 *
 * - `Element` — highlights that element's text content (R6a).
 * - `string`  — a CSS selector resolved to elements (R6a).
 * - `Range`   — an explicit range (R6b).
 * - `Selection` — the current selection's ranges (R6b).
 * - {@link TextTarget} — every match of a text query (R6c).
 * - {@link PageTarget}  — whole page/sub-tree with include/exclude (R6d).
 */
export type Target =
  | Element
  | string
  | Range
  | Selection
  | TextTarget
  | PageTarget;

/**
 * A handle to a single mark covering one target (R9). `remove()` restores the
 * DOM to its pre-highlight state — no orphaned overlay nodes, attributes, or
 * observers. `update()` re-resolves options through the merge chain and applies
 * the result without re-seeding stable geometry (R22d).
 */
export interface MarkHandle {
  /** Reveal the mark (re-animates only on first show or explicit re-show). */
  show(): void;
  /** Hide the mark without tearing down geometry or observers. */
  hide(): void;
  /** Merge `opts` over the current configuration and re-render (R9). */
  update(opts: Partial<HighlightOptions>): void;
  /** Remove the mark and fully restore the DOM and disconnect observers (R9). */
  remove(): void;
  /** Whether the mark is currently visible. */
  isShowing(): boolean;
  /** The concrete renderer tier in use (R27). */
  readonly tier: RendererTier;
}

/**
 * A grouping primitive (R10) that shows/hides multiple handles together and
 * animates them in sequence (choreography), analogous to RoughNotation's
 * `annotationGroup`.
 */
export interface GroupHandle {
  /** Show all members, staggered in array order for sequential draw-on. */
  show(): void;
  /** Hide all members. */
  hide(): void;
  /** Remove all members and restore the DOM. */
  remove(): void;
  /** The member handles, in choreography order. */
  readonly marks: MarkHandle[];
}

/** Capability + preference snapshot consumed by `selectTier()` (R27). */
export interface RenderEnvironment {
  /** Tier A support: `clip-path`, `mask-image`, SVG filters available. */
  supportsSvgFilters: boolean;
  /** Tier B support: `mix-blend-mode` + `box-decoration-break` available. */
  supportsCssBlend: boolean;
  /** Tier C support: the CSS Custom Highlight API is available. */
  supportsHighlightApi: boolean;
  /** `prefers-reduced-motion: reduce` is set. */
  prefersReducedMotion: boolean;
  /** `prefers-reduced-data: reduce` is set. */
  prefersReducedData: boolean;
  /** Coarse pointer (touch) — gates live-selection mode's native fallback (C5). */
  coarsePointer: boolean;
  /**
   * Count above which Tier A auto-degrades to Tier B for the perf budget
   * (R27/R31). Configurable; the live count is passed separately to `selectTier`.
   */
  degradeThreshold: number;
}

/**
 * One renderer tier's implementation contract (R26). A renderer owns the DOM/
 * paint for a single mark: it mounts overlay nodes for the given per-line
 * geometry, applies updates without re-seeding stable geometry, and fully
 * tears down on `unmount`. Filters are never recomputed on scroll (R32).
 */
export interface Renderer {
  /** The tier this renderer implements. */
  readonly tier: RendererTier;
  /** Create and attach overlay nodes for the mark's per-line geometry. */
  mount(context: RenderContext): void;
  /** Re-render with new geometry/options; preserve byte-identical stable regions. */
  update(context: RenderContext): void;
  /** Detach all nodes and release shared resources; leave the DOM pristine. */
  unmount(): void;
}

/**
 * Everything a {@link Renderer} needs to paint one mark for a single update:
 * the resolved options, the per-line geometry (already in absolute-px
 * mark-space), and the positioned container the overlay attaches to.
 */
export interface RenderContext {
  /** The positioned overlay host (absolutely positioned, `aria-hidden`). */
  container: HTMLElement;
  /** Fully-resolved options for this mark. */
  options: ResolvedOptions;
  /** One {@link MarkGeometry} per visual line, in document order. */
  lines: MarkGeometry[];
  /** The originating ranges, for Tier C (native `::highlight()`) painting. */
  ranges: Range[];
}

// --- Function-signature types -----------------------------------------------

/** Callback fired (rAF-batched) when observed targets reflow (R22). */
export type ReflowCallback = () => void;

/** Callback fired (debounced) when the observed root's subtree mutates (R8). */
export type MutationCallback = (records: MutationRecord[]) => void;

/** Disconnects an observer/listener set; idempotent and leak-free (R8/R33). */
export type Disconnect = () => void;

/** Signature of the public `highlight(target, options?)` entry point. */
export type HighlightFn = (target: Target, options?: HighlightOptions) => MarkHandle;

/**
 * Signature of `highlightAll(options?)` — applies declarative-attribute and
 * page-mode highlighting across the document (R6d/R6e), returning one handle.
 */
export type HighlightAllFn = (options?: HighlightOptions) => MarkHandle;

/**
 * Signature of `highlightSelection(options?)` — live-selection mode (R6f) with
 * the coarse-pointer native-selection fallback (C5).
 */
export type HighlightSelectionFn = (options?: HighlightOptions) => MarkHandle;

/** Signature of `group(handles)` — bundles handles for choreography (R10). */
export type GroupFn = (handles: MarkHandle[]) => GroupHandle;
