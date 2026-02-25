// Web Audio API based sound effects – no external audio files needed
type SoundType = 'deal' | 'check' | 'call' | 'raise' | 'fold' | 'allIn' | 'win' | 'chip' | 'turn' | 'notify';

let audioCtx: AudioContext | null = null;
let enabled = true;
let volume = 0.5;

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
    }
  } catch {}
}
loadSoundPrefs();

function saveSoundPrefs() {
  try {
    localStorage.setItem('texas-agent-sound', JSON.stringify({ enabled, volume }));
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
        // Dramatic chip push
        playChipSound();
        vibrate([100, 50, 100, 50, 200]); // dramatic vibration pattern for all-in
        setTimeout(() => {
          playTone(523, 0.2, 'triangle', volume * 0.2);
          setTimeout(() => playTone(659, 0.2, 'triangle', volume * 0.2), 100);
          setTimeout(() => playTone(784, 0.3, 'triangle', volume * 0.25), 200);
        }, 150);
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
