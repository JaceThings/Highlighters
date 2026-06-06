import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { animate, useMotionValue, useMotionValueEvent } from "framer-motion";
import { Highlight, useHighlight } from "@highlighters/react";
import type { HighlightOptions, TipType } from "@highlighters/core";
import { useEntranceComplete } from "../components/Stagger.tsx";
import { useMarkTypeSwap } from "../hooks/useMarkTypeSwap.ts";
import { STATE_CHANGE_EASE } from "../components/playground/springs.ts";
import { toCoreOptions, usePreviewOptions } from "./options-context.tsx";
import type { Quote } from "./quotes.ts";
import { planMarks, type MarkStrategy } from "./quote-marks.ts";
import { QuoteFrame, buildQuotePieces } from "./quote-render.tsx";

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
  // A mark-type change can't morph smoothly, so fade the old out and redraw the new (useMarkTypeSwap).
  const swap = useMarkTypeSwap(core.markType ?? "highlight");

  // Key = seed (so overlapping marks don't collide) + swap.drawKey, so a mark-type change remounts
  // the run and replays its draw-on. The plain-text branch keeps marks off until the entrance lands.
  const renderRun = (children: ReactNode, runOptions: HighlightOptions) => {
    const key = `${runOptions.seed}-${swap.drawKey}`;
    return entered ? (
      <Highlight as="span" options={runOptions} host={host} key={key}>
        {children}
      </Highlight>
    ) : (
      <span key={key}>{children}</span>
    );
  };

  const stacked = previewOptions.stack !== false;
  // Steady ink alpha. The mark-type fade rides the layer's compositor opacity (swap.fade), not this.
  const liveOpacity = core.opacity ?? 0.5;
  const words = quote.text.split(" ");
  const plan = planMarks(quote, words, strategy);

  // Overlap doubles are always mounted (toggling opacity, not nodes, avoids a draw-on replay); the
  // Stack toggle fades them in/out via this 0..1 amount rather than snapping. Only the overlap demo
  // plans doubles, so this per-frame opacity tween touches one card's couple of inner marks - it
  // can't go through a compositor layer like the mark-type fade, since opacity there would isolate
  // the doubles' multiply blend and kill the darkening.
  const hasDoubles = (plan.doubles?.length ?? 0) > 0;
  const stackFade = useMotionValue(stacked ? 1 : 0);
  const [stackAmt, setStackAmt] = useState(stacked ? 1 : 0);
  useMotionValueEvent(stackFade, "change", setStackAmt);
  useEffect(() => {
    if (!hasDoubles) return;
    const controls = animate(stackFade, stacked ? 1 : 0, { duration: 0.4, ease: STATE_CHANGE_EASE });
    return () => controls.stop();
  }, [stacked, hasDoubles, stackFade]);

  // Stable ranges + seeds every render, so a colour change restyles the existing marks in place
  // (handle.update) with no redraw or flash, like the dock's live marker.
  const quoteBody = (color: HighlightOptions["color"]) => {
    // Keep the band on multiply so the Stack toggle fades the overlap (the inner double's opacity)
    // instead of snapping the whole band's blend mode - a blend-mode flip can't be tweened, and it's
    // the overlap darkening, not the single band, that the demo is about.
    const opts: HighlightOptions = { ...core, markType: swap.markType, color, opacity: liveOpacity, blendMode: "multiply" };
    return buildQuotePieces(
      words,
      plan,
      (children, seed) => renderRun(children, { ...opts, seed }),
      (children, seed) => renderRun(children, { ...opts, seed, opacity: liveOpacity * stackAmt }),
    );
  };

  return (
    <QuoteFrame hostRef={setHost} author={quote.author} markOpacity={swap.fade}>
      {"“"}
      {quoteBody(core.color)}
      {"”"}
    </QuoteFrame>
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
    <QuoteFrame hostRef={hostRef} pRef={pRef} author={quote.author}>
      {full}
    </QuoteFrame>
  );
}
