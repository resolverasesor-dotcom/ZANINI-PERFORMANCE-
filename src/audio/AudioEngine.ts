// Todo el sonido se sintetiza con Web Audio (cero archivos): motor de dos tiempos,
// neumáticos, pianos, cadena, superficies, golpes, público, semáforo y música.

/** Voz de motor: kart 125 cc de dos tiempos con escape de cámara de expansión. */
interface EngineVoice {
  osc: OscillatorNode;
  osc2: OscillatorNode;
  sub: OscillatorNode;
  /** Ruido de admisión/escape modulado por cada explosión. */
  raspFilter: BiquadFilterNode;
  rasp: GainNode;
  fire: OscillatorNode;
  fireDepth: GainNode;
  /** Tartamudeo al soltar el gas (mezcla pobre, petardeo). */
  stutter: OscillatorNode;
  stutterDepth: GainNode;
  tone: BiquadFilterNode;
  body: GainNode;
  pan: StereoPannerNode;
  out: GainNode;
}

/** Estado sonoro del kart del jugador (lo calcula la vista de carrera cada frame). */
export interface KartSound {
  /** Velocidad (m/s). */
  speed: number;
  /** Rozamiento de neumáticos trabajando al límite (0..1). */
  scrub: number;
  /** Chirrido de deslizamiento (0..1). */
  squeal: number;
  /** Ruedas sobre el piano (0..1). */
  kerb: number;
  /** Lado del piano (−1 izquierda, 1 derecha). */
  kerbSide: number;
  grass: number;
  gravel: number;
  /** Acelerador (0..1). */
  load: number;
  /** Factor de viento (0..1). */
  wind: number;
  /** Roce contra la barrera y contra otro kart (m/s de deslizamiento). */
  wallScrape: number;
  kartScrape: number;
  /** Lado del roce (−1 izquierda, 1 derecha). */
  contactSide: number;
  /** Arena (además de grava). */
  sand: number;
}

/** Rival audible: revoluciones, distancia, panorama estéreo y efecto Doppler. */
export interface RivalSound {
  /** Identificador estable: cada rival conserva su voz (sin saltos al reordenar). */
  id: string;
  rpm: number;
  dist: number;
  pan: number;
  doppler: number;
}

