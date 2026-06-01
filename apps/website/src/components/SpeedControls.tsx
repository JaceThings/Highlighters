import { useState, type ReactNode } from "react";
import { useSelectionStyle, type SpeedSettings } from "../selection-style.tsx";

/**
 * The "Ink dynamics" panel — live, optional controls for the speed-aware deposit
 * (R17). Editing any control patches the shared selection style, so the
 * document-wide live marker (SelectionMarker) re-resolves and the NEXT drag picks
 * up the change. Speed dynamics is live-only, so the effect is felt by dragging a
 * selection across the prose above, not on this panel.
 *
 * The panel itself is `select-none` so fiddling with the sliders never creates a
 * text selection (which would paint a stray mark). Sliders are themed to the live
 * ink colour for a quiet bit of cohesion with the dock's swatch.
 */

const fmt2 = (v: number): string => v.toFixed(2);
const fmtPx = (v: number): string => `${v.toFixed(2)}`;
const fmtInt = (v: number): string => String(Math.round(v));

interface RangeProps {
  label: string;
  field: keyof SpeedSettings;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  accent: string;
  disabled: boolean;
}

function Range({ label, field, min, max, step, format, accent, disabled }: RangeProps) {
  const { speed, setSpeed } = useSelectionStyle();
  const value = speed[field] as number;
  return (
    <label className="flex items-center gap-3 text-[13px] leading-none">
      <span
        className="w-[104px] shrink-0"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => setSpeed({ [field]: Number.parseFloat(e.target.value) } as Partial<SpeedSettings>)}
        aria-label={label}
        className="h-1 flex-1 cursor-pointer disabled:cursor-default disabled:opacity-35"
        style={{ accentColor: accent }}
      />
      <span
        className="w-[42px] shrink-0 text-right tabular-nums"
        style={{ color: "var(--color-text-primary)" }}
      >
        {format(value)}
      </span>
    </label>
  );
}

function Toggle({ on, onChange, accent }: { on: boolean; onChange: (v: boolean) => void; accent: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Enable ink dynamics"
      onClick={() => onChange(!on)}
      data-focus-ring
      className="relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 ease-out active:scale-[0.96]"
      style={{ backgroundColor: on ? accent : "rgba(0,0,0,0.16)" }}
    >
      <span
        className="absolute top-[2px] size-[18px] rounded-full bg-white shadow-sm transition-[left] duration-200 ease-out"
        style={{ left: on ? 18 : 2 }}
      />
    </button>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-[14px]">{children}</div>;
}

export function SpeedControls() {
  const { style, speed, setSpeed } = useSelectionStyle();
  const [advanced, setAdvanced] = useState(false);
  const accent = style.color;
  const off = !speed.enabled;

  return (
    <div
      className="select-none rounded-[20px] p-5"
      style={{ backgroundColor: "rgba(0,0,0,0.02)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.05)" }}
    >
      {/* Header: title + master toggle. */}
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[14px] font-[560]" style={{ color: "var(--color-text-primary)" }}>
          Ink dynamics
        </span>
        <Toggle on={speed.enabled} onChange={(v) => setSpeed({ enabled: v })} accent={accent} />
      </div>
      <p className="mb-4 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
        Drag to highlight the passage above — the faster you swipe, the drier the ink.
      </p>

      <Group>
        <Range label="Strength" field="sensitivity" min={0} max={1} step={0.01} format={fmt2} accent={accent} disabled={off} />
        <Range label="Min ink" field="minDeposit" min={0.05} max={1} step={0.01} format={fmt2} accent={accent} disabled={off} />
        <Range label="Fast at" field="fastSpeed" min={0.3} max={5} step={0.1} format={fmtPx} accent={accent} disabled={off} />
      </Group>

      <button
        type="button"
        onClick={() => setAdvanced((a) => !a)}
        data-focus-ring
        className="mt-4 text-[12px] font-medium tracking-[0.01em] transition-opacity hover:opacity-70"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {advanced ? "Advanced ▾" : "Advanced ▸"}
      </button>

      {advanced && (
        <div className="mt-3">
          <Group>
            <Range label="Slow at" field="slowSpeed" min={0} max={1} step={0.01} format={fmtPx} accent={accent} disabled={off} />
            <Range label="Smoothing" field="smoothing" min={0.05} max={1} step={0.01} format={fmt2} accent={accent} disabled={off} />
            <Range label="Detail" field="resolution" min={4} max={24} step={1} format={fmtInt} accent={accent} disabled={off} />
            <Range label="Dry-out" field="dryoutBoost" min={0} max={1} step={0.01} format={fmt2} accent={accent} disabled={off} />
            <Range label="Streaking" field="streakBoost" min={0} max={1} step={0.01} format={fmt2} accent={accent} disabled={off} />
            <Range label="Edge sharpen" field="featherReduce" min={0} max={1} step={0.01} format={fmt2} accent={accent} disabled={off} />
            <Range label="End pooling" field="poolBoost" min={0} max={1} step={0.01} format={fmt2} accent={accent} disabled={off} />
          </Group>
        </div>
      )}
    </div>
  );
}
