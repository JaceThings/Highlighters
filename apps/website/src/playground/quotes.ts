export type Quote = { text: string; author: string };

export const QUOTES: Quote[] = [
  { text: "Helly was never cruel", author: "Irving Bailiff" },
  { text: "There's advertisements on my eyelids, free trials in the air I breathe", author: "Maxwell Davis" },
  { text: "And you'll be grateful for seats at the table though it dips at one end and the bench is unstable", author: "Gregory James Holgate" },
  { text: "You may waste your days, but at least you were able to pay off your grave since we leased you your cradle", author: "Gregory James Holgate" },
  { text: "No friend ever served me, and no enemy ever wronged me, whom I have not repaid in full", author: "Lucius Cornelius Sulla" },
  { text: "It is better to die on your feet than to live on your knees.", author: "Emiliano Zapata" },
  { text: "Men, I am not ordering you to attack. I am ordering you to die.", author: "Mustafa Kemal Atatürk" },
  { text: "Child, why did no one ever teach you that you cannot turn people into homes?", author: "Nikita Gill" },
  { text: "Onward we stagger. And if the tanks come, then God help the tanks!", author: "Colonel Bill Gruber" },
  { text: "Yours truly,\nYours, truly.", author: "Bo Burnham" },
  { text: "If you judge a fish by its ability to climb a tree, it will live its whole life believing that it is stupid.", author: "Unknown" },
  { text: "The man who sleeps with a machete is a fool every night but one.", author: "Justin McElroy" },
  { text: "A falling knife has no handle.", author: "Unknown" },
  { text: "I am a man dying of thirst watching another man drown.", author: "Dragon Ball Z" },
  { text: "Hatred is too strong of an emotion to waste on someone you don't like", author: "Sixto Rodriguez" },
  { text: "Trying to define yourself is like trying to bite your own teeth.", author: "Alan Watts" },
  { text: "What is hell? I maintain that it is the suffering of being unable to love.", author: "Fyodor Dostoevsky, The Brothers Karamazov" },
  { text: "A man who carries a cat by the tail learns something he can learn in no other way.", author: "Mark Twain" },
  { text: "Girl, I love you so much, I just need a little more.", author: "Andrew Salu" },
  { text: "Working all day, every day of my life, baby, tell me there's more to my life than a 9 to 5", author: "Christian Sassaro" },
  { text: "He was born on the day when the sun didn't shine, and the birds didn't chirp, and the clouds weren't in sight", author: "Dustin Muriel" },
  { text: "I heard the rain is going crazy, better leave him alone. And know, the only thing I trust are these four damn walls.", author: "Christian Sassaro" },
  { text: "My sweetheart's piano is rat-filled, and mine is infested with bugs.", author: "Rio Romeo" },
  { text: "The music we make is unnatural but it sounds just like falling in love.", author: "Rio Romeo" },
  { text: "Oh, Mrs. Potato Head, tell me - is it true that pain is beauty? Does a new face come with a warranty?", author: "Jeremy Dussolliet" },
  { text: 'What would happen if a nuke just hit? Would you say "bye" to your family? Would you post about it?', author: "Michael Keenan" },
];

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
