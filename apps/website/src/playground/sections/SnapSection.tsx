import { useCallback } from "react";
import { DEFAULT_OPTIONS } from "@highlighters/core";
import type { SnapMode } from "@highlighters/core";
import { FigureCard } from "../../components/playground/FigureCard.tsx";
import { RadioPillGroup } from "../../components/playground/RadioPillGroup.tsx";
import { Section } from "../../components/playground/Section.tsx";
import { ROW_DIVIDER } from "../../components/playground/styles.ts";
import { Preview } from "../Preview.tsx";
import { usePlaygroundOptions } from "../options-context.tsx";

// Boundary-snapping mode — the "window tip" (R22b). Clamps a mark's start/end
// to the chosen text boundary so it never overshoots into surrounding space.
const SNAP_OPTIONS = [
  { value: "none", label: "None" },
  { value: "word", label: "Word" },
  { value: "line", label: "Line" },
  { value: "glyph", label: "Glyph" },
] as const satisfies ReadonlyArray<{ value: SnapMode; label: string }>;

export function SnapSection() {
  const { options, set } = usePlaygroundOptions();

  const snap = (options.snap ?? DEFAULT_OPTIONS.snap) as SnapMode;

  const onSnapChange = useCallback(
    (next: SnapMode) => set("snap", next),
    [set],
  );

  return (
    <Section
      title="Snap"
      description="Boundary snapping — the “window tip” — clamps a mark's start and end to the nearest text boundary before the overshoot above is applied, so a mark never starts or stops in the middle of surrounding whitespace. None leaves the raw range exactly as targeted; word snaps each end to the enclosing word boundary; line snaps to the visual line edges; and glyph hugs the outermost characters tightly. Word is a good default for selections, line for whole-paragraph marks."
    >
      <FigureCard>
        <Preview />
        <div className={`w-full ${ROW_DIVIDER}`}>
          <RadioPillGroup
            ariaLabel="Snap"
            options={SNAP_OPTIONS}
            value={snap}
            onChange={onSnapChange}
            pillBasis="max-[560px]:basis-[calc(50%-6px)]"
          />
        </div>
      </FigureCard>
    </Section>
  );
}
