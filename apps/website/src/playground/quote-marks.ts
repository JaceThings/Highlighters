// What part of a quote each demo highlights, and how. Strategy picks the shape (ends for
// overshoot/caps, a central phrase for most, a clause with doubled sub-spans for overlap); CURATED
// picks WHERE per quote, since a positional slice often cuts mid-thought. Positional is the fallback.

import { QUOTES, shuffle, type Quote } from "./quotes.ts";

export type MarkStrategy = "central" | "ends" | "stack";

// Keyed by demo title. Anything absent is "central". Overshoot/jitter/cap show their ends, so
// they get two (or one) end bands; corner radius reads best on one clean band, so it's central.
const STRATEGY: Record<string, MarkStrategy> = {
  "tip.overshoot": "ends",
  "tip.overshootJitter": "ends",
  "edge.cap": "ends",
  "blendMode": "stack",
};

export function strategyFor(title: string): MarkStrategy {
  return STRATEGY[title] ?? "central";
}

export interface MarkPlan {
  ranges: [number, number][]; // [start, end) word indices to highlight
  doubles?: [number, number][]; // sub-ranges (within a band) painted a second time (overlap optics)
}

/**
 * The hand-picked mark for one quote.
 * - `central`: the single phrase to band for most demos (and corner radius).
 * - `ends`: one or two [opening, closing] phrases for the boundary demos.
 * - `stack`: a `band` clause plus the `doubles` sub-spans inside it painted twice - the darker
 *   overlap. Each is matched against the quote's words by text (ignoring surrounding punctuation
 *   and case), so a typo just falls back to the positional algorithm.
 */
interface CuratedPlan {
  central?: string;
  ends?: string[];
  stack?: { band: string; doubles: string[] };
}

// Indexed into QUOTES (trailing comment names the speaker). Each phrase is the part of the quote
// that carries the line, so the mark reads as a deliberate highlight rather than an arithmetic slice.
const CURATED: Record<number, CuratedPlan> = {
  0: { central: "never cruel", ends: ["Helly was never cruel"], stack: { band: "Helly was never cruel", doubles: ["cruel"] } }, // Bailiff
  1: { central: "advertisements on my eyelids", ends: ["the air I breathe"], stack: { band: "advertisements on my eyelids", doubles: ["advertisements", "eyelids"] } }, // Davis
  2: { central: "grateful for seats at the table", ends: ["And you'll be grateful", "the bench is unstable"], stack: { band: "grateful for seats at the table", doubles: ["seats at the table"] } }, // Holgate
  3: { central: "pay off your grave", ends: ["You may waste your days", "leased you your cradle"], stack: { band: "pay off your grave since we leased you your cradle", doubles: ["grave", "cradle"] } }, // Holgate
  4: { central: "no enemy ever wronged me", ends: ["No friend ever served me", "repaid in full"], stack: { band: "no enemy ever wronged me", doubles: ["wronged me"] } }, // Sulla
  5: { central: "die on your feet", ends: ["die on your feet", "live on your knees"], stack: { band: "to die on your feet than to live on your knees", doubles: ["die on your feet"] } }, // Zapata
  6: { central: "ordering you to die", ends: ["Men, I am not ordering you to attack", "die."], stack: { band: "I am ordering you to die", doubles: ["die"] } }, // Atatürk
  7: { central: "turn people into homes", ends: ["Child, why did", "turn people into homes"], stack: { band: "why did no one ever teach you that you cannot turn people into homes", doubles: ["people", "homes"] } }, // Gill
  8: { central: "God help the tanks", ends: ["Onward we stagger", "God help the tanks"], stack: { band: "And if the tanks come, then God help the tanks", doubles: ["then God help the tanks"] } }, // Gruber
  10: { central: "judge a fish by its ability to climb a tree", ends: ["If you judge a fish", "believing that it is stupid."], stack: { band: "judge a fish by its ability to climb a tree", doubles: ["fish", "tree"] } }, // Unknown
  11: { central: "a fool every night but one", ends: ["machete", "but one."], stack: { band: "a fool every night but one", doubles: ["but one"] } }, // McElroy
  12: { central: "falling knife has no handle", ends: ["A falling", "no handle"], stack: { band: "A falling knife has no handle", doubles: ["no handle"] } }, // Unknown
  13: { central: "dying of thirst watching another man drown", ends: ["I am a man", "another man drown"], stack: { band: "a man dying of thirst watching another man drown", doubles: ["thirst", "drown"] } }, // Dragon Ball Z
  14: { central: "too strong of an emotion to waste", ends: ["Hatred is too strong", "someone you don't like"], stack: { band: "too strong of an emotion to waste", doubles: ["waste"] } }, // Rodriguez
  15: { central: "trying to bite your own teeth", ends: ["Trying to define yourself", "bite your own teeth"], stack: { band: "trying to bite your own teeth", doubles: ["teeth"] } }, // Watts
  16: { central: "the suffering of being unable to love", ends: ["What is hell?", "unable to love"], stack: { band: "the suffering of being unable to love", doubles: ["unable to love"] } }, // Dostoevsky
  17: { central: "carries a cat by the tail", ends: ["A man who carries", "in no other way"], stack: { band: "carries a cat by the tail", doubles: ["cat", "tail"] } }, // Twain
  18: { central: "I just need a little more", ends: ["Girl, I love you", "a little more"], stack: { band: "I just need a little more", doubles: ["a little more"] } }, // Salu
  19: { central: "more to my life than a 9 to 5", ends: ["Working all day", "than a 9 to 5"], stack: { band: "more to my life than a 9 to 5", doubles: ["9 to 5"] } }, // Sassaro
  20: { central: "when the sun didn't shine", ends: ["He was born", "weren't in sight"], stack: { band: "when the sun didn't shine", doubles: ["didn't shine"] } }, // Muriel
  21: { central: "the only thing I trust", ends: ["I heard the rain", "four damn walls"], stack: { band: "the only thing I trust are these four damn walls", doubles: ["four damn walls"] } }, // Sassaro
  22: { central: "sweetheart's piano is rat-filled", ends: ["My sweetheart's piano", "infested with bugs"], stack: { band: "sweetheart's piano is rat-filled", doubles: ["rat-filled"] } }, // Romeo
  23: { central: "just like falling in love", ends: ["The music we make", "falling in love"], stack: { band: "sounds just like falling in love", doubles: ["falling in love"] } }, // Romeo
  24: { central: "true that pain is beauty", ends: ["Oh, Mrs. Potato Head", "with a warranty"], stack: { band: "true that pain is beauty", doubles: ["beauty"] } }, // Dussolliet
  25: { central: "Would you post about it", ends: ["What would happen", "post about it"], stack: { band: "Would you post about it", doubles: ["post about it"] } }, // Keenan
};

