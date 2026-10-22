// Todo el sonido se sintetiza con Web Audio: motor, derrapes, golpes, semáforo y música.

interface EngineVoice {
  o1: OscillatorNode;
  o2: OscillatorNode;
  sub: OscillatorNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  filter: BiquadFilterNode;
  amp: GainNode;
  out: GainNode;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;
  private player: EngineVoice | null = null;
  private rivals: EngineVoice[] = [];
  private skidSrc: AudioBufferSourceNode | null = null;
  private skidGain!: GainNode;
  private skidFilter!: BiquadFilterNode;
  private roadSrc: AudioBufferSourceNode | null = null;
  private roadGain!: GainNode;
  private windGain!: GainNode;
  private musicOn = false;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private musicNext = 0;
  private vol = { master: 0.8, sfx: 0.9, music: 0.5 };
  private wantMusic = true;
  private lastHit = 0;

  /** Debe llamarse tras un gesto del usuario. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain();
      this.master.connect(c.destination);
      // Compresor suave para que nada sature.
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      comp.connect(this.master);
      this.sfx = c.createGain();
      this.sfx.connect(comp);
      this.music = c.createGain();
      this.music.connect(comp);
      this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      this.setupLoops();
      if (this.wantMusic) this.startMusic();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(master: number, sfx: number, music: number, musicEnabled: boolean): void {
    this.vol = { master, sfx, music };
    this.wantMusic = musicEnabled;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.music.gain.setTargetAtTime(this.vol.music * 0.5, t, 0.05);
  }

  private setupLoops(): void {
    const c = this.ctx!;
    // Derrape: ruido filtrado en banda
    this.skidFilter = c.createBiquadFilter();
    this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = 1400;
    this.skidFilter.Q.value = 3;
    this.skidGain = c.createGain();
    this.skidGain.gain.value = 0;
    this.skidFilter.connect(this.skidGain).connect(this.sfx);
    this.skidSrc = c.createBufferSource();
    this.skidSrc.buffer = this.noise;
    this.skidSrc.loop = true;
    this.skidSrc.connect(this.skidFilter);
    this.skidSrc.start();
    // Rodadura fuera de pista / pianos
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    this.roadGain = c.createGain();
    this.roadGain.gain.value = 0;
    lp.connect(this.roadGain).connect(this.sfx);
    this.roadSrc = c.createBufferSource();
    this.roadSrc.buffer = this.noise;
    this.roadSrc.loop = true;
    this.roadSrc.playbackRate.value = 0.7;
    this.roadSrc.connect(lp);
    this.roadSrc.start();
    // Viento a alta velocidad
    const hp = c.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 600;
    hp.Q.value = 0.6;
    this.windGain = c.createGain();
    this.windGain.gain.value = 0;
    hp.connect(this.windGain).connect(this.sfx);
    const ws = c.createBufferSource();
    ws.buffer = this.noise;
    ws.loop = true;
    ws.playbackRate.value = 0.5;
    ws.connect(hp);
    ws.start();
  }

  private makeEngine(): EngineVoice {
    const c = this.ctx!;
    const o1 = c.createOscillator();
    o1.type = 'sawtooth';
    const o2 = c.createOscillator();
    o2.type = 'sawtooth';
    o2.detune.value = 9;
    const sub = c.createOscillator();
    sub.type = 'square';
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 3;
    filter.frequency.value = 900;
    const amp = c.createGain();
    amp.gain.value = 0.6;
    // Modulación "putt-putt" del motor de dos tiempos
    const lfo = c.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 20;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.25;
    lfo.connect(lfoGain).connect(amp.gain);
    const mix1 = c.createGain();
    mix1.gain.value = 0.35;
    const mix2 = c.createGain();
    mix2.gain.value = 0.25;
    const mix3 = c.createGain();
    mix3.gain.value = 0.3;
    o1.connect(mix1).connect(filter);
    o2.connect(mix2).connect(filter);
    sub.connect(mix3).connect(filter);
    const out = c.createGain();
    out.gain.value = 0;
    filter.connect(amp).connect(out).connect(this.sfx);
    o1.start();
    o2.start();
    sub.start();
    lfo.start();
    return { o1, o2, sub, lfo, lfoGain, filter, amp, out };
  }

  private setEngine(v: EngineVoice, rpm: number, load: number, gain: number): void {
    const t = this.ctx!.currentTime;
    const f = 48 + rpm * 190;
    v.o1.frequency.setTargetAtTime(f, t, 0.03);
    v.o2.frequency.setTargetAtTime(f * 1.005, t, 0.03);
    v.sub.frequency.setTargetAtTime(f / 2, t, 0.03);
    v.lfo.frequency.setTargetAtTime(f / 4, t, 0.03);
    v.lfoGain.gain.setTargetAtTime(0.32 - rpm * 0.2, t, 0.05);
    v.filter.frequency.setTargetAtTime(500 + load * 1700 + rpm * 1300, t, 0.04);
    v.out.gain.setTargetAtTime(gain, t, 0.05);
  }

  /** Motor del jugador y de los dos rivales más cercanos. */
  updateEngines(
    player: { rpm: number; load: number } | null,
    rivals: { rpm: number; dist: number }[],
  ): void {
    if (!this.ctx) return;
    if (!this.player) this.player = this.makeEngine();
    while (this.rivals.length < 2) this.rivals.push(this.makeEngine());
    if (player) this.setEngine(this.player, player.rpm, player.load, 0.16 + player.load * 0.08);
    else this.setEngine(this.player, 0, 0, 0);
    for (let i = 0; i < 2; i++) {
      const r = rivals[i];
      if (r) {
        const g = Math.max(0, 1 - r.dist / 45) * 0.11;
        this.setEngine(this.rivals[i], r.rpm, 0.6, g);
      } else this.setEngine(this.rivals[i], 0, 0, 0);
    }
  }

