# How Highlighters Actually Work

> Field notes behind `@highlighters`. This is the real-world research the library's design is grounded in — the physics of ink on paper, the engineering inside the pen, and what the great brands (especially the Japanese ones) figured out. If you want product recommendations instead, see **[buying-guide.md](./buying-guide.md)**.

---

## TL;DR

- A highlighter is a **self-regulating capillary system**, not a squeeze tube. Ink is pulled reservoir → wick → nib → paper along an engineered suction gradient and only releases when paper offers a smaller pore to out-pull the nib.
- The ink is **~1–10% dissolved fluorescent dye** in water + humectant + buffer. *Dissolved* (not pigment) = transparent, so you read through it.
- **Fluorescence adds light.** Dye absorbs UV and re-emits visible light (the Stokes shift), so a highlight can be physically *brighter* than the paper around it. This is why our renderer treats glow as additive, not just a tint.
- **Overlap darkening = the multiply blend** (Beer–Lambert). Two passes filter the light twice.
- The famous Japanese moves: **readable muted color** (Mildliner), **see-through tip** (Uni Propus), **erasable ink** (Pilot FriXion), **one-tip-many-widths** (Kokuyo Beetle), **anti-pool guardrails** (Pilot Kire-Na). The throughline, and the Japan Stationery Award criterion: *remove friction and protect readability, don't chase novelty.*

---

## 1. The mechanism: a capillary machine

Ink moves entirely by **capillary action** through a deliberately tuned gradient of pore sizes:

| Stage | Role | Pore size (Porex spec) |
|---|---|---|
| **Reservoir** ("ink charge") | A plug of spun-polyester/felt fiber soaked in ink. Holds ink in inter-fiber voids — weak grip. | large |
| **Wick / feed** | A fibrous or channeled rod bridging reservoir → nib. The rate-limiting throat. | medium |
| **Nib (chisel tip)** | Felt, needled-polyester, or sintered porous plastic. Strongest pull. | small (head 10–30 µm) |

Because suction *increases* from reservoir to tip, ink is continuously drawn toward the nib but never faster than the tip can surrender it. **Flow only happens when the paper provides an even smaller pore that out-pulls the nib** — lift the pen and flow stops. That's why a marker doesn't just empty itself.

Two reservoir architectures exist:
- **Fiber-reservoir** (most pens): steady, low-leak, lower max flow, gets skippy as it empties.
- **Free-ink / liquid-feed** (premium, fountain-pen-style comb feed): juicier, holds more, but needs active flow regulation to avoid flooding.

> **In the library:** this is the `ink.flow`/`juiciness` + `viscosity` model plus an internal "ink budget" that depletes along a fast stroke and refills at a feed rate — which is what produces a darker start (a re-saturated tip) and skipping when you move faster than the feed.

## 2. The ink: why it's transparent and neon

A representative aqueous highlighter ink (per the Avery patent family):

