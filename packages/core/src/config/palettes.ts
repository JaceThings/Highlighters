/** Curated palette families, each tuned so any pair of its swatches reads coherently for color-coding. Pure data. */

import type {
  ColorValue,
  Palette,
  PaletteName,
  PaletteSwatch,
} from "../types.js";

/** Each `swatches` map is ordered; that order is the color-coding cycle. */
export const PALETTES: Record<PaletteName, Palette> = {
  fluorescent: {
    name: "fluorescent",
    swatches: {
      yellow: "#fff14d",
      green: "#9bff5a",
      orange: "#ffb24d",
      pink: "#ff6fae",
      blue: "#5ad7ff",
      purple: "#c08bff",
    },
  },
  mild: {
    name: "mild",
    swatches: {
      yellow: "#f5e6a8",
      green: "#bfe0b2",
      blue: "#aacfe0",
      pink: "#eec2cf",
      orange: "#f0cdb0",
      purple: "#cdc1e0",
    },
  },
  vintage: {
    name: "vintage",
    swatches: {
      mustard: "#e3c567",
      olive: "#bcc06a",
      rust: "#d99873",
      rose: "#d39ba0",
      teal: "#7fb3a8",
      plum: "#a98bb0",
    },
  },
  neutral: {
    name: "neutral",
    swatches: {
      sand: "#e7dcc4",
      stone: "#d8d2c4",
      clay: "#dcc3b0",
      sage: "#cdd6c2",
      slate: "#c4ccd2",
      taupe: "#d3c8c2",
    },
  },
  calm: {
    name: "calm",
    swatches: {
      sky: "#bcd6ec",
      mint: "#bfe4d6",
      lavender: "#cfcae8",
      blush: "#ecd2da",
      seafoam: "#c6e3df",
      periwinkle: "#c2cce8",
    },
  },
};

/** Default swatch per family: the least-text-obscuring hue. */
const DEFAULT_SWATCH_NAMES: Record<PaletteName, string> = {
  fluorescent: "yellow",
  mild: "yellow",
  vintage: "mustard",
  neutral: "sand",
  calm: "sky",
};

/** Return a palette family by name. Throws on an unknown family. */
export function getPalette(name: PaletteName): Palette {
  const palette = PALETTES[name];
  if (!palette) {
    throw new Error(`@highlighters: unknown palette "${name}"`);
  }
  return palette;
}

/** Resolve a `{ palette, swatch }` reference to a {@link ColorValue}. Throws on an unknown swatch. */
export function resolveSwatch(ref: PaletteSwatch): ColorValue {
  const palette = getPalette(ref.palette);
  const color = palette.swatches[ref.swatch];
  if (color === undefined) {
    throw new Error(
      `@highlighters: unknown swatch "${ref.swatch}" in palette "${ref.palette}"`,
    );
  }
  return color;
}

/** The default color for a family. */
export function defaultSwatch(name: PaletteName): ColorValue {
  return resolveSwatch({ palette: name, swatch: DEFAULT_SWATCH_NAMES[name] });
}
