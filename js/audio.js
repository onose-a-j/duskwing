// Tiny synthesized sound kit: no audio files to download.
let ac = null, master = null, sizzleGain = null;
let muted = false;
try { muted = localStorage.getItem('duskwing.muted') === '1'; } catch {}

export const isMuted = () => muted;

export function setMuted(v) {
  muted = v;
  try { localStorage.setItem('duskwing.muted', v ? '1' : '0'); } catch {}
  if (master) master.gain.setTargetAtTime(v ? 0 : 0.5, ac.currentTime, 0.05);
}

export function unlock() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(ac.destination);
  startAmbient();
  startSizzle();
}

function tone(freq, dur, { type = 'sine', vol = 0.15, delay = 0, slide = 0 } = {}) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

function noiseBuffer() {
  const b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function startAmbient() {
  // Two detuned pads breathing slowly: dusk ambience.
  const pad = ac.createGain();
  pad.gain.value = 0.035;
  pad.connect(master);
  [110, 164.8, 220.5].forEach((f, i) => {
    const o = ac.createOscillator();
    o.type = 'sine'; o.frequency.value = f;
    const lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.frequency.value = 0.07 + i * 0.03; lg.gain.value = 0.5;
    const g = ac.createGain(); g.gain.value = 0.5;
    lfo.connect(lg).connect(g.gain);
    o.connect(g).connect(pad);
    o.start(); lfo.start();
  });
}

function startSizzle() {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(); src.loop = true;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.8;
  sizzleGain = ac.createGain(); sizzleGain.gain.value = 0;
  src.connect(bp).connect(sizzleGain).connect(master);
  src.start();
}

export function sizzle(level) {
  if (sizzleGain) sizzleGain.gain.setTargetAtTime(level * 0.12, ac.currentTime, 0.05);
}

export function play(type) {
  switch (type) {
    case 'lampOn': tone(880, 0.12, { type: 'triangle', vol: 0.12 }); break;
    case 'lampOff': tone(440, 0.1, { type: 'triangle', vol: 0.1, slide: 0.7 }); break;
    case 'release': tone(300, 0.4, { vol: 0.08, slide: 2.5 }); break;
    case 'pollen': tone(1318, 0.12, { vol: 0.1 }); tone(1975, 0.18, { vol: 0.08, delay: 0.06 }); break;
    case 'won': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, { vol: 0.1, delay: i * 0.09 })); break;
    case 'burned': tone(180, 0.6, { type: 'sawtooth', vol: 0.06, slide: 0.4 }); break;
    case 'zapped': tone(90, 0.3, { type: 'square', vol: 0.08 }); tone(2400, 0.15, { type: 'sawtooth', vol: 0.05, slide: 0.3 }); break;
    case 'webbed': tone(220, 0.3, { type: 'triangle', vol: 0.1, slide: 0.5 }); break;
  }
}
