import { useCallback } from "react";
import type { ColorantValue, QualityTier } from "@highlighters/core";
import { Collapse } from "../../components/playground/Collapse.tsx";
import { FigureCard } from "../../components/playground/FigureCard.tsx";
import { RadioPillGroup } from "../../components/playground/RadioPillGroup.tsx";
import { Section } from "../../components/playground/Section.tsx";
import { Slider } from "../../components/playground/Slider.tsx";
import { ROW_DIVIDER, SLIDER_ROW } from "../../components/playground/styles.ts";
import { Preview } from "../Preview.tsx";
import { usePlaygroundOptions } from "../options-context.tsx";

const fmt2 = (v: number) => v.toFixed(2);

// Glow enable is a boolean on the options object; map it through a string union
// so it can ride the same RadioPillGroup as every other pill control.
type GlowMode = "off" | "on";
const GLOW_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "on", label: "On" },
] as const satisfies ReadonlyArray<{ value: GlowMode; label: string }>;

// The manufacturing-quality axis (R18): bundles ink/edge variance into a look.
const QUALITY_OPTIONS = [
  { value: "premium", label: "Premium" },
  { value: "standard", label: "Standard" },
  { value: "cheap", label: "Cheap" },
] as const satisfies ReadonlyArray<{ value: QualityTier; label: string }>;

// The dye↔pigment master axis (R17b) accepts a number in [0,1] or a named
// anchor; the named anchors resolve to these canonical positions. The pill
// `value` stays a plain string union (RadioPillGroup requires `T extends
// string`) — the numeric `position` is what we actually write to `colorant`.
type ColorantAnchor = "dye" | "balanced" | "pigment";
const COLORANT_ANCHORS = [
  { value: "dye", label: "Dye", position: 0 },
  { value: "balanced", label: "Balanced", position: 0.5 },
  { value: "pigment", label: "Pigment", position: 1 },
] as const satisfies ReadonlyArray<{
  value: ColorantAnchor;
  label: string;
  position: number;
}>;

// Normalize the colorant axis (number | named anchor) to a slider position.
function colorantToNumber(c: ColorantValue | undefined): number {
  if (typeof c === "number") return c;
  const anchor = COLORANT_ANCHORS.find((a) => a.value === c);
  return anchor ? anchor.position : 0.5;
}

export function EffectSection() {
  const { options, set } = usePlaygroundOptions();

  const glow = options.glow ?? {};
  const glowEnabled = glow.enabled ?? false;
  const glowMode: GlowMode = glowEnabled ? "on" : "off";
  const intensity = glow.intensity ?? 0.5;
  const spread = glow.spread ?? 4;

  const colorant = colorantToNumber(options.colorant);
  const activeAnchor = COLORANT_ANCHORS.find((a) => a.position === colorant)?.value;

  const quality = (options.quality ?? "standard") as QualityTier;

  const onGlowMode = useCallback(
    (next: GlowMode) => set("glow.enabled", next === "on"),
    [set],
  );
  const onIntensity = useCallback(
    (v: number, fromDrag?: boolean) => set("glow.intensity", v, fromDrag),
    [set],
  );
  const onSpread = useCallback(
    (v: number, fromDrag?: boolean) => set("glow.spread", v, fromDrag),
    [set],
  );

  const onColorant = useCallback((v: number) => set("colorant", v), [set]);
  const onColorantAnchor = useCallback(
    (next: ColorantAnchor) => {
      const anchor = COLORANT_ANCHORS.find((a) => a.value === next);
      if (anchor) set("colorant", anchor.position);
    },
    [set],
  );

  const onQuality = useCallback((next: QualityTier) => set("quality", next), [set]);

  return (
    <Section
      title="Effect & material"
      description="The material character of the ink, above the per-knob ink controls. Fluorescence is modelled as an additive emission layered over the subtractive ink, so an enabled mark reads brighter and more saturated than its background — it must never reduce legibility, and is off by default. The colorant axis is a single dye↔pigment master knob that sets coherent defaults for the correlated ink parameters: toward dye the ink is saturated, feathery, and smeary; toward pigment it is muted, translucent, and cleanly multiplying. Quality bundles ink and edge variance into a coherent manufacturing grade — premium suppresses variance and end-pooling, cheap amplifies streaking, skipping, and pooling."
    >
      <FigureCard>
        <Preview />
        <div className={`w-full ${ROW_DIVIDER}`}>
          <RadioPillGroup
            ariaLabel="Fluorescence"
            options={GLOW_OPTIONS}
            value={glowMode}
            onChange={onGlowMode}
          />
        </div>
        <Collapse show={glowEnabled}>
          <div className={SLIDER_ROW}>
            <Slider
              label="Glow intensity"
              description="Strength of the fluorescent glow over the ink."
              value={intensity}
              min={0}
              max={1}
              step={0.01}
              format={fmt2}
              onChange={onIntensity}
            />
          </div>
          <div className={SLIDER_ROW}>
            <Slider
              label="Glow spread"
              description="How far the glow bleeds beyond the band."
              value={spread}
              min={0}
              max={20}
              step={1}
              format={(v) => `${Math.round(v)}px`}
              onChange={onSpread}
            />
          </div>
        </Collapse>
        <div className={SLIDER_ROW}>
          <Slider
            label="Colorant — dye to pigment"
            description="Dye (saturated, smeary) → pigment (muted, clean)."
            value={colorant}
            min={0}
            max={1}
            step={0.01}
            format={fmt2}
            onChange={onColorant}
          />
        </div>
        <div className={`w-full ${ROW_DIVIDER}`}>
          <RadioPillGroup
            ariaLabel="Colorant anchor"
            options={COLORANT_ANCHORS}
            value={(activeAnchor ?? "balanced") as ColorantAnchor}
            onChange={onColorantAnchor}
          />
        </div>
        <div className={`w-full ${ROW_DIVIDER}`}>
          <RadioPillGroup
            ariaLabel="Quality"
            options={QUALITY_OPTIONS}
            value={quality}
            onChange={onQuality}
          />
        </div>
      </FigureCard>
    </Section>
  );
}
