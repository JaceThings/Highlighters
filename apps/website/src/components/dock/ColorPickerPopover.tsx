import { useEffect, useState } from "react";
import type { ShadowConfig } from "@lisse/core";
import { SmoothCorners } from "@lisse/react";
import { hexToHsl, hslToHex } from "./oklch.ts";
import { HslSlider } from "./HslSlider.tsx";

const POPOVER_SHADOW: ShadowConfig = {
  offsetX: 0, offsetY: 6, blur: 14, spread: -6, color: "#73574A", opacity: 0.15,
};

const HUE_GRADIENT =
  "linear-gradient(to right, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))";

export function ColorPickerPopover({
  color,
  onChange,
}: {
  color: string;
  onChange: (hex: string) => void;
}) {
  const [{ h, s, l }, setHsl] = useState(() => hexToHsl(color));
  useEffect(() => {
    if (hslToHex({ h, s, l }) !== color) setHsl(hexToHsl(color));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-sync on an external color change
  }, [color]);

  const hex = hslToHex({ h, s, l });
  const set = (next: { h?: number; s?: number; l?: number }) => {
    const merged = { h: next.h ?? h, s: next.s ?? s, l: next.l ?? l };
    setHsl(merged);
    onChange(hslToHex(merged));
  };

  const satGradient = `linear-gradient(to right, hsl(${h} 0% 50%), hsl(${h} 100% 50%))`;
  const lightGradient = `linear-gradient(to right, hsl(${h} ${s}% 0%), hsl(${h} ${s}% 50%), hsl(${h} ${s}% 100%))`;

  return (
    <SmoothCorners
      asChild
      autoEffects={false}
      corners={{ radius: 41, smoothing: 0.6 }}
      shadow={POPOVER_SHADOW}
    >
      <div
        role="group"
        aria-label="Custom colour"
        className="flex w-[320px] flex-col items-center gap-[18px] bg-white p-[18px]"
      >
        <HslSlider
          label="Hue"
          value={h}
          min={0}
          max={360}
          step={5}
          gradient={HUE_GRADIENT}
          knobColor={hex}
          onChange={(next) => set({ h: next })}
        />
        <HslSlider
          label="Saturation"
          value={s}
          min={0}
          max={100}
          step={5}
          gradient={satGradient}
          knobColor={hex}
          onChange={(next) => set({ s: next })}
        />
        <HslSlider
          label="Lightness"
          value={l}
          min={0}
          max={100}
          step={5}
          gradient={lightGradient}
          knobColor={hex}
          onChange={(next) => set({ l: next })}
        />
      </div>
    </SmoothCorners>
  );
}
