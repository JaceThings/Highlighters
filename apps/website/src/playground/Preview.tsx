import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Highlight, useHighlight } from "@highlighters/react";
import type { HighlightOptions } from "@highlighters/core";
import { useEntranceComplete } from "../components/Stagger.tsx";
import { toCoreOptions, usePreviewOptions } from "./options-context.tsx";
import type { Quote } from "./quotes.ts";

/**
 * The live preview at the top of every docs paper card: a pre-highlighted quote
 * that re-marks as controls change. The quote lives in a `position: relative`
 * container so @highlighters scopes its overlay to that positioned ancestor and
 * can never paint as a floating band over unrelated chrome.
 *
 * The middle ~64% is marked, with an inner word painted twice so the Stack
 * control reads. The `snap` demo uses {@link SnapPreview} (a Range, not span marks).
 */

interface PreviewProps {
  quote: Quote;
}

// No webfont installed — fall back to a system hand.
const QUOTE_FONT = '"Letters Home", "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive';
const QUOTE_INK = "#73574a";

export function Preview({ quote }: PreviewProps) {
  const previewOptions = usePreviewOptions();
  // Plain text until the Stagger entrance finishes, then paint marks.
  const entered = useEntranceComplete();

  // The text is byte-identical in both branches and the mark is an overlay, so
  // swapping has zero layout shift. The `seed` keys each run so overlapping marks
  // don't collide.
  const mark = (children: ReactNode, runOptions: HighlightOptions) =>
    entered ? (
      <Highlight as="span" options={runOptions} key={runOptions.seed}>
        {children}
      </Highlight>
    ) : (
      <span>{children}</span>
    );

  const core = useMemo(() => toCoreOptions(previewOptions), [previewOptions]);

  // The inner word is ALWAYS painted by a second mark over the outer one, so
  // toggling Stack only changes its OPACITY (an in-place update) rather than
  // adding/removing a node — which would remeasure and replay the outer mark's
  // draw-on. ON: live alpha, so the two passes darken the overlap; OFF: 0, flat.
  const stacked = previewOptions.stack !== false;
  const liveOpacity = core.opacity ?? 0.5;

  const overlapOuterRun = { ...core, seed: 303 };
  const overlapInnerRun = { ...core, seed: 404, opacity: stacked ? liveOpacity : 0 };

  const words = quote.text.split(" ");
  const n = words.length;
  const a = Math.min(n - 1, Math.floor(n * 0.18));
  const b = Math.max(a + 1, Math.ceil(n * 0.82));
  const lead = (s: string) => (s ? s + " " : "");
  const trail = (s: string) => (s ? " " + s : "");

  // The inner-overlap word that keeps the stack toggle legible.
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
 * Offsets (into `“${text}”`) for a range that cuts mid-WORD at both ends. A span
 * mark can't demonstrate snap (the span IS the marked text, already flush on both
 * boundaries), so this targets a sub-range inside one text node that `word` can
 * visibly grow out to real boundaries. The short ~2-word window keeps the mark on
 * one line so the raggedness is obvious.
 */
function snapRangeOffsets(text: string): { start: number; end: number } {
  const words = text.split(" ");
  const n = words.length;
  const mid = Math.floor(n / 2);
  const ai = Math.max(0, mid - 1);
  const bi = Math.min(n - 1, mid + 1);
  const offsetOf = (wi: number) => {
    let o = 0;
    for (let k = 0; k < wi; k++) o += words[k].length + 1;
    return o;
  };
  const LEAD = 1; // the opening “ is one code unit
  const fw = words[ai];
  const lw = words[bi];
  const start = LEAD + offsetOf(ai) + Math.floor(fw.length / 2);
  const end = LEAD + offsetOf(bi) + Math.max(1, Math.ceil(lw.length / 2));
  // Never collapse to an empty range (a single short even-length word would).
  return { start, end: Math.max(end, start + 1) };
}

/**
 * The `snap` demo variant. Renders the quote as ONE text node and targets a
 * mid-word {@link Range} so the live `snap` control visibly moves the band's ends
 * to a boundary.
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

  // Build the mid-word Range once entered, then hand the positioned wrapper to
  // @highlighters as the overlay host so it scopes inside.
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
