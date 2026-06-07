// Dock height. Capsule, cap SVG, and marker clip-frame all scale off this; don't let them drift apart.
export const DOCK_H = 145;

// Opaque ink crossfade (pen tips dissolve old->new), shared so row + popovers stay in lockstep.
// Translucent marks morph in OKLCH instead (useAnimatedColor): crossfading translucent ink double-darkens.
export const INK_FADE_MS = 180;

// Desktop dock shrink tiers (viewport width, px). The full tray is ~730px wide; as the window
// narrows we shed sections so it never crowds the edges: drop the colour palette first, then the
// pens (leaving just nav + links, like the touch dock). Tune these if the spacing feels off.
export const DOCK_COLORS_MIN = 800; // at or above: show the colour palette
export const DOCK_PENS_MIN = 600; // at or above: show the pens (below: nav + links only)
