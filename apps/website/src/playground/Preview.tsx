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

interface PreviewProps {
  quote: Quote;
  strategy: MarkStrategy;
  lockTipType?: TipType;
}

const MARK_ENTRANCE_DELAY_MS = 200;

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
  const [host, setHost] = useState<HTMLElement | null>(null);
  const core = useMemo(() => {
    const c = toCoreOptions(previewOptions);
    return lockTipType ? { ...c, tip: { ...c.tip, type: lockTipType } } : c;
  }, [previewOptions, lockTipType]);
  const swap = useMarkTypeSwap(core.markType ?? "highlight");

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
  const liveOpacity = core.opacity ?? 0.5;
  const words = useMemo(() => quote.text.split(" "), [quote.text]);
  const plan = useMemo(() => planMarks(quote, words, strategy), [quote, words, strategy]);

  const hasDoubles = (plan.doubles?.length ?? 0) > 0;
  const stackFade = useMotionValue(stacked ? 1 : 0);
  const [stackAmt, setStackAmt] = useState(stacked ? 1 : 0);
  useMotionValueEvent(stackFade, "change", setStackAmt);
  useEffect(() => {
    if (!hasDoubles) return;
    const controls = animate(stackFade, stacked ? 1 : 0, { duration: 0.4, ease: STATE_CHANGE_EASE });
    return () => controls.stop();
  }, [stacked, hasDoubles, stackFade]);

  const quoteBody = (color: HighlightOptions["color"]) => {
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
  const LEAD = 1;
  const fw = words[ai];
  const lw = words[bi];
  const start = LEAD + offsetOf(ai) + Math.floor(fw.length / 2);
  const end = LEAD + offsetOf(bi) + Math.max(1, Math.ceil(lw.length / 2));
  return { start, end: Math.max(end, start + 1) };
}

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
    if (e <= s) return;
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
