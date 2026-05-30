import { useCallback } from "react";
import type { TipType } from "@highlighters/core";
import { Collapse } from "../../components/playground/Collapse.tsx";
import { FigureCard } from "../../components/playground/FigureCard.tsx";
import { RadioPillGroup } from "../../components/playground/RadioPillGroup.tsx";
import { Section } from "../../components/playground/Section.tsx";
import { Slider } from "../../components/playground/Slider.tsx";
import { ROW_DIVIDER, SLIDER_ROW } from "../../components/playground/styles.ts";
import { Preview } from "../Preview.tsx";
import { usePlaygroundOptions } from "../options-context.tsx";

// Nib geometry (R12). `type` drives the band's end shape: a chisel slants the
// leading/trailing edges, a bullet rounds them into a uniform cap, a fine tip
// keeps them crisp. Only the chisel has a meaningful slant ANGLE — the other two
// have no slant, so the Angle control is shown for the chisel alone.
const TIP_OPTIONS = [
  { value: "chisel", label: "Chisel" },
  { value: "bullet", label: "Bullet" },
  { value: "fine", label: "Fine" },
] as const satisfies ReadonlyArray<{ value: TipType; label: string }>;

export function TipSection() {
  const { options, set } = usePlaygroundOptions();

  // Read straight off the live tip group with defensive defaults — a preset that
  // omits a field leaves it undefined, so the controls fall back to the canonical
  // chisel-nib baseline rather than rendering `undefined`.
  const type = (options.tip?.type ?? "chisel") as TipType;
  const angle = options.tip?.angle ?? 35;

  const onTypeChange = useCallback(
    (next: TipType) => set("tip.type", next),
    [set],
  );

  const onAngleChange = useCallback(
    (v: number, fromDrag?: boolean) => set("tip.angle", v, fromDrag),
    [set],
  );

  return (
    <Section
      title="Tip"
      description="The highlighter's nib shape. A chisel slants the ends of every mark (set how far with the angle); a bullet rounds them into a soft uniform cap; a fine tip keeps them crisp."
    >
      <FigureCard>
        <Preview />
        <div className={`w-full ${ROW_DIVIDER}`}>
          <RadioPillGroup
            ariaLabel="Tip type"
            options={TIP_OPTIONS}
            value={type}
            onChange={onTypeChange}
          />
        </div>
        {/* Angle only means something for a chisel — bullet and fine have no
            slant. Collapse animates the row's height + opacity in and out as the
            tip changes, so it slides away rather than popping. */}
        <Collapse show={type === "chisel"}>
          <div className={SLIDER_ROW}>
            <Slider
              label="Angle"
              description="How far the chisel slants the ends of the mark — 0° is square, higher leans the edges further."
              value={angle}
              min={0}
              max={90}
              step={1}
              format={(v) => `${v}°`}
              onChange={onAngleChange}
            />
          </div>
        </Collapse>
      </FigureCard>
    </Section>
  );
}
