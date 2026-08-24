import colorPickerUrl from "./color-picker.svg";
import { INK_FADE_MS } from "./constants.ts";
import { playColorBloop, primeMarkerAudio } from "../../lib/marker-audio.ts";

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

const WHEEL = `url("${colorPickerUrl}") center / cover no-repeat`;

function mirrorRows<T>(items: T[], cols: number): T[] {
  const out: T[] = [];
  for (let i = 0; i < items.length; i += cols) out.push(...items.slice(i, i + cols).reverse());
  return out;
}

export function ColorPalette({
  value,
  onChange,
  onActivateCustom,
  columns = 3,
  mirror = false,
}: {
  value: string;
  onChange: (color: string) => void;
  onActivateCustom: (button: HTMLButtonElement) => void;
  columns?: number;
  mirror?: boolean;
}) {
  const customActive = !PRESET_COLORS.has(value);
  const items = [
    ...SWATCHES.map((s) => (
      <Disc
        key={s.id}
        label={s.label}
        ring={s.ring}
        fill={s.color}
        selected={s.color === value}
        onClick={() => {
          playColorBloop();
          onChange(s.color);
        }}
      />
    )),
    <CustomDisc
      key="custom"
      active={customActive}
      color={value}
      onClick={(btn) => {
        playColorBloop();
        onActivateCustom(btn);
      }}
    />,
  ];
  return (
    <div
      className="grid gap-x-[14px] gap-y-[14px]"
      style={{ gridTemplateColumns: `repeat(${columns}, 43px)` }}
      onPointerEnter={primeMarkerAudio}
    >
      {mirror ? mirrorRows(items, columns) : items}
    </div>
  );
}

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
          <span className="absolute inset-0 rounded-full" style={{ background: WHEEL }} />
          <span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: color, opacity: active ? 1 : 0, transition: `background-color ${INK_FADE_MS}ms ease, opacity 300ms ease` }}
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
      className="group relative size-[43px] shrink-0 rounded-full"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full transition-transform duration-150 group-active:scale-[0.96]"
        style={{ background: "#fff", boxShadow: `inset 0 0 0 3.57px ${ring}` }}
      >
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: fill,
            transformOrigin: "center",
            transform: selected ? "scale(0.703)" : "scale(1)",
            transition: selected
              ? "transform 220ms cubic-bezier(0.2, 0, 0, 1)"
              : "transform 300ms cubic-bezier(0.6, 0, 0.35, 1)",
          }}
        />
      </span>
    </button>
  );
}
