import type { CSSProperties, ReactNode, Ref } from "react";
import { m, type MotionValue } from "framer-motion";
import type { MarkPlan } from "./quote-marks.ts";
import type { Quote } from "./quotes.ts";

// Shared quote presentation (font, card frame, mark-building) so Preview and its snap variant render
// at one exact size and wrapping.

// Self-hosted face (tokens.css) with system-hand fallbacks.
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

// The quote card body. `hostRef` is the positioned wrapper @highlighters scopes its overlay to;
// `pRef` reaches the `<p>` (the snap variant ranges into it).
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
  /** Compositor opacity for the marks layer (the mark-type swap fade). Defaults to fully opaque. */
  markOpacity?: MotionValue<number>;
}) {
  return (
    <div className="flex w-full flex-1 select-none items-center justify-center overflow-hidden px-6 py-4">
      <div className="relative flex max-w-[420px] flex-col items-center gap-[10px] text-center" style={{ color: QUOTE_INK }}>
        {/* Marks layer. Absolute inset-0 keeps the overlay's coordinate origin identical to the
            wrapper while letting the mark-type swap fade it by compositor opacity, no re-raster. */}
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

// The quote at final size with NO marks, shown before Preview mounts. Frame matches Preview's so the
// swap is height-neutral (a resize would re-raster the paper/scribble SVGs); no per-frame subscription.
export function StaticQuote({ quote }: { quote: Quote }) {
  return (
    <QuoteFrame author={quote.author}>
      {"“"}
      {quote.text}
      {"”"}
    </QuoteFrame>
  );
}

// Build a quote's content nodes from a {@link MarkPlan}: an outer band per range, with `doubles`
// sub-ranges nested in an inner mark (painted twice, the darker overlap). Seeds: 300+ bands, 900+ doubles.
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
