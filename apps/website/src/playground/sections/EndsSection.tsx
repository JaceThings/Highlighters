import { useCallback } from "react";
import { FigureCard } from "../../components/playground/FigureCard.tsx";
import { Section } from "../../components/playground/Section.tsx";
import { Slider } from "../../components/playground/Slider.tsx";
import { SLIDER_ROW } from "../../components/playground/styles.ts";
import { fmtPx } from "../../components/playground/slider-utils.ts";
import { Preview } from "../Preview.tsx";
import {
  TIP_OVERSHOOT_DEFAULT,
  TIP_OVERSHOOT_JITTER_DEFAULT,
  usePlaygroundOptions,
} from "../options-context.tsx";

// Signed px formatter for overshoot: a "+" marks an overrun, "−" a pull-in.
const fmtSignedPx = (v: number) => (v > 0 ? `+${v.toFixed(0)}px` : `${v.toFixed(0)}px`);

/**
 * The mark's ENDS (phase-1 `tip.overshoot` / `tip.overshootJitter`). A real
 * highlighter swipe rarely stops on the exact glyph edge — it runs a little past
 * the word, and the two ends don't land identically. These two knobs author that
 * end behaviour: a base overrun and a per-end random variance around it.
 */
export function EndsSection() {
  const { options, set } = usePlaygroundOptions();

  const overshoot = options.tip?.overshoot ?? TIP_OVERSHOOT_DEFAULT;
  const overshootJitter =
    options.tip?.overshootJitter ?? TIP_OVERSHOOT_JITTER_DEFAULT;

  const onOvershoot = useCallback(
    (v: number, fromDrag?: boolean) => set("tip.overshoot", v, fromDrag),
    [set],
  );
  const onOvershootJitter = useCallback(
    (v: number, fromDrag?: boolean) => set("tip.overshootJitter", v, fromDrag),
    [set],
  );

  return (
    <Section
      title="Ends"
      description="Where each mark starts and stops relative to the text. Overshoot sets a base overrun past the edges; end randomness varies that overrun a touch per end so the two ends never land machine-perfectly identical."
    >
      <FigureCard>
        <Preview />
        <div className={SLIDER_ROW}>
          <Slider
            label="Overshoot"
            description="How far the mark runs past the text ends — negative pulls it in short, positive overshoots."
            value={overshoot}
            min={-8}
            max={12}
            step={1}
            format={fmtSignedPx}
            onChange={onOvershoot}
          />
        </div>
        <div className={SLIDER_ROW}>
          <Slider
            label="End randomness"
            description="How much each end randomly varies over/under the text edge."
            value={overshootJitter}
            min={0}
            max={8}
            step={1}
            format={fmtPx}
            onChange={onOvershootJitter}
          />
        </div>
      </FigureCard>
    </Section>
  );
}
