import colorPickerUrl from "./color-picker.svg";

// `ring` is the selected outline — solid, since box-shadow can't take a gradient.
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

// The custom disc shows the picked colour once it's active; otherwise the wheel art
// hints that it opens the HSL picker.
const CUSTOM_RING = "#9a918a";

export function ColorPalette({
  value,
  onChange,
  onActivateCustom,
}: {
  value: string;
  onChange: (color: string) => void;
  /** Clicking the custom swatch opens the HSL picker rising from this button. */
  onActivateCustom: (button: HTMLButtonElement) => void;
}) {
  const customActive = !PRESET_COLORS.has(value);
  return (
    <div className="grid grid-cols-3 gap-x-[14px] gap-y-[14px]">
      {SWATCHES.map((s) => (
        <Disc
          key={s.id}
          label={s.label}
          ring={s.ring}
          fill={s.color}
          selected={s.color === value}
          onClick={() => onChange(s.color)}
        />
      ))}
      <Disc
        label="Custom colour"
        ring={CUSTOM_RING}
        fill={customActive ? value : `url("${colorPickerUrl}") center / cover no-repeat`}
        selected={customActive}
        onClick={(button) => onActivateCustom(button)}
      />
    </div>
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
      // Never scale the button itself — it shifts the hit area out from under
      // the pointer and the click misfires. Press-scale lives on the visual layer.
      className="group relative size-[43px] shrink-0 rounded-full"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full transition-transform duration-150 group-active:scale-[0.96]"
        style={{ background: "#fff", boxShadow: `inset 0 0 0 3.57px ${ring}` }}
      >
        {/* Colour disc: fills when unselected; shrinks on select to reveal the ring. */}
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: fill,
            transformOrigin: "center",
            transform: selected ? "scale(0.703)" : "scale(1)",
            // Faster on select (ring pops in), slower on deselect (disc eases back).
            transition: selected
              ? "transform 220ms cubic-bezier(0.2, 0, 0, 1)"
              : "transform 300ms cubic-bezier(0.6, 0, 0.35, 1)",
          }}
        />
      </span>
    </button>
  );
}
