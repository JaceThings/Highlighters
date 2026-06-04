import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Highlight, useHighlight } from "@highlighters/react";
import type { HighlightOptions, TipType } from "@highlighters/core";
import { useEntranceComplete } from "../components/Stagger.tsx";
import { toCoreOptions, usePreviewOptions } from "./options-context.tsx";
import type { Quote } from "./quotes.ts";
import { planMarks, type MarkStrategy } from "./quote-marks.ts";

/**
 * The live preview at the top of every docs paper card: a pre-highlighted quote
 * that re-marks as controls change. The quote lives in a `position: relative`
 * container so @highlighters scopes its overlay to that positioned ancestor and
 * can never paint as a floating band over unrelated chrome.
 *
 * Which words are marked is chosen per-section by {@link planMarks} so the mark
 * demonstrates the option (ends-of-quote for overshoot/caps, a central phrase
 * otherwise). The `snap` demo uses {@link SnapPreview} (a Range, not span marks).
 */

interface PreviewProps {
  quote: Quote;
  strategy: MarkStrategy;
  /** Pin the nib type for this preview regardless of the shared tip.type, so a demo that
   *  only reads on one nib (the slant angle needs a chisel) keeps demonstrating when the
   *  dock pen switches the global nib. */
  lockTipType?: TipType;
}

// No webfont installed - fall back to a system hand.
const QUOTE_FONT = '"Letters Home", "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive';
const QUOTE_INK = "#73574a";
const QUOTE_STYLE: CSSProperties = {
  fontFamily: QUOTE_FONT,
  fontSize: 25,
  lineHeight: "30px",
  whiteSpace: "pre-line",
  hyphens: "none",
  WebkitHyphens: "none",
};

const ATTRIBUTION_STYLE: CSSProperties = { fontFamily: QUOTE_FONT, fontSize: 20, opacity: 0.5 };

// Beat held after a card's text has faded in before its marks draw on, so the highlighter
// reads as marking text that is already there rather than racing it.
const MARK_ENTRANCE_DELAY_MS = 200;

// True once the card's entrance has landed AND the post-text beat has elapsed - the gate
// for painting marks, so they always follow the fully-arrived text.
function useMarksReady(): boolean {
  const entered = useEntranceComplete();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!entered) {
      setReady(false);
      return;
    }
    const id = setTimeout(() => setReady(true), MARK_ENTRANCE_DELAY_MS);
    return () => clearTimeout(id);
  }, [entered]);
  return ready;
}

export function Preview({ quote, strategy, lockTipType }: PreviewProps) {
  const previewOptions = usePreviewOptions();
  // Plain text until the entrance lands and the post-text beat passes, then paint marks.
  const entered = useMarksReady();
  // Scope marks to this card's positioned wrapper (set below) so they ride the page-exit
  // fade with the content instead of lingering in the body overlay. Falls back to body if null.
  const [host, setHost] = useState<HTMLElement | null>(null);
  const core = useMemo(() => {
    const c = toCoreOptions(previewOptions);
    return lockTipType ? { ...c, tip: { ...c.tip, type: lockTipType } } : c;
  }, [previewOptions, lockTipType]);

  // The text is byte-identical entered/not, and the mark is an overlay, so the
  // swap has zero layout shift. `seed` keys each run so overlapping marks don't collide.
  const renderRun = (children: ReactNode, runOptions: HighlightOptions) =>
    entered ? (
      <Highlight as="span" options={runOptions} host={host} key={runOptions.seed}>
        {children}
      </Highlight>
    ) : (
      <span key={runOptions.seed}>{children}</span>
    );

  // The stack-demo overlap word is ALWAYS painted by a second mark, so toggling
  // Stack only changes its OPACITY (an in-place update) rather than adding/removing
  // a node - which would remeasure and replay the outer draw-on. ON: live alpha so
  // the two passes darken; OFF: 0, flat.
  const stacked = previewOptions.stack !== false;
  const liveOpacity = core.opacity ?? 0.5;
  const words = quote.text.split(" ");
  const plan = planMarks(words, strategy);

  // Build the marked quote. Same ranges + stable seeds every render, so a colour change is
  // an in-place restyle of the existing marks (Highlight -> handle.update), exactly like the
  // dock's live marker: no second copy, no redraw, no flash.
  const quoteBody = (color: HighlightOptions["color"]) => {
    const opts: HighlightOptions = { ...core, color };
    const innerMark = (word: string) =>
      renderRun(word, { ...opts, seed: 404, opacity: stacked ? liveOpacity : 0 });
    const pieces: ReactNode[] = [];
    let i = 0;
    plan.ranges.forEach(([s, e], ri) => {
      if (i < s) pieces.push(words.slice(i, s).join(" "));
      const seg = words.slice(s, e);
      const ov = plan.overlap != null && plan.overlap >= s && plan.overlap < e ? plan.overlap - s : -1;
      const body =
        ov < 0 ? (
          seg.join(" ")
        ) : (
          <>
            {seg.slice(0, ov).join(" ")}
            {ov > 0 ? " " : ""}
            {innerMark(seg[ov])}
            {ov < seg.length - 1 ? " " : ""}
            {seg.slice(ov + 1).join(" ")}
          </>
        );
      pieces.push(renderRun(body, { ...opts, seed: 300 + ri }));
      i = e;
    });
    if (i < words.length) pieces.push(words.slice(i).join(" "));
    return pieces.flatMap((p, idx) => (idx === 0 ? [p] : [" ", p]));
  };

  return (
    <div className="flex w-full flex-1 select-none items-center justify-center overflow-hidden px-6 py-4">
      <div ref={setHost} className="relative flex max-w-[420px] flex-col items-center gap-[10px] text-center" style={{ color: QUOTE_INK }}>
        <p className="m-0 text-wrap-pretty" style={QUOTE_STYLE}>
          {"“"}
          {quoteBody(core.color)}
          {"”"}
        </p>
        <p className="m-0" style={ATTRIBUTION_STYLE}>
          {"- " + quote.author}
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
  const entered = useMarksReady();
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
        <p ref={pRef} className="m-0 text-wrap-pretty" style={QUOTE_STYLE}>
          {full}
        </p>
        <p className="m-0" style={ATTRIBUTION_STYLE}>
          {"- " + quote.author}
        </p>
      </div>
    </div>
  );
}
