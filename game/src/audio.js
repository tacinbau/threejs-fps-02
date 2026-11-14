// Procedural sound: every effect is synthesised with WebAudio, so the game ships no
// audio files and makes no network request. The context is created lazily on the
// first user gesture; in screenshot mode it is never created at all.
export function createAudio() {
  let context = null;
  let master = null;

  function ensure() {
    if (context) return context;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = 0.35;
      master.connect(context.destination);
    } catch {
      context = null;
    }
    return context;
  }

  function noiseBuffer(seconds) {
    const ctx = ensure();
    if (!ctx) return null;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ seconds = 0.12, frequency = 1200, gain = 0.5, type = 'bandpass', quality = 1 }) {
    const ctx = ensure();
    if (!ctx) return;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(seconds);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = quality;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    source.connect(filter).connect(amp).connect(master);
    source.start();
  }

  function tone({ frequency = 440, end = null, seconds = 0.1, gain = 0.3, type = 'sine' }) {
    const ctx = ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    if (end !== null) osc.frequency.exponentialRampToValueAtTime(end, ctx.currentTime + seconds);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(amp).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + seconds + 0.02);
  }

  return {
    unlock() {
      ensure();
    },
    shot(kind) {
      if (kind === 'dmr') burst({ seconds: 0.22, frequency: 700, gain: 0.8, type: 'lowpass' });
      else if (kind === 'smg') burst({ seconds: 0.07, frequency: 1800, gain: 0.35 });
      else if (kind === 'pistol') burst({ seconds: 0.09, frequency: 1500, gain: 0.45 });
      else burst({ seconds: 0.12, frequency: 1100, gain: 0.55 });
      tone({ frequency: 160, end: 60, seconds: 0.08, gain: 0.25, type: 'triangle' });
    },
    dryFire() {
      tone({ frequency: 900, seconds: 0.04, gain: 0.2, type: 'square' });
    },
    reload() {
      tone({ frequency: 500, seconds: 0.05, gain: 0.2, type: 'square' });
      setTimeout(() => tone({ frequency: 700, seconds: 0.05, gain: 0.2, type: 'square' }), 120);
    },
    hit() {
      tone({ frequency: 1200, seconds: 0.05, gain: 0.25, type: 'sine' });
    },
    kill() {
      tone({ frequency: 1200, end: 1800, seconds: 0.12, gain: 0.3, type: 'sine' });
    },
    hurt() {
      tone({ frequency: 220, end: 110, seconds: 0.18, gain: 0.4, type: 'sawtooth' });
    },
    plant() {
      tone({ frequency: 880, seconds: 0.09, gain: 0.3, type: 'sine' });
      setTimeout(() => tone({ frequency: 880, seconds: 0.09, gain: 0.3, type: 'sine' }), 140);
    },
    beep() {
      tone({ frequency: 1046, seconds: 0.07, gain: 0.2, type: 'sine' });
    },
    explosion() {
      burst({ seconds: 0.9, frequency: 220, gain: 1.0, type: 'lowpass' });
      tone({ frequency: 90, end: 35, seconds: 0.8, gain: 0.7, type: 'sine' });
    },
    roundStart() {
      tone({ frequency: 523, seconds: 0.12, gain: 0.25, type: 'sine' });
      setTimeout(() => tone({ frequency: 784, seconds: 0.18, gain: 0.25, type: 'sine' }), 130);
    },
    roundWin() {
      [523, 659, 784].forEach((f, i) => setTimeout(() => tone({ frequency: f, seconds: 0.16, gain: 0.25, type: 'sine' }), i * 130));
    },
    roundLose() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => tone({ frequency: f, seconds: 0.16, gain: 0.22, type: 'sine' }), i * 130));
    },
    buy() {
      tone({ frequency: 660, end: 990, seconds: 0.1, gain: 0.25, type: 'sine' });
    },
  };
}
