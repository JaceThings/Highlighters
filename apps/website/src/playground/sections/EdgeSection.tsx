import { useCallback } from "react";
import { DEFAULT_OPTIONS } from "@highlighters/core";
import type { EdgeCap } from "@highlighters/core";
import { FigureCard } from "../../components/playground/FigureCard.tsx";
import { RadioPillGroup } from "../../components/playground/RadioPillGroup.tsx";
import { Section } from "../../components/playground/Section.tsx";
import { Slider } from "../../components/playground/Slider.tsx";
import { ROW_DIVIDER, SLIDER_ROW } from "../../components/playground/styles.ts";
import { fmt2, fmtPx } from "../../components/playground/slider-utils.ts";
import { Preview } from "../Preview.tsx";
import { usePlaygroundOptions } from "../options-context.tsx";

// End-cap styles for a band's leading/trailing edges (R13).
const CAP_OPTIONS = [
  { value: "flat", label: "Flat" },
  { value: "round", label: "Round" },
  { value: "square", label: "Square" },
] as const satisfies ReadonlyArray<{ value: EdgeCap; label: string }>;

export function EdgeSection() {
  const { options, set } = usePlaygroundOptions();

  // Read straight off the live options with defensive defaults from the
  // resolved baseline (the playground may open on a preset that omits a field).
  const waviness = options.edge?.waviness ?? DEFAULT_OPTIONS.edge.waviness;
  const frequency = options.edge?.frequency ?? DEFAULT_OPTIONS.edge.frequency;
  const roughness = options.edge?.roughness ?? DEFAULT_OPTIONS.edge.roughness;
  const radius = options.edge?.radius ?? DEFAULT_OPTIONS.edge.radius;
  const cap = (options.edge?.cap ?? DEFAULT_OPTIONS.edge.cap) as EdgeCap;

  const onCapChange = useCallback(
    (next: EdgeCap) => set("edge.cap", next),
    [set],
  );

  return (
    <Section
      title="Edge detail"
      description="Walk the perfectly-straight → highly-frayed continuum. Amplitude sets the peak displacement of the wavy edge in px; frequency is the distance between wave crests (smaller is wavier) and is width-independent, so the wave reads the same on a short word or a long line. Roughness layers high-frequency micro-jitter on top of that base wave, radius rounds the band's corners and caps, and the cap selects how each band's leading and trailing edge terminates — flat, round, or square. Set amplitude and roughness to zero for clean geometric edges."
    >
      <FigureCard>
        <Preview />
        <div className={`w-full ${ROW_DIVIDER}`}>
          <RadioPillGroup
            ariaLabel="Edge cap"
            options={CAP_OPTIONS}
            value={cap}
            onChange={onCapChange}
          />
        </div>
        <div className={SLIDER_ROW}>
          <Slider
            label="Amplitude"
            description="How far the wavy edge wobbles up and down."
            value={waviness}
            min={0}
            max={4}
            step={0.1}
            format={(v) => `${v.toFixed(1)}px`}
            onChange={(v, fromDrag) => set("edge.waviness", v, fromDrag)}
          />
        </div>
        <div className={SLIDER_ROW}>
          <Slider
            label="Frequency"
            description="Distance between wave crests — smaller is wavier."
            value={frequency}
            min={8}
            max={48}
            step={1}
            format={fmtPx}
            onChange={(v, fromDrag) => set("edge.frequency", v, fromDrag)}
          />
        </div>
        <div className={SLIDER_ROW}>
          <Slider
            label="Roughness"
            description="Fine micro-jitter layered on top of the wave."
            value={roughness}
            min={0}
            max={1}
            step={0.01}
            format={fmt2}
            onChange={(v, fromDrag) => set("edge.roughness", v, fromDrag)}
          />
        </div>
        <div className={SLIDER_ROW}>
          <Slider
            label="Radius"
            description="Rounding of the band's corners and caps."
            value={radius}
            min={0}
            max={12}
            step={1}
            format={fmtPx}
            onChange={(v, fromDrag) => set("edge.radius", v, fromDrag)}
          />
        </div>
      </FigureCard>
    </Section>
  );
}
