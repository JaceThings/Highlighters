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

// The custom disc wears a rainbow ring (the colour wheel) once a custom colour is active;
// otherwise the wheel art fills it, hinting that it opens the HSL picker.
const RAINBOW_RING =
  "conic-gradient(from 90deg, hsl(0 90% 60%), hsl(60 90% 60%), hsl(120 90% 60%), hsl(180 90% 60%), hsl(240 90% 60%), hsl(300 90% 60%), hsl(360 90% 60%))";

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
      <CustomDisc active={customActive} color={value} onClick={onActivateCustom} />
    </div>
  );
}

// The custom-colour disc: a rainbow ring with the picked colour at its centre when active,
// or the wheel art when not — so it reads as "open the colour picker".
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
      className="group relative size-[43px] shrink-0 rounded-full"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full transition-transform duration-150 group-active:scale-[0.96]"
      >
        {active ? (
          <>
            <span className="absolute inset-0 rounded-full" style={{ background: RAINBOW_RING }} />
            <span className="absolute rounded-full bg-white" style={{ inset: 3.57 }} />
            <span
              className="absolute inset-0 rounded-full"
              style={{
                background: color,
                transform: "scale(0.62)",
                transition: "transform 220ms cubic-bezier(0.2, 0, 0, 1)",
              }}
            />
          </>
        ) : (
          <span
            className="absolute inset-0 rounded-full"
            style={{ background: `url("${colorPickerUrl}") center / cover no-repeat` }}
          />
        )}
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
