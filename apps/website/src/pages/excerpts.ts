// A small shelf of passages — public-domain classics alongside a few hand-picked
// favourites. The homepage shows one per load, drawn from a shuffle bag (see
// pickNextExcerpt) so the demo reads a little differently each time and there is
// always plenty of real, human prose to mark up. Straight ASCII apostrophes
// throughout; the em dashes inside the passages are the authors' own.

export interface Excerpt {
  /** Work title, for the quiet attribution line under the passage. */
  title: string;
  author: string;
  /** The passage. Blank lines (\n\n) split it into paragraphs. */
  text: string;
}

export const EXCERPTS: Excerpt[] = [
  {
    title: "Moby-Dick",
    author: "Herman Melville",
    text: "Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world. It is a way I have of driving off the spleen and regulating the circulation. Whenever I find myself growing grim about the mouth; whenever it is a damp, drizzly November in my soul; whenever I find myself involuntarily pausing before coffin warehouses, and bringing up the rear of every funeral I meet; and especially whenever my hypos get such an upper hand of me, that it requires a strong moral principle to prevent me from deliberately stepping into the street, and methodically knocking people's hats off—then, I account it high time to get to sea as soon as I can.",
  },
  {
    title: "A Tale of Two Cities",
    author: "Charles Dickens",
    text: "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness, it was the spring of hope, it was the winter of despair, we had everything before us, we had nothing before us, we were all going direct to Heaven, we were all going direct the other way—in short, the period was so far like the present period, that some of its noisiest authorities insisted on its being received, for good or for evil, in the superlative degree of comparison only.",
  },
  {
    title: "Pride and Prejudice",
    author: "Jane Austen",
    text: "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered as the rightful property of some one or other of their daughters.\n\n'My dear Mr. Bennet,' said his lady to him one day, 'have you heard that Netherfield Park is let at last?'",
  },
  {
    title: "Walden",
    author: "Henry David Thoreau",
    text: "I went to the woods because I wished to live deliberately, to front only the essential facts of life, and see if I could not learn what it had to teach, and not, when I came to die, discover that I had not lived. I did not wish to live what was not life, living is so dear; nor did I wish to practise resignation, unless it was quite necessary. I wanted to live deep and suck out all the marrow of life, to live so sturdily and Spartan-like as to put to rout all that was not life, to cut a broad swath and shave close, to drive life into a corner, and reduce it to its lowest terms.",
  },
  {
    title: "Alice's Adventures in Wonderland",
    author: "Lewis Carroll",
    text: "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, 'and what is the use of a book,' thought Alice, 'without pictures or conversations?'\n\nSo she was considering in her own mind (as well as she could, for the hot day made her feel very sleepy and stupid), whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her.",
  },
  {
    title: "Frankenstein",
    author: "Mary Shelley",
    text: "You will rejoice to hear that no disaster has accompanied the commencement of an enterprise which you have regarded with such evil forebodings. I arrived here yesterday, and my first task is to assure my dear sister of my welfare and increasing confidence in the success of my undertaking.\n\nI am already far north of London, and as I walk in the streets of Petersburgh, I feel a cold northern breeze play upon my cheeks, which braces my nerves and fills me with delight. Do you understand this feeling?",
  },
  {
    title: "The Time Machine",
    author: "H. G. Wells",
    text: "The Time Traveller (for so it will be convenient to speak of him) was expounding a recondite matter to us. His pale grey eyes shone and twinkled, and his usually pale face was flushed and animated. The fire burned brightly, and the soft radiance of the incandescent lights in the lilies of silver caught the bubbles that flashed and passed in our glasses. Our chairs, being his patents, embraced and caressed us rather than submitted to be sat upon, and there was that luxurious after-dinner atmosphere when thought roams gracefully free of the trammels of precision.",
  },
  {
    title: "Jane Eyre",
    author: "Charlotte Bronte",
    text: "There was no possibility of taking a walk that day. We had been wandering, indeed, in the leafless shrubbery an hour in the morning; but since dinner (Mrs. Reed, when there was no company, dined early) the cold winter wind had brought with it clouds so sombre, and a rain so penetrating, that further out-door exercise was now out of the question.\n\nI was glad of it: I never liked long walks, especially on chilly afternoons: dreadful to me was the coming home in the raw twilight, with nipped fingers and toes, and a heart saddened by the chidings of Bessie, the nurse.",
  },
  {
    title: "The Cherry-Colored Kitten",
    author: "Emily Williams",
    text: "One day Uncle Bob came running up the steps and asked Barbara what she supposed he had in his pocket. 'Oh, I know—my kitten!' said Barbara; and, sure enough, he put his hand in his pocket and pulled out a dear little black kitten.\n\n'That isn't mine,' said Barbara. 'Mine is a pink kitten; you said so.'\n\n'No, indeed, I said \"cherry-colored,\"' laughed Uncle Bob, 'all cherries aren't the same color; some of them are black, just like the kitten.'",
  },
  {
    title: "You Might as Well Enjoy It",
    author: "William Moulton Marston",
    text: "Most people spend at least a third of their lives being bored; and the strange part of it is that their so-called amusements bore them more than work.\n\nPut five or six people together on a business task and each will take considerable interest in it. They have to; their jobs depend upon it. But gather a similar group of persons together at home and each is bored to extinction by the pet subjects of the others.\n\nAnd why? Because they have not mastered the art of acquiring new interests. They have not learned to enjoy the variety of entertainments this world offers.",
  },
  {
    title: "Doctor Who: Pompadour",
    author: "Steven Moffat",
    text: "You are so quiet, my love. If I could see your face more clearly, I should know if you were cross. Are you cross, my lonely angel?\n\nThe sigh is silent now. I have often complained of the ceaseless chatter, but I fear I've come to miss it. What has become of all the merry chatter? Where are all the people? Why are you so quiet, doctor?\n\nIn the many years I waited for you, I imagined we would talk the night away, you and I, and yet the dark remains and you are silent. Why can't I see your face, doctor?\n\nI have been assailed by a gleam of late, and yet not precisely a dream. I have thoughts in the dark which troubled me. Those clockwork monsters who came to take my head — you told me once that they were in the habit of making portraits of my mind. I believe you said they were scanning my brain, but then you always had such a comical turn of phrase. I took your words to mean that they had made a catalogue of my thoughts and memories and stored them for safekeeping in something I think you called a group computer, a computer inside a vessel lost in a distant void. The idea makes me shiver. This computer, doctor, full of my thoughts and memories and secrets — might it not in time come to mistake itself for me? I fear for this computer creature, doctor. Abandoned in infinite silence. I am prone to loneliness. Perhaps it will share my weakness. I look to you for comfort, but I cannot see you. Why can't I see you? Why is it so quiet, doctor? Why can't I feel the breath in my lungs, the air stirring on my skin? Where am I doctor? Where am I, doctor? Where am I?",
  },
];

