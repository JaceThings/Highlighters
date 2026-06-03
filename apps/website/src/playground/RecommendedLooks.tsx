import { useCallback, useMemo, type CSSProperties } from "react";
import { buildMarkGeometry, resolveOptions } from "@highlighters/core";
import type { LineRect, PresetName } from "@highlighters/core";
import { Card } from "../components/Card.tsx";
import { Section } from "../components/playground/Section.tsx";
import { playClick } from "../lib/sounds.ts";
import { usePlaygroundOptions } from "./options-context.tsx";

// The shipped presets, in the order the library documents them. Clicking copies
// the recipe's concrete values into the build.
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

const SWATCH_W = 44;
const SWATCH_H = 22;

// A real highlighter band per recipe, built from the geometry engine so each preset
// shows its actual look — wet feathers soft, dry streaks and skips, minimal is a thin
// underline — not just a flat colour chip. Same single-element technique as the dock's
// marker preview: clip-path for the shape, the noise tile as a mask for the ink texture.
function RecipeSwatch({ name, seed }: { name: PresetName; seed: number }) {
  const style = useMemo<CSSProperties>(() => {
    const r = resolveOptions({ preset: name });
    const line: LineRect = {
      left: 0, top: 0, width: SWATCH_W, height: SWATCH_H, seed, isFirst: true, isLast: true,
    };
    const geo = buildMarkGeometry(line, r, seed);
    return {
      position: "absolute",
      left: geo.box.x,
      top: geo.box.y,
      width: geo.box.width,
      height: geo.box.height,
      clipPath: geo.clipPath,
      WebkitClipPath: geo.clipPath,
      backgroundColor: typeof r.color === "string" ? r.color : "#fff14d",
      opacity: Math.max(0.4, r.opacity),
      maskImage: `url("${geo.noiseTile.dataUrl}")`,
      WebkitMaskImage: `url("${geo.noiseTile.dataUrl}")`,
      maskRepeat: "repeat",
      WebkitMaskRepeat: "repeat",
      maskSize: `${geo.noiseTile.width}px ${geo.noiseTile.height}px`,
      WebkitMaskSize: `${geo.noiseTile.width}px ${geo.noiseTile.height}px`,
      maskPosition: `${geo.maskOffset.x}px ${geo.maskOffset.y}px`,
      WebkitMaskPosition: `${geo.maskOffset.x}px ${geo.maskOffset.y}px`,
      mixBlendMode: r.blendMode,
    };
  }, [name, seed]);

  return (
    <span
      aria-hidden
      className="relative block flex-none overflow-hidden"
      style={{ width: SWATCH_W, height: SWATCH_H }}
    >
      <div style={style} />
    </span>
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
        {RECIPES.map((recipe, i) => (
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
                <RecipeSwatch name={recipe.name} seed={7 * (i + 1)} />
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
