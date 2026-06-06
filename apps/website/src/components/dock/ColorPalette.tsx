import colorPickerUrl from "./color-picker.svg";
import { playColorBloop, primeMarkerAudio } from "../../lib/marker-audio.ts";

// `ring` is the selected outline, solid since box-shadow can't take a gradient.
interface Swatch {
  id: string;
  label: string;
  color: string;
  ring: string;
}

const SWATCHES: Swatch[] = [
  { id: "brown", label: "Brown ink", color: "#6f584c", ring: "#6f584c" },
  { id: "blue", label: "Blue ink", color: "#3b7cf5", ring: "#3b7cf5" },
  { id: "green", label: "Green ink", color: "#54c45f", ring: "#54c45f" },
  { id: "yellow", label: "Yellow ink", color: "#f5c842", ring: "#f5c842" },
  { id: "red", label: "Red ink", color: "#ee4a3d", ring: "#ee4a3d" },
];

const PRESET_COLORS = new Set(SWATCHES.map((s) => s.color));

// One wheel image for both ring and fill, so they can't drift apart.
const WHEEL = `url("${colorPickerUrl}") center / cover no-repeat`;

export function ColorPalette({
  value,
  onChange,
  onActivateCustom,
}: {
  value: string;
  onChange: (color: string) => void;
  /** The custom swatch opens the HSL picker rising from this button. */
  onActivateCustom: (button: HTMLButtonElement) => void;
}) {
  const customActive = !PRESET_COLORS.has(value);
  return (
    <div
      className="grid grid-cols-3 gap-x-[14px] gap-y-[14px]"
      onPointerEnter={primeMarkerAudio}
    >
      {SWATCHES.map((s) => (
        <Disc
          key={s.id}
          label={s.label}
          ring={s.ring}
          fill={s.color}
          selected={s.color === value}
          // A paint bloop on every circle click (random, no repeats), independent of the colour change.
          onClick={() => {
            playColorBloop();
            onChange(s.color);
          }}
        />
      ))}
      <CustomDisc
        active={customActive}
        color={value}
        onClick={(btn) => {
          playColorBloop();
          onActivateCustom(btn);
        }}
      />
    </div>
  );
}

// The custom-colour disc: rainbow ring with the picked colour at centre when active, else the wheel art.
function CustomDisc({
  active,
  color,
  onClick,
}: {
  active: boolean;
  color: string;
  onClick: (button: HTMLButtonElement) => void;
}) {
  return (
    <button
      type="button"
      aria-label="Custom colour"
      aria-pressed={active}
      onClick={(e) => onClick(e.currentTarget)}
      data-focus-ring
      data-focus-radius="full"
      className="group relative size-[43px] shrink-0 rounded-full"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full transition-transform duration-150 group-active:scale-[0.96]"
        // Rasterise the stacked circles as one layer so the press-scale doesn't shimmer their edges.
        style={{ willChange: "transform", backfaceVisibility: "hidden" }}
      >
        <span className="absolute inset-0 rounded-full" style={{ background: WHEEL }} />
        <span className="absolute rounded-full bg-white" style={{ inset: "3.57px" }} />
        <span
          className="absolute inset-0 rounded-full"
          style={{
            transform: active ? "scale(0.703)" : "scale(1)",
            transition: active
              ? "transform 220ms cubic-bezier(0.2, 0, 0, 1)"
              : "transform 300ms cubic-bezier(0.6, 0, 0.35, 1)",
          }}
        >
          {/* Picked colour crossfades over the wheel via opacity (background can't transition). */}
          <span className="absolute inset-0 rounded-full" style={{ background: WHEEL }} />
          <span
            className="absolute inset-0 rounded-full"
            style={{ background: color, opacity: active ? 1 : 0, transition: "opacity 300ms ease" }}
          />
        </span>
      </span>
    </button>
  );
}

function Disc({
  label,
  ring,
  fill,
  selected,
  onClick,
}: {
  label: string;
  ring: string;
  fill: string;
  selected: boolean;
  onClick: (button: HTMLButtonElement) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={(e) => onClick(e.currentTarget)}
      data-focus-ring
      data-focus-radius="full"
      // Never scale the button itself: it shifts the hit area and the click misfires. Press-scale lives on the visual layer.
      className="group relative size-[43px] shrink-0 rounded-full"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full transition-transform duration-150 group-active:scale-[0.96]"
        style={{ background: "#fff", boxShadow: `inset 0 0 0 3.57px ${ring}` }}
      >
        {/* Disc fills when unselected; shrinks on select to reveal the ring. */}
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: fill,
            transformOrigin: "center",
            transform: selected ? "scale(0.703)" : "scale(1)",
            // Faster on select (ring pops), slower on deselect (disc eases back).
            transition: selected
              ? "transform 220ms cubic-bezier(0.2, 0, 0, 1)"
              : "transform 300ms cubic-bezier(0.6, 0, 0.35, 1)",
          }}
        />
      </span>
    </button>
  );
}
