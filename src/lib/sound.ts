import { readSoundPreference } from "./preferences";

/**
 * UI sounds (DESIGN §9), synthesised with Web Audio: no files. `armSound()` (root layout, once) waits for
 * the first tap, click or key press and creates/resumes the AudioContext inside it, as iOS Safari requires; nothing
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

// Events that count as a user gesture for audio. Not pointerdown/touchstart: a touch only activates when
// it ends, so a context resumed on touch-down stays suspended on iOS.
const GESTURES = ["pointerup", "touchend", "click", "keydown"] as const;
const SILENT = 0.0001; // exponential ramps can't reach 0
/** A sound asked for while the context wakes is dropped if the wake takes longer than this. */
const LATE_MS = 500;

let ctx: AudioContext | null = null;
let armed = false;
/** Settles when a `resume()` asked for inside a gesture has finished (either way). */
let waking: Promise<void> | null = null;

/** Keys that are not a user gesture for audio (HTML user activation leaves them out). */
const NOT_A_GESTURE = new Set(["Escape", "Shift", "Control", "Alt", "Meta"]);

function unlock(event: Event): void {
  if ("key" in event && NOT_A_GESTURE.has(String(event.key))) return;
  if (!readSoundPreference()) return; // keep listening: the toggle's own tap unlocks later
  try {
    const audio = (ctx ??= new AudioContext());
    if (audio.state === "running") {
      disarm();
      return;
    }
    // Stay armed until it really runs: a refused resume is tried again on the next gesture.
    const settle = (): void => {
      if (waking === mine) waking = null; // a later gesture may have started a newer one
      if (audio.state === "running") disarm();
    };
    const mine: Promise<void> = audio.resume().then(settle, settle);
    waking = mine;
  } catch {
    // Audio blocked: stay silent, try again on the next gesture.
  }
}

function disarm(): void {
  armed = false;
  for (const type of GESTURES) window.removeEventListener(type, unlock, true);
}

/** Start waiting for a user gesture to unlock audio. Safe to call more than once. */
export function armSound(): void {
  if (armed || typeof window === "undefined" || typeof AudioContext === "undefined") return;
  armed = true;
  for (const type of GESTURES) {
    window.addEventListener(type, unlock, { capture: true, passive: true });
  }
}

function schedule(audio: AudioContext, name: SoundName): void {
  const t0 = audio.currentTime;
  for (const v of SOUNDS[name]) {
    const start = t0 + v.at;
    const end = start + v.dur;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = v.type ?? "sine";
    osc.frequency.setValueAtTime(v.f, start);
    if (v.to) osc.frequency.exponentialRampToValueAtTime(v.to, end);
    if (v.cents) osc.detune.value = v.cents;
    gain.gain.setValueAtTime(SILENT, start);
    gain.gain.linearRampToValueAtTime(v.peak, start + (v.attack ?? 0.005));
    gain.gain.exponentialRampToValueAtTime(SILENT, end);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(start);
    osc.stop(end);
  }
}

/**
 * Plays a sound now. Nothing is ever scheduled on a suspended context (it would all sound at once, late,
 * when the context next starts). Returns false when it stays silent; true when it plays now, or will as
 * soon as the context finishes waking inside the tap that unlocked it.
 */
export function play(name: SoundName): boolean {
  const audio = ctx;
  if (!audio || !readSoundPreference() || document.hidden) return false;
  if (audio.state === "running") {
    schedule(audio, name);
    return true;
  }
  armSound(); // suspended (never woken, or put to sleep in the background): the next gesture resumes it
  if (!waking) return false;
  // Asked inside the unlocking tap itself: sound as soon as the context wakes, or not at all.
  const asked = Date.now();
  void waking.then(() => {
    const fresh = Date.now() - asked < LATE_MS;
    if (fresh && audio.state === "running" && readSoundPreference()) schedule(audio, name);
  });
  return true;
}

/** Test helper: forget the context and listeners. */
export function resetSoundForTest(): void {
  if (typeof window !== "undefined") disarm();
  ctx = null;
  waking = null;
}
