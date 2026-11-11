import { readSoundPreference } from "./preferences";

/**
 * UI sounds (DESIGN §9), synthesised with Web Audio: no files. `armSound()` (root layout, once) waits for
 * the first tap or key press and creates/resumes the AudioContext inside it, as iOS Safari requires; nothing
 * touches audio before that, so there is no autoplay warning. `play(name)` is then safe to call from
 * anywhere (a server event, an animation): it stays silent when sounds are off, the tab is hidden or audio
 * was never unlocked, and returns whether it played.
 */
export type SoundName = "credit" | "reward" | "tick" | "arrival";

type Voice = {
  /** Hz; `to` glides there over the voice's length. */
  f: number;
  to?: number;
  /** Seconds from the start of the sound, and how long the voice lasts. */
  at: number;
  dur: number;
  /** Peak gain. Voices that start together must add up to ≤ 0.18. */
  peak: number;
  /** Seconds to the peak (default 5ms). */
  attack?: number;
  type?: OscillatorType;
  /** Detune in cents (a shimmer partial). */
  cents?: number;
};

const note = (f: number, at: number, dur: number, peak: number): Voice => ({ f, at, dur, peak });
const shimmer = (v: Voice): Voice => ({ ...v, peak: 0.04, cents: 9, type: "triangle" });
const ARPEGGIO = [1046.5, 1318.51, 1567.98].map((f, i) => note(f, i * 0.12, 0.18, 0.12));

export const SOUNDS: Readonly<Record<SoundName, readonly Voice[]>> = {
  // E5 → B5, a fifth up, 180ms.
  credit: [note(659.25, 0, 0.09, 0.16), note(987.77, 0.09, 0.09, 0.16)],
  // C6, E6, G6 with a slightly detuned partial on each, 420ms.
  reward: [...ARPEGGIO, ...ARPEGGIO.map(shimmer)],
  tick: [note(1200, 0, 0.04, 0.1)],
  // A very soft swell, low to high, 300ms.
  arrival: [{ f: 196, to: 392, at: 0, dur: 0.3, peak: 0.07, attack: 0.12 }],
};

const GESTURES = ["pointerdown", "keydown", "touchend"] as const;
const SILENT = 0.0001; // exponential ramps can't reach 0

let ctx: AudioContext | null = null;
let armed = false;
let resuming = false;

function unlock(): void {
  if (!readSoundPreference()) return; // keep listening: the toggle's own tap unlocks later
  try {
    ctx ??= new AudioContext();
    if (ctx.state !== "running") {
      resuming = true;
      const done = (): void => {
        resuming = false;
      };
      ctx.resume().then(done, done);
    }
  } catch {
    return; // audio blocked: stay silent, try again on the next gesture
  }
  disarm();
}

function disarm(): void {
  armed = false;
  for (const type of GESTURES) window.removeEventListener(type, unlock, true);
}

/** Start waiting for a user gesture to unlock audio. Safe to call more than once. */
export function armSound(): void {
  if (armed || typeof window === "undefined" || typeof AudioContext === "undefined") return;
  armed = true;
  for (const type of GESTURES)
    window.addEventListener(type, unlock, { capture: true, passive: true });
}

export function play(name: SoundName): boolean {
  if (!ctx || !readSoundPreference() || document.hidden) return false;
  if (ctx.state !== "running" && !resuming) {
    armSound(); // the browser suspended it (e.g. after a spell in the background): next gesture resumes
    return false;
  }
  const t0 = ctx.currentTime;
  for (const v of SOUNDS[name]) {
    const start = t0 + v.at;
    const end = start + v.dur;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = v.type ?? "sine";
    osc.frequency.setValueAtTime(v.f, start);
    if (v.to) osc.frequency.exponentialRampToValueAtTime(v.to, end);
    if (v.cents) osc.detune.value = v.cents;
    gain.gain.setValueAtTime(SILENT, start);
    gain.gain.linearRampToValueAtTime(v.peak, start + (v.attack ?? 0.005));
    gain.gain.exponentialRampToValueAtTime(SILENT, end);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(end);
  }
  return true;
}

/** Test helper: forget the context and listeners. */
export function resetSoundForTest(): void {
  if (typeof window !== "undefined") disarm();
  ctx = null;
  resuming = false;
}
