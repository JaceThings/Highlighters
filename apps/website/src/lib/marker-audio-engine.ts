import { BROWSER } from "./browser-env.ts";

interface AudioSession {
  type: string;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
  interface Navigator {
    audioSession?: AudioSession;
  }
}

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
const NAV_HOME_URL = "/audio/nav-home.mp3";
const NAV_DOCS_URL = "/audio/nav-docs.mp3";
const MENU_OPEN_URL = "/audio/menu-open.mp3";
const MENU_CLOSE_URL = "/audio/menu-close.mp3";
const OPTION_CLICK_URL = "/audio/option-click.mp3";
const ALL_URLS = [
  ...SLIDER_URLS, ...CIRCLE_URLS, ...ZIGZAG_URLS, ...BLOOP_URLS, ...SELECT_URLS,
  NAV_HOME_URL, NAV_DOCS_URL, MENU_OPEN_URL, MENU_CLOSE_URL, OPTION_CLICK_URL,
];

const SLIDER_GAIN = 0.01;
const CIRCLE_GAIN = 0.0125;
const ZIGZAG_GAIN = 0.0125;
const BLOOP_GAIN = 0.025;
const SELECT_GAIN = 0.1;
const NAV_GAIN = 0.05;
const MENU_GAIN = 0.025;
const OPTION_GAIN = 0.025;
const FADE_IN = 0.015;
const FADE_OUT = 0.2;
const IDLE_MS = 150;
const NEAR_SILENT = 0.0001; // exponentialRamp cannot reach 0

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function createCtx(): AudioContext | null {
  if (!BROWSER.hasWindow) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    if (navigator.audioSession) {
      try {
        navigator.audioSession.type = "playback"; // iOS: play through the silent switch
      } catch {
      }
    }
  }
  return ctx;
}