- **~1–10 wt% dissolved dye** (examples use 2% Basic Yellow 40 / Acid Yellow 23). *Dissolved* dye has no light-scattering particles → **transparent**, so text shows through. Pigment (solid particles) would be more lightfast but more opaque and clog-prone, so it's rarer in highlighters.
- **~16% glycerol / glycol humectants** — hold water so the nib doesn't dry between uses.
- **Acid buffer (pH)** — for dyes like **pyranine**, pH literally sets the fluorescent color (it only fluoresces strongly when deprotonated).
- **Surfactant** (wets nib + varied papers evenly) + **biocide** (it's water; things grow).

The formulator is balancing three coupled axes: **flow vs bleed vs dry-time.** Lower viscosity/surface tension → more flow but more feathering; more volatile solvent → faster page-dry but faster nib dry-out.

## 3. Fluorescence: brighter than the paper

Fluorescent dyes (pyranine for yellow-green, rhodamine for pink, etc.) **absorb high-energy UV/short-visible photons and re-emit them at a longer visible wavelength** — the **Stokes shift**. The payoff (per WTAMU physics):

> An ordinary white surface can at best *reflect* the visible light hitting it. A fluorescent surface reflects its share **and manufactures new visible photons out of incident UV** — so it is physically brighter in the visible band than the paper around it.

That is the entire reason a highlight "pops." A screen can't out-emit its own white, so we **fake it additively**: a glow/screen pass on top of the multiply ink, optionally driven by a simulated "UV/ambient" amount.

## 4. The "juicy vs dry" spectrum and skipping

- **Juicy** = low viscosity + high capillary feed + soft nib (bigger contact patch) → heavy laydown, more spread/feather.
- **Dry / skipping** = **deposition demand > feed supply.** Caused by solvent evaporation thickening the tip, fiber compaction matting the pores, or just moving faster than the feed replenishes. Cheap markers skip early because their fiber packing is uneven.

So "streaky and uneven" is, ironically, *bad* in a real highlighter but is the **#1 authenticity tell** we want to optionally simulate (the `streakiness` and `dryout` params).

## 5. Bleed and feathering (two different things)

- **Feathering** — ink wicks *laterally* along paper fibers, fuzzing the edge in-plane before it dries.
- **Bleed-through** — ink penetrates *through* the sheet to the back.

Paper controls both via **sizing** (fills inter-fiber gaps so ink sits up — "works like a raincoat"), coating, and GSM. Rule of thumb: below ~80 gsm most papers can't stop migration; ~90 gsm + good sizing is reliable — but *GSM is weight, not quality*; a well-sized 70 gsm beats a poorly-sized 90 gsm.

> **In the library:** `feathering` = soft, fiber-noised, irregular edge that grows with wetness and shrinks with paper sizing. `paper.absorbency` modulates it. (Bleed-through to a "back of page" is deferred — see the blueprint's out-of-scope list.)

## 6. Quality, in manufacturing terms

What separates a premium marker from a cheap one is **consistency and tolerances**: tight ink viscosity/pH/dye batches, *uniform* reservoir fiber density (so it delivers the maximum % of its ink instead of stranding it), precise nib pore size and chisel geometry, and a cap that stays airtight over many cycles (the dominant shelf-life factor). Sintered/bonded nibs hold their chisel for life; cheap felt frays and mushrooms.

> **In the library:** `quality` is modeled as **variance injection** — premium = low stroke-to-stroke variance (even coverage, crisp edges, stable color, suppressed pooling); cheap = jittered flow/feather/edges and earlier skipping.

## 7. What the great Japanese brands actually do

The Japanese highlighter scene is where most of the *ergonomic* innovation lives. Five repeatable moves:

### Zebra Mildliner — readable muted color
The cult icon. "Mild" = deliberately **low-density, desaturated, translucent** ink so the page stays calm and text stays legible. 41 curated colors organized by **mood** (Mild / Warm / Cool / Friendly / Neutral / Calm), not rainbow order. Water-based **pigment**, layers beautifully via multiply, twin-tip (broad chisel + fine bullet). Its one flaw: it smears wet ink, so pair with ballpoint or laser print. → our **`mild` palette family + default preset**.

### Uni Propus Window — the see-through tip
A transparent **notch cut into the chisel tip** so you see the text *through* the nib and stop exactly at the line end — no overshoot into the margin. Pure geometric genius. → our **snap-to-bounds (`word`/`line`/`glyph`)** mode.

### Pilot FriXion Light — erasable (thermochromic)
Ink made of ~2–3 µm microcapsules of **leuco dye + developer + temperature regulator**. Friction heat (~60–65 °C) breaks the color bond → invisible; freezing (~−20 °C) restores it. The only mainstream erasable highlighter. Caveat: a hot car erases your notes. → our **removable/toggleable highlight layers + "rub-to-erase" fade**.

### Kokuyo Beetle Tip 3way — one nib, three widths
A beetle-horn-shaped nib gives **fine / broad / double-parallel-line** depending on the face/angle you press. 2007 Design Award. → angle-driven stroke + a `double-line` style.

### Pilot Kire-Na — anti-pool guardrails (2025 award winner)
Grand Prize at the Japanese Stationery Store Award. Two small **plastic rails flank the chisel tip** to keep strokes straight and **reduce ink pooling at the edges**; a flexible tip conforms to curved book pages; a flat thumb-rest stabilizes pen angle. → our **bidirectional `startEndBuildup` with an anti-pool "guardrail" mode** (premium pens fight pooling; cheap ones pool).

Others worth knowing: **Tombow** (Play Color = vivid dye; Kei Coat = archival pigment, refillable) cleanly demonstrates the **dye vs pigment** axis; **Sun-Star** Ninipie (rotate to switch highlighter/fineliner), Decot (light ink legible *over* dark ink), LAMECO (shimmer).

## 8. The awards

**日本文具大賞 / Nihon Bungu Taishō** (Japan Stationery Award), announced at **ISOT Tokyo**, with **Design** and **Function** tracks (plus Grand Prize). The consistent judging criterion — and a good design north star for this whole library:

> **Reward friction-removal and everyday practicality over novelty.** Visibility while marking, no overshoot, no pooling, readability-preserving color, one-tool-many-outputs, reversibility.

Every default in `@highlighters` is chosen in that spirit: maximize legibility, minimize the user having to think.

## 9. The physics → library parameter map

| Real mechanism | Library parameter(s) |
|---|---|
| Capillary feed gradient / wick density | `ink.flow` + internal feed-rate / ink-budget |
| Reservoir depletion along a stroke | start-of-stroke bloom, end-of-stroke fade |
| Ink viscosity | `ink.viscosity` → flow, pooling, edge dry speed, skip frequency |
| Surface tension / surfactant | feather + coverage evenness |
| Dye load (~1–10%) | `color` + `opacity` (multiply → text show-through) |
| Fluorescence (Stokes shift, *added* light) | `fluorescence`/`glow` → **additive** layer; can exceed paper brightness |
| Dissolved dye vs pigment | **`colorant` master axis** (vivid+feathery+smears ↔ muted+clean+archival) |
| Solvent evaporation + fiber compaction | `dryout` / `streakiness` |
| Cap seal / uncapped death | (session-state concept; not a per-stroke param) |
| Paper feathering | `feathering` + `paper.absorbency` |
| Window tip precision | **snap-to-bounds** (`word`/`line`/`glyph`) |
| Guardrails (anti-pool) | bidirectional `startEndBuildup` / quality `premium` |
| Manufacturing consistency | `quality` → variance injection |
| Muted curated palette | `mild` palette family (default) |

---

### Sources
Compound Interest (dye chemistry) · WTAMU "what makes a highlighter bright" (additive fluorescence) · Avery/Sanford ink patents US8007096, US8562729 (anti-smear), US5698614 (fluorescent ink) · Porex porous-nib engineering + US20170209894 (capillary-gradient pore design), US6117260 (nib classes), US7022200 (bonded nibs) · Pyranine Stokes-shift/quantum-yield papers · Fountain Pen Revolution (feathering vs bleed) · Zebra Mildliner guides · Pilot FriXion (Nippon.com, McGill OSS, RSC Education on leuco dyes) · Uni Propus, Kokuyo Beetle, Pilot Kire-Na (JetPens, bungu.store) · JetPens "Best of Japan's Stationery Awards".