// Where the shuffle bag lives between loads. Each refresh is a full page reload,
// so the bag has to survive in localStorage for "no repeats" to mean anything.
const BAG_KEY = "highlighters:excerpt-bag";

/** A shuffled draw order plus the index we handed out last, for the no-repeat rule. */
interface BagState {
  /** Indices still in the bag, in the order they'll be drawn (next = end of array). */
  order: number[];
  /** The index shown on the previous load, so a fresh bag never repeats it first. */
  last: number;
}

// Fisher-Yates. Client-only (no SSR), so Math.random is fine here.
function shuffledIndices(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function readBag(): BagState | null {
  try {
    const raw = localStorage.getItem(BAG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BagState;
    // Drop anything that no longer points at a real excerpt (e.g. the shelf
    // shrank since this bag was saved) so we never index out of range.
    const order = parsed.order.filter((i) => i >= 0 && i < EXCERPTS.length);
    const last = parsed.last >= 0 && parsed.last < EXCERPTS.length ? parsed.last : -1;
    return { order, last };
  } catch {
    return null; // private mode, disabled storage, or corrupt JSON: fall through to a fresh bag.
  }
}

function writeBag(state: BagState): void {
  try {
    localStorage.setItem(BAG_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable: we just lose the no-repeat guarantee, not the page.
  }
}

/**
 * Draw the next passage from a shuffle bag. Every excerpt is shown once before
 * any repeats; when the bag empties it refills with a fresh shuffle, and that
 * refill is nudged so it never hands back the passage we just showed. Called
 * once on the client when the homepage mounts, so each full page load advances
 * the bag by one. (Client-only; the site does not server-render.)
 */
export function pickNextExcerpt(): Excerpt {
  const { order, last } = readBag() ?? { order: [], last: -1 };

  if (order.length === 0) {
    order.push(...shuffledIndices(EXCERPTS.length));
    // The next draw is the tail of the bag; if a refill would repeat the last
    // passage straight away, swap it to the front so it comes out last instead.
    const lastOut = order.length - 1;
    if (order.length > 1 && order[lastOut] === last) {
      [order[0], order[lastOut]] = [order[lastOut], order[0]];
    }
  }

  const next = order.pop()!;
  writeBag({ order, last: next });
  return EXCERPTS[next];
}
