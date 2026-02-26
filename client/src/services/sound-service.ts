// Web Audio API based sound effects & BGM – no external audio files needed
type SoundType = 'deal' | 'check' | 'call' | 'raise' | 'fold' | 'allIn' | 'win' | 'chip' | 'turn' | 'notify';

let audioCtx: AudioContext | null = null;
let enabled = true;
let volume = 0.5;
let bgmEnabled = true;
let bgmVolume = 0.3;

// --- Vibration (haptic feedback) support ---
function vibrate(pattern: number | number[]) {
  try {
    if (navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  } catch {}
}

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function loadSoundPrefs() {
  try {
    const stored = localStorage.getItem('texas-agent-sound');
    if (stored) {
      const prefs = JSON.parse(stored);
      enabled = prefs.enabled ?? true;
      volume = prefs.volume ?? 0.5;
      bgmEnabled = prefs.bgmEnabled ?? true;
      bgmVolume = prefs.bgmVolume ?? 0.3;
    }
  } catch {}
}
loadSoundPrefs();

function saveSoundPrefs() {
  try {
    localStorage.setItem('texas-agent-sound', JSON.stringify({ enabled, volume, bgmEnabled, bgmVolume }));
  } catch {}
}

export function isSoundEnabled(): boolean { return enabled; }
export function getSoundVolume(): number { return volume; }

export function setSoundEnabled(val: boolean) {
  enabled = val;
  saveSoundPrefs();
}

export function setSoundVolume(val: number) {
  volume = Math.max(0, Math.min(1, val));
  saveSoundPrefs();
}

// Synthesized sound generators
function playTone(freq: number, duration: number, type: OscillatorType = 'sine', vol = volume) {
  if (!enabled) return;
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol * 0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

function playNoise(duration: number, vol = volume) {
  if (!enabled) return;
  const ctx = getCtx();
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.3;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 3000;
  gain.gain.setValueAtTime(vol * 0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start();
  source.stop(ctx.currentTime + duration);
}

function playChipSound() {
  if (!enabled) return;
  // Simulate chip clinking: quick burst of high frequencies
  const ctx = getCtx();
  for (let i = 0; i < 3; i++) {
    const delay = i * 0.04;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 4000 + Math.random() * 2000;
    gain.gain.setValueAtTime(volume * 0.12, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + 0.08);
  }
}

function playRaiseSound() {
  if (!enabled) return;
  const ctx = getCtx();
  const now = ctx.currentTime;

  // 1) Low-freq impact hit (like slamming chips on table)
  const impactOsc = ctx.createOscillator();
  const impactGain = ctx.createGain();
  impactOsc.type = 'sine';
  impactOsc.frequency.setValueAtTime(120, now);
  impactOsc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
  impactGain.gain.setValueAtTime(volume * 0.5, now);
  impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  impactOsc.connect(impactGain);
  impactGain.connect(ctx.destination);
  impactOsc.start(now);
  impactOsc.stop(now + 0.2);

  // 2) Noise burst for texture (chip slam impact)
  const bufLen = ctx.sampleRate * 0.1;
  const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const noiseData = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    noiseData[i] = (Math.random() * 2 - 1) * 0.5;
  }
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = noiseBuf;
  const noiseFilt = ctx.createBiquadFilter();
  noiseFilt.type = 'bandpass';
  noiseFilt.frequency.value = 2000;
  noiseFilt.Q.value = 1.5;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(volume * 0.25, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  noiseSrc.connect(noiseFilt);
  noiseFilt.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noiseSrc.start(now);
  noiseSrc.stop(now + 0.1);

  // 3) Heavy chip clinking (more chips, lower freq range)
  for (let i = 0; i < 5; i++) {
    const delay = 0.05 + i * 0.03;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 3000 + Math.random() * 3000;
    gain.gain.setValueAtTime(volume * 0.18, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + delay);
    osc.stop(now + delay + 0.06);
  }

  // 4) Rising power tone (aggressive ascent)
  setTimeout(() => {
    const riseOsc = ctx.createOscillator();
    const riseGain = ctx.createGain();
    riseOsc.type = 'sawtooth';
    const t = ctx.currentTime;
    riseOsc.frequency.setValueAtTime(400, t);
    riseOsc.frequency.exponentialRampToValueAtTime(1200, t + 0.25);
    riseGain.gain.setValueAtTime(volume * 0.12, t);
    riseGain.gain.setValueAtTime(volume * 0.15, t + 0.1);
    riseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    riseOsc.connect(riseGain);
    riseGain.connect(ctx.destination);
    riseOsc.start(t);
    riseOsc.stop(t + 0.3);
  }, 120);
}

function playAllInSound() {
  if (!enabled) return;
  const ctx = getCtx();
  const now = ctx.currentTime;

  // 1) Deep sub-bass boom
  const boomOsc = ctx.createOscillator();
  const boomGain = ctx.createGain();
  boomOsc.type = 'sine';
  boomOsc.frequency.setValueAtTime(60, now);
  boomOsc.frequency.exponentialRampToValueAtTime(20, now + 0.4);
  boomGain.gain.setValueAtTime(volume * 0.7, now);
  boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  boomOsc.connect(boomGain);
  boomGain.connect(ctx.destination);
  boomOsc.start(now);
  boomOsc.stop(now + 0.5);

  // 2) Explosive noise burst
  const bufLen = ctx.sampleRate * 0.15;
  const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const noiseData = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    noiseData[i] = (Math.random() * 2 - 1) * 0.7;
  }
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = noiseBuf;
  const noiseFilt = ctx.createBiquadFilter();
  noiseFilt.type = 'bandpass';
  noiseFilt.frequency.value = 1500;
  noiseFilt.Q.value = 0.8;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(volume * 0.35, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  noiseSrc.connect(noiseFilt);
  noiseFilt.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noiseSrc.start(now);
  noiseSrc.stop(now + 0.15);

  // 3) Heavy chip cascade (lots of chips sliding)
  for (let i = 0; i < 8; i++) {
    const delay = 0.05 + i * 0.025;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 3000 + Math.random() * 4000;
    gain.gain.setValueAtTime(volume * 0.15, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + delay);
    osc.stop(now + delay + 0.07);
  }

  // 4) Dramatic rising power chord (C-E-G-C)
  setTimeout(() => {
    const t = ctx.currentTime;
    const chordNotes = [261.63, 329.63, 392.00, 523.25, 659.25];
    chordNotes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i < 2 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq * 0.5, t);
      osc.frequency.exponentialRampToValueAtTime(freq, t + 0.15);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume * 0.12, t + 0.08);
      gain.gain.setValueAtTime(volume * 0.12, t + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  }, 200);

  // 5) Final impact stinger
  setTimeout(() => {
    const t = ctx.currentTime;
    const stingOsc = ctx.createOscillator();
    const stingGain = ctx.createGain();
    stingOsc.type = 'square';
    stingOsc.frequency.setValueAtTime(880, t);
    stingOsc.frequency.exponentialRampToValueAtTime(440, t + 0.1);
    stingGain.gain.setValueAtTime(volume * 0.2, t);
    stingGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    stingOsc.connect(stingGain);
    stingGain.connect(ctx.destination);
    stingOsc.start(t);
    stingOsc.stop(t + 0.15);
  }, 500);
}

export function playSound(type: SoundType) {
  if (!enabled) return;
  try {
    switch (type) {
      case 'deal':
        // Card slide sound
        playNoise(0.12, volume * 0.8);
        playTone(800, 0.06, 'sine', volume * 0.1);
        break;
      case 'check':
        // Double tap
        playTone(600, 0.08, 'sine');
        setTimeout(() => playTone(700, 0.08, 'sine'), 80);
        break;
      case 'call':
        playChipSound();
        break;
      case 'raise':
        // Aggressive raise: impact hit + power surge + chip slam
        playRaiseSound();
        vibrate([50, 30, 100]); // short-pause-long vibration pattern
        break;
      case 'fold':
        // Soft swoosh
        playNoise(0.2, volume * 0.4);
        playTone(300, 0.15, 'sine', volume * 0.08);
        break;
      case 'allIn':
        // Epic all-in: dramatic build-up + explosive impact
        playAllInSound();
        vibrate([100, 50, 100, 50, 200]); // dramatic vibration pattern for all-in
        break;
      case 'win':
        // Victory fanfare
        const notes = [523, 659, 784, 1047];
        notes.forEach((freq, i) => {
          setTimeout(() => playTone(freq, 0.3, 'triangle', volume * 0.2), i * 120);
        });
        break;
      case 'chip':
        playChipSound();
        break;
      case 'turn':
        // Your turn notification
        playTone(880, 0.1, 'sine', volume * 0.15);
        setTimeout(() => playTone(1100, 0.15, 'sine', volume * 0.2), 120);
        break;
      case 'notify':
        playTone(660, 0.1, 'triangle', volume * 0.15);
        break;
    }
  } catch {
    // Audio context may be blocked by browser policy, silently ignore
  }
}

// ==================== BGM System (3 distinct scenes) ====================
// Each scene has a unique synthesized BGM style:
// - lobby: Chill lo-fi jazz — relaxed, ambient, smooth
// - singlePlayer: Focused groove — moderate tempo, bluesy, confident
// - multiplayer: Intense battle — fast, driving, high-energy

export type BGMScene = 'lobby' | 'singlePlayer' | 'multiplayer';

let bgmPlaying = false;
let bgmCurrentScene: BGMScene | null = null;
let bgmGainNode: GainNode | null = null;
let bgmOscillators: OscillatorNode[] = [];
let bgmTimeouts: ReturnType<typeof setTimeout>[] = [];

// ── Lobby BGM: Chill lo-fi jazz (ii-V-I-vi in C major) ──
const LOBBY_CHORDS = [
  [146.83, 174.61, 220.00, 261.63], // Dm7
  [98.00, 246.94, 293.66, 349.23],  // G7
  [130.81, 164.81, 196.00, 246.94], // Cmaj7
  [110.00, 130.81, 164.81, 196.00], // Am7
];
const LOBBY_BEAT = 2.8; // slower, more relaxed

const LOBBY_MELODY = [
  [293.66, 330.00, 349.23, 330.00],
  [392.00, 349.23, 330.00, 293.66],
  [330.00, 349.23, 392.00, 440.00],
  [261.63, 293.66, 330.00, 293.66],
];

function playLobbyLoop(ctx: AudioContext, vol: number) {
  if (!bgmPlaying || !bgmEnabled) return;
  const now = ctx.currentTime;

  LOBBY_CHORDS.forEach((chord, i) => {
    const start = now + i * LOBBY_BEAT;
    // Pad chords — very soft, warm
    chord.forEach((freq, j) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = j === 0 ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      filter.Q.value = 0.4;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(vol * 0.05, start + 0.4);
      gain.gain.setValueAtTime(vol * 0.05, start + LOBBY_BEAT - 0.6);
      gain.gain.linearRampToValueAtTime(0, start + LOBBY_BEAT);
      osc.connect(filter); filter.connect(gain);
      if (bgmGainNode) gain.connect(bgmGainNode);
      osc.start(start); osc.stop(start + LOBBY_BEAT);
      bgmOscillators.push(osc);
    });

    // Melody — gentle sine notes
    const melody = LOBBY_MELODY[i % LOBBY_MELODY.length];
    const noteLen = LOBBY_BEAT / melody.length;
    melody.forEach((freq, j) => {
      const t = start + j * noteLen;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = 'sine';
      osc.frequency.value = freq;
      filter.type = 'lowpass'; filter.frequency.value = 1000;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol * 0.028, t + 0.05);
      gain.gain.setValueAtTime(vol * 0.028, t + noteLen * 0.6);
      gain.gain.linearRampToValueAtTime(0, t + noteLen * 0.95);
      osc.connect(filter); filter.connect(gain);
      if (bgmGainNode) gain.connect(bgmGainNode);
      osc.start(t); osc.stop(t + noteLen);
      bgmOscillators.push(osc);
    });
  });

  const loopMs = LOBBY_CHORDS.length * LOBBY_BEAT * 1000;
  const tid = setTimeout(() => playLobbyLoop(ctx, vol), loopMs - 100);
  bgmTimeouts.push(tid);
}

