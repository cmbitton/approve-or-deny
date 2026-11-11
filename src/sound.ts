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
  if (!on) silentLoop?.pause();
}

// iOS routes Web Audio through the "ambient" audio session, which the Ring/Silent
// switch mutes, so sound looked broken on iPhones set to silent. Asking for the
// "playback" session (iOS 17+) makes it behave like any other media. Older iOS has
// no such API, but a playing <audio> element switches the session the same way,
// so a silent looping one is started from the gesture instead.
let silentLoop: HTMLAudioElement | null = null;

function usePlaybackSession() {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) {
    try {
      session.type = 'playback';
      return;
    } catch {
      // Fall through to the <audio> workaround.
    }
  }
  if (!/iPad|iPhone|iPod/.test(navigator.userAgent) && !(navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent))) return;
  if (!silentLoop) {
    silentLoop = document.createElement('audio');
    silentLoop.setAttribute('x-webkit-airplay', 'deny');
    silentLoop.preload = 'auto';
    silentLoop.loop = true;
    silentLoop.src = silentWav();
  }
  void silentLoop.play().catch(() => {});
}

/** A short silent mono WAV as a data URI. */
function silentWav(): string {
  const rate = 8000;
  const samples = rate / 10;
  const bytes = new Uint8Array(44 + samples);
  const v = new DataView(bytes.buffer);
  const str = (o: number, t: string) => [...t].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true); // 8-bit
  str(36, 'data');
  v.setUint32(40, samples, true);
  bytes.fill(128, 44); // 8-bit silence is the midpoint
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

/**
 * Call from a user gesture (tap, click, key). Creates or wakes the AudioContext there,
 * because browsers refuse to start audio anywhere else. Safari also wants a sound to
 * actually start inside the gesture, so a silent one is played.
 */
export function unlock() {
  if (!enabled) return;
  usePlaybackSession();
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
