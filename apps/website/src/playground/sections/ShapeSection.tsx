import { useCallback } from "react";
import type { ShapeType } from "@highlighters/core";
import { FigureCard } from "../../components/playground/FigureCard.tsx";
import { RadioPillGroup } from "../../components/playground/RadioPillGroup.tsx";
import { Section } from "../../components/playground/Section.tsx";
import { ROW_DIVIDER } from "../../components/playground/styles.ts";
import { Preview } from "../Preview.tsx";
import { usePlaygroundOptions } from "../options-context.tsx";

// The three mark kinds. They share one band primitive and the full physics
// model — they differ only in vertical position and thickness.
const SHAPE_OPTIONS = [
  { value: "highlight", label: "Highlight" },
  { value: "underline", label: "Underline" },
  { value: "strike-through", label: "Strike" },
] as const satisfies ReadonlyArray<{ value: ShapeType; label: string }>;

export function ShapeSection() {
  const { options, setShape } = usePlaygroundOptions();

  // The context keeps `shape` and `markType` in lockstep via setShape, so either
  // reflects the active kind; read whichever is set, defaulting to "highlight".
  const activeShape = (options.markType ?? options.shape ?? "highlight") as ShapeType;

  const onShapeChange = useCallback(
    (next: ShapeType) => setShape(next),
    [setShape],
  );

  return (
    <Section
      title="Shape"
      description="The kind of mark drawn. All three share one band primitive and the full ink-physics model — they differ only in vertical position and thickness. Highlight is a tall band sized to the text, underline a thin band riding the baseline, and strike-through a thin band centred through the x-height. Whatever you set for tip, ink, and edge applies identically across all three."
    >
      <FigureCard>
        <Preview />
        <div className={`w-full ${ROW_DIVIDER}`}>
          <RadioPillGroup
            ariaLabel="Shape"
            options={SHAPE_OPTIONS}
            value={activeShape}
            onChange={onShapeChange}
          />
        </div>
      </FigureCard>
    </Section>
  );
}