// ── Single Player BGM: Focused blues groove (I-IV-I-V in A minor) ──
const SINGLE_CHORDS = [
  [110.00, 164.81, 220.00, 261.63], // Am7
  [146.83, 220.00, 261.63, 349.23], // Dm7
  [110.00, 164.81, 220.00, 329.63], // Am(add9)
  [164.81, 196.00, 246.94, 329.63], // Em7
];
const SINGLE_BEAT = 2.0; // moderate tempo

const SINGLE_MELODY = [
  [440.00, 493.88, 523.25, 493.88, 440.00, 392.00, 440.00, 523.25],
  [587.33, 523.25, 493.88, 440.00, 392.00, 440.00, 493.88, 440.00],
  [523.25, 587.33, 659.25, 587.33, 523.25, 493.88, 440.00, 523.25],
  [392.00, 440.00, 493.88, 523.25, 587.33, 523.25, 493.88, 440.00],
];

// Walking bass line for groove
const SINGLE_BASS = [
  [110.00, 130.81, 146.83, 130.81],
  [146.83, 164.81, 174.61, 146.83],
  [110.00, 123.47, 130.81, 146.83],
  [164.81, 146.83, 130.81, 123.47],
];

function playSinglePlayerLoop(ctx: AudioContext, vol: number) {
  if (!bgmPlaying || !bgmEnabled) return;
  const now = ctx.currentTime;

  SINGLE_CHORDS.forEach((chord, i) => {
    const start = now + i * SINGLE_BEAT;

    // Pad — slightly brighter than lobby
    chord.forEach((freq, j) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = j === 0 ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      filter.type = 'lowpass'; filter.frequency.value = 900; filter.Q.value = 0.6;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(vol * 0.055, start + 0.25);
      gain.gain.setValueAtTime(vol * 0.055, start + SINGLE_BEAT - 0.4);
      gain.gain.linearRampToValueAtTime(0, start + SINGLE_BEAT);
      osc.connect(filter); filter.connect(gain);
      if (bgmGainNode) gain.connect(bgmGainNode);
      osc.start(start); osc.stop(start + SINGLE_BEAT);
      bgmOscillators.push(osc);
    });

    // Melody — bluesy, 8 notes per chord
    const melody = SINGLE_MELODY[i % SINGLE_MELODY.length];
    const noteLen = SINGLE_BEAT / melody.length;
    melody.forEach((freq, j) => {
      const t = start + j * noteLen;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = j % 3 === 0 ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol * 0.04, t + 0.03);
      gain.gain.setValueAtTime(vol * 0.04, t + noteLen * 0.55);
      gain.gain.linearRampToValueAtTime(0, t + noteLen * 0.9);
      osc.connect(gain);
      if (bgmGainNode) gain.connect(bgmGainNode);
      osc.start(t); osc.stop(t + noteLen);
      bgmOscillators.push(osc);
    });

    // Walking bass — adds groove
    const bass = SINGLE_BASS[i % SINGLE_BASS.length];
    const bassLen = SINGLE_BEAT / bass.length;
    bass.forEach((freq, j) => {
      const t = start + j * bassLen;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol * 0.07, t + 0.02);
      gain.gain.setValueAtTime(vol * 0.07, t + bassLen * 0.6);
      gain.gain.linearRampToValueAtTime(0, t + bassLen * 0.9);
      osc.connect(gain);
      if (bgmGainNode) gain.connect(bgmGainNode);
      osc.start(t); osc.stop(t + bassLen);
      bgmOscillators.push(osc);
    });
  });

  const loopMs = SINGLE_CHORDS.length * SINGLE_BEAT * 1000;
  const tid = setTimeout(() => playSinglePlayerLoop(ctx, vol), loopMs - 100);
  bgmTimeouts.push(tid);
}

