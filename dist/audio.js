// House audio: procedural Web Audio score, ambience and cues.
// Pure state-diff layer (snapshot/cues/mood) is exported for Node tests.
// Never touches game RNG or state; uses Math.random for sound variation only.
(function (root) {
'use strict';
const KEY = 'house-audio';
const DEFAULTS = { enabled: false, master: 0.8, music: 0.55, ambience: 0.5, sfx: 0.85 };
const BUSES = ['music', 'ambience', 'sfx'];
const TIMED = ['rescue', 'burial', 'seals'];

// ---------- pure layer ----------
function sum(a) { return a.reduce((n, x) => n + x, 0); }
function snapshot(s) {
  if (!s) return null;
  const r = s.rescue, seals = s.seals;
  return {
    id: s.seed + '|' + (s.startedAt || 0),
    phase: s.phase, omen: s.omen || 0, rooms: (s.rooms || []).length, active: s.active, turn: s.turnSerial || 0,
    roll: s.lastRoll?.serial || 0, haunt: s.lastHauntCheck?.serial || 0,
    countdown: TIMED.includes(s.phase) ? s.countdown : null,
    result: s.result ? s.result.team : null,
    event: !!s.eventChoice,
    humanActive: s.players?.[s.active]?.controller === 'human',
    players: (s.players || []).map(p => ({ room: p.room, idx: [...p.idx], alive: p.alive, items: p.items.length })),
    progress: (s.heroProgress || 0) + (s.traitorProgress || 0) + (s.ghost?.hits || 0)
      + (seals ? sum(seals.nodes.map(n => n.progress || 0)) : 0)
      + (r ? (r.web || 0) + (r.eggs ? 1 : 0) + (r.door ? 1 : 0) : 0),
    collapsed: (s.rooms || []).filter(x => x.collapsed).length,
  };
}
function mood(snap) {
  if (!snap) return 'menu';
  if (snap.result) return 'end';
  if (snap.phase === 'explore') return 'explore';
  if (snap.countdown !== null && snap.countdown <= 3) return 'urgent';
  return 'haunt';
}
// Returns ordered cue names for the change a -> b. New/loaded game returns [].
function cues(a, b) {
  if (!a || !b || a.id !== b.id) return [];
  if (b.result && !a.result) return [b.result === 'hero' ? 'victory' : 'defeat'];
  const out = [], add = k => { if (!out.includes(k)) out.push(k); };
  const hauntStarted = a.phase === 'explore' && b.phase !== 'explore';
  if (b.roll > a.roll || b.haunt > a.haunt) add('dice');
  if (hauntStarted) add('haunt');
  if (b.omen > a.omen) add('omen');
  if (b.rooms > a.rooms) add('reveal');
  if (b.event && !a.event) add('card');
  const pa = a.players, pb = b.players;
  let moved = false, hurt = false, gain = false, died = false, item = false;
  pb.forEach((p, i) => {
    const q = pa[i]; if (!q) return;
    if (q.alive && !p.alive) died = true;
    if (p.room !== q.room) moved = true;
    if (p.items > q.items) item = true;
    p.idx.forEach((v, t) => { if (v < q.idx[t]) hurt = true; if (v > q.idx[t]) gain = true; });
  });
  if (died) add('death'); else if (hurt) add('hurt');
  if (gain && !hauntStarted) add('gain');
  if (item) add('item');
  if (b.progress > a.progress) add('progress');
  if (b.collapsed > a.collapsed) add('collapse');
  if (moved && !out.includes('reveal')) add('step');
  if (b.countdown !== null && a.countdown !== null && b.countdown < a.countdown && b.countdown <= 3) add('tick');
  if (b.turn !== a.turn && b.humanActive && !out.length) add('turn');
  return hauntStarted ? out.filter(k => !['step', 'reveal', 'gain', 'turn'].includes(k)) : out;
}
function loadSettings(store) {
  try { return { ...DEFAULTS, ...JSON.parse(store?.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}

// ---------- Web Audio engine ----------
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

class HouseSound {
  constructor(store) {
    this.store = store; this.settings = loadSettings(store);
    this.ctx = null; this.prev = null; this.mood = 'menu'; this.timers = []; this.layers = {}; this.unlocked = false;
    // browsers only allow audio after a user gesture: never create/resume the context before one
    const unlock = () => { this.unlocked = true; if (this.enabled && this.ensure()) { this.ctx.resume(); this.applyMoodOnce(); } };
    root.addEventListener?.('pointerdown', unlock, true); root.addEventListener?.('keydown', unlock, true);
  }
  save() { try { this.store?.setItem(KEY, JSON.stringify(this.settings)); } catch { } }
  get enabled() { return !!this.settings.enabled; }
  setEnabled(on) {
    this.settings.enabled = !!on; this.save();
    if (on) { this.unlocked = true; if (this.ensure()) { this.ctx.resume(); this.ramp(this.master, this.settings.master, 0.3); this.applyMood(true); } }
    else if (this.ctx) { this.ramp(this.master, 0, 0.25); setTimeout(() => { if (!this.settings.enabled) this.ctx?.suspend(); }, 400); }
  }
  setLevel(key, v) {
    this.settings[key] = Math.max(0, Math.min(1, Number(v))); this.save();
    if (!this.ctx) return;
    if (key === 'master') this.ramp(this.master, this.enabled ? this.settings.master : 0, 0.08);
    else if (this.bus[key]) this.ramp(this.bus[key], this.settings[key], 0.08);
  }
  ramp(param, v, t = 0.5) { const g = param.gain || param; if (!this.ctx) return; const n = this.ctx.currentTime; g.cancelScheduledValues(n); g.setValueAtTime(g.value, n); g.linearRampToValueAtTime(v, n + t); }
  ensure() {
    if (this.ctx) return true;
    if (!this.unlocked) return false;
    const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return false;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
    this.master.connect(comp).connect(c.destination);
    this.bus = {};
    for (const b of BUSES) { const g = c.createGain(); g.gain.value = this.settings[b]; g.connect(this.master); this.bus[b] = g; }
    // "the house" reverb: one impulse, one convolver per bus so each fader also scales its own tail
    const ir = this.impulse(3.2, 2.6);
    this.verbIn = {};
    for (const b of BUSES) { const send = c.createGain(), cv = c.createConvolver(), wet = c.createGain(); cv.buffer = ir; wet.gain.value = 0.9; send.connect(cv).connect(wet).connect(this.bus[b]); this.verbIn[b] = send; }
    this.noiseBuf = this.noise(2.5, 'white'); this.brownBuf = this.noise(4, 'brown');
    this.startBeds();
    return true;
  }
  impulse(sec, decay) {
    const c = this.ctx, len = Math.floor(c.sampleRate * sec), buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 200 ? i / 200 : 1); }
    return buf;
  }
  noise(sec, kind) {
    const c = this.ctx, len = Math.floor(c.sampleRate * sec), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    return buf;
  }
  src(buf, loop = false) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = loop; return s; }
  // one-shot helpers --------------------------------------------------------
  out(bus, send = 0, pan = 0) {
    const c = this.ctx, g = c.createGain(), p = c.createStereoPanner ? c.createStereoPanner() : null;
    if (p) { p.pan.value = pan; g.connect(p).connect(this.bus[bus]); if (send) { const s = c.createGain(); s.gain.value = send; p.connect(s).connect(this.verbIn[bus]); } }
    else { g.connect(this.bus[bus]); if (send) { const s = c.createGain(); s.gain.value = send; g.connect(s).connect(this.verbIn[bus]); } }
    return g;
  }
  env(g, t, a, peak, d, sustain = 0.0001) { const p = g.gain; p.setValueAtTime(0.0001, t); p.exponentialRampToValueAtTime(peak, t + a); p.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d); }
  osc(type, f, t, dur, peak, bus = 'sfx', { a = 0.005, send = 0.2, pan = 0, glide = null, detune = 0 } = {}) {
    const c = this.ctx, o = c.createOscillator(), g = this.out(bus, send, pan);
    o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
    const e = c.createGain(); o.connect(e).connect(g); this.env(e, t, a, peak, dur);
    o.start(t); o.stop(t + a + dur + 0.05); return o;
  }
  burst(t, dur, peak, { type = 'lowpass', f = 800, f2 = null, q = 0.7, bus = 'sfx', send = 0.2, pan = 0, a = 0.003, buf = null } = {}) {
    const c = this.ctx, s = this.src(buf || this.noiseBuf), fl = c.createBiquadFilter(), g = this.out(bus, send, pan), e = c.createGain();
    fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q; if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    s.connect(fl).connect(e).connect(g); this.env(e, t, a, peak, dur);
    s.start(t, Math.random() * 1.5); s.stop(t + a + dur + 0.05);
  }
  creak(t, dur = rnd(0.5, 1.1), peak = 0.12, bus = 'ambience', pan = rnd(-0.8, 0.8)) {
    // wood creak: fast pulse train through resonant band-pass, both gliding
    const c = this.ctx, o = c.createOscillator(), bp = c.createBiquadFilter(), g = this.out(bus, 0.5, pan), e = c.createGain();
    const r0 = rnd(28, 60), f0 = rnd(600, 1300);
    o.type = 'sawtooth'; o.frequency.setValueAtTime(r0, t); o.frequency.linearRampToValueAtTime(r0 * rnd(0.6, 1.5), t + dur);
    bp.type = 'bandpass'; bp.Q.value = 9; bp.frequency.setValueAtTime(f0, t); bp.frequency.linearRampToValueAtTime(f0 * rnd(0.7, 1.3), t + dur);
    o.connect(bp).connect(e).connect(g);
    e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(peak, t + dur * 0.3); e.gain.linearRampToValueAtTime(peak * 0.6, t + dur * 0.7); e.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.05);
  }
  bell(f, t, dur, peak, bus = 'sfx', send = 0.7, pan = 0) {
    [[1, 1], [2.76, 0.45], [5.4, 0.25], [8.93, 0.12], [0.5, 0.35]].forEach(([m, a]) => this.osc('sine', f * m, t, dur / Math.sqrt(m), peak * a, bus, { a: 0.004, send, pan }));
  }
  // cues ----------------------------------------------------------------------
  play(k, when = 0) {
    if (!this.enabled || !this.ensure()) return;
    const c = this.ctx; if (c.state === 'suspended') c.resume();
    const t = c.currentTime + 0.02 + when;
    switch (k) {
      case 'step': for (let i = 0; i < 2; i++) { const s = t + i * rnd(0.26, 0.32); this.burst(s, 0.09, 0.35, { f: 320, send: 0.25, pan: rnd(-0.2, 0.2) }); this.osc('sine', rnd(62, 75), s, 0.12, 0.3, 'sfx', { glide: 40, send: 0.1 }); } break;
      case 'reveal': this.creak(t, 0.7, 0.16, 'sfx', rnd(-0.3, 0.3)); this.burst(t + 0.65, 0.3, 0.4, { f: 180, send: 0.4 }); this.osc('sine', 55, t + 0.65, 0.4, 0.35, 'sfx', { glide: 35 }); break;
      case 'card': this.burst(t, 0.16, 0.22, { type: 'highpass', f: 1800, f2: 5000, send: 0.2 }); this.burst(t + 0.09, 0.1, 0.12, { type: 'bandpass', f: 3500, q: 1.2 }); break;
      case 'item': [hz(84), hz(91)].forEach((f, i) => this.bell(f, t + i * 0.09, 0.9, 0.09, 'sfx', 0.4)); break;
      case 'dice': { let s = t; const n = 5 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) { s += rnd(0.035, 0.09) * (1 + i * 0.25); const a = 0.9 * Math.pow(0.8, i); this.burst(s, 0.03, a, { type: 'bandpass', f: rnd(1800, 3800), q: 2.5, pan: rnd(-0.4, 0.4), send: 0.15 }); this.osc('triangle', rnd(700, 1100), s, 0.04, a * 0.5, 'sfx', { send: 0.05 }); } break; }
      case 'gain': [hz(74), hz(78), hz(81)].forEach((f, i) => this.osc('triangle', f, t + i * 0.07, 0.4, 0.15, 'sfx', { send: 0.4 })); break;
      case 'progress': [hz(81), hz(86), hz(93)].forEach((f, i) => { this.osc('sine', f, t + i * 0.11, 1.4, 0.09, 'sfx', { send: 0.8 }); this.osc('sine', f * 2.01, t + i * 0.11, 0.6, 0.03, 'sfx', { send: 0.8 }); }); break;
      case 'hurt': { this.osc('sine', 130, t, 0.28, 0.55, 'sfx', { glide: 38, send: 0.2 }); this.burst(t, 0.18, 0.4, { f: 900, f2: 200, send: 0.25 }); this.osc('square', 58, t, 0.2, 0.08, 'sfx', { glide: 40 }); break; }
      case 'death': this.osc('sawtooth', 220, t, 2.6, 0.12, 'sfx', { a: 0.05, glide: 45, send: 0.7 }); this.osc('sawtooth', 233, t, 2.6, 0.08, 'sfx', { a: 0.05, glide: 47, send: 0.7 }); this.bell(hz(38), t + 0.1, 5, 0.18, 'sfx', 0.9); break;
      case 'omen': this.bell(hz(50), t, 5.5, 0.22, 'sfx', 1); this.osc('sine', hz(26), t, 3.5, 0.25, 'sfx', { a: 0.4, send: 0.3 }); this.burst(t, 2.5, 0.05, { type: 'bandpass', f: 3000, f2: 1200, q: 3, a: 0.8, send: 0.9 }); break;
      case 'haunt': {
        // reverse swell -> cluster hit -> sub drop
        this.burst(t, 0.9, 0.35, { type: 'lowpass', f: 300, f2: 6000, a: 0.85, send: 0.6 });
        const h = t + 0.9;
        [38, 39, 44, 45, 50, 51].forEach((m, i) => this.osc('sawtooth', hz(m), h, 3.2, 0.07, 'sfx', { send: 0.9, pan: (i % 2 ? 1 : -1) * 0.4, detune: rnd(-12, 12) }));
        this.burst(h, 1.4, 0.6, { f: 2400, f2: 90, send: 0.9 });
        this.osc('sine', 70, h, 2.8, 0.7, 'sfx', { glide: 27, send: 0.2 });
        this.bell(hz(37), h + 0.05, 7, 0.2, 'sfx', 1);
        break;
      }
      case 'collapse': this.burst(t, 2.8, 0.55, { f: 160, a: 0.3, buf: this.brownBuf, send: 0.6 }); for (let i = 0; i < 9; i++) this.burst(t + rnd(0.2, 2.2), 0.05, rnd(0.08, 0.2), { type: 'bandpass', f: rnd(900, 3000), q: 3, pan: rnd(-0.8, 0.8), send: 0.5 }); break;
      case 'tick': this.burst(t, 0.02, 0.35, { type: 'highpass', f: 3500, send: 0.3 }); this.burst(t + 0.5, 0.03, 0.25, { type: 'bandpass', f: 1400, q: 4, send: 0.3 }); this.osc('sine', hz(38), t, 1.5, 0.2, 'sfx', { send: 0.5 }); break;
      case 'turn': this.osc('sine', hz(74), t, 0.6, 0.12, 'sfx', { send: 0.6 }); this.osc('sine', hz(81), t + 0.12, 0.9, 0.1, 'sfx', { send: 0.6 }); break;
      case 'victory': [62, 66, 69, 74, 78].forEach((m, i) => { this.osc('triangle', hz(m), t + i * 0.16, 2.8 - i * 0.2, 0.08, 'sfx', { send: 0.8 }); }); [50, 57, 62].forEach(m => this.osc('sine', hz(m), t + 0.8, 4, 0.08, 'sfx', { a: 0.6, send: 0.7 })); break;
      case 'defeat': [62, 60, 58, 57].forEach((m, i) => this.osc('triangle', hz(m), t + i * 0.45, 1.6, 0.07, 'sfx', { send: 0.8 })); [38, 39, 45].forEach(m => this.osc('sawtooth', hz(m), t + 1.6, 4.5, 0.05, 'sfx', { a: 1, send: 0.9 })); this.bell(hz(33), t + 1.8, 7, 0.2, 'sfx', 1); break;
      case 'ui': this.osc('sine', hz(86), t, 0.25, 0.05, 'sfx', { send: 0.4 }); break;
    }
  }
  // beds ----------------------------------------------------------------------
  startBeds() {
    const c = this.ctx, L = this.layers;
    // wind
    const w = this.src(this.noiseBuf, true), wf = c.createBiquadFilter(), wg = c.createGain(), wp = c.createStereoPanner ? c.createStereoPanner() : c.createGain();
    wf.type = 'bandpass'; wf.frequency.value = 450; wf.Q.value = 0.8; wg.gain.value = 0.0001;
    w.connect(wf).connect(wg).connect(wp).connect(this.bus.ambience); w.start();
    L.wind = { f: wf, g: wg, p: wp };
    // room tone
    const r = this.src(this.brownBuf, true), rf = c.createBiquadFilter(), rg = c.createGain();
    rf.type = 'lowpass'; rf.frequency.value = 140; rg.gain.value = 0.0001; r.connect(rf).connect(rg).connect(this.bus.ambience); r.start();
    L.room = { g: rg };
    // drone: two detuned saws per voice through a breathing low-pass
    const df = c.createBiquadFilter(), dg = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    df.type = 'lowpass'; df.frequency.value = 380; df.Q.value = 2; dg.gain.value = 0.0001;
    lfo.frequency.value = 0.045; lg.gain.value = 160; lfo.connect(lg).connect(df.frequency); lfo.start();
    const vs = c.createGain(); vs.gain.value = 0.35; dg.connect(vs).connect(this.verbIn.music);
    df.connect(dg).connect(this.bus.music);
    const voice = (m, lvl) => { const g = c.createGain(); g.gain.value = 0.0001; g.connect(df); [-7, 7].forEach(d => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = d; o.connect(g); o.start(); }); return { g, lvl }; };
    L.drone = { f: df, g: dg, base: [voice(38, 0.3), voice(45, 0.22), voice(50, 0.16), voice(53, 0.1)], dark: [voice(44, 0.2), voice(51, 0.12)] };
    // heartbeat pulse bus (haunt/urgent)
    L.pulse = { g: c.createGain() }; L.pulse.g.gain.value = 0.0001; L.pulse.g.connect(this.bus.music);
    this.loop('box', () => this.musicBox(), () => this.mood === 'end' ? 9 : rnd(4.5, 10));
    this.loop('creak', () => this.creak(this.ctx.currentTime + 0.05), () => rnd(7, 20) * (this.mood === 'explore' || this.mood === 'menu' ? 1 : 0.6));
    this.loop('gust', () => this.gust(), () => rnd(3, 6));
    this.loop('heart', () => this.heartbeat(), () => this.mood === 'urgent' ? 0.6 : 0.95);
    this.loop('thunder', () => { if (this.mood === 'haunt' || this.mood === 'urgent') this.burst(this.ctx.currentTime + 0.05, rnd(2.5, 4), rnd(0.12, 0.25), { f: 90, a: rnd(0.2, 0.6), buf: this.brownBuf, bus: 'ambience', send: 0.5, pan: rnd(-0.6, 0.6) }); }, () => rnd(18, 40));
    this.loop('clock', () => { if (this.mood === 'urgent') { const t = this.ctx.currentTime + 0.02; this.burst(t, 0.015, 0.12, { type: 'highpass', f: 4200, bus: 'music', send: 0.2 }); } }, () => 1);
  }
  loop(name, fn, next) {
    const run = () => { if (this.ctx && this.enabled && this.ctx.state === 'running') { try { fn(); } catch { } } this.timers[name] = setTimeout(run, next() * 1000); };
    this.timers[name] = setTimeout(run, next() * 1000);
  }
  gust() {
    const L = this.layers.wind, t = this.ctx.currentTime, strong = this.mood === 'haunt' || this.mood === 'urgent';
    L.f.frequency.setTargetAtTime(rnd(strong ? 350 : 250, strong ? 1400 : 800), t, 1.2);
    L.g.gain.setTargetAtTime(rnd(0.05, strong ? 0.2 : 0.12), t, 1.5);
    if (L.p.pan) L.p.pan.setTargetAtTime(rnd(-0.7, 0.7), t, 2);
  }
  heartbeat() {
    if (this.mood !== 'haunt' && this.mood !== 'urgent') return;
    const t = this.ctx.currentTime + 0.02, lvl = this.mood === 'urgent' ? 0.5 : 0.28;
    [0, 0.2].forEach((d, i) => { const o = this.ctx.createOscillator(), e = this.ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(58, t + d); o.frequency.exponentialRampToValueAtTime(34, t + d + 0.18); o.connect(e).connect(this.layers.pulse.g); this.env(e, t + d, 0.01, lvl * (i ? 0.6 : 1), 0.2); o.start(t + d); o.stop(t + d + 0.3); });
  }
  musicBox() {
    if (this.mood === 'end') return;
    const t = this.ctx.currentTime + 0.05, haunted = this.mood !== 'explore' && this.mood !== 'menu';
    const scale = haunted ? [74, 75, 77, 80, 81, 82, 86] : [74, 77, 79, 81, 84, 86, 89];
    const n = 1 + Math.floor(Math.random() * (haunted ? 2 : 3));
    for (let i = 0; i < n; i++) {
      const m = pick(scale), s = t + i * rnd(0.35, 0.6), det = haunted ? rnd(-25, 25) : rnd(-4, 4), pan = rnd(-0.5, 0.5);
      this.osc('triangle', hz(m), s, 2.6, haunted ? 0.035 : 0.045, 'music', { a: 0.003, send: 0.85, pan, detune: det });
      this.osc('sine', hz(m) * 2, s, 1.2, 0.015, 'music', { a: 0.003, send: 0.85, pan, detune: det });
    }
  }
  applyMood(force = false) {
    if (!this.ctx) return;
    const m = this.mood, L = this.layers, t = this.ctx.currentTime, T = force ? 0.6 : 2.5;
    const lv = { menu: [0.5, 0, 0.35, 0.4], explore: [0.8, 0, 0.5, 0.6], haunt: [1, 0.9, 0.7, 0.8], urgent: [1, 1, 0.9, 0.9], end: [0.25, 0.2, 0.3, 0.4] }[m];
    L.drone.base.forEach(v => v.g.gain.setTargetAtTime(v.lvl * lv[0], t, T));
    L.drone.dark.forEach(v => v.g.gain.setTargetAtTime(v.lvl * lv[1], t, T));
    L.drone.g.gain.setTargetAtTime(0.16, t, T);
    L.drone.f.frequency.setTargetAtTime({ menu: 300, explore: 380, haunt: 700, urgent: 1100, end: 250 }[m], t, T);
    L.pulse.g.gain.setTargetAtTime(m === 'haunt' || m === 'urgent' ? 1 : 0.0001, t, T);
    L.room.g.gain.setTargetAtTime(0.5 * lv[3], t, T);
    L.wind.g.gain.setTargetAtTime(0.08 * lv[2] + 0.02, t, T);
  }
  // state observer ------------------------------------------------------------
  observe(game) {
    const snap = snapshot(game?.s || null), prev = this.prev; this.prev = snap;
    const m = mood(snap); if (m !== this.mood) { this.mood = m; if (this.enabled && this.ctx) this.applyMood(); }
    if (!this.enabled) return [];
    const list = cues(prev, snap);
    if (list.length && this.ensure()) {
      let d = 0;
      for (const k of list.slice(0, 4)) { this.play(k, d); d += k === 'dice' ? 0.45 : k === 'haunt' ? 0.2 : 0.12; }
    }
    if (this.enabled && this.ensure()) this.applyMoodOnce();
    return list;
  }
  applyMoodOnce() { if (!this._moodApplied) { this._moodApplied = true; this.applyMood(true); this.ramp(this.master, this.settings.master, 0.5); } }
  // settings dialog -----------------------------------------------------------
  settingsHTML() {
    const s = this.settings, row = (k, label, help) => `<label class="audio-row"><span>${label}<small>${help}</small></span><input type="range" min="0" max="100" step="1" value="${Math.round(s[k] * 100)}" data-audio="${k}" aria-label="${label}音量"><output>${Math.round(s[k] * 100)}</output></label>`;
    const test = [['step', '脚步'], ['reveal', '开门'], ['dice', '骰子'], ['omen', '预兆'], ['haunt', '作祟'], ['hurt', '受伤'], ['progress', '进度'], ['tick', '倒计时'], ['victory', '胜利'], ['defeat', '失败']];
    return `<div class="eyebrow">SOUND</div><h2>声音设置</h2><p class="helper">声音全部由浏览器实时合成：阶段音乐会随探索、作祟、最后三轮时限变化；环境层包含风声、木构吱呀和远雷；交互音对应移动、揭示、检定、受伤、进度和胜负。关闭声音不影响任何规则信息。</p>
<label class="guide-option audio-enable"><input type="checkbox" data-audio="enabled" ${s.enabled ? 'checked' : ''}> 开启声音</label>
<div class="audio-mixer">${row('master', '总音量', '全部声音')}${row('music', '音乐', '阶段氛围与八音盒')}${row('ambience', '环境', '风、木构、远雷')}${row('sfx', '交互', '移动、检定、事件')}</div>
<p class="helper">试听</p><div class="audio-tests">${test.map(([k, l]) => `<button class="small" data-audio-test="${k}">${l}</button>`).join('')}</div>
<div class="dialogactions"><button class="primary" data-action="close">完成</button></div>`;
  }
  bind(modalEl) {
    modalEl.querySelectorAll('input[data-audio]').forEach(el => {
      const k = el.dataset.audio;
      el.addEventListener(k === 'enabled' ? 'change' : 'input', () => {
        if (k === 'enabled') { this.setEnabled(el.checked); root.dispatchEvent?.(new CustomEvent('house-audio', { detail: this.settings })); if (el.checked) this.play('ui'); }
        else { this.setLevel(k, el.value / 100); el.nextElementSibling.value = el.value; }
      });
    });
    modalEl.querySelectorAll('[data-audio-test]').forEach(el => el.addEventListener('click', e => {
      e.stopPropagation();
      if (!this.enabled) { this.setEnabled(true); const cb = modalEl.querySelector('input[data-audio="enabled"]'); if (cb) cb.checked = true; root.dispatchEvent?.(new CustomEvent('house-audio', { detail: this.settings })); }
      this.play(el.dataset.audioTest);
    }));
  }
}

const api = { snapshot, cues, mood, loadSettings, DEFAULTS, KEY };
if (typeof module === 'object' && module.exports) module.exports = api;
if (root && root.document) {
  let store = null; try { store = root.localStorage; } catch { }
  const engine = new HouseSound(store);
  engine.pure = api;
  root.HouseAudio = engine;
} else if (root) root.HouseAudioPure = api;
})(typeof window !== 'undefined' ? window : globalThis);