/** Normalize a word for phrase matching: strip surrounding punctuation, lowercase, keep internals. */
function norm(word: string): string {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLowerCase();
}

/** First [start, end) range within [from, to) whose normalized words match `phrase`, or null. */
function rangeOf(words: string[], phrase: string, from = 0, to = words.length): [number, number] | null {
  const target = phrase.split(" ").map(norm).filter(Boolean);
  if (target.length === 0) return null;
  for (let i = from; i + target.length <= to; i++) {
    let match = true;
    for (let j = 0; j < target.length; j++) {
      if (norm(words[i + j]) !== target[j]) {
        match = false;
        break;
      }
    }
    if (match) return [i, i + target.length];
  }
  return null;
}

// A word too slight to stand alone as a mark on its own line ("if", "a", "to", …).
function isSlight(word: string): boolean {
  return word.replace(/[^\p{L}\p{N}]/gu, "").length <= 2;
}

/**
 * Word ranges to highlight for a quote under a strategy. Prefers the quote's curated phrase
 * (CURATED); falls back to a positional slice that sits on word boundaries and never begins or
 * ends on a slight word, so a mark is never a lone "if" on a line.
 */
export function planMarks(quote: Quote, words: string[], strategy: MarkStrategy): MarkPlan {
  const n = words.length;
  const curated = CURATED[QUOTES.indexOf(quote)];

  if (strategy === "ends") {
    if (curated?.ends) {
      // Resolve each band after the previous one, so two ends stay ordered with a gap between.
      const ranges: [number, number][] = [];
      let from = 0;
      let ok = true;
      for (const phrase of curated.ends) {
        const r = rangeOf(words, phrase, from);
        if (!r) {
          ok = false;
          break;
        }
        ranges.push(r);
        from = r[1];
      }
      if (ok && ranges.length > 0) return { ranges };
    }
    if (n >= 6) {
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
    }
    // too short to split cleanly - fall through to central
  }

  if (strategy === "stack") {
    if (curated?.stack) {
      const band = rangeOf(words, curated.stack.band);
      if (band) {
        const doubles: [number, number][] = [];
        for (const d of curated.stack.doubles) {
          const r = rangeOf(words, d, band[0], band[1]);
          if (r) doubles.push(r);
        }
        return { ranges: [band], doubles };
      }
    }
    // Positional fallback: a compact band on the first line, one doubled word.
    const end = Math.min(n, 4);
    let m = 0;
    while (m < end - 1 && isSlight(words[m])) m++;
    return { ranges: [[0, end]], doubles: [[m, m + 1]] };
  }

  if (curated?.central) {
    const r = rangeOf(words, curated.central);
    if (r) return { ranges: [r] };
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
  "blendMode": [12, 13, 18, 14],
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