// ── Multiplayer BGM: Intense battle (i-VII-VI-V in E minor, driving rhythm) ──
const MULTI_CHORDS = [
  [164.81, 246.94, 329.63, 493.88], // Em
  [146.83, 220.00, 293.66, 440.00], // D
  [130.81, 196.00, 261.63, 392.00], // C
  [123.47, 185.00, 246.94, 369.99], // B7
];
const MULTI_BEAT = 1.5; // fast!

const MULTI_MELODY = [
  [659.25, 739.99, 783.99, 880.00, 783.99, 739.99, 659.25, 587.33, 659.25, 783.99, 880.00, 783.99],
  [587.33, 659.25, 739.99, 659.25, 587.33, 523.25, 587.33, 659.25, 739.99, 783.99, 739.99, 659.25],
  [523.25, 587.33, 659.25, 739.99, 783.99, 739.99, 659.25, 587.33, 523.25, 587.33, 659.25, 587.33],
  [493.88, 587.33, 659.25, 739.99, 783.99, 880.00, 783.99, 659.25, 587.33, 493.88, 587.33, 659.25],
];

const MULTI_BASS = [
  [82.41, 82.41, 98.00, 82.41, 110.00, 82.41],
  [73.42, 73.42, 87.31, 73.42, 98.00, 73.42],
  [65.41, 65.41, 82.41, 65.41, 98.00, 82.41],
  [61.74, 61.74, 73.42, 82.41, 98.00, 82.41],
];

