// Web Audio for the marker UI, five sound sets: a looping SLIDER scribble that swells while a slider
// scrubs, a one-shot CIRCLE pop on a docs colour-swatch pick, a one-shot ZIG-ZAG clip on a legend
// pick, a one-shot BLOOP on a dock colour pick, and a one-shot SELECT click on a dock pen pick. MP3
// clips (decodeAudioData-safe everywhere incl. Safari), decoded once and cached. The context is created
// without resuming and only resumed inside a gesture (else the autoplay warning).

type WebkitWindow = typeof globalThis & { webkitAudioContext?: typeof AudioContext };

const SLIDER_URLS = ["/audio/marker-slider-1.mp3", "/audio/marker-slider-2.mp3"];
const CIRCLE_URLS = [
  "/audio/marker-circle-1.mp3",
  "/audio/marker-circle-2.mp3",
  "/audio/marker-circle-3.mp3",
  "/audio/marker-circle-4.mp3",
  "/audio/marker-circle-5.mp3",
  "/audio/marker-circle-6.mp3",
];
const ZIGZAG_URLS = [
  "/audio/marker-zigzag-1.mp3",
  "/audio/marker-zigzag-2.mp3",
  "/audio/marker-zigzag-3.mp3",
  "/audio/marker-zigzag-4.mp3",
  "/audio/marker-zigzag-5.mp3",
  "/audio/marker-zigzag-6.mp3",
  "/audio/marker-zigzag-7.mp3",
  "/audio/marker-zigzag-8.mp3",
  "/audio/marker-zigzag-9.mp3",
  "/audio/marker-zigzag-10.mp3",
  "/audio/marker-zigzag-11.mp3",
  "/audio/marker-zigzag-12.mp3",
  "/audio/marker-zigzag-13.mp3",
];
const BLOOP_URLS = [
  "/audio/paint-bloop-1.mp3",
  "/audio/paint-bloop-2.mp3",
  "/audio/paint-bloop-3.mp3",
  "/audio/paint-bloop-4.mp3",
  "/audio/paint-bloop-5.mp3",
];
const SELECT_URLS = [
  "/audio/marker-select-1.mp3",
  "/audio/marker-select-2.mp3",
  "/audio/marker-select-3.mp3",
  "/audio/marker-select-4.mp3",
];
const ALL_URLS = [...SLIDER_URLS, ...CIRCLE_URLS, ...ZIGZAG_URLS, ...BLOOP_URLS, ...SELECT_URLS];

const SLIDER_GAIN = 0.01;
const CIRCLE_GAIN = 0.0125;
const ZIGZAG_GAIN = 0.0125;
const BLOOP_GAIN = 0.025; // dock sounds sit louder than the docs cues
const SELECT_GAIN = 0.025;
const FADE_IN = 0.015; // s, slider swell-in
const FADE_OUT = 0.2; // s, fade-out after scrub stops
const IDLE_MS = 150; // no feed for this long => fade out
const NEAR_SILENT = 0.0001; // exponential ramps can't reach 0

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

// Create but never resume: resuming outside a gesture trips the autoplay warning, so only the
// gesture handlers call ensureRunning.
function createCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) {
      try {
        nav.audioSession.type = "playback"; // iOS: survive the silent switch
      } catch {
        // setter can throw on some iOS versions
      }
    }
  }
  return ctx;
}

function ensureRunning(): AudioContext | null {
  const c = createCtx();
  if (c && c.state === "suspended") void c.resume();
  return c;
}

const buffers = new Map<string, AudioBuffer>();
const inflight = new Map<string, Promise<AudioBuffer | null>>();

function decode(url: string): Promise<AudioBuffer | null> {
  const c = createCtx();
  if (!c) return Promise.resolve(null);
  const hit = buffers.get(url);
  if (hit) return Promise.resolve(hit);
  let p = inflight.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => c.decodeAudioData(data))
      .then((buf) => {
        buffers.set(url, buf);
        inflight.delete(url);
        return buf;
      })
      .catch(() => {
        inflight.delete(url);
        return null;
      });
    inflight.set(url, p);
  }
  return p;
}

/** Warm the context and decode every clip before the first real trigger. Idempotent (cached/inflight),
 *  so callers can fire it on any early opportunity (idle, first interaction, control hover). */
export function primeMarkerAudio(): void {
  if (!createCtx()) return;
  for (const u of ALL_URLS) void decode(u);
}

// Play a clip once at `gain` with slight pitch variance; the picker factories below choose the clip.
function playClip(url: string, gain: number): void {
  void decode(url).then((buf) => {
    if (!buf || !ctx || !master) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.97 + Math.random() * 0.06; // pitch variance
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(master);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
    src.start();
  });
}

// One random clip per call, never the same one three times in a row. Each caller keeps its own history.
function makeOneShot(urls: string[], gain: number): () => void {
  const history: number[] = [];
  const nextIndex = (): number => {
    const n = urls.length;
    if (n < 2) return 0; // also avoids the block-the-only-index infinite loop
    const last = history[history.length - 1];
    const prev = history[history.length - 2];
    const blocked = last !== undefined && last === prev ? last : -1; // two in a row => block a third
    let i = Math.floor(Math.random() * n);
    while (i === blocked) i = Math.floor(Math.random() * n);
    history.push(i);
    if (history.length > 3) history.shift();
    return i;
  };
  return () => {
    if (ensureRunning()) playClip(urls[nextIndex()], gain);
  };
}

