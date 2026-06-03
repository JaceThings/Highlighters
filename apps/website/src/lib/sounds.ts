// UI sounds: short audio files for discrete events, a Web Audio synth for the slider
// tick (fires dozens/sec on drags), and a silent looper that keeps iOS on the media
// audio session.

// Fresh `Audio` per play so rapid triggers overlap; play() rejection (autoplay
// policy, pre-interaction) is swallowed.
const SOUND_FILES = [
  "/click.webm",
  "/copy-success.webm",
  "/pill-select.webm",
  "/silent.webm",
] as const;

// Prefetch at load so the first interaction plays without a cold-cache wait.
for (const src of SOUND_FILES) {
  const a = new Audio(src);
  a.preload = "auto";
}

function playFile(src: string, volume: number) {
  const inst = new Audio(src);
  inst.volume = volume;
  inst.play().catch(() => {});
}

export const playClick = () => playFile("/click.webm", 0.6);
export const playCopySuccess = () => playFile("/copy-success.webm", 0.5);
export const playPillSelect = () => playFile("/pill-select.webm", 0.6);

// The tick: a 5.5 kHz sine partial + a short noise burst through a Q=18 bandpass,
// ringing like a small rigid click (ratchet pawl).
const TICK_VOLUME = 0.075;
const TICK_FREQ = 5500;
const TICK_DECAY_SEC = 0.006;
const NOISE_DURATION_SEC = 0.002;
const NOISE_LEVEL = 0.85;
const NOISE_Q = 18;

let ctx: AudioContext | null = null;
function audio() {
  if (!ctx) ctx = new AudioContext({ latencyHint: "interactive" });
  return ctx;
}

// iOS Safari quirks, both fixed on first gesture: (1) the AudioContext starts
// suspended and the tick fires too late for an in-handler resume, so resume + play a
// 1-sample buffer here; (2) WebAudio defaults to the ringer session (muted by the
// silent switch), so request the media session and keep a silent looping <audio>
// alive so iOS honours it.
if (typeof window !== "undefined") {
  const unlock = () => {
    try {
      const c = audio();
      c.resume().catch(() => {});
      const src = c.createBufferSource();
      src.buffer = c.createBuffer(1, 1, 22050);
      src.connect(c.destination);
      src.start(0);

      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) {
        try { nav.audioSession.type = "playback"; } catch {}
      }

      const silent = new Audio("/silent.webm");
      silent.loop = true;
      silent.setAttribute("playsinline", "");
      silent.volume = 0.0001;
      silent.play().catch(() => {});
    } catch {
      // Let the next gesture retry - don't strip the listeners.
      return;
    }
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

// 0.5 s of pre-generated white noise, reused across every fire.
let noiseBuffer: AudioBuffer | null = null;
function getNoise(c: AudioContext) {
  if (noiseBuffer) return noiseBuffer;
  const samples = c.sampleRate * 0.5;
  noiseBuffer = c.createBuffer(1, samples, c.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

// Cap at ~25 Hz (40 ms gap) - faster and the clicks smear into a buzz. The matching
// queue-ahead keeps at most ~1 tick pending, so a release feels sharp.
const TICK_MIN_GAP_SEC = 0.04;
const MAX_QUEUE_AHEAD_SEC = 0.04;
let nextTickTime = 0;

interface PendingTick {
  when: number;
  osc: OscillatorNode;
  noise: AudioBufferSourceNode;
}
let pending: PendingTick[] = [];

function scheduleOneTick(c: AudioContext, when: number) {
  const master = c.createGain();
  master.gain.value = TICK_VOLUME;
  master.connect(c.destination);

  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.value = TICK_FREQ;
  const oscEnv = c.createGain();
  oscEnv.gain.setValueAtTime(1, when);
  oscEnv.gain.exponentialRampToValueAtTime(0.0005, when + TICK_DECAY_SEC);
  osc.connect(oscEnv).connect(master);
  osc.start(when);
  osc.stop(when + TICK_DECAY_SEC + 0.02);

  const noise = c.createBufferSource();
  noise.buffer = getNoise(c);
  const nGain = c.createGain();
  nGain.gain.setValueAtTime(NOISE_LEVEL, when);
  nGain.gain.exponentialRampToValueAtTime(0.0005, when + NOISE_DURATION_SEC);
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = TICK_FREQ;
  filter.Q.value = NOISE_Q;
  noise.connect(nGain).connect(filter).connect(master);
  noise.start(when);
  noise.stop(when + NOISE_DURATION_SEC + 0.01);

  pending.push({ when, osc, noise });
}

// Cancel ticks still in the future; the firing one keeps its decay (cutting it
// glitches). Drop refs so `pending` doesn't grow across drags.
export function cancelPendingTicks() {
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const p of pending) {
    if (p.when > now) {
      try { p.osc.stop(); } catch {}
      try { p.noise.stop(); } catch {}
    }
  }
  pending = [];
  nextTickTime = now;
}

export function playTick() {
  try {
    const c = audio();
    const now = c.currentTime;
    // Earliest free slot; drop the tick if the queue runs past the look-ahead.
    const when = Math.max(now, nextTickTime);
    if (when - now > MAX_QUEUE_AHEAD_SEC) return;
    scheduleOneTick(c, when);
    nextTickTime = when + TICK_MIN_GAP_SEC;
  } catch {}
}
