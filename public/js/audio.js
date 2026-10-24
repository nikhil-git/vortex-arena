/**
 * Procedural Web Audio API sound synthesizer for Vortex Arena.
 * Generates high-fidelity weapon acoustics, impacts, hitmarkers, and UI sound effects
 * with zero external asset dependencies or HTTP 404 risks.
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.isMuted = false;

    this.settings = {
      masterVolume: 0.8,
      sfxVolume: 0.9,
      musicVolume: 0.5
    };
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();

      this.masterGain.gain.setValueAtTime(this.settings.masterVolume, this.ctx.currentTime);
      this.sfxGain.gain.setValueAtTime(this.settings.sfxVolume, this.ctx.currentTime);

      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      // Pre-compute 1-second static white noise buffer once (eliminates 100% of runtime allocations)
      this.sharedNoiseBuffer = this.createNoiseBuffer(1.0);
      this.lastShootAudioTime = 0;
    } catch (e) {
      console.warn('Web Audio API not supported in this browser:', e);
    }
  }

  cleanupNodes(nodes, delayMs = 500) {
    setTimeout(() => {
      nodes.forEach(n => {
        try { n.disconnect(); } catch (e) {}
      });
    }, delayMs);
  }

  ensureContext() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setMasterVolume(val) {
    this.settings.masterVolume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.settings.masterVolume, this.ctx.currentTime);
    }
  }

  setSfxVolume(val) {
    this.settings.sfxVolume = Math.max(0, Math.min(1, val));
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(this.settings.sfxVolume, this.ctx.currentTime);
    }
  }

  playShoot(weaponId = 'assault_rifle') {
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Rate limit audio triggers so mobile audio buffer never overflows
    if (now - this.lastShootAudioTime < 0.075) return;
    this.lastShootAudioTime = now;

    const noiseBuf = this.sharedNoiseBuffer || this.createNoiseBuffer(0.5);

    if (weaponId === 'sniper_rifle') {
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(25, now + 0.35);

      oscGain.gain.setValueAtTime(1.0, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      const noiseNode = this.ctx.createBufferSource();
      noiseNode.buffer = noiseBuf;
      const noiseGain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1800, now);
      filter.Q.setValueAtTime(3.0, now);

      noiseGain.gain.setValueAtTime(1.1, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      noiseNode.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.sfxGain);

      osc.connect(oscGain);
      oscGain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + 0.45);
      noiseNode.start(now);
      noiseNode.stop(now + 0.3);

      this.cleanupNodes([osc, oscGain, noiseNode, noiseGain, filter], 500);

    } else if (weaponId === 'shotgun') {
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(100, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.2);

      oscGain.gain.setValueAtTime(1.1, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      const noiseNode = this.ctx.createBufferSource();
      noiseNode.buffer = noiseBuf;
      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(1200, now);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(1.2, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      noiseNode.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.sfxGain);

      osc.connect(oscGain);
      oscGain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + 0.25);
      noiseNode.start(now);
      noiseNode.stop(now + 0.25);

      this.cleanupNodes([osc, oscGain, noiseNode, noiseGain, noiseFilter], 350);

    } else if (weaponId === 'pistol') {
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.08);

      oscGain.gain.setValueAtTime(0.65, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      const noiseNode = this.ctx.createBufferSource();
      noiseNode.buffer = noiseBuf;
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.6, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      noiseNode.connect(noiseGain);
      noiseGain.connect(this.sfxGain);

      osc.connect(oscGain);
      oscGain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + 0.1);
      noiseNode.start(now);
      noiseNode.stop(now + 0.08);

      this.cleanupNodes([osc, oscGain, noiseNode, noiseGain], 200);

    } else {
      // V-44 Assault Rifle
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.11);

      oscGain.gain.setValueAtTime(0.8, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      const noiseNode = this.ctx.createBufferSource();
      noiseNode.buffer = noiseBuf;
      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(2400, now);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.75, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      noiseNode.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.sfxGain);

      osc.connect(oscGain);
      oscGain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + 0.12);
      noiseNode.start(now);
      noiseNode.stop(now + 0.1);

      this.cleanupNodes([osc, oscGain, noiseNode, noiseGain, noiseFilter], 200);
    }
  }

  playReload() {
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Mag eject click
    this.playClick(now, 600, 0.04);
    // Mag insert clack
    this.playClick(now + 0.8, 450, 0.06);
    // Bolt rack slide
    this.playClick(now + 1.4, 900, 0.08);
  }

  playClick(time, freq, dur) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.4, time + dur);
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + dur);
    this.cleanupNodes([osc, gain], (dur + 0.1) * 1000);
  }

  playHitmarker(isHeadshot = false) {
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (isHeadshot) {
      // High-pitch dual chime
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2400, now);
      osc.frequency.setValueAtTime(3200, now + 0.05);
      gain.gain.setValueAtTime(0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    } else {
      // Crisp metallic hit tap
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    }

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.18);
    this.cleanupNodes([osc, gain], 250);
  }

  playKill() {
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Triumphant ascending synth stinger
    const freqs = [440, 554, 659, 880];
    const nodes = [];
    freqs.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + idx * 0.06);
      gain.gain.setValueAtTime(0.4, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.25);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.25);
      nodes.push(osc, gain);
    });
    this.cleanupNodes(nodes, 600);
  }

  playFootstep() {
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const noise = this.sharedNoiseBuffer || this.createNoiseBuffer(0.05);
    const node = this.ctx.createBufferSource();
    node.buffer = noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(280, now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    node.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    node.start(now);
    node.stop(now + 0.05);
    this.cleanupNodes([node, filter, gain], 150);
  }

  playJump() {
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.15);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.18);
    this.cleanupNodes([osc, gain], 250);
  }

  playDamage() {
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.2);
    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.22);
    this.cleanupNodes([osc, gain], 300);
  }

  playMatchStart() {
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Tactical warning siren
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.linearRampToValueAtTime(880, now + 0.5);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.6);
    this.cleanupNodes([osc, gain], 700);
  }

  playCountdownBeep(isFinal = false) {
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (isFinal) {
      // Energetic dual harmonic chime for "GO!"
      const freqs = [880, 1320];
      freqs.forEach((f, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + idx * 0.05);
        gain.gain.setValueAtTime(0.6, now + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.35);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now + idx * 0.05);
        osc.stop(now + idx * 0.05 + 0.35);
        this.cleanupNodes([osc, gain], 500);
      });
    } else {
      // Crisp tactical countdown blip (5, 4, 3, 2, 1)
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(750, now);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.12);
      this.cleanupNodes([osc, gain], 200);
    }
  }

  createNoiseBuffer(duration = 0.2) {
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}

window.soundEngine = new SoundEngine();
