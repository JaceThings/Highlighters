import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Highlight, useHighlight } from "@highlighters/react";
import type { HighlightOptions } from "@highlighters/core";
import { useEntranceComplete } from "../components/Stagger.tsx";
import { toCoreOptions, usePreviewOptions } from "./options-context.tsx";
import type { Quote } from "./quotes.ts";

/**
 * The live preview that fills the top of every docs paper card: a real quote +
 * attribution, PRE-HIGHLIGHTED with the user's live build so marks are visible by
 * default (no selection) and LIVE-UPDATE the instant any control changes. The
 * reader adjusts the control below; the quote itself is `select-none`.
 *
 * RACE-PROOFING. The quote lives inside a `position: relative` container.
 * @highlighters attaches its overlay to the nearest positioned ancestor, so the
 * mark overlay is scoped INSIDE this block's own DOM and visibility context — it
 * can never paint as a floating band over the text (the old on-mount/refresh bug)
 * or land on the surrounding chrome.
 *
 * The middle ~64% of the quote is marked, with an inner word painted TWICE (a
 * second mark over the first) to keep the Stack control legible: Stack ON (the
 * `multiply` optic) darkens the overlap as two translucent passes build up; Stack
 * OFF (`normal`) merges the same-colour bands flat with no darkening. The doubled
 * word only changes OPACITY when toggled, so the mark never re-draws.
 *
 * Each run gets a distinct stable `seed` for deterministic ink texture; options
 * are lowered through {@link toCoreOptions} so the playground-only `stack` /
 * overshoot knobs become what the core renderer consumes (`stack` → blend mode).
 * The `snap` demo uses {@link SnapPreview} instead (a Range, not span marks).
 */

interface PreviewProps {
  /** The quote + author painted (live-highlighted) on the sheet above the control. */
  quote: Quote;
}

// Handwriting face for the quote (no webfont installed — fall back to a system hand).
const QUOTE_FONT = '"Letters Home", "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive';
const QUOTE_INK = "#73574a";

export function Preview({ quote }: PreviewProps) {
  const previewOptions = usePreviewOptions();
  // Gate the marks on the Stagger entrance: before the text has fully faded
  // in, render the phrases as plain text; only paint marks once entered.
  const entered = useEntranceComplete();

  // Wrap a phrase in a live <Highlight> once entered, else render the SAME
  // children as plain inline text. The text is byte-identical in both states and
  // the mark is an overlay, so swapping has zero layout shift. Each run's stable
  // `seed` keys its mark so the two overlapping marks never collide.
  const mark = (children: ReactNode, runOptions: HighlightOptions) =>
    entered ? (
      <Highlight as="span" options={runOptions} key={runOptions.seed}>
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

  const overlapOuterRun = { ...core, seed: 303 };
  const overlapInnerRun = { ...core, seed: 404, opacity: stacked ? liveOpacity : 0 };

  // A real quote with attribution, its middle ~64% live-highlighted (with an inner word doubled
  // so the stack toggle still reads). Fills the sheet above the control.
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
  const start = LEAD + offsetOf(ai) + Math.floor(fw.length / 2); // mid word `ai`
  const end = LEAD + offsetOf(bi) + Math.max(1, Math.ceil(lw.length / 2)); // mid word `bi`
  // A single short even-length word would collapse start===end; never hand back an empty range
  // (the snap demo's whole point is a non-empty mid-word span).
  return { start, end: Math.max(end, start + 1) };
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
    const s = Math.min(start, Math.max(0, max - 1));
    const e = Math.min(Math.max(end, s + 1), max);
    if (e <= s) return; // nothing to mark (degenerate text)
    const r = document.createRange();
    r.setStart(node, s);
    r.setEnd(node, e);
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
