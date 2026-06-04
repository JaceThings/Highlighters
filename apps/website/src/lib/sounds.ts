// UI sounds: a short audio file per discrete event, plus a silent looper that keeps iOS
// on the media audio session so the effects play through the hardware mute switch.

// Fresh `Audio` per play so rapid triggers overlap; play() rejection (autoplay
// policy, pre-interaction) is swallowed.
const SOUND_FILES = ["/pill-select.webm", "/silent.webm"] as const;

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

export const playPillSelect = () => playFile("/pill-select.webm", 0.6);

// iOS Safari defaults audio to the ringer session (muted by the silent switch). On the
// first gesture, request the media session and keep a silent looping <audio> alive so
// iOS honours it for the effects above.
if (typeof window !== "undefined") {
  const unlock = () => {
    try {
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
