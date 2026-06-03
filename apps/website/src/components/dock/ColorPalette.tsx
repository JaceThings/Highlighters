import colorPickerUrl from "./color-picker.svg";

// `ring` is the selected outline — solid, since box-shadow can't take a gradient.
interface Swatch {
  id: string;
  label: string;
  color: string;
  ring: string;
  background?: string;
}

const SWATCHES: Swatch[] = [
  { id: "brown", label: "Brown ink", color: "#6f584c", ring: "#6f584c" },
  { id: "blue", label: "Blue ink", color: "#3b7cf5", ring: "#3b7cf5" },
  { id: "green", label: "Green ink", color: "#54c45f", ring: "#54c45f" },
  { id: "yellow", label: "Yellow ink", color: "#f5c842", ring: "#f5c842" },
  { id: "red", label: "Red ink", color: "#ee4a3d", ring: "#ee4a3d" },
  {
    id: "rainbow",
    label: "Custom colour",
    color: "#a855f7",
    ring: "#9a918a",
    background: `url("${colorPickerUrl}") center / cover no-repeat`,
  },
];

export function ColorPalette({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-x-[14px] gap-y-[14px]">
      {SWATCHES.map((s) => {
        const isSelected = s.color === value;
        return (
          <button
            key={s.id}
            type="button"
            aria-label={s.label}
            aria-pressed={isSelected}
            onClick={() => onChange(s.color)}
            data-focus-ring
            // Never scale the button itself — it shifts the hit area out from under
            // the pointer and the click misfires. Press-scale lives on the visual layer.
            className="group relative size-[43px] shrink-0 rounded-full"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-full transition-transform duration-150 group-active:scale-[0.96]"
              style={{
                background: "#fff",
                boxShadow: `inset 0 0 0 3.57px ${s.ring}`,
              }}
            >
              {/* Colour disc: fills when unselected; shrinks on select to reveal the ring. */}
              <span
                className="absolute inset-0 rounded-full"
                style={{
                  background: s.background ?? s.color,
                  transformOrigin: "center",
                  transform: isSelected ? "scale(0.703)" : "scale(1)",
                  // Faster on select (ring pops in), slower on deselect (disc eases back).
                  transition: isSelected
                    ? "transform 220ms cubic-bezier(0.2, 0, 0, 1)"
                    : "transform 300ms cubic-bezier(0.6, 0, 0.35, 1)",
                }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}
