/**
 * Zero-asset Web Audio sound effects for a tactile electrical feel. Each sound is a short list of tones and
 * filtered noise bursts. Nothing plays while sound is turned off.
 */
import { isSoundMuted, setSoundMuted } from './soundSettings';

export interface ToneVoice {
  kind: 'tone';
  wave: OscillatorType;
  /** Start frequency in Hz, sliding to `to` over the sweep (or the whole voice) */
  from: number;
  to?: number;
  sweep?: number;
  /** Start time after the sound begins, in seconds */
  at?: number;
  dur: number;
  gain: number;
}

export interface NoiseVoice {
  kind: 'noise';
  /** Centre frequency and sharpness of the band-pass filter */
  band: number;
  q: number;
  at?: number;
  dur: number;
  gain: number;
}

export type Voice = ToneVoice | NoiseVoice;

const tone = (wave: OscillatorType, from: number, to: number | undefined, dur: number, gain: number, at = 0, sweep?: number): ToneVoice => ({
  kind: 'tone', wave, from, to, dur, gain, at, sweep,
});
const noise = (band: number, q: number, dur: number, gain: number, at = 0): NoiseVoice => ({ kind: 'noise', band, q, dur, gain, at });

export const SOUND_RECIPES = {
  /** Tactile wall switch */
  switch: [tone('triangle', 420, 120, 0.04, 0.25)],
  /** Soft UI click */
  click: [tone('triangle', 420, 120, 0.04, 0.25)],
  /** Heavy DIN-rail breaker toggle */
  breaker: [tone('square', 260, 80, 0.08, 0.35, 0, 0.07)],
  /** Protective device tripping, with a metallic tail */
  trip: [tone('sawtooth', 650, 60, 0.13, 0.45, 0, 0.12)],
  /** Short circuit zap */
  spark: [noise(1800, 3, 0.15, 0.5)],
  /** Conductor clamped into a terminal: two screw clicks */
  wireConnect: [tone('triangle', 900, 500, 0.025, 0.18), noise(4000, 6, 0.02, 0.12, 0.02), tone('triangle', 1300, 700, 0.025, 0.16, 0.05)],
  /** Conductor pulled out */
  wireRemove: [tone('triangle', 640, 180, 0.09, 0.18), noise(2600, 4, 0.03, 0.1)],
  /** Device clacking onto the rail */
  place: [noise(900, 1.5, 0.05, 0.35), tone('sine', 140, 70, 0.08, 0.3)],
  /** Device taken off */
  remove: [tone('sine', 220, 60, 0.12, 0.25), noise(500, 1, 0.06, 0.15)],
  rotate: [tone('triangle', 700, 900, 0.035, 0.14)],
  /** An edit that is not allowed right now: two low buzzes */
  blocked: [tone('square', 150, undefined, 0.07, 0.12), tone('square', 150, undefined, 0.07, 0.12, 0.1)],
  /** Main contactor pulls in and the supply hums up */
  energize: [noise(700, 1.2, 0.05, 0.35), tone('sawtooth', 60, 120, 0.4, 0.08, 0.02, 0.3), tone('sine', 120, undefined, 0.35, 0.1, 0.07)],
  /** Supply drops out */
  deEnergize: [noise(500, 1.2, 0.04, 0.25), tone('sawtooth', 120, 40, 0.35, 0.08)],
  contactorIn: [noise(1200, 2, 0.03, 0.3), tone('square', 180, 90, 0.04, 0.18)],
  contactorOut: [noise(800, 2, 0.03, 0.22), tone('square', 130, 60, 0.04, 0.12)],
  buttonPress: [tone('triangle', 520, 260, 0.025, 0.16)],
  buttonRelease: [tone('triangle', 360, 520, 0.025, 0.1)],
  /** One short alarm beep at 2.4 kHz (buzzer devices and the continuity tester) */
  beep: [tone('square', 2400, undefined, 0.3, 0.06)],
} satisfies Record<string, Voice[]>;

export type SoundName = keyof typeof SOUND_RECIPES;

let ctx: AudioContext | null = null;
let noiseSeed: AudioContext | null = null;
const noiseBuffers = new Map<number, AudioBuffer>();

function audioContext(): AudioContext | null {
  if (!ctx) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx() as AudioContext;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Decaying white noise of the given length, made once per context */
function noiseBuffer(audio: AudioContext, dur: number): AudioBuffer {
  if (noiseSeed !== audio) {
    noiseBuffers.clear();
    noiseSeed = audio;
  }
  let buffer = noiseBuffers.get(dur);
  if (!buffer) {
    const size = Math.max(1, Math.floor(audio.sampleRate * dur));
    buffer = audio.createBuffer(1, size, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (size * 0.3));
    noiseBuffers.set(dur, buffer);
  }
  return buffer;
}

function playVoice(audio: AudioContext, voice: Voice): void {
  const start = audio.currentTime + (voice.at ?? 0);
  const gain = audio.createGain();
  gain.gain.setValueAtTime(voice.gain, start);
  gain.connect(audio.destination);

  if (voice.kind === 'noise') {
    const source = audio.createBufferSource();
    source.buffer = noiseBuffer(audio, voice.dur);
    const filter = audio.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = voice.band;
    filter.Q.value = voice.q;
    source.connect(filter);
    filter.connect(gain);
    source.start(start);
    return;
  }

  const osc = audio.createOscillator();
  osc.type = voice.wave;
  osc.frequency.setValueAtTime(voice.from, start);
  if (voice.to !== undefined) osc.frequency.exponentialRampToValueAtTime(voice.to, start + (voice.sweep ?? voice.dur));
  gain.gain.exponentialRampToValueAtTime(0.001, start + voice.dur);
  osc.connect(gain);
  osc.start(start);
  osc.stop(start + voice.dur + 0.01);
}

/** Sounds a held key or a drag could otherwise repeat into a stutter (ms between plays) */
const MIN_GAP_MS: Partial<Record<SoundName, number>> = { blocked: 400 };
const lastPlayed = new Map<SoundName, number>();

export function playSound(name: SoundName): void {
  if (isSoundMuted()) return;
  const gap = MIN_GAP_MS[name];
  if (gap) {
    const now = Date.now();
    if (now - (lastPlayed.get(name) ?? 0) < gap) return;
    lastPlayed.set(name, now);
  }
  try {
    const audio = audioContext();
    if (!audio) return;
    for (const voice of SOUND_RECIPES[name]) playVoice(audio, voice);
  } catch {
    // audio unavailable or blocked until the first click
  }
}

/** Flips the saved switch. Turning sound on answers with a click, so the change can be heard. */
export function toggleSound(): boolean {
  const muted = !isSoundMuted();
  setSoundMuted(muted);
  if (!muted) playSound('switch');
  return muted;
}

/** The sound for operating a device on the workbench */
export function deviceToggleSound(type: string): SoundName {
  return /mcb|rcd|rcbo|breaker|fuse|isolator|disconnect/.test(type) ? 'breaker' : 'switch';
}

/** Which coils picked up or dropped out since the last solve, for contactor and relay clicks */
export function coilTransitions(
  previous: ReadonlySet<string>,
  devices: ReadonlyArray<{ id: string; state: Record<string, any> }>
): { energized: Set<string>; pulledIn: boolean; droppedOut: boolean } {
  const energized = new Set(devices.filter((d) => d.state.coilEnergized).map((d) => d.id));
  return {
    energized,
    pulledIn: [...energized].some((id) => !previous.has(id)),
    droppedOut: [...previous].some((id) => !energized.has(id)),
  };
}
