// Dock height. Capsule height, cap SVG source-canvas height, and marker clip-frame
// height all scale off this - the pixel-tuned geometry breaks if they drift apart.
export const DOCK_H = 145;

// Duration of the dock's opaque ink crossfade (pen tips dissolve old->new). Shared so the
// row and the popover previews stay in lockstep. (Translucent marks morph in OKLCH instead -
// see useAnimatedColor - because crossfading translucent ink double-darkens.)
export const INK_FADE_MS = 180;
