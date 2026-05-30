import { useCallback } from "react";
import { FigureCard } from "../../components/playground/FigureCard.tsx";
import { Section } from "../../components/playground/Section.tsx";
import { Slider } from "../../components/playground/Slider.tsx";
import { SLIDER_ROW } from "../../components/playground/styles.ts";
import { Preview } from "../Preview.tsx";
import { usePlaygroundOptions } from "../options-context.tsx";

// Normalized [0,1] knobs read to two decimals; startEndBuildup keeps its sign.
const fmt2 = (v: number) => v.toFixed(2);
const fmtSigned = (v: number) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2));

export function InkSection() {
  const { options, set } = usePlaygroundOptions();

  // Read straight off the live ink group, falling back to the DEFAULT_OPTIONS
  // baseline so controls open on sensible, non-undefined values.
  const ink = options.ink ?? {};
  const flow = ink.flow ?? 0.5;
  const viscosity = ink.viscosity ?? 0.5;
  const saturation = ink.saturation ?? 0.7;
  const feathering = ink.feathering ?? 0.3;
  const streakiness = ink.streakiness ?? 0.35;
  const dryout = ink.dryout ?? 0.15;
  const startEndBuildup = ink.startEndBuildup ?? 0.25;

  const onFlow = useCallback(
    (v: number, fromDrag?: boolean) => set("ink.flow", v, fromDrag),
    [set],
  );
  const onViscosity = useCallback(
    (v: number, fromDrag?: boolean) => set("ink.viscosity", v, fromDrag),
    [set],
  );
  const onSaturation = useCallback(
    (v: number, fromDrag?: boolean) => set("ink.saturation", v, fromDrag),
    [set],
  );
  const onFeathering = useCallback(
    (v: number, fromDrag?: boolean) => set("ink.feathering", v, fromDrag),
    [set],
  );
  const onStreakiness = useCallback(
    (v: number, fromDrag?: boolean) => set("ink.streakiness", v, fromDrag),
    [set],
  );
  const onDryout = useCallback(
    (v: number, fromDrag?: boolean) => set("ink.dryout", v, fromDrag),
    [set],
  );
  const onStartEndBuildup = useCallback(
    (v: number, fromDrag?: boolean) => set("ink.startEndBuildup", v, fromDrag),
    [set],
  );

  return (
    <Section
      title="Ink"
      description="The deposited ink, modelled in real-highlighter vocabulary. Each knob is normalised 0–1 (start/end buildup is signed −1…1) and they interact the way a marker's chemistry does. Flow is juiciness — more ink reads fuller and softer-edged; viscosity is its inverse, raising edge sharpness and skip frequency. Saturation is the per-pass alpha; feathering is the capillary spread of ink into the paper at the edges; streakiness lays down the lengthwise lighter/darker lanes that are the primary realism tell. Dryout opens probabilistic alpha gaps (coupled to viscosity), and start/end buildup pools ink at stroke ends and direction changes when positive, or engages the explicit anti-pool guardrail — the premium-marker look — when negative."
    >
      <FigureCard>
        <Preview />
        <div className={SLIDER_ROW}>
          <Slider
            label="Flow"
            description="Juiciness — more ink reads fuller and softer; less is thin and dry."
            value={flow}
            min={0}
            max={1}
            step={0.01}
            format={fmt2}
            onChange={onFlow}
          />
        </div>
        <div className={SLIDER_ROW}>
          <Slider
            label="Viscosity"
            description="Thicker ink — sharper edges and more skipping."
            value={viscosity}
            min={0}
            max={1}
            step={0.01}
            format={fmt2}
            onChange={onViscosity}
          />
        </div>
        <div className={SLIDER_ROW}>
          <Slider
            label="Saturation"
            description="Colour intensity — higher is bolder and less see-through."
            value={saturation}
            min={0}
            max={1}
            step={0.01}
            format={fmt2}
            onChange={onSaturation}
          />
        </div>
        <div className={SLIDER_ROW}>
          <Slider
            label="Feathering"
            description="How far ink bleeds into the paper at the edges."
            value={feathering}
            min={0}
            max={1}
            step={0.01}
            format={fmt2}
            onChange={onFeathering}
          />
        </div>
        <div className={SLIDER_ROW}>
          <Slider
            label="Streakiness"
            description="Lengthwise light/dark lanes left by the nib."
            value={streakiness}
            min={0}
            max={1}
            step={0.01}
            format={fmt2}
            onChange={onStreakiness}
          />
        </div>
        <div className={SLIDER_ROW}>
          <Slider
            label="Dryout"
            description="Skipping — gaps where a near-empty pen misses the paper."
            value={dryout}
            min={0}
            max={1}
            step={0.01}
            format={fmt2}
            onChange={onDryout}
          />
        </div>
        <div className={SLIDER_ROW}>
          {/* Signed −1…1: the Slider auto-anchors the fill at zero. */}
          <Slider
            label="Start / end buildup"
            description="Pooled ink at the stroke ends (+), or clean guardrail ends (−)."
            value={startEndBuildup}
            min={-1}
            max={1}
            step={0.01}
            format={fmtSigned}
            onChange={onStartEndBuildup}
          />
        </div>
      </FigureCard>
    </Section>
  );
}