// Shuffle bag: play through a shuffled copy of `urls`, then reshuffle. Every clip plays once per bag
// (no in-bag repeats), and a fresh bag never opens on the clip the previous bag closed on.
function makeShuffleBag(urls: string[], gain: number): () => void {
  let bag: number[] = [];
  let last = -1;
  const nextIndex = (): number => {
    if (bag.length === 0) {
      bag = urls.map((_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      // We pop from the end; if that first pick repeats the last bag's final clip, swap it to the front.
      if (urls.length > 1 && bag[bag.length - 1] === last) {
        [bag[bag.length - 1], bag[0]] = [bag[0], bag[bag.length - 1]];
      }
    }
    last = bag.pop() ?? 0;
    return last;
  };
  return () => {
    if (ensureRunning()) playClip(urls[nextIndex()], gain);
  };
}

/** Docs colour swatch pick: a short pop. */
export const playCircleSound = makeOneShot(CIRCLE_URLS, CIRCLE_GAIN);
/** Legend option pick (the zig-zag underline): a zig-zag clip. */
export const playZigZagSound = makeOneShot(ZIGZAG_URLS, ZIGZAG_GAIN);
/** Dock colour pick: a paint bloop, drawn from a shuffle bag. */
export const playColorBloop = makeShuffleBag(BLOOP_URLS, BLOOP_GAIN);
/** Dock pen pick: a marker-select click, drawn from a shuffle bag. */
export const playMarkerSelect = makeShuffleBag(SELECT_URLS, SELECT_GAIN);

// Slider scrub: one looping voice that swells with movement, fades when it stops.

let sliderSrc: AudioBufferSourceNode | null = null;
let sliderGain: GainNode | null = null;
let sliderStarting = false; // decode in flight for the current burst
let active = false; // user is scrubbing
let lastSlider = -1;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let stopTimer: ReturnType<typeof setTimeout> | undefined;

function pickSlider(): number {
  if (SLIDER_URLS.length < 2) return 0;
  let i = Math.floor(Math.random() * SLIDER_URLS.length);
  if (i === lastSlider) i = (i + 1) % SLIDER_URLS.length; // alternate so a burst rarely repeats
  lastSlider = i;
  return i;
}

function rampSliderTo(target: number, seconds: number): void {
  if (!ctx || !sliderGain) return;
  const now = ctx.currentTime;
  const g = sliderGain.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(Math.max(g.value, NEAR_SILENT), now);
  g.exponentialRampToValueAtTime(Math.max(target, NEAR_SILENT), now + seconds);
}

// Per-buffer offsets (seconds) where a stroke is sounding, so the loop never opens or wraps onto a
// silent gap between strokes. Scanned once per decoded buffer.
const strokeOffsetCache = new WeakMap<AudioBuffer, number[]>();
function strokeOffsets(buf: AudioBuffer): number[] {
  const cached = strokeOffsetCache.get(buf);
  if (cached) return cached;
  const data = buf.getChannelData(0);
  const win = Math.floor(buf.sampleRate * 0.03); // 30 ms windows
  const offs: number[] = [];
  for (let i = 0; i + win < data.length; i += win) {
    let peak = 0;
    for (let j = i; j < i + win; j += 4) {
      const a = Math.abs(data[j]);
      if (a > peak) peak = a;
    }
    if (peak > 0.3) offs.push(i / buf.sampleRate); // window carrying a stroke, not a gap
  }
  const result = offs.length ? offs : [buf.duration * 0.1];
  strokeOffsetCache.set(buf, result);
  return result;
}

function startSlider(buf: AudioBuffer): void {
  if (!ctx || !master) return;
  const offs = strokeOffsets(buf);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.loopStart = offs[0]; // loop between first and last stroke, skipping dead lead/tail
  src.loopEnd = Math.max(offs[offs.length - 1] + 0.05, offs[0] + 0.2);
  src.playbackRate.value = 0.92 + Math.random() * 0.16; // each burst pitched differently
  const g = ctx.createGain();
  g.gain.value = NEAR_SILENT;
  src.connect(g).connect(master);
  src.start(0, offs[Math.floor(Math.random() * offs.length)]); // open on a stroke, not a gap
  sliderSrc = src;
  sliderGain = g;
}

function fadeOutSlider(): void {
  if (!sliderSrc || !sliderGain) return;
  rampSliderTo(NEAR_SILENT, FADE_OUT);
  const dyingSrc = sliderSrc;
  const dyingGain = sliderGain;
  clearTimeout(stopTimer);
  // A feed arriving before this fires cancels it (same source ramps back up, seamless).
  stopTimer = setTimeout(
    () => {
      try {
        dyingSrc.stop();
      } catch {
        // already stopped
      }
      dyingSrc.disconnect();
      dyingGain.disconnect();
      if (sliderSrc === dyingSrc) {
        sliderSrc = null;
        sliderGain = null;
      }
    },
    FADE_OUT * 1000 + 80,
  );
}

/** Call repeatedly while a slider is being scrubbed; the voice fades itself out once feeds stop. */
export function feedSliderSound(): void {
  if (!ensureRunning() || !master) return;
  active = true;
  clearTimeout(stopTimer);
  stopTimer = undefined;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    active = false;
    fadeOutSlider();
  }, IDLE_MS);

  if (sliderSrc) {
    rampSliderTo(SLIDER_GAIN, FADE_IN); // swell the live (or fading) voice back up
    return;
  }
  if (sliderStarting) return;
  sliderStarting = true;
  void decode(SLIDER_URLS[pickSlider()]).then((buf) => {
    sliderStarting = false;
    if (!buf || !active || sliderSrc || !ctx || !master) return; // released mid-decode or already live
    startSlider(buf);
    rampSliderTo(SLIDER_GAIN, FADE_IN);
  });
}

/** Force the slider voice to fade now (e.g. on drag release or unmount). */
export function stopSliderSound(): void {
  active = false;
  clearTimeout(idleTimer);
  idleTimer = undefined;
  fadeOutSlider();
}
