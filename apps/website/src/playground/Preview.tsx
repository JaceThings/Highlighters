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

// The live preview atop every docs card: a pre-highlighted quote re-marking as controls change.
// Which words are marked is chosen per-section by {@link planMarks}; the `snap` demo uses {@link SnapPreview}.

interface PreviewProps {
  quote: Quote;
  strategy: MarkStrategy;
  /** Pin the nib type regardless of the shared tip.type, so a one-nib demo (slant needs chisel) keeps reading. */
  lockTipType?: TipType;
}

// Beat held after the card's text fades in before marks draw on, so the highlighter reads as marking
// text already there rather than racing it.
const MARK_ENTRANCE_DELAY_MS = 200;

// True once the entrance has landed AND the post-text beat elapsed: the gate for painting marks.
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
  const entered = useMarksReady();
  // Scope marks to this card's positioned wrapper so they ride the page-exit fade. Falls back to body if null.
  const [host, setHost] = useState<HTMLElement | null>(null);
  const core = useMemo(() => {
    const c = toCoreOptions(previewOptions);
    return lockTipType ? { ...c, tip: { ...c.tip, type: lockTipType } } : c;
  }, [previewOptions, lockTipType]);
  const swap = useMarkTypeSwap(core.markType ?? "highlight");

  // Key = seed (overlapping marks don't collide) + swap.drawKey (mark-type change remounts + redraws).
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
  // Steady ink alpha. The mark-type fade rides swap.fade (compositor opacity), not this.
  const liveOpacity = core.opacity ?? 0.5;
  const words = quote.text.split(" ");
  const plan = planMarks(quote, words, strategy);

  // Overlap doubles stay mounted (toggling opacity, not nodes, avoids a draw-on replay); the Stack
  // toggle fades them via this 0..1 amount. Can't use a compositor layer here: opacity there would
  // isolate the doubles' multiply blend and kill the darkening.
  const hasDoubles = (plan.doubles?.length ?? 0) > 0;
  const stackFade = useMotionValue(stacked ? 1 : 0);
  const [stackAmt, setStackAmt] = useState(stacked ? 1 : 0);
  useMotionValueEvent(stackFade, "change", setStackAmt);
  useEffect(() => {
    if (!hasDoubles) return;
    const controls = animate(stackFade, stacked ? 1 : 0, { duration: 0.4, ease: STATE_CHANGE_EASE });
    return () => controls.stop();
  }, [stacked, hasDoubles, stackFade]);

  // Stable ranges + seeds every render, so a colour change restyles marks in place (no redraw/flash).
  const quoteBody = (color: HighlightOptions["color"]) => {
    // Band stays on multiply so the Stack toggle fades the overlap rather than flipping blend mode
    // (a blend-mode flip can't be tweened).
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

// Offsets into `“${text}”` for a range cutting mid-WORD at both ends, so `word` snap can visibly
// grow it out to real boundaries (a span mark is already flush, so it can't demonstrate snap).
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
  const LEAD = 1; // opening “ is one code unit
  const fw = words[ai];
  const lw = words[bi];
  const start = LEAD + offsetOf(ai) + Math.floor(fw.length / 2);
  const end = LEAD + offsetOf(bi) + Math.max(1, Math.ceil(lw.length / 2));
  // Never collapse to an empty range.
  return { start, end: Math.max(end, start + 1) };
}

/** The `snap` demo: quote as ONE text node, targeting a mid-word {@link Range} so `snap` moves the ends to a boundary. */
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

  // Build the mid-word Range once entered, then hand the positioned wrapper to @highlighters as host.
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
    if (e <= s) return; // degenerate text
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
