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

export const feedSliderSound = (): void => call((e) => e.feedSliderSound());

export const stopSliderSound = (): void => call((e) => e.stopSliderSound());

export const feedRumble = (): void => call((e) => e.feedRumble());

export const setRumble = (cfg: Parameters<Engine["setRumble"]>[0]): void =>
  call((e) => e.setRumble(cfg));
