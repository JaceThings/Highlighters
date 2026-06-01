import { useCallback } from "react";
import { FigureCard } from "../../components/playground/FigureCard.tsx";
import { Section } from "../../components/playground/Section.tsx";
import { Slider } from "../../components/playground/Slider.tsx";
import { SLIDER_ROW } from "../../components/playground/styles.ts";
import { fmt2 } from "../../components/playground/slider-utils.ts";
import { Preview } from "../Preview.tsx";
import { usePlaygroundOptions } from "../options-context.tsx";

export function PaperSection() {
  const { options, set } = usePlaygroundOptions();

  // Absorbency 0–1: higher wicks more ink, growing feather and softening edges.
  const absorbency = options.paper?.absorbency ?? 0.3;

  const onAbsorbency = useCallback(
    (v: number, fromDrag?: boolean) => set("paper.absorbency", v, fromDrag),
    [set],
  );

  return (
    <Section
      title="Paper"
      description="The paper surface the ink lands on. Absorbency runs 0–1 and acts as a multiplier on feathering: higher values wick more ink laterally, so the feather grows and the edges soften the way a marker bleeds into uncoated stock. Coated, glossy stock sits near zero; thirsty newsprint sits high."
    >
      <FigureCard>
        <Preview />
        <div className={SLIDER_ROW}>
          <Slider
            label="Absorbency"
            description="Thirstier paper — more feathering and softer edges."
            value={absorbency}
            min={0}
            max={1}
            step={0.01}
            format={fmt2}
            onChange={onAbsorbency}
          />
        </div>
      </FigureCard>
    </Section>
  );
}
