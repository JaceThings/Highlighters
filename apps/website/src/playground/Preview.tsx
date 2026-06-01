import { useMemo, type ReactNode } from "react";
import { Highlight } from "@highlighters/react";
import type { HighlightOptions } from "@highlighters/core";
import { useEntranceComplete } from "../components/Stagger.tsx";
import { toCoreOptions, usePlaygroundOptions } from "./options-context.tsx";

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

// Match the Lisse "Figure Content" frame height across every section.
const CANVAS_HEIGHT = 255;

interface PreviewProps {
  /** Bump to replay the draw-on animation: changing it remounts every
   *  `<Highlight>` mark (via its React `key`) so each stroke re-draws.
   *  Defaults to 0 — no replays. */
  replayNonce?: number;
}

export function Preview({ replayNonce = 0 }: PreviewProps) {
  const { previewOptions } = usePlaygroundOptions();
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

  return (
    <div
      className="flex w-full items-center justify-center overflow-hidden px-7 py-6"
      style={{ height: CANVAS_HEIGHT }}
    >
      {/* The exhibit: position:relative scopes the @highlighters overlay inside
          this block, and select-none means the reader can never grab it. */}
      <div className="relative flex max-w-[420px] select-none flex-col gap-3 text-text-primary">
        <h3 className="text-[19px] leading-[1.3] font-[560] tracking-[-0.4px]">
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