function playMultiplayerLoop(ctx: AudioContext, vol: number) {
  if (!bgmPlaying || !bgmEnabled) return;
  const now = ctx.currentTime;

  MULTI_CHORDS.forEach((chord, i) => {
    const start = now + i * MULTI_BEAT;

    // Power chords — aggressive, louder
    chord.forEach((freq, j) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = j < 2 ? 'sawtooth' : 'triangle';
      osc.frequency.value = freq;
      filter.type = 'lowpass'; filter.frequency.value = 1200; filter.Q.value = 1.0;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(vol * 0.045, start + 0.08);
      gain.gain.setValueAtTime(vol * 0.045, start + MULTI_BEAT - 0.2);
      gain.gain.linearRampToValueAtTime(0, start + MULTI_BEAT);
      osc.connect(filter); filter.connect(gain);
      if (bgmGainNode) gain.connect(bgmGainNode);
      osc.start(start); osc.stop(start + MULTI_BEAT);
      bgmOscillators.push(osc);
    });

    // Fast melody — 12 notes per chord for intensity
    const melody = MULTI_MELODY[i % MULTI_MELODY.length];
    const noteLen = MULTI_BEAT / melody.length;
    melody.forEach((freq, j) => {
      const t = start + j * noteLen;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = j % 2 === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.value = freq;
      // Punchy, staccato notes
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol * 0.038, t + 0.01);
      gain.gain.setValueAtTime(vol * 0.038, t + noteLen * 0.4);
      gain.gain.linearRampToValueAtTime(0, t + noteLen * 0.75);
      osc.connect(gain);
      if (bgmGainNode) gain.connect(bgmGainNode);
      osc.start(t); osc.stop(t + noteLen);
      bgmOscillators.push(osc);
    });

    // Driving bass — rhythmic, heavy
    const bass = MULTI_BASS[i % MULTI_BASS.length];
    const bassLen = MULTI_BEAT / bass.length;
    bass.forEach((freq, j) => {
      const t = start + j * bassLen;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      // Tight, punchy bass
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol * 0.09, t + 0.01);
      gain.gain.setValueAtTime(vol * 0.09, t + bassLen * 0.5);
      gain.gain.linearRampToValueAtTime(0, t + bassLen * 0.8);
      osc.connect(gain);
      if (bgmGainNode) gain.connect(bgmGainNode);
      osc.start(t); osc.stop(t + bassLen);
      bgmOscillators.push(osc);
    });

    // Percussive hits (noise-based) — adds rhythmic drive
    const hitCount = 4;
    const hitLen = MULTI_BEAT / hitCount;
    for (let h = 0; h < hitCount; h++) {
      const t = start + h * hitLen;
      const bufLen = Math.floor(ctx.sampleRate * 0.04);
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let s = 0; s < bufLen; s++) {
        data[s] = (Math.random() * 2 - 1) * 0.5;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hpf = ctx.createBiquadFilter();
      hpf.type = 'highpass'; hpf.frequency.value = 4000;
      const hGain = ctx.createGain();
      const accent = h === 0 || h === 2 ? 1.4 : 0.8;
      hGain.gain.setValueAtTime(vol * 0.06 * accent, t);
      hGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      src.connect(hpf); hpf.connect(hGain);
      if (bgmGainNode) hGain.connect(bgmGainNode);
      src.start(t); src.stop(t + 0.04);
    }
  });

  const loopMs = MULTI_CHORDS.length * MULTI_BEAT * 1000;
  const tid = setTimeout(() => playMultiplayerLoop(ctx, vol), loopMs - 100);
  bgmTimeouts.push(tid);
}

