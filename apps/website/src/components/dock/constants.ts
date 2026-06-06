// Dock height. Capsule, cap SVG, and marker clip-frame all scale off this; don't let them drift apart.
export const DOCK_H = 145;

// Opaque ink crossfade (pen tips dissolve old->new), shared so row + popovers stay in lockstep.
// Translucent marks morph in OKLCH instead (useAnimatedColor): crossfading translucent ink double-darkens.
export const INK_FADE_MS = 180;
