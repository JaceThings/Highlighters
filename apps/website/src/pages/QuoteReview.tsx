import { useState, type ReactNode } from "react";
import { Highlight } from "@highlighters/react";
import type { HighlightOptions, MarkType, SnapMode, TipType } from "@highlighters/core";
import { PaperCard } from "../components/docs/PaperCard.tsx";
import { QUOTES } from "../playground/quotes.ts";
import { planMarks, type MarkStrategy } from "../playground/quote-marks.ts";
import { QuoteFrame, buildQuotePieces } from "../playground/quote-render.tsx";

// Scratch page: pick a quote, then see it marked on the real paper card (at the real /docs size)
// under EVERY documentation option - so the curated mark spans (quote-marks.ts) and the look of
// each setting can be eyeballed together. Each option uses a demonstrative value of that knob,
// its placement strategy, and the same defaults otherwise. Pills options (mark type, nib, cap,
// colour, snap) get a sub-toggle to flip between their values.

const BROWN = "#73574a";
const YELLOW = "#f7d054";

// The six designer inks (kept local so this dev page doesn't import the playground).
const SWATCHES = ["#f7d054", "#f4b460", "#ed78ab", "#7dd4fb", "#c6dfb6", "#b2cede"];

// Default config, matching the docs' initial options - every option below overrides just its knob.
const BASE: HighlightOptions = {
  color: YELLOW,
  markType: "highlight",
  opacity: 0.5,
  blendMode: "multiply",
  snap: "word",
  tip: { type: "chisel", width: 16, thickness: 4, angle: 8, overshoot: 2, overshootJitter: 1 },
  ink: { flow: 0.5, viscosity: 0.5, feathering: 0.3, streakiness: 0.35, dryout: 0.15, flowFade: 0.5, startEndBuildup: 0.25 },
  edge: { waviness: 1.5, frequency: 22, roughness: 0.3, cap: "round", radius: 4 },
  paper: { absorbency: 0.3 },
  glow: { enabled: false },
  animation: { draw: true, duration: 420, easing: "ease-out", stagger: 90 },
  renderer: "auto",
};

interface Sub {
  markType: MarkType;
  color: string;
  nib: TipType;
  cap: "flat" | "round" | "square";
  snap: SnapMode;
}
const SUB0: Sub = { markType: "highlight", color: YELLOW, nib: "chisel", cap: "round", snap: "word" };

type Control = "markType" | "color" | "nib" | "cap" | "snap" | null;

interface Demo {
  code: string;
  name: string;
  strategy: MarkStrategy;
  control: Control;
  note?: string;
}

// Every documentation option, in /docs order, with the placement strategy it uses and the
// demonstrative value shown (see optsFor). Pills options carry a `control` sub-toggle.
const DEMOS: Demo[] = [
  { code: "markType", name: "Mark type", strategy: "central", control: "markType" },
  { code: "color", name: "Colour", strategy: "central", control: "color" },
  { code: "opacity", name: "Opacity", strategy: "central", control: null, note: "opacity 0.3" },
  { code: "blendMode", name: "Overlap optics", strategy: "stack", control: null, note: "multiply, one word painted twice" },
  { code: "tip.type", name: "Nib shape", strategy: "central", control: "nib" },
  { code: "tip.angle", name: "Slant angle", strategy: "central", control: null, note: "chisel @ 35°" },
  { code: "tip.overshoot", name: "Overshoot", strategy: "ends", control: null, note: "overshoot 10px" },
  { code: "tip.overshootJitter", name: "End randomness", strategy: "ends", control: null, note: "jitter 6px" },
  { code: "ink.flow", name: "Ink flow", strategy: "central", control: null, note: "flow 0.9" },
  { code: "ink.viscosity", name: "Viscosity", strategy: "central", control: null, note: "viscosity 0.9" },
  { code: "ink.feathering", name: "Feathering", strategy: "central", control: null, note: "feathering 0.85" },
  { code: "ink.streakiness", name: "Streakiness", strategy: "central", control: null, note: "streakiness 0.85" },
  { code: "ink.dryout", name: "Dryout", strategy: "central", control: null, note: "dryout 0.55" },
  { code: "ink.flowFade", name: "Flow fade", strategy: "central", control: null, note: "flowFade 0.9" },
  { code: "edge.waviness", name: "Waviness", strategy: "central", control: null, note: "waviness 3.5" },
  { code: "edge.frequency", name: "Wave frequency", strategy: "central", control: null, note: "frequency 10" },
  { code: "edge.roughness", name: "Roughness", strategy: "central", control: null, note: "roughness 0.85" },
  { code: "edge.cap", name: "Cap style", strategy: "ends", control: "cap" },
  { code: "edge.radius", name: "Corner radius", strategy: "central", control: null, note: "radius 11" },
  { code: "paper.absorbency", name: "Paper absorbency", strategy: "central", control: null, note: "absorbency 0.9" },
  { code: "snap", name: "Snap", strategy: "central", control: "snap", note: "approx - span marks; live snap is on /docs" },
];

