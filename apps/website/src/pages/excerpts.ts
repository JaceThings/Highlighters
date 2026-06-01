// A small shelf of passages — public-domain classics alongside a few hand-picked
// favourites. The homepage shows one per load, drawn from a shuffle bag (see
// pickNextExcerpt) so the demo reads a little differently each time and there is
// always plenty of real, human prose to mark up. Straight ASCII apostrophes
// throughout; the em dashes inside the passages are the authors' own.

export interface Excerpt {
  /** Work title, if it has one — part of the quiet attribution line. */
  title?: string;
  /** Author or source, if known. */
  author?: string;
  /** The passage. Blank lines (\n\n) split it into paragraphs. */
  text: string;
}

/**
 * The credit shown after "from " under a passage: "Title by Author" when both
 * are known, otherwise whichever single part exists (a lone title, a lone
 * author/handle, or "Unknown"). Some passages are untitled web pieces, so the
 * line has to read naturally with one part missing.
 */
export function creditLine(e: Excerpt): string {
  if (e.title && e.author) return `${e.title} by ${e.author}`;
  return e.title ?? e.author ?? "";
}

export const EXCERPTS: Excerpt[] = [
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
  {
    // Source unknown.
    author: "Unknown",
    text: "You ask me why you cannot cast magic. It's because you are not casting it. You are copying what I have shown you. That is not magic. Magic is taking what already exists, making it yours and creating. You are not making it yours. You're trying to create something that has already been created. The air in front of you is not something you convert into fire. When you say those words, you wield those flames from nothing into something. When I was fighting demons, I was not looking forward, asking the air to turn to fire. I was telling the world, create fire! So if you wish to stay a mage, and you wish to continue forward, you have to tell the world, I am here, and I wish for it to be!",
  },
  {
    title: "His Last Bow",
    author: "Arthur Conan Doyle",
    text: "The two friends chatted in intimate converse for a few minutes, recalling once again the days of the past whilst their prisoner vainly wriggled to undo the bonds that held him. As they turned to the car, Holmes pointed back to the moonlit sea, and shook a thoughtful head.\n\n'There's an east wind coming, Watson.'\n\n'I think not, Holmes. It is very warm.'\n\n'Good old Watson! You are the one fixed point in a changing age. There's an east wind coming all the same, such a wind as never blew on England yet. It will be cold and bitter, Watson, and a good many of us may wither before its blast. But it's God's own wind none the less, and a cleaner, better, stronger land will lie in the sunshine when the storm has cleared. Start her up, Watson, for it's time that we were on our way. I have a cheque for five hundred pounds which should be cashed early, for the drawer is quite capable of stopping it, if he can.'",
  },
  {
    title: "Small Kindnesses",
    author: "Danusha Laméris",
    // poets.org/poem/small-kindnesses
    text: "I've been thinking about the way, when you walk down a crowded aisle, people pull in their legs to let you by. Or how strangers still say 'bless you' when someone sneezes, a leftover from the Bubonic plague. 'Don't die,' we are saying.\n\nAnd sometimes, when you spill lemons from your grocery bag, someone else will help you pick them up. Mostly, we don't want to harm each other.\n\nWe want to be handed our cup of coffee hot, and to say thank you to the person handing it. To smile at them and for them to smile back. For the waitress to call us honey when she sets down the bowl of clam chowder, and for the driver in the red pick-up truck to let us pass.\n\nWe have so little of each other, now. So far from tribe and fire. Only these brief moments of exchange.\n\nWhat if they are the true dwelling of the holy, these fleeting temples we make together when we say, 'Here, have my seat,' 'Go ahead—you first,' 'I like your hat.'",
  },
  {
    author: "Vina Amoris",
    // viviynaa.medium.com/i-cant-celebrate-my-achievements-because-in-my-mind-it-was-my-obligation-to-achieve-them-5e571dad50ae
    text: "How is it possible to achieve so much and still feel something is missing? As if the recognition aren't enough to feed my hunger for validation.\n\nI stand here with a list of accomplishments longer than I ever imagined, with shelves filled with trophies and certificates, and yet, it feels like I have achieved nothing.\n\nThe very things that were meant to define me have left me feeling empty. These awards, these honors, these 'unmatchable achievements' they were never gifts. They were expectations.",
  },
  {
    author: "missingvibrance",
    // tumblr.com/missingvibrance/718092031714574336
    text: "One of the greatest tragedies in life is that you will always be loved more than you will ever know. Someone in class finds your presence inviting and warm, even if you've only ever exchanged a few words with them — maybe none at all. Someone on the street loves your smile and it gets them down the next few streets. Someone you used to be friends with still wishes to fondly call your name. Someone you used to be friends with five years ago would give anything to be in the same room as you today. Someone who regularly comes into work is disappointed when you aren't there to brighten their day. Someone missed you today. Someone noticed you were gone. Someone loves you when you're there; someone loves you when you're nowhere to be found at all. You think you have always disappeared when you're no longer in the picture, but you've never left the frame.",
  },
  {
    title: "Worm Tutorial",
    text: "Hey everybody! Today we're going to be showing you how to rinse. A lot of people forget about rinsing. That's okay, don't feel bad. Just don't make that mistake again, alright? Learn from your mistakes. You've got to rinse afterwards, otherwise everything will be all soapy. Even if it doesn't look soapy, the soap particles are still there, and if you don't rinse properly, you'll ruin everything. You'll ruin everything. You're ruining everything. You've ruined everything.",
  },
  {
    author: "Carl Sagan",
    text: "For example, a kid asks mommy, 'Why is the grass green?' And very often you get an answer like, 'Oh, don't ask dumb questions,' or, 'Who knows?' When in fact, it's an extremely profound question. Or 'Why is the sky blue?' In both those cases, it goes to the fundamentals, in one case of biology and the other of a kind of physics. How much better would it be to say to the child, 'That's a good question, Johnny. I don't know the answer. Maybe we can look it up,' or, 'Nobody knows, maybe when you grow up you'll be the person to find out.' I think kids who are discouraged from asking those questions wind up learning the lesson that there's something bad about using the mind, and we lose resources. And we need people able to think complex and subtle thoughts. I believe a great many children have that capability if only they're encouraged.",
  },
  {
    author: "L, Death Note",
    text: "There are many types of monsters in this world: monsters who will not show themselves and who cause trouble, monsters who abduct children, monsters who devour dreams, monsters who suck blood... and monsters who always tell lies.\n\nLying monsters are a real nuisance; they are much more cunning than other monsters.\n\nThey pose as humans even though they have no understanding of the human heart; they eat even though they've never experienced hunger; they study even though they have no interest in academics; they seek friendship even though they do not know how to love.\n\nIf I were to encounter such monsters, I would likely be eaten by it... because in truth, I am that monster.",
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
    const last =
      parsed.last >= 0 && parsed.last < EXCERPTS.length ? parsed.last : -1;
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