function ensureRunning(): AudioContext | null {
  const c = createCtx();
  if (c && c.state !== "running") void c.resume();
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

export function primeMarkerAudio(): void {
  if (!createCtx()) return;
  for (const u of ALL_URLS) void decode(u);
}

function playClip(url: string, gain: number, vary = true): number {
  const rate = vary ? 0.97 + Math.random() * 0.06 : 1;
  void decode(url).then((buf) => {
    if (!buf || !ctx || !master) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(master);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
    src.start();
  });
  const buf = buffers.get(url);
  return buf ? buf.duration / rate : 0;
}

function makeOneShot(urls: string[], gain: number): () => number {
  const history: number[] = [];
  const nextIndex = (): number => {
    const n = urls.length;
    if (n < 2) return 0;
    const last = history[history.length - 1];
    const prev = history[history.length - 2];
    const blocked = last !== undefined && last === prev ? last : -1;
    let i = Math.floor(Math.random() * n);
    while (i === blocked) i = Math.floor(Math.random() * n);
    history.push(i);
    if (history.length > 3) history.shift();
    return i;
  };
  return () => (ensureRunning() ? playClip(urls[nextIndex()], gain) : 0);
}

function makeShuffleBag(urls: string[], gain: number): () => number {
  let bag: number[] = [];
  let last = -1;
  const nextIndex = (): number => {
    if (bag.length === 0) {
      bag = urls.map((_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (urls.length > 1 && bag[bag.length - 1] === last) {
        [bag[bag.length - 1], bag[0]] = [bag[0], bag[bag.length - 1]];
      }
    }
    last = bag.pop() ?? 0;
    return last;
  };
  return () => (ensureRunning() ? playClip(urls[nextIndex()], gain) : 0);
}

function makeFixed(url: string, gain: number): () => number {
  return () => (ensureRunning() ? playClip(url, gain, false) : 0);
}

export const playCircleSound = makeOneShot(CIRCLE_URLS, CIRCLE_GAIN);
export const playZigZagSound = makeOneShot(ZIGZAG_URLS, ZIGZAG_GAIN);
export const playColorBloop = makeShuffleBag(BLOOP_URLS, BLOOP_GAIN);
export const playMarkerSelect = makeShuffleBag(SELECT_URLS, SELECT_GAIN);
export const playNavHome = makeFixed(NAV_HOME_URL, NAV_GAIN);
export const playNavDocs = makeFixed(NAV_DOCS_URL, NAV_GAIN);
export const playMenuOpen = makeFixed(MENU_OPEN_URL, MENU_GAIN);
export const playMenuClose = makeFixed(MENU_CLOSE_URL, MENU_GAIN);
export const playOptionClick = makeFixed(OPTION_CLICK_URL, OPTION_GAIN);

let sliderSrc: AudioBufferSourceNode | null = null;
let sliderGain: GainNode | null = null;
let sliderStarting = false;
let active = false;
let lastSlider = -1;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let stopTimer: ReturnType<typeof setTimeout> | undefined;

function pickSlider(): number {
  if (SLIDER_URLS.length < 2) return 0;
  let i = Math.floor(Math.random() * SLIDER_URLS.length);
  if (i === lastSlider) i = (i + 1) % SLIDER_URLS.length;
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

const strokeOffsetCache = new WeakMap<AudioBuffer, number[]>();
function strokeOffsets(buf: AudioBuffer): number[] {
  const cached = strokeOffsetCache.get(buf);
  if (cached) return cached;
  const data = buf.getChannelData(0);
  const win = Math.floor(buf.sampleRate * 0.03);
  const offs: number[] = [];
  for (let i = 0; i + win < data.length; i += win) {
    let peak = 0;
    for (let j = i; j < i + win; j += 4) {
      const a = Math.abs(data[j]);
      if (a > peak) peak = a;
    }
    if (peak > 0.3) offs.push(i / buf.sampleRate);
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
  src.loopStart = offs[0];
  src.loopEnd = Math.max(offs[offs.length - 1] + 0.05, offs[0] + 0.2); // loop on strokes, not silent gaps
  src.playbackRate.value = 0.92 + Math.random() * 0.16;
  const g = ctx.createGain();
  g.gain.value = NEAR_SILENT;
  src.connect(g).connect(master);
  src.start(0, offs[Math.floor(Math.random() * offs.length)]);
  sliderSrc = src;
  sliderGain = g;
}

function fadeOutSlider(): void {
  if (!sliderSrc || !sliderGain) return;
  rampSliderTo(NEAR_SILENT, FADE_OUT);
  const dyingSrc = sliderSrc;
  const dyingGain = sliderGain;
  clearTimeout(stopTimer);
  stopTimer = setTimeout(
    () => {
      try {
        dyingSrc.stop();
      } catch {
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
    rampSliderTo(SLIDER_GAIN, FADE_IN);
    return;
  }
  if (sliderStarting) return;
  sliderStarting = true;
  void decode(SLIDER_URLS[pickSlider()]).then((buf) => {
    sliderStarting = false;
    if (!buf || !active || sliderSrc || !ctx || !master) return;
    startSlider(buf);
    rampSliderTo(SLIDER_GAIN, FADE_IN);
  });
}

export function stopSliderSound(): void {
  active = false;
  clearTimeout(idleTimer);
  idleTimer = undefined;
  fadeOutSlider();
}

let rumbleSrc: AudioBufferSourceNode | null = null;
let rumbleFilter: BiquadFilterNode | null = null;
let rumbleGain: GainNode | null = null;
let rumbleIdle: ReturnType<typeof setTimeout> | undefined;
let rumbleStopTimer: ReturnType<typeof setTimeout> | undefined;

let rumbleCutoff = 160;
let rumbleQ = 0.9;
let rumbleLevel = 0.045;
let rumbleFadeIn = 0.25;
let rumbleFadeOut = 0.4;
export function setRumble(cfg: { cutoff?: number; q?: number; gain?: number; fadeIn?: number; fadeOut?: number }): void {
  const now = ctx?.currentTime ?? 0;
  if (cfg.cutoff !== undefined) {
    rumbleCutoff = cfg.cutoff;
    rumbleFilter?.frequency.setValueAtTime(rumbleCutoff, now);
  }
  if (cfg.q !== undefined) {
    rumbleQ = cfg.q;
    rumbleFilter?.Q.setValueAtTime(rumbleQ, now);
  }
  if (cfg.gain !== undefined) {
    rumbleLevel = cfg.gain;
    if (rumbleSrc) rampRumble(rumbleLevel, 0.05);
  }
  if (cfg.fadeIn !== undefined) rumbleFadeIn = cfg.fadeIn;
  if (cfg.fadeOut !== undefined) rumbleFadeOut = cfg.fadeOut;
}

let brownBuffer: AudioBuffer | null = null;
function brownNoise(c: AudioContext): AudioBuffer {
  if (brownBuffer) return brownBuffer;
  const len = c.sampleRate * 2;
  brownBuffer = c.createBuffer(1, len, c.sampleRate);
  const d = brownBuffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  return brownBuffer;
}

function rampRumble(target: number, seconds: number): void {
  if (!ctx || !rumbleGain) return;
  const now = ctx.currentTime;
  const g = rumbleGain.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(Math.max(g.value, NEAR_SILENT), now);
  g.exponentialRampToValueAtTime(Math.max(target, NEAR_SILENT), now + seconds);
}

function startRumble(): void {
  if (!ctx || !master) return;
  const src = ctx.createBufferSource();
  src.buffer = brownNoise(ctx);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = rumbleCutoff;
  filter.Q.value = rumbleQ;
  const g = ctx.createGain();
  g.gain.value = NEAR_SILENT;
  src.connect(filter).connect(g).connect(master);
  src.start();
  rumbleSrc = src;
  rumbleFilter = filter;
  rumbleGain = g;
}

function fadeOutRumble(): void {
  if (!rumbleSrc || !rumbleGain) return;
  rampRumble(NEAR_SILENT, rumbleFadeOut);
  const dyingSrc = rumbleSrc;
  const dyingFilter = rumbleFilter;
  const dyingGain = rumbleGain;
  clearTimeout(rumbleStopTimer);
  rumbleStopTimer = setTimeout(
    () => {
      try {
        dyingSrc.stop();
      } catch {
      }
      dyingSrc.disconnect();
      dyingFilter?.disconnect();
      dyingGain.disconnect();
      if (rumbleSrc === dyingSrc) {
        rumbleSrc = null;
        rumbleFilter = null;
        rumbleGain = null;
      }
    },
    rumbleFadeOut * 1000 + 80,
  );
}

export function feedRumble(): void {
  if (!ensureRunning() || !master) return;
  clearTimeout(rumbleStopTimer);
  rumbleStopTimer = undefined;
  clearTimeout(rumbleIdle);
  rumbleIdle = setTimeout(fadeOutRumble, IDLE_MS);
  if (!rumbleSrc) startRumble();
  rampRumble(rumbleLevel, rumbleFadeIn);
}