// Build the options for one option card: BASE with that single knob pushed to a demonstrative value.
function optsFor(code: string, sub: Sub): HighlightOptions {
  const o: HighlightOptions = { ...BASE };
  switch (code) {
    case "markType": o.markType = sub.markType; break;
    case "color": o.color = sub.color; break;
    case "opacity": o.opacity = 0.3; break;
    case "blendMode": o.blendMode = "multiply"; break; // the stack strategy paints the doubled word
    case "tip.type": o.tip = { ...o.tip, type: sub.nib }; break;
    case "tip.angle": o.tip = { ...o.tip, type: "chisel", angle: 35 }; break;
    case "tip.overshoot": o.tip = { ...o.tip, overshoot: 10 }; break;
    case "tip.overshootJitter": o.tip = { ...o.tip, overshootJitter: 6 }; break;
    case "ink.flow": o.ink = { ...o.ink, flow: 0.9 }; break;
    case "ink.viscosity": o.ink = { ...o.ink, viscosity: 0.9 }; break;
    case "ink.feathering": o.ink = { ...o.ink, feathering: 0.85 }; break;
    case "ink.streakiness": o.ink = { ...o.ink, streakiness: 0.85 }; break;
    case "ink.dryout": o.ink = { ...o.ink, dryout: 0.55 }; break;
    case "ink.flowFade": o.ink = { ...o.ink, flowFade: 0.9 }; break;
    case "edge.waviness": o.edge = { ...o.edge, waviness: 3.5 }; break;
    case "edge.frequency": o.edge = { ...o.edge, frequency: 10 }; break;
    case "edge.roughness": o.edge = { ...o.edge, roughness: 0.85 }; break;
    case "edge.cap": o.edge = { ...o.edge, cap: sub.cap }; break;
    case "edge.radius": o.edge = { ...o.edge, radius: 11 }; break;
    case "paper.absorbency": o.paper = { ...o.paper, absorbency: 0.9 }; break;
    case "snap": o.snap = sub.snap; break;
  }
  return o;
}

