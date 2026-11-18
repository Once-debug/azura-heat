// All sound is synthesized with WebAudio: oscillators and filtered noise, no audio files.
// The context is created lazily and resumed on the first user gesture, and every call is
// guarded so a browser that refuses audio never breaks the game.

class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.muted = false;
  }

  /** Create (once) and resume the context. Call from any user-gesture handler. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.03);
    }
  }

  /** A short oscillator blip with an envelope. */
  tone(freq, dur, type = 'sine', vol = 0.2, slideTo = 0, delay = 0) {
    if (!this.ctx || this.muted) return;
    try {
      const t0 = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch { /* sound is decoration; never throw */ }
  }

  /** A burst of filtered noise: gunshots, punches, crashes, tire squeal texture. */
  noise(dur, vol = 0.3, freq = 1200, q = 0.8, delay = 0) {
    if (!this.ctx || this.muted) return;
    try {
      const t0 = this.ctx.currentTime + delay;
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(filter).connect(gain).connect(this.master);
      src.start(t0);
    } catch { /* ignore */ }
  }

  gunshot() {
    this.noise(0.16, 0.5, 700, 0.4);
    this.tone(150, 0.1, 'square', 0.18, 40);
  }

  punch() {
    this.noise(0.08, 0.3, 300, 1);
    this.tone(90, 0.09, 'sine', 0.3, 45);
  }

  crash(strength = 1) {
    this.noise(0.22, 0.25 + 0.3 * strength, 420, 0.5);
    this.tone(70, 0.2, 'triangle', 0.25 * strength, 35);
  }

  horn() {
    this.tone(370, 0.28, 'square', 0.12);
    this.tone(466, 0.28, 'square', 0.1);
  }

  cash() {
    this.tone(880, 0.09, 'sine', 0.2);
    this.tone(1318, 0.14, 'sine', 0.2, 0, 0.08);
  }

  blip() {
    this.tone(660, 0.06, 'sine', 0.12);
  }

  pickup() {
    this.tone(520, 0.08, 'triangle', 0.2, 780);
  }

  reload() {
    this.noise(0.05, 0.15, 2000, 2);
    this.noise(0.05, 0.18, 1500, 2, 0, 0.12);
  }

  missionComplete() {
    this.tone(523, 0.12, 'triangle', 0.22);
    this.tone(659, 0.12, 'triangle', 0.22, 0, 0.11);
    this.tone(784, 0.22, 'triangle', 0.24, 0, 0.22);
  }

  fail() {
    this.tone(330, 0.16, 'triangle', 0.2, 262);
    this.tone(262, 0.3, 'triangle', 0.2, 196, 0.15);
  }

  /** Continuous engine hum while the player drives; call every frame with speed 0..1. */
  engine(on, speedRatio, dt) {
    if (!this.ctx) return;
    try {
      if (on && !this.muted) {
        if (!this.engineOsc) {
          this.engineOsc = this.ctx.createOscillator();
          this.engineGain = this.ctx.createGain();
          this.engineOsc.type = 'sawtooth';
          this.engineGain.gain.value = 0;
          const filter = this.ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 500;
          this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master);
          this.engineOsc.start();
        }
        const t = this.ctx.currentTime;
        this.engineOsc.frequency.setTargetAtTime(55 + speedRatio * 130, t, 0.08);
        this.engineGain.gain.setTargetAtTime(0.05 + speedRatio * 0.06, t, 0.1);
      } else if (this.engineOsc) {
        this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      }
    } catch { /* ignore */ }
  }

  /** Two-tone police siren while a cruiser is close; call every frame. */
  siren(on, dt, phase) {
    if (!this.ctx) return;
    try {
      if (on && !this.muted) {
        if (!this.sirenOsc) {
          this.sirenOsc = this.ctx.createOscillator();
          this.sirenGain = this.ctx.createGain();
          this.sirenOsc.type = 'triangle';
          this.sirenGain.gain.value = 0;
          this.sirenOsc.connect(this.sirenGain).connect(this.master);
          this.sirenOsc.start();
        }
        const t = this.ctx.currentTime;
        const freq = Math.sin(phase * 5.2) > 0 ? 760 : 570;
        this.sirenOsc.frequency.setTargetAtTime(freq, t, 0.03);
        this.sirenGain.gain.setTargetAtTime(0.045, t, 0.1);
      } else if (this.sirenOsc) {
        this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      }
    } catch { /* ignore */ }
  }
}

export const audio = new AudioSys();
