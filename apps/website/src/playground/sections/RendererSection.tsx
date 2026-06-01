import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_OPTIONS,
  detectEnvironment,
  selectTier,
} from "@highlighters/core";
import type {
  RendererTier,
  RendererTierPreference,
} from "@highlighters/core";
import { FigureCard } from "../../components/playground/FigureCard.tsx";
import { RadioPillGroup } from "../../components/playground/RadioPillGroup.tsx";
import { Section } from "../../components/playground/Section.tsx";
import { ROW_DIVIDER } from "../../components/playground/styles.ts";
import { Preview } from "../Preview.tsx";
import { usePlaygroundOptions } from "../options-context.tsx";

// Renderer tier preference / pin (R27). `auto` selects the best supported tier
// and enables auto-degrade; the others pin a specific tier.
const RENDERER_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "svg", label: "SVG" },
  { value: "css", label: "CSS" },
  { value: "highlight-api", label: "Highlight API" },
] as const satisfies ReadonlyArray<{ value: RendererTierPreference; label: string }>;

// Human-readable label for the concrete tier the request resolves to.
const TIER_LABEL: Record<RendererTier, string> = {
  svg: "SVG band (Tier A)",
  css: "CSS gradient (Tier B)",
  "highlight-api": "Highlight API (Tier C)",
};

export function RendererSection() {
  const { options, set } = usePlaygroundOptions();

  const renderer = (options.renderer ??
    DEFAULT_OPTIONS.renderer) as RendererTierPreference;

  // The concrete tier the preference resolves to in *this* browser. Detection
  // touches the DOM, so resolve it in an effect (it returns conservative SSR
  // defaults if called server-side) and re-resolve whenever the pin changes.
  const [activeTier, setActiveTier] = useState<RendererTier | null>(null);
  useEffect(() => {
    const env = detectEnvironment();
    // The preview paints a handful of marks — well under the degrade threshold,
    // so `auto` reports the genuine top supported tier rather than a count-based
    // step-down.
    setActiveTier(selectTier(renderer, env, 1));
  }, [renderer]);

  const onRendererChange = useCallback(
    (next: RendererTierPreference) => set("renderer", next),
    [set],
  );

  return (
    <Section
      title="Renderer"
      description="Three rendering tiers sit behind one API, and degradation is fidelity-only — a lower tier never moves, resizes, or recolours a mark, it only simplifies the edge organicness and texture. Tier A is a per-line SVG band with shared turbulence and displacement filters (the realistic default); Tier B is a CSS linear-gradient band; Tier C is the native CSS Custom Highlight API. Auto selects the best supported tier in this browser and steps down under heavy mark counts to protect the frame budget; the other options pin a single tier and disable auto-degrade. The active tier below reports what your current choice resolves to here."
    >
      <FigureCard>
        <Preview />
        <div className={`w-full ${ROW_DIVIDER}`}>
          <RadioPillGroup
            ariaLabel="Renderer tier"
            options={RENDERER_OPTIONS}
            value={renderer}
            onChange={onRendererChange}
            pillBasis="max-[560px]:basis-[calc(50%-6px)]"
          />
        </div>
        <div className={`flex w-full items-center justify-between gap-3 px-4 py-3 ${ROW_DIVIDER}`}>
          <span className="text-[14px] leading-[1.2] font-medium tracking-[-0.25px] text-text-input">
            Active tier
          </span>
          <span className="text-[14px] leading-[1.2] font-medium tracking-[-0.25px] text-[rgba(126,117,108,0.5)]">
            {activeTier ? TIER_LABEL[activeTier] : "Detecting…"}
          </span>
        </div>
      </FigureCard>
    </Section>
  );
}
