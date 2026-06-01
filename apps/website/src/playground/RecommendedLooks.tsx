import { useCallback } from "react";
import { SmoothCorners } from "@lisse/react";
import { resolveOptions } from "@highlighters/core";
import type { PresetName } from "@highlighters/core";
import { Card } from "../components/Card.tsx";
import { Section } from "../components/playground/Section.tsx";
import { playClick } from "../lib/sounds.ts";
import { usePlaygroundOptions } from "./options-context.tsx";

// The six shipped presets (R19), in the order the library documents them, each
// with a one-line description framing it as a STARTING POINT — not a mode you
// switch into. Clicking copies the recipe's concrete values into the build.
const RECIPES: ReadonlyArray<{
  name: PresetName;
  label: string;
  blurb: string;
}> = [
  {
    name: "classic-yellow",
    label: "Classic yellow",
    blurb: "The archetypal saturated yellow marker — juicy, a touch of pooling.",
  },
  {
    name: "mild",
    label: "Mild",
    blurb: "Desaturated Mildliner pastels, low opacity. Maximum readability.",
  },
  {
    name: "wet",
    label: "Wet",
    blurb: "A freshly-laid-down marker: high flow, heavy feather, soft edges.",
  },
  {
    name: "dry",
    label: "Dry",
    blurb: "A near-empty marker: low flow, pronounced streaking and skipping.",
  },
  {
    name: "premium",
    label: "Premium",
    blurb: "Engineered against pooling: clean multiply, lightened ends.",
  },
  {
    name: "minimal",
    label: "Minimal",
    blurb: "A restrained underline — thin, flat, straight, no animation.",
  },
];

// A tiny static highlight chip per recipe for flavor. Resolve the preset to its
// concrete color + opacity and paint a small rounded band so each card carries a
// glance of its look without being a live, selectable mark.
function RecipeSwatch({ name }: { name: PresetName }) {
  const r = resolveOptions({ preset: name });
  return (
    <SmoothCorners
      asChild
      autoEffects={false}
      corners={{ radius: 6, smoothing: 0.6 }}
    >
      <span
        aria-hidden
        className="block h-5 w-9 flex-none"
        style={{
          backgroundColor: r.color,
          opacity: Math.max(0.35, r.opacity),
          mixBlendMode: r.blendMode,
        }}
      />
    </SmoothCorners>
  );
}

export function RecommendedLooks() {
  const { applyRecipe } = usePlaygroundOptions();

  const onApply = useCallback(
    (name: PresetName) => {
      playClick();
      applyRecipe(name);
    },
    [applyRecipe],
  );

  return (
    <Section
      title="Recommended looks"
      description="Starting points, not a menu — apply one and then make it your own. Each copies a coherent set of ink, edge, and color values into the controls below, where everything stays editable."
    >
      <div className="grid w-full grid-cols-2 gap-3 max-[480px]:grid-cols-1">
        {RECIPES.map((recipe) => (
          <button
            key={recipe.name}
            type="button"
            data-focus-ring
            onClick={() => onApply(recipe.name)}
            aria-label={`Apply the ${recipe.label} recommended look to the controls`}
            className="block w-full cursor-pointer text-left"
          >
            <Card>
              <div className="flex w-full items-center gap-3 bg-surface px-3.5 py-3">
                <RecipeSwatch name={recipe.name} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[14px] leading-none font-[550] tracking-[-0.25px] text-text-primary">
                    {recipe.label}
                  </span>
                  <span className="text-[12px] leading-[1.35] font-medium tracking-[-0.1px] text-wrap-pretty text-[rgba(126,117,108,0.7)]">
                    {recipe.blurb}
                  </span>
                </span>
              </div>
            </Card>
          </button>
        ))}
      </div>
    </Section>
  );
}
