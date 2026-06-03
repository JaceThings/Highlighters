import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Highlight, useHighlight } from "@highlighters/react";
import type { HighlightOptions } from "@highlighters/core";
import { useEntranceComplete } from "../components/Stagger.tsx";
import { toCoreOptions, usePreviewOptions } from "./options-context.tsx";
import type { Quote } from "./quotes.ts";

/**
 * The live preview EXHIBIT. Mirrors the Lisse Preview's framing — a centered
 * ~255px-tall canvas inside the white {@link FigureCard} — holding real sample
 * prose that is PRE-HIGHLIGHTED with the user's live build.
 *
 * MENTAL MODEL — "museum exhibit". This prose is the exhibit: representative
 * phrases are wrapped in `<Highlight as="span">` and painted automatically with
 * the live {@link usePlaygroundOptions | playground options}, so marks are
 * visible by default (no selection required) and LIVE-UPDATE the instant any
 * control changes. The reader can press buttons to adjust what's inside, but
 * they never touch the exhibit itself — the whole block is `select-none`.
 *
 * RACE-PROOFING. The prose lives inside a `position: relative` container.
 * @highlighters attaches its overlay to the nearest positioned ancestor, so the
 * mark overlay is scoped INSIDE the exhibit's own DOM and visibility context.
 * It can never paint as a floating band before/over the text (the old
 * on-mount/refresh bug), and it can never land on the surrounding chrome.
 *
 * The sample deliberately exercises what a highlighter must get right:
 * - the heading (a short, bold run),
 * - a multi-word phrase that WRAPS across lines (per-line band seeding),
 * - an OVERLAPPING pair — an outer run with an inner word marked twice, the
 *   live demonstration of the Stack control: the inner word is painted by a
 *   second, separate mark laid over the first. With Stack ON (the `multiply`
 *   optic) the overlap reads visibly DARKER, the way two passes of translucent
 *   ink build up; with Stack OFF (the `normal` optic) the two same-colour bands
 *   merge into ONE cohesive colour with no darkening where they cross,
 * - a tail phrase.
 *
 * Each run gets a distinct stable `seed` so its ink texture is deterministic and
 * the runs don't all share identical jitter. Every run's options are lowered
 * through {@link toCoreOptions} so the playground-only `stack` / overshoot knobs
 * become exactly what the core renderer consumes (`stack` → blend mode).
 */

// Match the Lisse "Figure Content" frame height across every section. Exported so the
// figure-card demos can reserve the same height before the Preview mounts.
export const CANVAS_HEIGHT = 255;

interface PreviewProps {
  /** Bump to replay the draw-on animation: changing it remounts every
   *  `<Highlight>` mark (via its React `key`) so each stroke re-draws.
   *  Defaults to 0 — no replays. */
  replayNonce?: number;
  /** Render the paper-card variant: this quote + author (live-highlighted) filling the
   *  sheet above the legend, instead of the fixed-height exhibit. */
  quote?: Quote;
}

// Handwriting face for the quote (no webfont installed — fall back to a system hand).
const QUOTE_FONT = '"Letters Home", "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive';
const QUOTE_INK = "#73574a";