// ── BGM control functions ──

export function startBGM(scene: BGMScene = 'lobby') {
  // If already playing the same scene, do nothing
  if (bgmPlaying && bgmCurrentScene === scene) return;
  // If playing a different scene, stop first
  if (bgmPlaying) stopBGM();
  if (!bgmEnabled) return;
  try {
    const ctx = getCtx();
    bgmGainNode = ctx.createGain();
    bgmGainNode.gain.value = 1;
    bgmGainNode.connect(ctx.destination);
    bgmPlaying = true;
    bgmCurrentScene = scene;
    switch (scene) {
      case 'lobby': playLobbyLoop(ctx, bgmVolume); break;
      case 'singlePlayer': playSinglePlayerLoop(ctx, bgmVolume); break;
      case 'multiplayer': playMultiplayerLoop(ctx, bgmVolume); break;
    }
  } catch {}
}

export function stopBGM() {
  bgmPlaying = false;
  // Keep bgmCurrentScene so toggle can resume the correct scene
  bgmTimeouts.forEach(tid => clearTimeout(tid));
  bgmTimeouts = [];
  bgmOscillators.forEach(osc => {
    try { osc.stop(); } catch {}
  });
  bgmOscillators = [];
  if (bgmGainNode) {
    try { bgmGainNode.disconnect(); } catch {}
    bgmGainNode = null;
  }
}

export function getBGMScene(): BGMScene | null { return bgmCurrentScene; }

export function isBGMEnabled(): boolean { return bgmEnabled; }
export function getBGMVolume(): number { return bgmVolume; }

export function setBGMEnabled(val: boolean) {
  bgmEnabled = val;
  saveSoundPrefs();
  if (!val) {
    stopBGM();
  }
}

export function setBGMVolume(val: number) {
  bgmVolume = Math.max(0, Math.min(1, val));
  saveSoundPrefs();
}

export function isBGMPlaying(): boolean { return bgmPlaying; }