const RIVAL_VOICES = 3;
/** Separación entre resaltes del piano (m): el "brrrr" va a v / KERB_BUMP Hz. */
const KERB_BUMP = 0.42;

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;
  private pulseWave!: PeriodicWave;
  private player: EngineVoice | null = null;
  private rivals: EngineVoice[] = [];
  private loops!: {
    scrub: GainNode;
    squealF: BiquadFilterNode;
    squeal: GainNode;
    roll: GainNode;
    rollF: BiquadFilterNode;
    chain: OscillatorNode;
    chainG: GainNode;
    kerbOsc: OscillatorNode;
    kerbThump: GainNode;
    kerbRattle: GainNode;
    kerbRattleF: BiquadFilterNode;
    kerbPan: StereoPannerNode;
    grass: GainNode;
    grassSwish: GainNode;
    sandHiss: GainNode;
    gravel: GainNode;
    wind: GainNode;
    crowd: GainNode;
    wallRub: GainNode;
    wallRubF: BiquadFilterNode;
    wallSqueak: GainNode;
    kartRub: GainNode;
    contactPan: StereoPannerNode;
  };
  /** Voz asignada a cada rival audible (por id). */
  private rivalSlots: (string | null)[] = [];
  private bumpLevel = 0;
  private bumpNext = 0;
  private gravelLevel = 0;
  private gravelNext = 0;
  private musicOn = false;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private musicNext = 0;
  private vol = { master: 0.8, sfx: 0.9, music: 0.5 };
  private wantMusic = true;

  /** Debe llamarse tras un gesto del usuario. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      // Búfer "equilibrado": algo más de latencia a cambio de no entrecortarse en móviles
      try {
        this.ctx = new AC({ latencyHint: 'balanced' });
      } catch {
        this.ctx = new AC();
      }
      const c = this.ctx;
      this.master = c.createGain();
      this.master.connect(c.destination);
      // Compresor suave para que nada sature.
      const comp = c.createDynamicsCompressor();
      // Suave y lento: controla picos sin "bombear" (el bombeo se oía como cortes)
      comp.threshold.value = -10;
      comp.knee.value = 12;
      comp.ratio.value = 3;
      comp.attack.value = 0.01;
      comp.release.value = 0.3;
      comp.connect(this.master);
      this.sfx = c.createGain();
      this.sfx.connect(comp);
      this.music = c.createGain();
      this.music.connect(comp);
      this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // Onda de pulsos estrecha: el "zumbido" característico de un monocilíndrico de dos tiempos
      const N = 32;
      const re = new Float32Array(N);
      const im = new Float32Array(N);
      const duty = 0.2;
      for (let n = 1; n < N; n++) im[n] = (Math.abs(Math.sin(n * Math.PI * duty)) / n) * (n % 2 ? 1 : 0.8);
      this.pulseWave = c.createPeriodicWave(re, im);
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

  /** Fuente de ruido en bucle (con arranque aleatorio para que no se correlacionen). */
  private noiseLoop(rate = 1): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = rate;
    src.start(0, Math.random() * 2);
    return src;
  }

  private filter(type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  private gain(v = 0): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = v;
    return g;
  }

  private setupLoops(): void {
    const c = this.ctx!;
    const out = this.sfx;
    // Neumáticos al límite: "scrub" sordo de goma
    const scrub = this.gain();
    this.noiseLoop(0.8).connect(this.filter('bandpass', 650, 0.9)).connect(scrub).connect(out);
    // Chirrido al deslizar: resonante y con leve vaivén
    const squealF = this.filter('bandpass', 1250, 9);
    const squeal = this.gain();
    this.noiseLoop().connect(squealF).connect(squeal).connect(out);
    // Rodadura sobre asfalto (zumbido grave que crece con la velocidad)
    const rollF = this.filter('lowpass', 200, 0.5);
    const roll = this.gain();
    this.noiseLoop(0.6).connect(rollF).connect(roll).connect(out);
    // Silbido de la cadena y el piñón (transmisión directa)
    const chain = c.createOscillator();
    chain.type = 'triangle';
    const chainG = this.gain();
    chain.connect(this.filter('bandpass', 1200, 2)).connect(chainG).connect(out);
    chain.start();
    // Piano: golpeteo grave de los resaltes + traqueteo del chasis, al ritmo de la velocidad
    const kerbPan = c.createStereoPanner();
    kerbPan.connect(out);
    const kerbOsc = c.createOscillator();
    kerbOsc.type = 'triangle';
    const kerbThump = this.gain();
    kerbOsc.connect(this.filter('lowpass', 180, 1.2)).connect(kerbThump).connect(kerbPan);
    kerbOsc.start();
    const kerbRattleF = this.filter('bandpass', 900, 1.4);
    const kerbAM = this.gain(0.5);
    const kerbRattle = this.gain();
    this.noiseLoop().connect(kerbRattleF).connect(kerbAM).connect(kerbRattle).connect(kerbPan);
    // El oscilador de resaltes abre y cierra el traqueteo (modulación de amplitud)
    const amDepth = this.gain(0.5);
    kerbOsc.connect(amDepth).connect(kerbAM.gain);
    // Hierba: roce sordo; grava: crujido granular (se dispara aparte)
    const grass = this.gain();
    this.noiseLoop(0.5).connect(this.filter('lowpass', 420, 0.6)).connect(grass).connect(out);
    // Roce de la hierba en el chasis y los pontones
    const grassSwish = this.gain();
    this.noiseLoop(0.9).connect(this.filter('bandpass', 3200, 0.8)).connect(grassSwish).connect(out);
    // Arena: siseo fino
    const sandHiss = this.gain();
    this.noiseLoop(1.1).connect(this.filter('highpass', 2800, 0.7)).connect(sandHiss).connect(out);
    // Roces: goma contra la barrera de neumáticos y plástico contra otro kart
    const contactPan = c.createStereoPanner();
    contactPan.connect(out);
    const wallRubF = this.filter('lowpass', 420, 0.9);
    const wallRub = this.gain();
    this.noiseLoop(0.7).connect(wallRubF).connect(wallRub).connect(contactPan);
    const wallSqueak = this.gain();
    this.noiseLoop().connect(this.filter('bandpass', 1700, 6)).connect(wallSqueak).connect(contactPan);
    const kartRub = this.gain();
    this.noiseLoop(1.2).connect(this.filter('bandpass', 2400, 1.8)).connect(kartRub).connect(contactPan);
    const gravel = this.gain(1);
    gravel.connect(out);
    // Viento
    const wind = this.gain();
    this.noiseLoop(0.5).connect(this.filter('bandpass', 600, 0.6)).connect(wind).connect(out);
    // Público del kartódromo (murmullo lejano)
    const crowd = this.gain();
    this.noiseLoop(0.35).connect(this.filter('bandpass', 900, 0.4)).connect(crowd).connect(out);
    this.loops = { scrub, squealF, squeal, roll, rollF, chain, chainG, kerbOsc, kerbThump, kerbRattle, kerbRattleF, kerbPan, grass, grassSwish, sandHiss, gravel, wind, crowd, wallRub, wallRubF, wallSqueak, kartRub, contactPan };
  }

  private makeEngine(): EngineVoice {
    const c = this.ctx!;
    const osc = c.createOscillator();
    osc.setPeriodicWave(this.pulseWave);
    const osc2 = c.createOscillator();
    osc2.setPeriodicWave(this.pulseWave);
    osc2.detune.value = 7;
    const sub = c.createOscillator();
    sub.type = 'sine';
    // Distorsión suave: aspereza del escape
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 2.4);
    }
    shaper.curve = curve;
    const mix = this.gain(1);
    const g1 = this.gain(0.42);
    const g2 = this.gain(0.16);
    const g3 = this.gain(0.22);
    osc.connect(g1).connect(mix);
    osc2.connect(g2).connect(mix);
    sub.connect(g3).connect(mix);
    // Ruido de escape modulado por la explosión de cada vuelta del cigüeñal
    const raspFilter = this.filter('bandpass', 900, 1.3);
    const rasp = this.gain(0.12);
    this.noiseLoop().connect(raspFilter).connect(rasp).connect(mix);
    const fire = c.createOscillator();
    fire.type = 'square';
    const fireDepth = this.gain(0.1);
    fire.connect(fireDepth).connect(rasp.gain);
    // Resonancias de la cámara de expansión y tono según la carga
    const res1 = this.filter('peaking', 380, 1.2);
    res1.gain.value = 6;
    const res2 = this.filter('peaking', 1150, 1.6);
    res2.gain.value = 4;
    const tone = this.filter('lowpass', 2000, 0.9);
    const body = this.gain(1);
    // Tartamudeo al cortar gas
    const stutter = c.createOscillator();
    // Borboteo suave al cortar gas (antes era una onda cuadrada y sonaba "cortado")
    stutter.type = 'sine';
    stutter.frequency.value = 9;
    const stutterDepth = this.gain(0);
    stutter.connect(stutterDepth).connect(body.gain);
    const pan = c.createStereoPanner();
    const out = this.gain(0);
    mix.connect(shaper).connect(res1).connect(res2).connect(tone).connect(body).connect(pan).connect(out).connect(this.sfx);
    for (const o of [osc, osc2, sub, fire, stutter]) o.start();
    return { osc, osc2, sub, raspFilter, rasp, fire, fireDepth, stutter, stutterDepth, tone, body, pan, out };
  }

  /**
   * rpm 0..1.1 → 2.500–17.000 rpm reales. Un dos tiempos explota una vez por
   * vuelta: la fundamental es rpm/60 (de ~40 a ~280 Hz).
   */
  private setEngine(v: EngineVoice, rpm: number, load: number, gain: number, pan = 0, doppler = 1): void {
    const t = this.ctx!.currentTime;
    const f = ((2500 + rpm * 13500) / 60) * doppler;
    v.osc.frequency.setTargetAtTime(f, t, 0.025);
    v.osc2.frequency.setTargetAtTime(f * 2.002, t, 0.025);
    v.sub.frequency.setTargetAtTime(f / 2, t, 0.025);
    v.fire.frequency.setTargetAtTime(f, t, 0.025);
    v.raspFilter.frequency.setTargetAtTime(700 + f * 4, t, 0.05);
    v.rasp.gain.setTargetAtTime(0.06 + load * 0.12, t, 0.08);
    v.fireDepth.gain.setTargetAtTime(0.05 + load * 0.1, t, 0.08);
    // Con gas: brillante y lleno. Sin gas: apagado y con tartamudeo (petardeo del 2T)
    v.tone.frequency.setTargetAtTime(650 + load * 2600 + rpm * 900, t, 0.08);
    v.stutterDepth.gain.setTargetAtTime((1 - load) * rpm * 0.12, t, 0.12);
    v.stutter.frequency.setTargetAtTime(7 + rpm * 9, t, 0.1);
    v.pan.pan.setTargetAtTime(pan, t, 0.05);
    v.out.gain.setTargetAtTime(gain, t, 0.08);
  }

  /** Motor del jugador y de los rivales más cercanos (con estéreo y Doppler). */
  updateEngines(player: { rpm: number; load: number } | null, rivals: RivalSound[]): void {
    if (!this.ctx) return;
    if (!this.player) this.player = this.makeEngine();
    while (this.rivals.length < RIVAL_VOICES) this.rivals.push(this.makeEngine());
    if (player) this.setEngine(this.player, player.rpm, player.load, 0.13 + player.load * 0.07);
    else this.setEngine(this.player, 0, 0, 0);
    // Asignación estable: un rival conserva su voz mientras siga entre los audibles; las
    // voces libres se reasignan solo cuando ya están en silencio (sin saltos de tono).
    while (this.rivalSlots.length < RIVAL_VOICES) this.rivalSlots.push(null);
    const ids = new Set(rivals.map((r) => r.id));
    for (let i = 0; i < RIVAL_VOICES; i++) if (this.rivalSlots[i] && !ids.has(this.rivalSlots[i]!)) this.rivalSlots[i] = null;
    for (const r of rivals) {
      if (this.rivalSlots.includes(r.id)) continue;
      const free = this.rivalSlots.indexOf(null);
      if (free >= 0) this.rivalSlots[free] = r.id;
    }
    for (let i = 0; i < RIVAL_VOICES; i++) {
      const r = rivals.find((x) => x.id === this.rivalSlots[i]);
      if (r) {
        // Atenuación por distancia (inversa, suave) y algo más apagados que el propio
        const g = 0.12 / (1 + (r.dist / 9) ** 1.6);
        this.setEngine(this.rivals[i], r.rpm, 0.7, g, r.pan, r.doppler);
      } else this.setEngine(this.rivals[i], 0.3, 0, 0);
    }
  }

  /** Bucles continuos del kart del jugador: neumáticos, pianos, superficie, cadena y viento. */
  updateLoops(k: KartSound | null, crowd = 0): void {
    if (!this.ctx) return;
    const L = this.loops;
    const t = this.ctx.currentTime;
    const v = k?.speed ?? 0;
    const vk = Math.min(1, v / 25);
    L.scrub.gain.setTargetAtTime((k?.scrub ?? 0) * 0.2 * vk, t, 0.04);
    L.squeal.gain.setTargetAtTime((k?.squeal ?? 0) * 0.5, t, 0.04);
    L.squealF.frequency.setTargetAtTime(1100 + (k?.squeal ?? 0) * 450 + Math.sin(t * 7) * 60, t, 0.05);
    L.roll.gain.setTargetAtTime(vk * 0.09, t, 0.1);
    L.rollF.frequency.setTargetAtTime(140 + v * 9, t, 0.1);
    // Cadena: ~40 dientes de corona por vuelta de rueda trasera (Ø 0,28 m)
    L.chain.frequency.setTargetAtTime(Math.max(40, (v / (Math.PI * 0.28)) * 11), t, 0.05);
    L.chainG.gain.setTargetAtTime(vk * (0.012 + (k?.load ?? 0) * 0.012), t, 0.08);
    // Piano: frecuencia de resaltes = v / separación; más fuerte cuanto más rápido y más ruedas
    const kerb = k?.kerb ?? 0;
    const bump = Math.max(4, v / KERB_BUMP);
    L.kerbOsc.frequency.setTargetAtTime(bump, t, 0.02);
    const kl = kerb * Math.min(1, v / 12);
    // Ataque rápido y salida algo más lenta: sin "parpadeos" cuando la rueda roza el borde
    L.kerbThump.gain.setTargetAtTime(kl * 0.2, t, kl > 0 ? 0.03 : 0.09);
    L.kerbRattle.gain.setTargetAtTime(kl * 0.12, t, kl > 0 ? 0.03 : 0.09);
    L.kerbRattleF.frequency.setTargetAtTime(700 + v * 18, t, 0.05);
    L.kerbPan.pan.setTargetAtTime((k?.kerbSide ?? 0) * 0.35, t, 0.05);
    const gl = (k?.grass ?? 0) * Math.min(1, v / 10);
    const sl = (k?.sand ?? 0) * Math.min(1, v / 8);
    L.grass.gain.setTargetAtTime((gl + sl * 0.6) * 0.55, t, 0.06);
    L.grassSwish.gain.setTargetAtTime(gl * 0.07, t, 0.06);
    L.sandHiss.gain.setTargetAtTime(sl * 0.09, t, 0.06);
    // Baches del terreno: golpes graves del chasis contra el suelo irregular
    this.bumpLevel = Math.max(gl, sl, this.gravelLevel);
    while (this.bumpLevel > 0.05 && this.bumpNext < t + 0.12) {
      if (this.bumpNext < t) this.bumpNext = t;
      this.thud(this.bumpNext, 0.25 * this.bumpLevel * (0.5 + Math.random()));
      this.bumpNext += 0.07 + Math.random() * 0.22 / (0.4 + Math.min(1, v / 15));
    }
    // Roces con la barrera y con otros karts
    const wr = Math.min(1, (k?.wallScrape ?? 0) / 10);
    const kr = Math.min(1, (k?.kartScrape ?? 0) / 6);
    L.wallRub.gain.setTargetAtTime(wr * 0.65, t, wr > 0 ? 0.02 : 0.08);
    L.wallRubF.frequency.setTargetAtTime(300 + wr * 500, t, 0.05);
    L.wallSqueak.gain.setTargetAtTime(wr * 0.12, t, wr > 0 ? 0.02 : 0.08);
    L.kartRub.gain.setTargetAtTime(kr * 0.45, t, kr > 0 ? 0.02 : 0.08);
    L.contactPan.pan.setTargetAtTime((k?.contactSide ?? 0) * 0.6, t, 0.05);
    this.gravelLevel = (k?.gravel ?? 0) * Math.min(1, v / 8);
    // Crujido de grava: granitos de ruido a un ritmo que crece con la velocidad
    while (this.gravelLevel > 0.05 && this.gravelNext < t + 0.1) {
      if (this.gravelNext < t) this.gravelNext = t;
      this.grain(this.gravelNext, 0.03 + Math.random() * 0.05, this.gravelLevel * (0.25 + Math.random() * 0.35), 1500 + Math.random() * 2500);
      this.gravelNext += 0.012 + Math.random() * (0.05 / (0.3 + this.gravelLevel));
    }
    L.wind.gain.setTargetAtTime((k?.wind ?? 0) * 0.07, t, 0.1);
    L.crowd.gain.setTargetAtTime(crowd * 0.035, t, 0.4);
  }

  silenceLoops(): void {
    this.updateLoops(null, 0);
    this.updateEngines(null, []);
  }

  /** Golpe grave corto (baches fuera de pista). */
  private thud(t: number, peak: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(70 + Math.random() * 30, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.09);
    const g = c.createGain();
    o.connect(g).connect(this.sfx);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.start(t);
    o.stop(t + 0.14);
  }

  /** Grano corto de ruido (crujidos). */
  private grain(t: number, dur: number, peak: number, freq: number): void {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 2;
    const g = c.createGain();
    src.connect(f).connect(g).connect(this.sfx);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.start(t, Math.random() * 1.8);
    src.stop(t + dur + 0.02);
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

  private lastWallHit = 0;
  private lastKartHit = 0;

  /**
   * Golpe contra la barrera de neumáticos: "bum" grave del impacto, rebote de la goma
   * de los neumáticos apilados, crujido del pontón y, si es fuerte, el chasis que suena.
   */
  hitBarrier(strength: number, pan = 0): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastWallHit < 0.09) return;
    this.lastWallHit = now;
    const s = Math.min(1, strength / 8);
    const out = this.panned(pan);
    this.toneTo(out, 62 + s * 20, 0.28 + s * 0.2, 'sine', 0.45 + s * 0.5, 0, 34);
    this.noiseTo(out, 0.16 + s * 0.2, 0.3 + s * 0.45, 320 + s * 260, 'lowpass');
    // rebote de goma ("boing" corto) de los neumáticos
    this.toneTo(out, 150 + s * 40, 0.16, 'triangle', 0.1 + s * 0.18, 0.05, 85);
    this.toneTo(out, 70, 0.14, 'sine', 0.12 + s * 0.22, 0.12 + s * 0.05, 45);
    // plástico del pontón y chasis
    if (s > 0.2) this.noiseTo(out, 0.07, 0.12 + s * 0.3, 2400, 'highpass', 0.005);
    if (s > 0.55) this.toneTo(out, 420, 0.25, 'square', 0.05 * s, 0.01, 380);
  }

  /** Contacto entre karts: golpe de plástico de pontones y parachoques y del chasis. */
  hitKart(strength: number, pan = 0): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastKartHit < 0.08) return;
    this.lastKartHit = now;
    const s = Math.min(1, strength / 5);
    const out = this.panned(pan);
    this.noiseTo(out, 0.06 + s * 0.06, 0.25 + s * 0.45, 2000, 'highpass');
    this.noiseTo(out, 0.1, 0.15 + s * 0.3, 900, 'bandpass', 0.004);
    this.toneTo(out, 330 + s * 140, 0.08, 'square', 0.06 + s * 0.12, 0, 190);
    this.toneTo(out, 105, 0.13, 'sine', 0.18 + s * 0.35, 0, 55);
  }

  /** Nodo con panorama estéreo que se libera solo cuando acaba el efecto. */
  private panned(pan: number): AudioNode {
    const p = this.ctx!.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.sfx);
    setTimeout(() => p.disconnect(), 1500);
    return p;
  }

  private toneTo(out: AudioNode, freq: number, dur: number, type: OscillatorType, peak: number, at = 0, slideTo?: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    const g = c.createGain();
    o.connect(g).connect(out);
    const t = c.currentTime + at;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    this.env(g, Math.min(1, peak), 0.004, dur, at);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseTo(out: AudioNode, dur: number, peak: number, freq: number, type: BiquadFilterType, at = 0): void {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    src.connect(f).connect(g).connect(out);
    const t = c.currentTime + at;
    this.env(g, Math.min(1, peak), 0.003, dur, at);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  /** Entrada en el piano: el primer "trrrac" (y vibración en el mando). */
  kerbHit(speed: number): void {
    if (!this.ctx) return;
    const s = Math.min(1, speed / 25);
    for (let i = 0; i < 3; i++) this.tone(85, 0.05, 'square', 0.12 + s * 0.15, i * (KERB_BUMP / Math.max(5, speed)), 50);
  }

  /** Ovación del público (salida y bandera a cuadros). */
  cheer(strength = 1): void {
    if (!this.ctx) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.filter('bandpass', 1100, 0.5);
    const g = c.createGain();
    src.connect(f).connect(g).connect(this.sfx);
    const t = c.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * strength, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    src.start(t, Math.random());
    src.stop(t + 3);
    // silbidos
    for (let i = 0; i < 3; i++) {
      const at = 0.2 + Math.random() * 1.2;
      const fr = 1800 + Math.random() * 900;
      this.tone(fr, 0.35, 'sine', 0.025 * strength, at, fr * 1.25);
    }
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