export function Preview({ replayNonce = 0, quote }: PreviewProps) {
  const previewOptions = usePreviewOptions();
  // Gate the marks on the Stagger entrance: before the text has fully faded
  // in, render the phrases as plain text; only paint marks once entered.
  const entered = useEntranceComplete();

  // Wrap a phrase in a live <Highlight> once entered, else render the SAME
  // children as plain inline text. The text is byte-identical in both states and
  // the mark is an overlay, so swapping has zero layout shift. Folding
  // `replayNonce` into the `key` remounts the mark to replay its draw-on; the
  // per-run `seed` keeps each mark's key distinct so they don't collide.
  const mark = (children: ReactNode, runOptions: HighlightOptions) =>
    entered ? (
      <Highlight as="span" options={runOptions} key={`${runOptions.seed}-${replayNonce}`}>
        {children}
      </Highlight>
    ) : (
      <span>{children}</span>
    );

  // Lower the playground superset (stack / overshoot) to core options once per
  // change. Each run below gets a distinct stable seed so it has its own
  // deterministic ink texture and the overlapping pair reads as two genuinely
  // separate strokes that stack or merge per the live Stack control.
  const core = useMemo(() => toCoreOptions(previewOptions), [previewOptions]);

  // The Stack demonstration. The inner "pools" word is ALWAYS painted by a
  // second mark laid over the outer one, so toggling Stack never adds or removes
  // a node — which would remeasure the outer mark and replay its draw-on (the old
  // "reset/redraw" flash). Stack instead only changes that inner mark's OPACITY:
  // ON gives it the live alpha so the two translucent passes build up into a
  // visibly DARKER overlap (the `multiply` optic); OFF drops it to 0 so only the
  // single outer band covers the word — one cohesive colour, no darkening,
  // exactly the flat look. A plain opacity change is an in-place update, so the
  // mark never re-draws when you flip the toggle.
  const stacked = previewOptions.stack !== false;
  const liveOpacity = core.opacity ?? 0.5;

  const headingRun = { ...core, seed: 101 };
  const phraseRun = { ...core, seed: 202 };
  const overlapOuterRun = { ...core, seed: 303 };
  const overlapInnerRun = { ...core, seed: 404, opacity: stacked ? liveOpacity : 0 };
  const tailRun = { ...core, seed: 505 };

  // Paper-card variant: a real quote with attribution, a middle phrase live-highlighted (with
  // an inner word doubled so the stack toggle still reads). Fills the sheet above the legend.
  if (quote) {
    // Mark the middle ~64% of the quote.
    const words = quote.text.split(" ");
    const n = words.length;
    const a = Math.min(n - 1, Math.floor(n * 0.18));
    const b = Math.max(a + 1, Math.ceil(n * 0.82));
    const lead = (s: string) => (s ? s + " " : "");
    const trail = (s: string) => (s ? " " + s : "");

    // `m` is the inner-overlap word that keeps the stack toggle legible.
    const m = Math.min(b - 1, Math.floor((a + b) / 2));
    const pre = lead(words.slice(0, a).join(" "));
    const marked = (
      <>
        {lead(words.slice(a, m).join(" "))}
        {mark(words[m], overlapInnerRun)}
        {trail(words.slice(m + 1, b).join(" "))}
      </>
    );
    const post = trail(words.slice(b).join(" "));

    return (
      <div className="flex w-full flex-1 select-none items-center justify-center overflow-hidden px-6 py-4">
        <div className="relative flex max-w-[420px] flex-col items-center gap-[10px] text-center" style={{ color: QUOTE_INK }}>
          <p
            className="m-0 text-wrap-pretty"
            style={{ fontFamily: QUOTE_FONT, fontSize: 25, lineHeight: "30px", whiteSpace: "pre-line" }}
          >
            {"“"}
            {pre}
            {mark(marked, overlapOuterRun)}
            {post}
            {"”"}
          </p>
          <p className="m-0" style={{ fontFamily: QUOTE_FONT, fontSize: 20, opacity: 0.5 }}>
            {"— " + quote.author}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex w-full items-center justify-center overflow-hidden px-7 py-6"
      style={{ height: CANVAS_HEIGHT }}
    >
      {/* The exhibit: position:relative scopes the @highlighters overlay inside
          this block, and select-none means the reader can never grab it. */}
      <div className="relative flex max-w-[420px] select-none flex-col gap-3 text-text-primary">
        <h3 className="text-[20px] leading-[1.3] font-[560] tracking-[-0.4px]">
          {mark("The anchored-grid method", headingRun)}
        </h3>

        <p className="text-[15px] leading-[1.65] font-medium tracking-[-0.2px] text-wrap-pretty">
          Real highlighters lay down{" "}
          {mark(
            <>
              ink that {mark("pools", overlapInnerRun)} at the ends
            </>,
            overlapOuterRun,
          )}{" "}
          and {mark("feathers into the paper", phraseRun)}, never a flat
          rectangle. Each mark is seeded deterministically so server and client
          agree, and it {mark("stays perfectly legible", tailRun)} underneath.
        </p>
      </div>
    </div>
  );
}

const useIsoLayout = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Character offsets (into `“${text}”`) for a range that cuts mid-WORD at BOTH
 * ends — the target shape that makes `snap` visibly do something. A
 * `<Highlight as="span">` can't demonstrate snap: the span's text node IS exactly
 * the marked text, so the range already sits flush on both boundaries and there is
 * nothing to expand. A sub-range inside one continuous text node lets the headline
 * behaviour show: `none` leaves both ends sliced through a word, while `word` grows
 * each end out to the whole word so the band lands on real boundaries. (`glyph`/
 * `line` only trim boundary whitespace, so for a clean mid-word range they read the
 * same as `none` — which is the honest, correct behaviour.)
 *
 * A SHORT central window (~2 words) keeps the mark on one visual line, so the
 * mid-word raggedness is a large, obvious fraction of it rather than lost across a
 * multi-line wrap.
 */
function snapRangeOffsets(text: string): { start: number; end: number } {
  const words = text.split(" ");
  const n = words.length;
  const mid = Math.floor(n / 2);
  const ai = Math.max(0, mid - 1);
  const bi = Math.min(n - 1, mid + 1);
  const offsetOf = (wi: number) => {
    let o = 0;
    for (let k = 0; k < wi; k++) o += words[k].length + 1; // word + the joining space
    return o;
  };
  const LEAD = 1; // the opening “ is one code unit
  const fw = words[ai];
  const lw = words[bi];
  return {
    start: LEAD + offsetOf(ai) + Math.floor(fw.length / 2), // mid word `ai`
    end: LEAD + offsetOf(bi) + Math.max(1, Math.ceil(lw.length / 2)), // mid word `bi`
  };
}

/**
 * The paper-card variant for the `snap` demo. Unlike {@link Preview}'s quote
 * branch (which wraps phrases in `<Highlight as="span">`), this renders the quote
 * as ONE text node and targets a {@link Range} that deliberately cuts mid-word, so
 * the live `snap` control actually moves the band's ends to a boundary — the whole
 * point of the setting. Switching snap re-runs the mark via `update()`, which
 * re-snaps and repaints in place.
 */
export function SnapPreview({ quote }: { quote: Quote }) {
  const previewOptions = usePreviewOptions();
  const entered = useEntranceComplete();
  const core = useMemo(() => toCoreOptions(previewOptions), [previewOptions]);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const pRef = useRef<HTMLParagraphElement | null>(null);
  const [range, setRange] = useState<Range | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  const full = `“${quote.text}”`;
  const { start, end } = useMemo(() => snapRangeOffsets(quote.text), [quote.text]);

  // Build the mid-word Range over the single text node once the entrance has
  // finished (so the band only appears with the rest of the card), then hand the
  // positioned wrapper to @highlighters as the overlay host so it scopes inside.
  useIsoLayout(() => {
    if (!entered) {
      setRange(null);
      return;
    }
    const node = pRef.current?.firstChild;
    if (!node) return;
    const max = node.textContent?.length ?? 0;
    const r = document.createRange();
    r.setStart(node, Math.min(start, max));
    r.setEnd(node, Math.min(end, max));
    setRange(r);
    setHost(hostRef.current);
  }, [entered, start, end, full]);

  useHighlight(range, { ...core, seed: 707 }, host);

  return (
    <div className="flex w-full flex-1 select-none items-center justify-center overflow-hidden px-6 py-4">
      <div
        ref={hostRef}
        className="relative flex max-w-[420px] flex-col items-center gap-[10px] text-center"
        style={{ color: QUOTE_INK }}
      >
        <p
          ref={pRef}
          className="m-0 text-wrap-pretty"
          style={{ fontFamily: QUOTE_FONT, fontSize: 25, lineHeight: "30px", whiteSpace: "pre-line" }}
        >
          {full}
        </p>
        <p className="m-0" style={{ fontFamily: QUOTE_FONT, fontSize: 20, opacity: 0.5 }}>
          {"— " + quote.author}
        </p>
      </div>
    </div>
  );
}
