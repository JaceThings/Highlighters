import { useEffect } from "react";
import { DialRoot, useDialKit } from "dialkit";
import "dialkit/styles.css";
import { DEFAULT_TUNING, setPreview, setTipTune } from "./outline-tuning.ts";
import { setCircleSpeed, setCirclePitch } from "../../lib/marker-audio.ts";

// Dev-only DialKit panel driving the marker-outline tuning store (outline-tuning.ts). Pick a
// Preview to force a pen's outline visible, then dial X/Y/Scale. Sliders seed from DEFAULT_TUNING.
type Dial = [number, number, number, number]; // [default, min, max, step]
const nudge = (def: number): Dial => [def, -24, 24, 0.5];
const scaleDial = (def: number): Dial => [def, 0.7, 1.4, 0.01];

const PREVIEW_TO_TIP = { off: null, chisel: "slant", bullet: "round", fine: "fine" } as const;

export function OutlineDials() {
  const { slant, round, fine } = DEFAULT_TUNING;
  const p = useDialKit("Marker outlines", {
    preview: { type: "select", options: ["off", "chisel", "bullet", "fine"], default: "off" },
    chisel: { x: nudge(slant.dx), y: nudge(slant.dy), scale: scaleDial(slant.scale) },
    bullet: { x: nudge(round.dx), y: nudge(round.dy), scale: scaleDial(round.scale) },
    fine: { x: nudge(fine.dx), y: nudge(fine.dy), scale: scaleDial(fine.scale) },
    // Circle pop: speed = ring-draw length, pitch = audio rate (independent; baked together later).
    circlePop: {
      speed: [1, 0.4, 2.5, 0.05] as [number, number, number, number],
      pitch: [1, 0.5, 2, 0.02] as [number, number, number, number],
    },
  });

  useEffect(() => {
    setCircleSpeed(p.circlePop.speed);
  }, [p.circlePop.speed]);
  useEffect(() => {
    setCirclePitch(p.circlePop.pitch);
  }, [p.circlePop.pitch]);

  useEffect(() => {
    setTipTune("slant", { dx: p.chisel.x, dy: p.chisel.y, scale: p.chisel.scale });
  }, [p.chisel.x, p.chisel.y, p.chisel.scale]);
  useEffect(() => {
    setTipTune("round", { dx: p.bullet.x, dy: p.bullet.y, scale: p.bullet.scale });
  }, [p.bullet.x, p.bullet.y, p.bullet.scale]);
  useEffect(() => {
    setTipTune("fine", { dx: p.fine.x, dy: p.fine.y, scale: p.fine.scale });
  }, [p.fine.x, p.fine.y, p.fine.scale]);
  useEffect(() => {
    setPreview(PREVIEW_TO_TIP[p.preview as keyof typeof PREVIEW_TO_TIP] ?? null);
  }, [p.preview]);

  return <DialRoot position="top-right" theme="dark" />;
}
