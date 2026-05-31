// The dock's fixed pixel height (Figma "Toolbar" content = 145). Three things
// scale off this one number — capsule height, cap SVG's native source-canvas
// height, and marker clip-frame height — and the pixel-tuned geometry only works
// if they stay in lockstep. Centralised so they can't drift apart.
export const DOCK_H = 145;
