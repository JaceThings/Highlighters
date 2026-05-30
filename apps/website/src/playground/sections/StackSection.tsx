import { useCallback } from "react";
import { FigureCard } from "../../components/playground/FigureCard.tsx";
import { RadioPillGroup } from "../../components/playground/RadioPillGroup.tsx";
import { Section } from "../../components/playground/Section.tsx";
import { ROW_DIVIDER } from "../../components/playground/styles.ts";
import { Preview } from "../Preview.tsx";
import { STACK_DEFAULT, usePlaygroundOptions } from "../options-context.tsx";

// The stack axis as a two-pill control. `value` is a plain string union (the
// RadioPillGroup requires `T extends string`); it maps to the `stack` boolean.
type StackMode = "stack" | "flat";

const STACK_OPTIONS = [
  { value: "stack", label: "Stack" },
  { value: "flat", label: "Flat" },
] as const satisfies ReadonlyArray<{ value: StackMode; label: string }>;

// The active mode's caption, shown under the pills the way the Sliders surface a
// per-control description — so the reader sees exactly what the chosen mode does.
const STACK_DESCRIPTIONS: Record<StackMode, string> = {
  stack: "Overlapping marks darken, like real translucent ink.",
  flat: "Overlaps merge into one cohesive colour — no darkening where marks cross.",
};

/**
 * The Stack control (phase-1 `stack`). Replaces the raw blend-mode picker: rather
 * than expose six compositing modes the reader has to reason about, this is the
 * one question that actually matters for layered marks — do overlaps build up
 * (darken) or stay flat (one cohesive colour)? It is wired straight to the live
 * `stack` boolean, which the options context lowers to the `multiply` / `normal`
 * compositing model for the renderer.
 */
export function StackSection() {
  const { options, set } = usePlaygroundOptions();

  const stack = options.stack ?? STACK_DEFAULT;
  const mode: StackMode = stack ? "stack" : "flat";

  const onModeChange = useCallback(
    (next: StackMode) => set("stack", next === "stack"),
    [set],
  );

  return (
    <Section
      title="Stack"
      description="What happens where two marks overlap. Stack is the true translucent-ink optic — each pass deepens the colour. Flat keeps overlaps a single even colour, ideal when you don't want crossings to read as darker patches."
    >
      <FigureCard>
        <Preview />
        <div className={`w-full ${ROW_DIVIDER}`}>
          <RadioPillGroup
            ariaLabel="Stack"
            options={STACK_OPTIONS}
            value={mode}
            onChange={onModeChange}
          />
        </div>
        <div className={`flex w-full items-center justify-center px-4 py-3 ${ROW_DIVIDER}`}>
          <p className="select-none text-center text-[12px] leading-[1.35] font-medium tracking-[-0.1px] text-text-secondary text-wrap-pretty">
            {STACK_DESCRIPTIONS[mode]}
          </p>
        </div>
      </FigureCard>
    </Section>
  );
}
