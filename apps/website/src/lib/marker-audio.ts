// Web Audio for the docs demo. Two effects:
//   - a looping "scribble" that swells while a slider is scrubbed and fades when it stops
//   - a one-shot "pop" when a colour swatch is picked
// Clips are MP3 (decodeAudioData-safe on every browser, Safari included), decoded once and cached
// (primed during idle or on hover). The context is created without resuming and only resumed inside
// a real gesture, so it never trips the autoplay warning; on iOS it claims the playback audio
// session so effects survive the silent switch.

type WebkitWindow = typeof globalThis & { webkitAudioContext?: typeof AudioContext };

const SCRIBBLE_URLS = ["/audio/marker-scribble-1.mp3", "/audio/marker-scribble-2.mp3"];
const SHORT_URLS = [
  "/audio/marker-short-1.mp3",
  "/audio/marker-short-2.mp3",
  "/audio/marker-short-3.mp3",
  "/audio/marker-short-4.mp3",
  "/audio/marker-short-5.mp3",
  "/audio/marker-short-6.mp3",
];

const SCRIBBLE_GAIN = 0.02;
const POP_GAIN = 0.025;
const FADE_IN = 0.015; // seconds: scribble swell-in (short so it doesn't open on a dead ramp)
const FADE_OUT = 0.2; // seconds: scribble fade-out after the scrub stops
const IDLE_MS = 150; // no scrub feed for this long => fade out
const NEAR_SILENT = 0.0001; // exponential ramps can't reach 0

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

// Create (but never resume) the context. Resuming outside a gesture is what triggers the
// autoplay warning, so prime/decode use this and only the gesture handlers call ensureRunning.
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
        /* setter can throw on some iOS versions */
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

/** Warm the context and decode every clip before the first real trigger. */
export function primeMarkerAudio(): void {
  if (!createCtx()) return;
  for (const u of SCRIBBLE_URLS) void decode(u);
  for (const u of SHORT_URLS) void decode(u);
}

// --- colour pick: one-shot, never the same clip three times in a row ---

const popHistory: number[] = [];

function nextPopIndex(): number {
  const n = SHORT_URLS.length;
  const last = popHistory[popHistory.length - 1];
  const prev = popHistory[popHistory.length - 2];
  const blocked = last !== undefined && last === prev ? last : -1; // two in a row already => block a third
  let i = Math.floor(Math.random() * n);
  while (i === blocked) i = Math.floor(Math.random() * n);
  popHistory.push(i);
  if (popHistory.length > 3) popHistory.shift();
  return i;
}

export function playMarkerPop(): void {
  if (!ensureRunning()) return;
  const url = SHORT_URLS[nextPopIndex()];
  void decode(url).then((buf) => {
    if (!buf || !ctx || !master) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.97 + Math.random() * 0.06; // subtle pitch variance
    const g = ctx.createGain();
    g.gain.value = POP_GAIN;
    src.connect(g).connect(master);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
    src.start();
  });
}

// --- slider scrub: one looping voice that swells with movement, fades when it stops ---

let scribSrc: AudioBufferSourceNode | null = null;
let scribGain: GainNode | null = null;
let scribStarting = false; // a decode is in flight for the current burst
let active = false; // the user is currently scrubbing
let lastScrib = -1;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let stopTimer: ReturnType<typeof setTimeout> | undefined;

function pickScribble(): number {
  if (SCRIBBLE_URLS.length < 2) return 0;
  let i = Math.floor(Math.random() * SCRIBBLE_URLS.length);
  if (i === lastScrib) i = (i + 1) % SCRIBBLE_URLS.length; // alternate so a burst rarely repeats
  lastScrib = i;
  return i;
}

function rampScribbleTo(target: number, seconds: number): void {
  if (!ctx || !scribGain) return;
  const now = ctx.currentTime;
  const g = scribGain.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(Math.max(g.value, NEAR_SILENT), now);
  g.exponentialRampToValueAtTime(Math.max(target, NEAR_SILENT), now + seconds);
}

// Per-buffer list of offsets (seconds) where a stroke is actually sounding, so a scribble never
// opens or loops onto one of the silent gaps between strokes. Scanned once per decoded buffer.
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
    if (peak > 0.3) offs.push(i / buf.sampleRate); // a window carrying a stroke, not a gap
  }
  const result = offs.length ? offs : [buf.duration * 0.1];
  strokeOffsetCache.set(buf, result);
  return result;
}

function startScribble(buf: AudioBuffer): void {
  if (!ctx || !master) return;
  const offs = strokeOffsets(buf);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.loopStart = offs[0]; // hold the loop between the first and last stroke, skipping dead lead/tail
  src.loopEnd = Math.max(offs[offs.length - 1] + 0.05, offs[0] + 0.2);
  src.playbackRate.value = 0.92 + Math.random() * 0.16; // each burst pitched a little differently
  const g = ctx.createGain();
  g.gain.value = NEAR_SILENT;
  src.connect(g).connect(master);
  src.start(0, offs[Math.floor(Math.random() * offs.length)]); // open on a stroke, not a gap
  scribSrc = src;
  scribGain = g;
}

function fadeOutScribble(): void {
  if (!scribSrc || !scribGain) return;
  rampScribbleTo(NEAR_SILENT, FADE_OUT);
  const dyingSrc = scribSrc;
  const dyingGain = scribGain;
  clearTimeout(stopTimer);
  // A feed arriving before this fires cancels it (the same source ramps back up, seamless).
  stopTimer = setTimeout(
    () => {
      try {
        dyingSrc.stop();
      } catch {
        /* already stopped */
      }
      dyingSrc.disconnect();
      dyingGain.disconnect();
      if (scribSrc === dyingSrc) {
        scribSrc = null;
        scribGain = null;
      }
    },
    FADE_OUT * 1000 + 80,
  );
}

/** Call repeatedly while a slider is being scrubbed; the voice fades itself out once feeds stop. */
export function feedScribbleSound(): void {
  if (!ensureRunning() || !master) return;
  active = true;
  clearTimeout(stopTimer);
  stopTimer = undefined;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    active = false;
    fadeOutScribble();
  }, IDLE_MS);

  if (scribSrc) {
    rampScribbleTo(SCRIBBLE_GAIN, FADE_IN); // swell the live (or fading) voice back up
    return;
  }
  if (scribStarting) return;
  scribStarting = true;
  void decode(SCRIBBLE_URLS[pickScribble()]).then((buf) => {
    scribStarting = false;
    if (!buf || !active || scribSrc || !ctx || !master) return; // released mid-decode, or already live
    startScribble(buf);
    rampScribbleTo(SCRIBBLE_GAIN, FADE_IN);
  });
}

/** Force the scribble to fade now (e.g. on drag release or unmount). */
export function stopScribbleSound(): void {
  active = false;
  clearTimeout(idleTimer);
  idleTimer = undefined;
  fadeOutScribble();
}
