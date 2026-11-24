// Every sound in Port Solace is synthesised with WebAudio — no audio files. Short one-shot
// voices (shots, punches, pickups, jingles) are built per call from oscillators and a noise
// buffer; two loops (the police siren and the engine hum) run on gain nodes main.js fades
// with the state of the world. The context opens on the first key or click, as browsers ask.

export function createAudio() {
  let ctx = null;
  let sirenGain = null;
  let engineGain = null;
  let engineOsc = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    // The siren: two detuned squares through one quiet gain, their pitch swapped by an LFO.
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenGain.connect(ctx.destination);
    const sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'square';
    sirenOsc.frequency.value = 820;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.7;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 130;
    lfo.connect(lfoGain);
    lfoGain.connect(sirenOsc.frequency);
    sirenOsc.connect(sirenGain);
    sirenOsc.start();
    lfo.start();
    // The engine: a low saw whose pitch main.js sets with the car's speed.
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc.start();
    return ctx;
  }

  function tone(freq, dur, type = 'sine', vol = 0.16, slideTo = null, delay = 0) {
    const ac = ensure();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol = 0.2, freq = 1200, delay = 0) {
    const ac = ensure();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buffer = ac.createBuffer(1, len, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    src.start(t0);
  }

  const sounds = {
    shot: () => { noise(0.13, 0.28, 2600); tone(150, 0.09, 'square', 0.1, 60); },
    punch: () => tone(95, 0.11, 'sine', 0.3, 45),
    thud: () => { tone(70, 0.18, 'sine', 0.32, 38); noise(0.08, 0.12, 500); },
    click: () => tone(1400, 0.03, 'square', 0.06),
    steal: () => { tone(220, 0.06, 'square', 0.12); tone(330, 0.07, 'square', 0.12, null, 0.07); },
    pickup: () => { tone(660, 0.08, 'sine', 0.16); tone(990, 0.1, 'sine', 0.16, null, 0.07); },
    package: () => { tone(523, 0.09, 'triangle', 0.18); tone(659, 0.09, 'triangle', 0.18, null, 0.08); tone(784, 0.13, 'triangle', 0.18, null, 0.16); },
    cash: () => { tone(1175, 0.07, 'square', 0.1); tone(1568, 0.12, 'square', 0.1, null, 0.06); },
    checkpoint: () => tone(880, 0.12, 'triangle', 0.2, 1320),
    hurt: () => tone(190, 0.12, 'sawtooth', 0.14, 90),
    repaint: () => tone(300, 0.4, 'sine', 0.14, 900),
    mission: () => { tone(392, 0.12, 'triangle', 0.2); tone(523, 0.12, 'triangle', 0.2, null, 0.11); tone(659, 0.12, 'triangle', 0.2, null, 0.22); tone(784, 0.22, 'triangle', 0.22, null, 0.33); },
    busted: () => { tone(392, 0.2, 'square', 0.14); tone(311, 0.34, 'square', 0.14, null, 0.18); },
    wasted: () => tone(220, 0.7, 'sine', 0.2, 55),
  };

  return {
    /** Play a named one-shot; unknown names are ignored. */
    play(name) {
      const fn = sounds[name];
      if (fn) fn();
    },
    /** Open (or wake) the context from a user gesture. */
    unlock() {
      ensure();
    },
    /** Fade the siren with the wanted level; called every frame. */
    setSiren(on) {
      if (!ctx || !sirenGain) return;
      sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, ctx.currentTime, 0.25);
    },
    /** The engine hum follows the player's car; off on foot. */
    setEngine(on, frac = 0) {
      if (!ctx || !engineGain || !engineOsc) return;
      engineGain.gain.setTargetAtTime(on ? 0.05 : 0, ctx.currentTime, 0.12);
      if (on) engineOsc.frequency.setTargetAtTime(52 + frac * 105, ctx.currentTime, 0.08);
    },
  };
}
