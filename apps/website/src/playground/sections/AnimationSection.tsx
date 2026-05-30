import { useCallback, useState } from "react";
import { SmoothCorners } from "@lisse/react";
import { DEFAULT_OPTIONS } from "@highlighters/core";
import type { AnimationTrigger } from "@highlighters/core";
import { Collapse } from "../../components/playground/Collapse.tsx";
import { FigureCard } from "../../components/playground/FigureCard.tsx";
import { RadioPillGroup } from "../../components/playground/RadioPillGroup.tsx";
import { Section } from "../../components/playground/Section.tsx";
import { Slider } from "../../components/playground/Slider.tsx";
import { ROW_DIVIDER, SLIDER_ROW } from "../../components/playground/styles.ts";
import { playClick } from "../../lib/sounds.ts";
import { Preview } from "../Preview.tsx";
import { usePlaygroundOptions } from "../options-context.tsx";

// The draw-on enable, modelled as a two-pill toggle so it reads identically to
// the rest of the playground's boolean axes (off / on).
const DRAW_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "on", label: "On" },
] as const satisfies ReadonlyArray<{ value: "off" | "on"; label: string }>;

// When the entrance animation begins. `in-view` arms an IntersectionObserver
// so each band draws as it scrolls into view (R24).
const TRIGGER_OPTIONS = [
  { value: "immediate", label: "Immediate" },
  { value: "in-view", label: "In view" },
] as const satisfies ReadonlyArray<{ value: AnimationTrigger; label: string }>;

export function AnimationSection() {
  const { options, set } = usePlaygroundOptions();

  // Bumping this remounts every <Highlight> mark inside this section's
  // <Preview> (the nonce is folded into each mark's React `key`), so the
  // draw-on stroke re-plays with the current settings — no page refresh.
  const [replayNonce, setReplayNonce] = useState(0);
  const replay = useCallback(() => {
    playClick();
    setReplayNonce((n) => n + 1);
  }, []);

  const draw = options.animation?.draw ?? DEFAULT_OPTIONS.animation.draw;
  const duration = options.animation?.duration ?? DEFAULT_OPTIONS.animation.duration;
  const trigger = (options.animation?.trigger ??
    DEFAULT_OPTIONS.animation.trigger) as AnimationTrigger;

  const onDrawChange = useCallback(
    (next: "off" | "on") => set("animation.draw", next === "on"),
    [set],
  );

  const onTriggerChange = useCallback(
    (next: AnimationTrigger) => set("animation.trigger", next),
    [set],
  );

  return (
    <Section
      title="Animation"
      description="The entrance draw-on: each band paints left-to-right like a pen stroke rather than appearing all at once. Turn it on to set the per-band duration in milliseconds and choose the trigger — immediate fires on mount, while in-view arms an IntersectionObserver so each mark draws as it scrolls into the viewport. All entrance motion is suppressed automatically under prefers-reduced-motion. Use the Replay button to re-run the current stroke without reloading."
    >
      <FigureCard>
        <Preview replayNonce={replayNonce} />
        {/* Replay the draw-on stroke without a page refresh. Only meaningful
            while draw-on is enabled, so it shares the Collapse with the
            duration/trigger controls. Bumping `replayNonce` remounts the
            preview marks → each stroke re-draws with the live settings. */}
        <Collapse show={draw}>
          <div className={`flex w-full items-center justify-center p-3 ${ROW_DIVIDER}`}>
            <button
              type="button"
              onClick={replay}
              data-focus-ring
              aria-label="Replay the draw-on animation"
              className="cursor-pointer select-none p-1.5 -m-1.5"
            >
              <SmoothCorners
                asChild
                autoEffects={false}
                corners={{ radius: 8, smoothing: 0.6 }}
              >
                <span className="flex items-center justify-center gap-1.5 bg-[rgba(126,117,108,0.12)] px-3 py-1.5 text-[14px] leading-[1.2] font-medium tracking-[-0.25px] text-text-input transition-[background-color] duration-[350ms] [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] hover:bg-[rgba(126,117,108,0.18)]">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="-ml-0.5 shrink-0"
                  >
                    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                  Replay
                </span>
              </SmoothCorners>
            </button>
          </div>
        </Collapse>
        <div className={`w-full ${ROW_DIVIDER}`}>
          <RadioPillGroup
            ariaLabel="Draw-on animation"
            options={DRAW_OPTIONS}
            value={draw ? "on" : "off"}
            onChange={onDrawChange}
          />
        </div>
        <Collapse show={draw}>
          <div className={SLIDER_ROW}>
            <Slider
              label="Duration"
              value={duration}
              min={0}
              max={1500}
              step={10}
              format={(v) => `${v.toFixed(0)}ms`}
              description="How long the draw-on swipe takes to sweep across."
              onChange={(v) => set("animation.duration", v)}
            />
          </div>
          <div className={`w-full ${ROW_DIVIDER}`}>
            <RadioPillGroup
              ariaLabel="Animation trigger"
              options={TRIGGER_OPTIONS}
              value={trigger}
              onChange={onTriggerChange}
            />
          </div>
        </Collapse>
      </FigureCard>
    </Section>
  );
}