// One paper card: the quote marked with `options` under `strategy`, on the real /docs frame.
function MarkedPaper({
  quote,
  options,
  strategy,
  stamp,
}: {
  quote: (typeof QUOTES)[number];
  options: HighlightOptions;
  strategy: MarkStrategy;
  stamp: string;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const words = quote.text.split(" ");
  const plan = planMarks(quote, words, strategy);

  const mark = (children: ReactNode, seed: number) => (
    <Highlight as="span" options={{ ...options, seed }} host={host} key={`${seed}-${stamp}`}>
      {children}
    </Highlight>
  );
  // Outer band and inner doubles use the same mark, so overlap sub-spans paint twice (darken).
  const flat = buildQuotePieces(words, plan, mark, mark);

  return (
    <PaperCard>
      <QuoteFrame hostRef={setHost} author={quote.author}>
        {"“"}
        {flat}
        {"”"}
      </QuoteFrame>
    </PaperCard>
  );
}

function PillRow({ values, value, onChange }: { values: { v: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex overflow-hidden rounded-md" style={{ border: `1px solid ${BROWN}33` }}>
      {values.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className="cursor-pointer border-0 px-2.5 py-1"
          style={{ background: value === o.v ? BROWN : "transparent", color: value === o.v ? "#fff" : BROWN, fontSize: 11 }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// The per-option value sub-toggle (pills options only).
function SubControl({ demo, sub, setSub }: { demo: Demo; sub: Sub; setSub: (s: Sub) => void }) {
  switch (demo.control) {
    case "markType":
      return (
        <PillRow
          value={sub.markType}
          onChange={(v) => setSub({ ...sub, markType: v as MarkType })}
          values={[
            { v: "highlight", label: "Highlight" },
            { v: "underline", label: "Underline" },
            { v: "overline", label: "Overline" },
            { v: "strike-through", label: "Strike" },
          ]}
        />
      );
    case "nib":
      return (
        <PillRow
          value={sub.nib}
          onChange={(v) => setSub({ ...sub, nib: v as TipType })}
          values={[
            { v: "chisel", label: "Chisel" },
            { v: "bullet", label: "Bullet" },
            { v: "fine", label: "Fine" },
          ]}
        />
      );
    case "cap":
      return (
        <PillRow
          value={sub.cap}
          onChange={(v) => setSub({ ...sub, cap: v as Sub["cap"] })}
          values={[
            { v: "flat", label: "Flat" },
            { v: "round", label: "Round" },
            { v: "square", label: "Square" },
          ]}
        />
      );
    case "snap":
      return (
        <PillRow
          value={sub.snap}
          onChange={(v) => setSub({ ...sub, snap: v as SnapMode })}
          values={[
            { v: "none", label: "None" },
            { v: "word", label: "Word" },
            { v: "line", label: "Line" },
            { v: "glyph", label: "Glyph" },
          ]}
        />
      );
    case "color":
      return (
        <div className="flex gap-1.5">
          {SWATCHES.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => setSub({ ...sub, color: hex })}
              aria-label={hex}
              className="cursor-pointer rounded-full"
              style={{ width: 18, height: 18, background: hex, border: sub.color === hex ? `2px solid ${BROWN}` : "2px solid transparent" }}
            />
          ))}
        </div>
      );
    default:
      return null;
  }
}

function subValue(demo: Demo, sub: Sub): string {
  switch (demo.control) {
    case "markType": return sub.markType;
    case "nib": return sub.nib;
    case "cap": return sub.cap;
    case "snap": return sub.snap;
    case "color": return sub.color;
    default: return "";
  }
}

export function QuoteReview() {
  const [qi, setQi] = useState(0);
  const [sub, setSub] = useState<Sub>(SUB0);
  const [drawKey, setDrawKey] = useState(0);
  const quote = QUOTES[qi];

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-col">
          <h1 className="m-0" style={{ fontSize: 16, fontWeight: 600, color: BROWN }}>
            Quote {qi} × every option
          </h1>
          <p className="m-0" style={{ fontSize: 13, color: BROWN, opacity: 0.55 }}>
            How this quote highlights on each /docs card, on the real paper at the real size.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setQi((q) => (q - 1 + QUOTES.length) % QUOTES.length)} className="cursor-pointer rounded-md border-0 px-3 py-1.5" style={{ background: `${BROWN}22`, color: BROWN, fontSize: 13 }}>
            ‹ Prev
          </button>
          <select
            value={qi}
            onChange={(e) => setQi(Number(e.target.value))}
            className="cursor-pointer rounded-md px-2 py-1.5"
            style={{ border: `1px solid ${BROWN}33`, color: BROWN, fontSize: 13, maxWidth: 360 }}
          >
            {QUOTES.map((q, i) => (
              <option key={i} value={i}>
                {i} — {q.author}: {q.text.slice(0, 40).replace(/\n/g, " ")}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setQi((q) => (q + 1) % QUOTES.length)} className="cursor-pointer rounded-md border-0 px-3 py-1.5" style={{ background: `${BROWN}22`, color: BROWN, fontSize: 13 }}>
            Next ›
          </button>
          <button type="button" onClick={() => setDrawKey((k) => k + 1)} className="cursor-pointer rounded-md border-0 px-3 py-1.5" style={{ background: BROWN, color: "#fff", fontSize: 13 }}>
            Replay
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-9">
        {DEMOS.map((demo) => {
          const options = optsFor(demo.code, sub);
          const stamp = `${qi}-${drawKey}-${demo.code}-${subValue(demo, sub)}`;
          return (
            <section key={demo.code} className="flex flex-col gap-2" style={{ contentVisibility: "auto", containIntrinsicSize: "auto 360px" }}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-1.5" style={{ borderColor: `${BROWN}1f` }}>
                <h2 className="m-0 flex items-baseline gap-2" style={{ fontSize: 14, fontWeight: 650, color: BROWN }}>
                  {demo.name}
                  <span className="font-mono" style={{ fontSize: 11, fontWeight: 400, opacity: 0.5 }}>
                    {demo.code}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.4 }}>· {demo.strategy}</span>
                  {demo.note ? <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.4 }}>· {demo.note}</span> : null}
                </h2>
                <SubControl demo={demo} sub={sub} setSub={setSub} />
              </div>
              <MarkedPaper quote={quote} options={options} strategy={demo.strategy} stamp={stamp} />
            </section>
          );
        })}
      </div>
    </div>
  );
}
