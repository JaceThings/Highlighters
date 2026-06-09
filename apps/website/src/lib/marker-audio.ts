// Facade over the Web Audio engine (marker-audio-engine.ts), which only this module may import,
// and only dynamically, so the engine builds as its own lazy chunk. Forwarding policy: once the
// engine is loaded every call forwards synchronously; before that, any call starts the one engine
// load, no-ops, and returns the API's pre-decode no-signal value (0 for duration-returning
// players, void otherwise). Only primeMarkerAudio forwards after the load resolves; early
// one-shots and feeds are dropped, matching the engine's silent-before-decode contract, and a
// dropped feed can never start a loop, so no stop can be orphaned. A failed load (e.g. a stale
// tab requesting a purged chunk after a redeploy) clears the latch so the next trigger retries.

type Engine = typeof import("./marker-audio-engine.ts");

let engine: Engine | null = null;
let loading: Promise<Engine | null> | null = null;

function load(): Promise<Engine | null> {
  loading ??= import("./marker-audio-engine.ts").then(
    (m) => (engine = m),
    () => {
      loading = null;
      return null;
    },
  );
  return loading;
}

function call(fn: (e: Engine) => void): void {
  if (engine) fn(engine);
  else void load();
}

function play(fn: (e: Engine) => number): number {
  if (engine) return fn(engine);
  void load();
  return 0;
}

/** Warm the context and decode every clip before the first real trigger. Idempotent, so callers
 *  can fire it on any early opportunity (idle, first interaction, control hover). */
export const primeMarkerAudio = (): void => void load().then((m) => m?.primeMarkerAudio());

export const playCircleSound = (): number => play((e) => e.playCircleSound());
export const playZigZagSound = (): number => play((e) => e.playZigZagSound());
export const playColorBloop = (): number => play((e) => e.playColorBloop());
export const playMarkerSelect = (): number => play((e) => e.playMarkerSelect());
export const playNavHome = (): number => play((e) => e.playNavHome());
export const playNavDocs = (): number => play((e) => e.playNavDocs());
export const playMenuOpen = (): number => play((e) => e.playMenuOpen());
export const playMenuClose = (): number => play((e) => e.playMenuClose());
export const playOptionClick = (): number => play((e) => e.playOptionClick());

/** Call repeatedly while a slider is being scrubbed; the voice fades itself out once feeds stop. */
export const feedSliderSound = (): void => call((e) => e.feedSliderSound());

/** Force the slider voice to fade now (e.g. on drag release or unmount). */
export const stopSliderSound = (): void => call((e) => e.stopSliderSound());

/** Call repeatedly while a popup slider moves; the rumble fades itself out once feeds stop. */
export const feedRumble = (): void => call((e) => e.feedRumble());

export const setRumble = (cfg: Parameters<Engine["setRumble"]>[0]): void =>
  call((e) => e.setRumble(cfg));
