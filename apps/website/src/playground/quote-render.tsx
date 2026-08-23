import type { CSSProperties, ReactNode, Ref } from "react";
import { m, type MotionValue } from "framer-motion";
import type { MarkPlan } from "./quote-marks.ts";
import type { Quote } from "./quotes.ts";

export const QUOTE_FONT = '"Letters Home", "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive';
export const QUOTE_INK = "#73574a";
export const QUOTE_STYLE: CSSProperties = {
  fontFamily: QUOTE_FONT,
  fontSize: 25,
  lineHeight: "30px",
  whiteSpace: "pre-line",
  hyphens: "none",
  WebkitHyphens: "none",
};
export const ATTRIBUTION_STYLE: CSSProperties = { fontFamily: QUOTE_FONT, fontSize: 20, opacity: 0.5 };

export function QuoteFrame({
  hostRef,
  pRef,
  author,
  children,
  markOpacity,
}: {
  hostRef?: Ref<HTMLDivElement>;
  pRef?: Ref<HTMLParagraphElement>;
  author: string;
  children: ReactNode;
  markOpacity?: MotionValue<number>;
}) {
  return (
    <div className="flex w-full flex-1 select-none items-center justify-center overflow-hidden px-6 py-4">
      <div className="relative flex max-w-[420px] flex-col items-center gap-[10px] text-center" style={{ color: QUOTE_INK }}>
        <m.div
          ref={hostRef}
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ opacity: markOpacity ?? 1 }}
        />
        <p ref={pRef} className="m-0 text-wrap-pretty" style={QUOTE_STYLE}>
          {children}
        </p>
        <p className="m-0" style={ATTRIBUTION_STYLE}>
          {"- " + author}
        </p>
      </div>
    </div>
  );
}

export function StaticQuote({ quote }: { quote: Quote }) {
  return (
    <QuoteFrame author={quote.author}>
      {"“"}
      {quote.text}
      {"”"}
    </QuoteFrame>
  );
}

export function buildQuotePieces(
  words: string[],
  plan: MarkPlan,
  outer: (children: ReactNode, seed: number) => ReactNode,
  inner: (children: ReactNode, seed: number) => ReactNode,
): ReactNode[] {
  const pieces: ReactNode[] = [];
  let i = 0;
  plan.ranges.forEach(([s, e], ri) => {
    if (i < s) pieces.push(words.slice(i, s).join(" "));
    const doubles = (plan.doubles ?? [])
      .filter((d) => d[0] >= s && d[1] <= e)
      .sort((a, b) => a[0] - b[0]);
    let body: ReactNode;
    if (doubles.length === 0) {
      body = words.slice(s, e).join(" ");
    } else {
      const nodes: ReactNode[] = [];
      let j = s;
      for (const [ds, de] of doubles) {
        if (j < ds) nodes.push(words.slice(j, ds).join(" "));
        nodes.push(inner(words.slice(ds, de).join(" "), 900 + ds));
        j = de;
      }
      if (j < e) nodes.push(words.slice(j, e).join(" "));
      body = nodes.flatMap((nd, idx) => (idx === 0 ? [nd] : [" ", nd]));
    }
    pieces.push(outer(body, 300 + ri));
    i = e;
  });
  if (i < words.length) pieces.push(words.slice(i).join(" "));
  return pieces.flatMap((p, idx) => (idx === 0 ? [p] : [" ", p]));
}
