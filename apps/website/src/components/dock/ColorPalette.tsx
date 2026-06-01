// The compact ink well: two rows of three. The last is the "custom" hue wheel
// (placeholder for a future picker). Controlled — the selected swatch is the one
// matching `value`; clicking reports its ink colour.
//
// `color` is the ink value (and what click reports). `ring` is the selected-state
// outline — solid, since box-shadow can't take a gradient, so the wheel borrows a
// neutral warm grey. `background` defaults to `color`; the wheel paints a conic gradient.
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
    background:
      "conic-gradient(from 90deg, #ff3b30, #ffcc00, #34c759, #00c7be, #007aff, #af52de, #ff2d55, #ff3b30)",
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
            // The button is the click target and is NEVER scaled — its 43px hit
            // area stays put. The press-scale lives on the (pointer-events:none)
            // visual layer below, via group-active. Scaling the button itself
            // shrank its bounds out from under the pointer on an edge press, so the
            // pointerup landed outside and the click never fired (you'd see the
            // bounce but the colour wouldn't swap).
            className="group relative size-[43px] shrink-0 rounded-full"
          >
            {/* Visual layer: white gap + fixed ink ring. Scales on press so the
                whole swatch (ring + disc nested inside) gives the tactile dip,
                while the button's hit area underneath is unaffected. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-full transition-transform duration-150 group-active:scale-[0.96]"
              style={{
                background: "#fff",
                boxShadow: `inset 0 0 0 3.57px ${s.ring}`,
              }}
            >
              {/* The colour value disc: fills the swatch when unselected (covering
                  ring + gap). On select it scales down to ~30px, revealing the white
                  gap and fixed edge ring — the ring stays put, only the disc animates. */}
              <span
                className="absolute inset-0 rounded-full"
                style={{
                  background: s.background ?? s.color,
                  transformOrigin: "center",
                  transform: isSelected ? "scale(0.703)" : "scale(1)",
                  // Directional: ring pops IN fast on select (disc shrinks away). On
                  // DESELECT the disc grows back slower with a gentle ease-in-out so it
                  // doesn't snap shut — you see the ring leave. (CSS uses the transition
                  // declared on the target state.)
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
