// SOLMAR — synthesized sound. Every effect and the ambient music loop are
// built from WebAudio oscillators and filtered noise, so the game ships no
// audio files at all. Nothing plays until the player first interacts with
// the page (browsers require a user gesture for audio).

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  /** Create the audio graph. Call from a user gesture (button click). */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
    this.startMusic();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.55;
  }

  /** A short burst of filtered noise, the building block of impacts. */
  noiseBurst(duration, filterFreq, volume, type = 'lowpass') {
    if (!this.ctx) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
  }

  /** A pitched blip: oscillator with a quick pitch slide and decay. */
  blip(freqA, freqB, duration, volume, type = 'sine') {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqB), this.ctx.currentTime + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + duration + 0.02);
  }

  shoot() {
    this.noiseBurst(0.09, 1800, 0.5, 'highpass');
    this.blip(220, 55, 0.12, 0.35, 'square');
  }

  enemyShoot() {
    this.noiseBurst(0.07, 1200, 0.22, 'highpass');
  }

  punch() {
    this.noiseBurst(0.08, 500, 0.4);
  }

  crash() {
    this.noiseBurst(0.35, 300, 0.7);
    this.blip(90, 30, 0.3, 0.5, 'sawtooth');
  }

  explosion() {
    this.noiseBurst(0.7, 220, 0.9);
    this.blip(120, 24, 0.6, 0.7, 'sawtooth');
  }

  pickup() {
    this.blip(880, 880, 0.08, 0.3);
    setTimeout(() => this.blip(1318, 1318, 0.12, 0.3), 70);
  }

  cash() {
    this.blip(1046, 1046, 0.07, 0.28);
    setTimeout(() => this.blip(1568, 1568, 0.14, 0.28), 60);
  }

  missionStart() {
    [523, 659, 784].forEach((f, i) => setTimeout(() => this.blip(f, f, 0.16, 0.32, 'triangle'), i * 110));
  }

  missionDone() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.blip(f, f, 0.22, 0.32, 'triangle'), i * 100));
  }

  missionFail() {
    [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip(f, f, 0.25, 0.3, 'triangle'), i * 140));
  }

  busted() {
    [330, 262, 196, 131].forEach((f, i) => setTimeout(() => this.blip(f, f, 0.3, 0.35, 'sawtooth'), i * 160));
  }

  horn() {
    this.blip(370, 370, 0.18, 0.25, 'square');
    setTimeout(() => this.blip(466, 466, 0.18, 0.25, 'square'), 30);
  }

  doorSlam() {
    this.noiseBurst(0.12, 400, 0.45);
  }

  /** Engine hum: a sawtooth whose pitch follows speed. Call every frame. */
  setEngine(speedRatio, on) {
    if (!this.ctx) return;
    if (!on || speedRatio <= 0.01) {
      if (this.engineOsc) {
        try { this.engineOsc.stop(); } catch { /* already stopped */ }
        this.engineOsc = null;
        this.engineGain = null;
      }
      return;
    }
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.05;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
    }
    this.engineOsc.frequency.value = 55 + speedRatio * 165;
    this.engineGain.gain.value = 0.03 + speedRatio * 0.06;
  }

  /** Two-tone police siren. Call every frame with `on` from the police system. */
  setSiren(on) {
    if (!this.ctx) return;
    if (!on) {
      if (this.sirenOsc) {
        try { this.sirenOsc.stop(); } catch { /* already stopped */ }
        this.sirenOsc = null;
        this.sirenGain = null;
      }
      return;
    }
    if (!this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.05;
      this.sirenOsc.connect(this.sirenGain).connect(this.master);
      this.sirenOsc.start();
      this.sirenOsc.frequency.setValueAtTime(660, this.ctx.currentTime);
    }
    // Alternate 660 / 520 Hz on a 0.45 s cycle.
    const phase = (performance.now() / 450) % 2;
    this.sirenOsc.frequency.value = phase < 1 ? 660 : 520;
  }

  /** A lazy sunset groove: A-minor bass line and soft hats, scheduled ahead. */
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    // A-minor progression: Am, F, C, G — one bar each, 8th-note bass.
    const roots = [55, 43.65, 65.41, 49];
    const stepDur = 0.22;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const bar = Math.floor(this.musicStep / 8) % 4;
      const root = roots[bar];
      const beat = this.musicStep % 8;
      if (beat % 2 === 0) {
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = root * (beat === 6 ? 1.5 : 1);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + stepDur * 1.8);
        osc.connect(gain).connect(this.musicGain);
        osc.start();
        osc.stop(this.ctx.currentTime + stepDur * 2);
      }
      if (beat % 2 === 1) this.hat();
      this.musicStep += 1;
    }, stepDur * 1000);
  }

  hat() {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * 0.03);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.12;
    src.connect(filter).connect(gain).connect(this.musicGain);
    src.start();
  }
}
