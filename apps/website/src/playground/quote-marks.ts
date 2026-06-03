// What part of a quote each demo highlights, and how. The strategy is chosen so the mark
// actually demonstrates the option: ends-of-quote for overshoot/caps (you see the boundaries),
// a central phrase for most, a central phrase with one doubled word for the stack toggle.

import { QUOTES, shuffle, type Quote } from "./quotes.ts";

export type MarkStrategy = "central" | "ends" | "stack";

// Keyed by demo title. Anything absent is "central".
const STRATEGY: Record<string, MarkStrategy> = {
  "tip.overshoot": "ends",
  "tip.overshootJitter": "ends",
  "edge.cap": "ends",
  "edge.radius": "ends",
  "blendMode (stack)": "stack",
};

export function strategyFor(title: string): MarkStrategy {
  return STRATEGY[title] ?? "central";
}

export interface MarkPlan {
  ranges: [number, number][]; // [start, end) word indices to highlight
  overlap?: number; // word index painted a second time (stack demo)
}

// A word too slight to stand alone as a mark on its own line ("if", "a", "to", …).
function isSlight(word: string): boolean {
  return word.replace(/[^\p{L}\p{N}]/gu, "").length <= 2;
}

/**
 * Word ranges to highlight for a quote under a strategy. Ranges sit on word boundaries and never
 * begin or end on a slight word, so a mark is never a lone "if" on a line.
 */
export function planMarks(words: string[], strategy: MarkStrategy): MarkPlan {
  const n = words.length;

  if (strategy === "ends" && n >= 6) {
    let kf = 2;
    while (kf < n && isSlight(words[kf - 1])) kf++; // don't end the front mark on a slight word
    let kb = 2;
    while (kb < n && isSlight(words[n - kb])) kb++; // don't start the back mark on a slight word
    const half = Math.floor(n / 2);
    kf = Math.min(kf, half - 1);
    kb = Math.min(kb, half - 1);
    if (kf >= 2 && kb >= 2 && kf + kb <= n - 1) {
      return { ranges: [[0, kf], [n - kb, n]] };
    }
    // too short to split cleanly - fall through to central
  }

  if (strategy === "stack") {
    // A compact mark on the quote's first line: one clean band with a single doubled word,
    // so the overlap reads as one darker spot rather than a band split across a wrap.
    const end = Math.min(n, 4);
    let m = 0;
    while (m < end - 1 && isSlight(words[m])) m++;
    return { ranges: [[0, end]], overlap: m };
  }

  let a = Math.min(n - 1, Math.floor(n * 0.2));
  let b = Math.max(a + 1, Math.ceil(n * 0.8));
  while (a < b - 1 && isSlight(words[a])) a++;
  while (b - 1 > a && isSlight(words[b - 1])) b--;

  return { ranges: [[a, b]] };
}

// Quotes hand-picked to read well under each demo's strategy (indices into QUOTES),
// keyed by demo title. A section randomly draws one per load; titles absent fall back
// to any quote. Ends-marked sections (overshoot, caps, radius) get quotes with strong
// opening AND closing phrases; the rest get quotes with a strong middle.
export const SECTION_QUOTES: Record<string, number[]> = {
  markType: [7, 15, 16, 23],
  color: [18, 22, 13, 14],
  opacity: [8, 24, 1, 11],
  "blendMode (stack)": [12, 13, 18, 14],
  "tip.type": [12, 15, 11, 0],
  "tip.angle": [5, 3, 13, 8],
  "tip.overshoot": [10, 2, 20, 21],
  "tip.overshootJitter": [3, 19, 24, 25],
  "ink.flow": [1, 22, 23, 7],
  "ink.viscosity": [12, 15, 5, 14],
  "ink.feathering": [13, 16, 18, 22],
  "ink.streakiness": [19, 8, 25, 1],
  "ink.dryout": [8, 12, 5, 20],
  "ink.flowFade": [16, 20, 18, 21],
  "edge.waviness": [24, 21, 2, 25],
  "edge.frequency": [10, 4, 11, 23],
  "edge.roughness": [12, 11, 0, 17],
  "edge.cap": [4, 10, 17, 2],
  "edge.radius": [20, 19, 3, 17],
  "paper.absorbency": [22, 7, 16, 13],
  snap: [6, 5, 15, 18],
};

/**
 * One quote per demo (titles in order). Each draws from its curated candidates,
 * preferring one not yet shown on the page and whose author hasn't appeared in the
 * last two, so the page stays varied. Sections with no curated list take any unused quote.
 */
export function buildCuratedQuotes(titles: string[]): Quote[] {
  const used = new Set<Quote>();
  const out: Quote[] = [];
  for (const title of titles) {
    const a1 = out[out.length - 1]?.author;
    const a2 = out[out.length - 2]?.author;
    const curated = shuffle((SECTION_QUOTES[title] ?? []).map((i) => QUOTES[i]).filter(Boolean));
    const fresh = (pool: Quote[]) =>
      pool.find((q) => !used.has(q) && q.author !== a1 && q.author !== a2) ??
      pool.find((q) => !used.has(q));
    const pick = fresh(curated) ?? fresh(shuffle(QUOTES)) ?? curated[0] ?? QUOTES[0];
    used.add(pick);
    out.push(pick);
  }
  return out;
}