  /** Bucles continuos: derrape, rodadura y viento. */
  updateLoops(skid: number, road: number, wind: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.skidGain.gain.setTargetAtTime(skid * 0.22, t, 0.05);
    this.skidFilter.frequency.setTargetAtTime(1100 + skid * 700, t, 0.1);
    this.roadGain.gain.setTargetAtTime(road * 0.5, t, 0.05);
    this.windGain.gain.setTargetAtTime(wind * 0.07, t, 0.1);
  }

  silenceLoops(): void {
    this.updateLoops(0, 0, 0);
    this.updateEngines(null, []);
  }

  private env(node: GainNode, peak: number, attack: number, decay: number, at = 0): void {
    const t = this.ctx!.currentTime + at;
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(freq: number, dur: number, type: OscillatorType, peak: number, at = 0, slideTo?: number): void {
    if (!this.ctx) return;
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    const g = c.createGain();
    o.connect(g).connect(this.sfx);
    const t = c.currentTime + at;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    this.env(g, peak, 0.005, dur, at);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseBurst(dur: number, peak: number, freq: number, type: BiquadFilterType = 'lowpass', at = 0): void {
    if (!this.ctx) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    src.connect(f).connect(g).connect(this.sfx);
    const t = c.currentTime + at;
    this.env(g, peak, 0.004, dur, at);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  /** Golpe contra muro o kart. */
  hit(strength: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastHit < 0.12) return;
    this.lastHit = now;
    const s = Math.min(1, strength / 12);
    this.noiseBurst(0.18 + s * 0.2, 0.25 + s * 0.5, 700 + s * 1200);
    this.tone(90 + s * 40, 0.18, 'sine', 0.3 + s * 0.4, 0, 45);
  }

  /** Petardeo del escape. */
  pop(): void {
    this.noiseBurst(0.07, 0.35, 900);
    this.tone(70, 0.08, 'square', 0.18, 0, 40);
    this.noiseBurst(0.05, 0.2, 700, 'lowpass', 0.09);
  }

  lightBeep(): void {
    this.tone(660, 0.22, 'sine', 0.35);
  }

  goBeep(): void {
    this.tone(1320, 0.6, 'sine', 0.4);
    this.tone(990, 0.6, 'triangle', 0.15);
  }

  /** Saltito: golpe sordo del asiento y del chasis. */
  hop(): void {
    this.tone(95, 0.12, 'sine', 0.22, 0, 60);
    this.noiseBurst(0.08, 0.12, 600, 'lowpass');
  }

  click(): void {
    this.tone(1200, 0.04, 'square', 0.05);
  }

  select(): void {
    this.tone(880, 0.06, 'square', 0.06);
    this.tone(1320, 0.08, 'square', 0.05, 0.05);
  }

  warning(): void {
    this.tone(440, 0.18, 'square', 0.12);
    this.tone(330, 0.25, 'square', 0.12, 0.2);
  }

  lapChime(best: boolean): void {
    const notes = best ? [784, 988, 1175, 1568] : [784, 988];
    notes.forEach((n, i) => this.tone(n, 0.18, 'triangle', 0.2, i * 0.09));
  }

  fanfare(): void {
    const seq = [523, 659, 784, 1046, 784, 1046, 1318];
    seq.forEach((n, i) => {
      this.tone(n, i === seq.length - 1 ? 0.9 : 0.16, 'square', 0.1, i * 0.13);
      this.tone(n / 2, i === seq.length - 1 ? 0.9 : 0.16, 'triangle', 0.12, i * 0.13);
    });
  }

  // --- Música de menú (secuenciador sencillo) ---
  startMusic(): void {
    this.wantMusic = true;
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.musicStep = 0;
    this.musicNext = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 25);
  }

  stopMusic(): void {
    this.musicOn = false;
    if (this.musicTimer != null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  setMusicEnabled(on: boolean, inMenu: boolean): void {
    this.wantMusic = on;
    if (on && inMenu) this.startMusic();
    else this.stopMusic();
  }

  private scheduleMusic(): void {
    if (!this.ctx || !this.musicOn) return;
    const c = this.ctx;
    const stepDur = 60 / 124 / 4;
    // Am - F - C - G
    const roots = [57, 53, 48, 55];
    const chords = [
      [0, 3, 7, 12],
      [0, 4, 7, 12],
      [0, 4, 7, 12],
      [0, 4, 7, 11],
    ];
    const arp = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 3, 1, 2];
    while (this.musicNext < c.currentTime + 0.12) {
      const t = this.musicNext;
      const step = this.musicStep % 16;
      const bar = Math.floor(this.musicStep / 16) % 4;
      const root = roots[bar];
      const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
      // Bajo en corcheas
      if (step % 2 === 0) this.musicNote(midi(root - 12 + (step % 8 === 6 ? 7 : 0)), stepDur * 1.6, 'sawtooth', 0.16, t, 500);
      // Arpegio
      const ch = chords[bar];
      if (this.musicStep >= 32 || step % 2 === 0) this.musicNote(midi(root + 12 + ch[arp[step]]), stepDur * 0.9, 'square', 0.05, t, 2600);
      // Bombo
      if (step % 4 === 0) this.musicKick(t);
      // Caja
      if (step === 4 || step === 12) this.musicNoise(t, 0.12, 0.12, 1800);
      // Charles
      if (step % 2 === 1) this.musicNoise(t, 0.03, 0.05, 8000);
      this.musicNext += stepDur;
      this.musicStep = (this.musicStep + 1) % 128;
    }
  }

  private musicNote(freq: number, dur: number, type: OscillatorType, peak: number, t: number, cutoff: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = c.createGain();
    o.connect(f).connect(g).connect(this.music);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private musicKick(t: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = c.createGain();
    o.connect(g).connect(this.music);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.start(t);
    o.stop(t + 0.22);
  }

  private musicNoise(t: number, dur: number, peak: number, freq: number): void {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = freq;
    const g = c.createGain();
    src.connect(f).connect(g).connect(this.music);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }
}
