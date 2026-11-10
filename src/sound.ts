// Sounds are synthesized with Web Audio: no files to download. Off by default.
// The AudioContext is created on the first tap that enables sound, since browsers
// only allow audio to start from a user gesture.

export type Cue = 'tap' | 'stamp' | 'correct' | 'wrong';

let ctx: AudioContext | null = null;
let enabled = false;
let noise: AudioBuffer | null = null;

/** Only records the setting; the AudioContext waits for the next tap or key (see unlock). */
export function setSoundEnabled(on: boolean) {
  enabled = on;
}

/**
 * Call from a user gesture (tap, click, key). Creates or wakes the AudioContext there,
 * because browsers refuse to start audio anywhere else. Safari also wants a sound to
 * actually start inside the gesture, so a silent one is played.
 */
export function unlock() {
  if (!enabled) return;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.connect(ctx.destination);
      src.start();
    }
    if (ctx.state !== 'running') void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function play(cue: Cue) {
  if (!enabled || !ctx) return;
  const c = ctx;
  const go = () => {
    try {
      CUES[cue](c, c.currentTime + 0.005);
    } catch {
      // A sound failing must never affect play.
    }
  };
  // A context that is still waking up (Safari starts them suspended; iOS suspends them
  // when the app is backgrounded) plays the cue once it is running instead of dropping it.
  if (c.state === 'running') go();
  else c.resume().then(() => c.state === 'running' && go(), () => {});
}

function envelope(c: AudioContext, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(c.destination);
  return g;
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === c.sampleRate) return noise;
  noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.3), c.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

function tone(c: AudioContext, t: number, type: OscillatorType, from: number, to: number, out: AudioNode, dur: number) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  o.connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const CUES: Record<Cue, (c: AudioContext, t: number) => void> = {
  tap(c, t) {
    tone(c, t, 'triangle', 1400, 900, envelope(c, t, 0.08, 0.002, 0.04), 0.05);
  },

  // Rubber stamp: a dull thump plus a short burst of filtered noise.
  stamp(c, t) {
    tone(c, t, 'sine', 140, 45, envelope(c, t, 0.9, 0.004, 0.22), 0.25);
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1100;
    src.connect(filter);
    filter.connect(envelope(c, t, 0.5, 0.002, 0.09));
    src.start(t);
    src.stop(t + 0.12);
  },

  // Two rising notes.
  correct(c, t) {
    tone(c, t, 'triangle', 784, 784, envelope(c, t, 0.22, 0.005, 0.18), 0.2);
    tone(c, t + 0.1, 'triangle', 1175, 1175, envelope(c, t + 0.1, 0.22, 0.005, 0.32), 0.34);
  },

  // Game-show buzzer: two detuned sawtooths through a lowpass.
  wrong(c, t) {
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.connect(envelope(c, t, 0.28, 0.01, 0.42));
    tone(c, t, 'sawtooth', 110, 104, filter, 0.42);
    tone(c, t, 'sawtooth', 116.5, 110, filter, 0.42);
  },
};
