import { useEffect } from "react";
import { DialRoot, useDialKit } from "dialkit";
import "dialkit/styles.css";
import { DEFAULT_TUNING, setPreview, setTipTune } from "./outline-tuning.ts";
import type { PenTip } from "../../selection-style.tsx";
import { setRumble } from "../../lib/marker-audio.ts";

type Dial = [number, number, number, number];
const dial = (def: number, min: number, max: number, step: number): Dial => [def, min, max, step];
const nudge = (def: number): Dial => dial(def, -24, 24, 0.5);
const scaleDial = (def: number): Dial => dial(def, 0.7, 1.4, 0.01);

const PREVIEW_TO_TIP = new Map<string, PenTip>([
  ["chisel", "slant"],
  ["bullet", "round"],
  ["fine", "fine"],
]);

export function OutlineDials() {
  const { slant, round, fine } = DEFAULT_TUNING;
  const p = useDialKit("Marker outlines", {
    preview: { type: "select", options: ["off", "chisel", "bullet", "fine"], default: "off" },
    chisel: { x: nudge(slant.dx), y: nudge(slant.dy), scale: scaleDial(slant.scale) },
    bullet: { x: nudge(round.dx), y: nudge(round.dy), scale: scaleDial(round.scale) },
    fine: { x: nudge(fine.dx), y: nudge(fine.dy), scale: scaleDial(fine.scale) },
    rumble: {
      cutoff: dial(160, 40, 1500, 10),
      q: dial(0.9, 0.1, 8, 0.1),
      gain: dial(0.045, 0, 0.2, 0.005),
      fadeIn: dial(0.25, 0, 1, 0.02),
      fadeOut: dial(0.4, 0, 1.5, 0.02),
    },
  });

  useEffect(() => {
    setRumble(p.rumble);
  }, [p.rumble.cutoff, p.rumble.q, p.rumble.gain, p.rumble.fadeIn, p.rumble.fadeOut]);

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
    setPreview(PREVIEW_TO_TIP.get(p.preview) ?? null);
  }, [p.preview]);

  return <DialRoot position="top-right" theme="dark" />;
}
