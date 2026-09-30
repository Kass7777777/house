// House board renderer: animated isometric scene (materials, walls, props, lighting, fog, sprites, beacons).
// Presentation only. Reads game state; never mutates it and never touches the game RNG (Math.random only).
// Relies on app.js globals at call time: game, floor, mapFocus, hitAreas, act, modal, guideState, HouseGuide.
(function (root) {
'use strict';
const DIRV = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const S = 0.84;                       // room footprint relative to grid step (gap = corridor)
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; };
const G = () => (typeof game !== 'undefined' ? game : null);
const reduced = () => { try { return root.HouseSettings?.get('reducedMotion') || root.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

// ---------- room look-up tables ----------
const MATERIAL = {
  图书室: 'wood', 卧室: 'wood', 书房: 'wood', 音乐室: 'wood', 阁楼: 'plank', 客厅: 'carpet', 画廊: 'wood', 餐厅: 'wood', 旧教室: 'plank',
  礼拜堂: 'checker', 实验室: 'checker', 镜厅: 'checker', 温室: 'garden', 宝库: 'stone', 地窖: 'stone', 墓穴: 'stone', 锅炉房: 'stone',
  煤槽: 'stone', 密室: 'stone', 塌陷房间: 'stone', 储藏室: 'plank', 古物室: 'carpet', 观星台: 'checker', 长廊: 'carpet', 幽暗回廊: 'carpet',
  祭器室: 'checker', 入口大厅: 'carpet', 大楼梯: 'carpet', 上层平台: 'wood', 地下平台: 'stone',
};
const PROP = {
  图书室: 'shelves', 书房: 'desk', 古物室: 'cabinet', 旧教室: 'desks', 礼拜堂: 'altar', 祭器室: 'altar', 墓穴: 'coffin', 餐厅: 'table',
  实验室: 'lab', 卧室: 'bed', 音乐室: 'piano', 温室: 'plants', 储藏室: 'crates', 地窖: 'barrels', 煤槽: 'coal', 锅炉房: 'boiler',
  阁楼: 'crates', 画廊: 'paintings', 镜厅: 'mirror', 长廊: 'paintings', 幽暗回廊: 'candles', 客厅: 'sofa', 观星台: 'telescope',
  宝库: 'chest', 密室: 'candles', 大楼梯: 'stairs', 上层平台: 'stairsDown', 地下平台: 'stairsUp', 入口大厅: 'chandelier', 塌陷房间: 'rubble',
};
const MAT = {
  wood: { base: ['#6b4a30', '#4a3120'], line: '#2e1d12' }, plank: { base: ['#71583c', '#4d3a27'], line: '#33261a' },
  stone: { base: ['#555a55', '#3a3e3b'], line: '#262a28' }, checker: { base: ['#7d7a6e', '#4c4a43'], a: '#9c978a', b: '#2f2e2a' },
  carpet: { base: ['#5d412c', '#3e2a1c'], rug: '#6c2626', rugDark: '#4a1818', trim: '#c8a257' }, garden: { base: ['#46583b', '#2d3a27'], line: '#243020' },
};
const WALL = { '-1': ['#3c403e', '#2a2e2c', '#8b8f86'], 0: ['#3e4a3c', '#2b3429', '#b19a62'], 1: ['#473a4a', '#302733', '#b49872'] };

// ---------- state ----------
const st = {
  canvas: null, ctx: null, W: 0, H: 0, dpr: 1, raf: 0, last: 0, t: 0,
  cam: { u0: 0, v0: 0, tile: 80, ready: false, floor: null, gameId: null },
  view: { zoom: 1, panX: 0, panY: 0 }, drag: null, mouse: null,
  scene: null, anim: {}, reveal: {}, floats: [], prev: null, dust: [], shake: 0, flash: 0, flashColor: '#fff', lightning: 0, nextBolt: 0,
  patterns: new Map(), light: null, resizeObs: null, offX: 0, offY: 0,
};

// ---------- scene model (computed on each render) ----------
function model() {
  const s = game.s, p = game.p, here = game.roomNow;
  const rooms = s.rooms.filter(r => r.f === floor);
  const candidates = [];
  if (here.f === floor) for (const e of game.exits()) if (e.open && !e.target) { const [dx, dy] = DIRV[e.d]; candidates.push({ x: here.x + dx, y: here.y + dy, d: e.d }); }
  const neighbors = new Set(game.neighbors(p.room).map(n => n.id));
  const beacons = [], elsewhere = {};
  const add = (room, label, color, kind = 'goal') => { const r = room && s.rooms.find(q => q.id === room); if (!r) return; if (r.f === floor) beacons.push({ room, label, color, kind }); else if (kind !== 'safe') elsewhere[r.f] = (elsewhere[r.f] || 0) + 1; };
  if (s.phase === 'burial') { if (s.carrier === null) add(s.corpseRoom, 'Ⅰ 遗骸', '#a8efe4'); add(s.burialRoom, 'Ⅱ 安葬', '#f3dc9a'); }
  if (s.phase === 'rescue' && s.rescue) {
    const r = s.rescue, v = s.players[r.victim];
    if (r.web < r.webGoal || !r.eggs) add(v.room, 'Ⅰ 救援', '#fff0bd');
    if (!r.eggs) add(r.kitRoom, 'Ⅱ 医疗', '#bfe9c9');
    add('0:0:0', r.door ? 'Ⅳ 逃脱' : 'Ⅲ 前门', '#f3dc9a');
  }
  if (s.phase === 'seals' && s.seals) {
    const T = ['力量', '速度', '知识', '理智'];
    s.seals.nodes.forEach((n, i) => { const done = n.progress >= n.goal; add(n.room, done ? `安全 · 封印 ${i + 1}` : `封印 ${'①②③④'[i]} ${T[n.trait] || ''} ${n.progress}/${n.goal}`, done ? '#f6dc8f' : '#c9a7ff', done ? 'safe' : 'seal'); });
    if (s.seals.nodes.every(n => n.progress >= n.goal)) add('0:0:0', '撤离出口', '#f3dc9a');
  }
  const spider = s.phase === 'rescue' && s.rescue ? s.rescue.spider : null;
  let guide = null;
  try {
    if (guideState().enabled && !game.isAI() && !s.result && guideState().lesson >= 3) {
      const tip = HouseGuide.tutorial(game);
      if (tip?.room) guide = { room: tip.room };
      else if (tip?.action?.startsWith('move:')) { const d = Number(tip.action.split(':')[1]), e = game.exits()[d]; guide = e?.target ? { room: e.target.id } : { d }; }
    }
  } catch { }
  const locked = !game.canAct() || game.isAI(p);
  return {
    s, p, here, rooms, candidates, neighbors, beacons, elsewhere, spider, guide, locked, floor,
    haunt: s.phase !== 'explore', urgent: ['rescue', 'burial', 'seals'].includes(s.phase) && (s.phase === 'seals' ? s.seals?.remaining : s.phase === 'rescue' ? s.rescue?.remaining : s.countdown) <= 3 && !s.result,
    ghost: s.ghost && s.ghost.room, focus: mapFocus, cost: game.cost(), moves: s.moves,
    id: s.seed + '|' + s.startedAt,
  };
}

// ---------- geometry ----------
function pos(x, y) { const c = st.cam; return [st.W / 2 + st.offX + (x - y - c.u0) * c.tile + st.view.panX, st.H / 2 + st.offY + (x + y - c.v0) * c.tile * 0.52 + st.view.panY]; }
function local(cx, cy, lx, ly, h = 0) { const t = st.cam.tile; return [cx + (lx - ly) * t, cy + (lx + ly) * t * 0.52 - h]; }
function path(c, pts) { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); }
function diamondPts(x, y, k = 1) { const hw = st.cam.tile * S * k, hh = st.cam.tile * 0.52 * S * k; return [[x, y - hh], [x + hw, y], [x, y + hh], [x - hw, y]]; }
function cuboid(c, cx, cy, lx, ly, a, b, h, top, left, right, lift = 0) {
  const P = (u, v, z) => local(cx, cy, u, v, z + lift);
  const x0 = lx - a / 2, x1 = lx + a / 2, y0 = ly - b / 2, y1 = ly + b / 2;
  path(c, [P(x0, y1, 0), P(x1, y1, 0), P(x1, y1, h), P(x0, y1, h)]); c.fillStyle = left; c.fill();
  path(c, [P(x1, y0, 0), P(x1, y1, 0), P(x1, y1, h), P(x1, y0, h)]); c.fillStyle = right; c.fill();
  path(c, [P(x0, y0, h), P(x1, y0, h), P(x1, y1, h), P(x0, y1, h)]); c.fillStyle = top; c.fill();
}

// ---------- materials (cached per tile size) ----------
function floorPattern(mat, collapsed) {
  const tile = Math.round(st.cam.tile), key = mat + '|' + tile + '|' + collapsed + '|' + st.dpr;
  if (st.patterns.has(key)) return st.patterns.get(key);
  const hw = tile * S, hh = tile * 0.52 * S, cv = document.createElement('canvas');
  cv.width = Math.ceil((hw * 2 + 4) * st.dpr); cv.height = Math.ceil((hh * 2 + 4) * st.dpr);
  const c = cv.getContext('2d'); c.scale(st.dpr, st.dpr); c.translate(hw + 2, hh + 2);
  const m = MAT[mat] || MAT.wood, pts = [[0, -hh], [hw, 0], [0, hh], [-hw, 0]];
  path(c, pts); c.save(); c.clip();
  const g = c.createLinearGradient(0, -hh, 0, hh); g.addColorStop(0, m.base[0]); g.addColorStop(1, m.base[1]); c.fillStyle = g; c.fillRect(-hw, -hh, hw * 2, hh * 2);
  const along = (n, fn) => { for (let i = 1; i < n; i++) fn(i / n); };
  // lines parallel to each iso axis
  const lineA = t => { const ox = lerp(-hw, 0, t), oy = lerp(0, hh, t); c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox + hw, oy - hh); c.stroke(); };
  const lineB = t => { const ox = lerp(-hw, 0, t), oy = lerp(0, -hh, t); c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox + hw, oy + hh); c.stroke(); };
  if (mat === 'wood' || mat === 'plank') {
    c.strokeStyle = m.line; c.lineWidth = 1; c.globalAlpha = 0.55; along(mat === 'plank' ? 6 : 9, lineA);
    c.globalAlpha = 0.35; for (let i = 0; i < 14; i++) { const t = hash(key + i), u = hash(key + 'u' + i); const ox = lerp(-hw, 0, t), oy = lerp(0, hh, t); c.beginPath(); c.moveTo(ox + hw * u, oy - hh * u); c.lineTo(ox + hw * u + 4, oy - hh * u + 2.2); c.stroke(); }
    c.globalAlpha = 0.08; c.fillStyle = '#fff'; path(c, [[0, -hh], [hw * 0.5, -hh * 0.5], [0, 0], [-hw * 0.5, -hh * 0.5]]); c.fill();
  } else if (mat === 'stone') {
    c.strokeStyle = m.line; c.lineWidth = 1.2; c.globalAlpha = 0.7; along(5, lineA); along(5, lineB);
    c.globalAlpha = 0.18; for (let i = 0; i < 10; i++) { const a = hash(key + 's' + i), b = hash(key + 't' + i); const [x, y] = [(a - b) * hw, (a + b - 1) * hh]; c.fillStyle = i % 2 ? '#000' : '#9aa096'; path(c, [[x, y - hh / 5], [x + hw / 5, y], [x, y + hh / 5], [x - hw / 5, y]]); c.fill(); }
  } else if (mat === 'checker') {
    const n = 6;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const u0 = i / n, v0 = j / n, P = (u, v) => [lerp(-hw, 0, v) + hw * u, lerp(0, hh, v) - hh * u];
      c.fillStyle = (i + j) % 2 ? m.b : m.a; c.globalAlpha = 0.7;
      path(c, [P(u0, v0), P(u0 + 1 / n, v0), P(u0 + 1 / n, v0 + 1 / n), P(u0, v0 + 1 / n)]); c.fill();
    }
  } else if (mat === 'carpet') {
    c.strokeStyle = '#2e1d12'; c.globalAlpha = 0.5; along(8, lineA); c.globalAlpha = 1;
    const k = 0.72; path(c, [[0, -hh * k], [hw * k, 0], [0, hh * k], [-hw * k, 0]]); c.fillStyle = m.rug; c.fill();
    c.strokeStyle = m.trim; c.lineWidth = 1.5; c.globalAlpha = 0.8; c.stroke();
    const k2 = 0.5; path(c, [[0, -hh * k2], [hw * k2, 0], [0, hh * k2], [-hw * k2, 0]]); c.fillStyle = m.rugDark; c.globalAlpha = 0.8; c.fill(); c.globalAlpha = 0.5; c.stroke();
    const k3 = 0.22; path(c, [[0, -hh * k3], [hw * k3, 0], [0, hh * k3], [-hw * k3, 0]]); c.fillStyle = m.trim; c.globalAlpha = 0.45; c.fill();
  } else if (mat === 'garden') {
    c.strokeStyle = m.line; c.globalAlpha = 0.5; along(4, lineA); along(4, lineB);
    for (let i = 0; i < 26; i++) { const a = hash(key + 'g' + i), b = hash(key + 'h' + i); c.fillStyle = i % 3 ? '#6f8e52' : '#a4b86a'; c.globalAlpha = 0.6; c.beginPath(); c.ellipse((a - b) * hw * 0.9, (a + b - 1) * hh * 0.9, 2.5, 1.4, 0, 0, TAU); c.fill(); }
  }
  if (collapsed) {
    c.globalAlpha = 0.75; c.fillStyle = '#1a1512'; c.fillRect(-hw, -hh, hw * 2, hh * 2);
    c.strokeStyle = '#8d5147'; c.lineWidth = 1.5; c.globalAlpha = 0.9;
    for (let i = 0; i < 5; i++) { c.beginPath(); let x = (hash(key + 'c' + i) - 0.5) * hw, y = (hash(key + 'd' + i) - 0.5) * hh; c.moveTo(x, y); for (let j = 0; j < 4; j++) { x += (hash(key + i + 'x' + j) - 0.5) * hw * 0.5; y += (hash(key + i + 'y' + j) - 0.5) * hh * 0.5; c.lineTo(x, y); } c.stroke(); }
  }
  c.restore();
  // soft inner edge shading
  c.globalAlpha = 1; path(c, pts); c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.35)'; c.stroke();
  const out = { cv, hw, hh };
  if (st.patterns.size > 80) st.patterns.clear();
  st.patterns.set(key, out); return out;
}

// ---------- props ----------
function drawProp(c, kind, x, y, r, t, lights) {
  const T = st.cam.tile, flick = 0.85 + 0.15 * Math.sin(t * 9 + hash(r.id) * 20);
  const candle = (lx, ly, h = 0) => { const [px, py] = local(x, y, lx, ly, h); c.fillStyle = '#e9e1c8'; c.fillRect(px - 1.2, py - T * 0.07, 2.4, T * 0.07); c.fillStyle = '#ffcf6a'; c.globalAlpha = flick; c.beginPath(); c.ellipse(px, py - T * 0.085, 1.6, 3, 0, 0, TAU); c.fill(); c.globalAlpha = 1; lights.push({ x: px, y: py - T * 0.08, r: T * 0.55, c: '255,190,90', a: 0.35 * flick }); };
  switch (kind) {
    case 'shelves': cuboid(c, x, y, -0.34, -0.05, 0.1, 0.55, T * 0.34, '#4a3020', '#2c1c12', '#3c2718');
      for (let i = 0; i < 3; i++) { const [a, b] = local(x, y, -0.29, -0.3, T * (0.08 + i * 0.1)), [e, f] = local(x, y, -0.29, 0.2, T * (0.08 + i * 0.1)); c.strokeStyle = ['#8b3a32', '#3f6a6b', '#b28a45'][i]; c.lineWidth = T * 0.05; c.beginPath(); c.moveTo(a, b); c.lineTo(e, f); c.stroke(); }
      cuboid(c, x, y, 0.12, 0.12, 0.26, 0.18, T * 0.1, '#5b3e28', '#33231a', '#402c1e'); break;
    case 'desk': cuboid(c, x, y, -0.1, -0.18, 0.36, 0.2, T * 0.11, '#5b3e28', '#33231a', '#402c1e'); candle(-0.2, -0.2, T * 0.11); break;
    case 'desks': for (const [a, b] of [[-0.18, -0.15], [0.12, -0.15], [-0.18, 0.15]]) cuboid(c, x, y, a, b, 0.2, 0.12, T * 0.08, '#6a4a30', '#3a2819', '#4a3322'); break;
    case 'cabinet': cuboid(c, x, y, -0.33, -0.1, 0.12, 0.3, T * 0.28, '#3f2a1c', '#24170f', '#301f14'); cuboid(c, x, y, -0.05, -0.32, 0.26, 0.1, T * 0.2, '#3f2a1c', '#24170f', '#301f14');
      { const [a, b] = local(x, y, 0.05, 0.05, T * 0.1); c.fillStyle = '#c9b27a'; c.beginPath(); c.arc(a, b, T * 0.05, 0, TAU); c.fill(); } break;
    case 'altar': cuboid(c, x, y, -0.15, -0.15, 0.3, 0.18, T * 0.12, '#8c8573', '#4d4a40', '#6a6558'); candle(-0.26, -0.19, T * 0.12); candle(-0.04, -0.19, T * 0.12);
      { const [a, b] = local(x, y, -0.15, -0.28, T * 0.3); c.strokeStyle = '#c8a257'; c.lineWidth = 2; c.beginPath(); c.moveTo(a, b - T * 0.14); c.lineTo(a, b + T * 0.06); c.moveTo(a - T * 0.05, b - T * 0.07); c.lineTo(a + T * 0.05, b - T * 0.07); c.stroke(); } break;
    case 'coffin': cuboid(c, x, y, -0.05, -0.12, 0.42, 0.16, T * 0.08, '#3a2a22', '#1f1612', '#2a1f19'); candle(0.25, -0.25); break;
    case 'table': cuboid(c, x, y, 0, -0.05, 0.46, 0.24, T * 0.1, '#6a4a30', '#3a2819', '#4a3322'); candle(-0.1, -0.05, T * 0.1); candle(0.1, -0.05, T * 0.1); break;
    case 'lab': cuboid(c, x, y, -0.05, -0.2, 0.44, 0.18, T * 0.11, '#5a5f60', '#33383a', '#454a4c');
      { const [a, b] = local(x, y, 0.05, -0.2, T * 0.11), pulse = 0.6 + 0.4 * Math.sin(t * 2.3); c.fillStyle = `rgba(120,255,170,${0.55 + 0.3 * pulse})`; c.beginPath(); c.arc(a, b - T * 0.04, T * 0.045, 0, TAU); c.fill(); lights.push({ x: a, y: b, r: T * 0.7, c: '90,255,150', a: 0.25 * pulse }); } break;
    case 'bed': cuboid(c, x, y, -0.1, -0.1, 0.3, 0.46, T * 0.09, '#d7d0bf', '#6f5a45', '#85705a'); cuboid(c, x, y, -0.1, -0.28, 0.24, 0.1, T * 0.04, '#f2ecdd', '#bdb5a3', '#cfc7b4', T * 0.09); break;
    case 'piano': cuboid(c, x, y, -0.12, -0.2, 0.42, 0.18, T * 0.16, '#16181a', '#0b0c0d', '#111314'); { const [a, b] = local(x, y, -0.12, -0.1, T * 0.16); c.fillStyle = '#e8e2d2'; c.fillRect(a - T * 0.18, b - 1, T * 0.36, 2); } break;
    case 'plants': for (const [a, b, h] of [[-0.25, -0.25, 0.22], [0.2, -0.28, 0.16], [-0.28, 0.18, 0.18], [0.05, 0.05, 0.12]]) { cuboid(c, x, y, a, b, 0.1, 0.1, T * 0.05, '#8a5a3a', '#5a3a26', '#6a442c'); const [px, py] = local(x, y, a, b, T * (0.05 + h / 2)); c.fillStyle = '#4f7a3e'; c.beginPath(); c.arc(px, py, T * h * 0.5, 0, TAU); c.fill(); c.fillStyle = '#7aa05a'; c.beginPath(); c.arc(px - 2, py - 2, T * h * 0.3, 0, TAU); c.fill(); } break;
    case 'crates': cuboid(c, x, y, -0.25, -0.22, 0.2, 0.2, T * 0.14, '#8a6a42', '#5a4428', '#6e5434'); cuboid(c, x, y, 0.02, -0.28, 0.16, 0.16, T * 0.1, '#7a5c38', '#4e3a22', '#62492c'); cuboid(c, x, y, -0.25, -0.22, 0.14, 0.14, T * 0.1, '#9a7a4e', '#5a4428', '#6e5434', T * 0.14); break;
    case 'barrels': for (const [a, b] of [[-0.25, -0.2], [-0.05, -0.3], [-0.28, 0.05]]) { const [px, py] = local(x, y, a, b); c.fillStyle = '#4e3522'; c.fillRect(px - T * 0.08, py - T * 0.2, T * 0.16, T * 0.2); c.fillStyle = '#6b4a30'; c.beginPath(); c.ellipse(px, py - T * 0.2, T * 0.08, T * 0.04, 0, 0, TAU); c.fill(); c.strokeStyle = '#2a1c12'; c.beginPath(); c.moveTo(px - T * 0.08, py - T * 0.08); c.lineTo(px + T * 0.08, py - T * 0.08); c.stroke(); } break;
    case 'coal': { const [px, py] = local(x, y, -0.15, -0.15); c.fillStyle = '#141414'; c.beginPath(); c.ellipse(px, py, T * 0.25, T * 0.11, 0, Math.PI, TAU); c.fill(); c.fillStyle = '#262626'; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(px + (hash(r.id + i) - 0.5) * T * 0.3, py - hash(r.id + 'y' + i) * T * 0.08, T * 0.03, 0, TAU); c.fill(); } } break;
    case 'boiler': { const [px, py] = local(x, y, -0.18, -0.18), pulse = 0.7 + 0.3 * Math.sin(t * 3); c.fillStyle = '#3d3a36'; c.fillRect(px - T * 0.14, py - T * 0.34, T * 0.28, T * 0.34); c.fillStyle = '#56514b'; c.beginPath(); c.ellipse(px, py - T * 0.34, T * 0.14, T * 0.06, 0, 0, TAU); c.fill(); c.fillStyle = `rgba(255,120,40,${0.7 * pulse})`; c.fillRect(px - T * 0.06, py - T * 0.12, T * 0.12, T * 0.07); lights.push({ x: px, y: py - T * 0.1, r: T * 0.9, c: '255,110,40', a: 0.35 * pulse }); } break;
    case 'paintings': for (const [a, col] of [[-0.2, '#7a3b2e'], [0.15, '#2f5a5a']]) { const [p1, q1] = local(x, y, a, -0.42, T * 0.28), [p2, q2] = local(x, y, a + 0.2, -0.42, T * 0.28); c.fillStyle = '#b5924d'; path(c, [[p1, q1], [p2, q2], [p2, q2 + T * 0.16], [p1, q1 + T * 0.16]]); c.fill(); c.fillStyle = col; path(c, [[p1 + 2, q1 + 3], [p2 - 2, q2 + 1], [p2 - 2, q2 + T * 0.16 - 3], [p1 + 2, q1 + T * 0.16 - 1]]); c.fill(); } break;
    case 'mirror': { const [p1, q1] = local(x, y, -0.15, -0.42, T * 0.36), [p2, q2] = local(x, y, 0.15, -0.42, T * 0.36), sh = (Math.sin(t * 0.8) + 1) / 2; const g = c.createLinearGradient(p1, q1, p2, q2); g.addColorStop(0, '#6f8f98'); g.addColorStop(sh, '#e8f6f8'); g.addColorStop(1, '#4b6a72'); c.fillStyle = '#b5924d'; path(c, [[p1 - 2, q1 - 2], [p2 + 2, q2 - 2], [p2 + 2, q2 + T * 0.26], [p1 - 2, q1 + T * 0.26]]); c.fill(); c.fillStyle = g; path(c, [[p1, q1], [p2, q2], [p2, q2 + T * 0.24], [p1, q1 + T * 0.24]]); c.fill(); } break;
    case 'candles': candle(-0.3, -0.3); candle(0.25, -0.33); candle(-0.33, 0.2); break;
    case 'sofa': cuboid(c, x, y, -0.12, -0.25, 0.4, 0.14, T * 0.1, '#5a2a2a', '#351818', '#452020'); cuboid(c, x, y, -0.12, -0.3, 0.4, 0.05, T * 0.12, '#6a3232', '#351818', '#452020', T * 0.1); break;
    case 'telescope': { const [px, py] = local(x, y, -0.1, -0.15); c.strokeStyle = '#b5924d'; c.lineWidth = 2; c.beginPath(); c.moveTo(px, py); c.lineTo(px - T * 0.08, py - T * 0.18); c.moveTo(px, py); c.lineTo(px + T * 0.08, py - T * 0.18); c.stroke(); c.lineWidth = T * 0.06; c.strokeStyle = '#8d7a5a'; c.beginPath(); c.moveTo(px - T * 0.15, py - T * 0.12); c.lineTo(px + T * 0.18, py - T * 0.34); c.stroke(); for (let i = 0; i < 5; i++) { const sx = px + (hash(r.id + 'st' + i) - 0.5) * T, sy = py - T * 0.5 - hash(r.id + 'sy' + i) * T * 0.3; c.fillStyle = `rgba(230,240,255,${0.4 + 0.4 * Math.sin(t * 2 + i)})`; c.fillRect(sx, sy, 1.5, 1.5); } } break;
    case 'chest': { cuboid(c, x, y, -0.1, -0.2, 0.3, 0.18, T * 0.12, '#8a6a2a', '#4a3812', '#5e4818'); const [px, py] = local(x, y, -0.1, -0.2, T * 0.12); lights.push({ x: px, y: py, r: T * 0.6, c: '255,210,110', a: 0.25 }); c.fillStyle = '#e9c65a'; c.fillRect(px - 2, py - 1, 4, 3); } break;
    case 'stairs': for (let i = 0; i < 5; i++) cuboid(c, x, y, -0.25 + i * 0.1, -0.2, 0.1, 0.36, T * (0.05 + i * 0.05), '#6b4a30', '#3a2819', '#4a3322'); break;
    case 'stairsDown': case 'stairsUp': { const pts = diamondPts(...local(x, y, -0.12, -0.12), 0.3); path(c, pts); c.fillStyle = '#0c0f0e'; c.fill(); for (let i = 1; i < 4; i++) { const k = 0.3 - i * 0.07; path(c, diamondPts(...local(x, y, -0.12 + i * 0.03, -0.12, kind === 'stairsDown' ? -i * 3 : i * 3), k)); c.strokeStyle = '#5a4430'; c.lineWidth = 1.5; c.stroke(); } } break;
    case 'chandelier': { const [px, py] = local(x, y, 0, 0, T * 0.62), sw = Math.sin(t * 0.7) * 2; c.strokeStyle = '#6a5a3a'; c.beginPath(); c.moveTo(px, py - T * 0.3); c.lineTo(px + sw, py); c.stroke(); c.fillStyle = '#b5924d'; c.beginPath(); c.ellipse(px + sw, py, T * 0.12, T * 0.04, 0, 0, TAU); c.fill(); for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; c.fillStyle = '#ffd98a'; c.globalAlpha = flick; c.beginPath(); c.arc(px + sw + Math.cos(a) * T * 0.11, py - 3 + Math.sin(a) * T * 0.035, 1.8, 0, TAU); c.fill(); } c.globalAlpha = 1; lights.push({ x: px, y: py + T * 0.4, r: T * 1.3, c: '255,200,120', a: 0.3 * flick }); } break;
    case 'rubble': for (let i = 0; i < 6; i++) cuboid(c, x, y, (hash(r.id + 'rx' + i) - 0.5) * 0.6, (hash(r.id + 'ry' + i) - 0.5) * 0.6, 0.08 + hash(r.id + i) * 0.1, 0.08, T * (0.03 + hash(r.id + 'h' + i) * 0.08), '#5a524a', '#302a25', '#3e3731'); break;
  }
}

// ---------- walls ----------
function drawWalls(c, r, x, y, alpha) {
  const T = st.cam.tile, hw = T * S, hh = T * 0.52 * S, h = T * 0.3, [face, shade, trim] = WALL[r.f] || WALL[0];
  const left = [-hw, 0], topV = [0, -hh], right = [hw, 0];
  // edge west = left->top, north = top->right ; door gap in the middle when that side has a door
  const seg = (a, b, t0, t1, col) => { const p0 = [lerp(a[0], b[0], t0) + x, lerp(a[1], b[1], t0) + y], p1 = [lerp(a[0], b[0], t1) + x, lerp(a[1], b[1], t1) + y]; path(c, [p0, p1, [p1[0], p1[1] - h], [p0[0], p0[1] - h]]); c.fillStyle = col; c.fill(); c.strokeStyle = trim; c.globalAlpha = alpha * 0.55; c.beginPath(); c.moveTo(p0[0], p0[1] - h); c.lineTo(p1[0], p1[1] - h); c.stroke(); c.globalAlpha = alpha; };
  c.globalAlpha = alpha; c.lineWidth = 1.5;
  for (const [a, b, dir, col] of [[left, topV, 3, shade], [topV, right, 0, face]]) {
    if (r.doors.includes(dir)) {
      seg(a, b, 0, 0.36, col); seg(a, b, 0.64, 1, col);
      const p0 = [lerp(a[0], b[0], 0.36) + x, lerp(a[1], b[1], 0.36) + y], p1 = [lerp(a[0], b[0], 0.64) + x, lerp(a[1], b[1], 0.64) + y];
      path(c, [p0, p1, [p1[0], p1[1] - h * 0.8], [p0[0], p0[1] - h * 0.8]]); c.fillStyle = '#07090a'; c.fill();
      c.strokeStyle = trim; c.globalAlpha = alpha * 0.7; c.stroke(); c.globalAlpha = alpha;
    } else seg(a, b, 0, 1, col);
  }
  c.globalAlpha = 1;
}

// ---------- sprites ----------
function pawn(c, x, y, color, n, active, t, opts = {}) {
  const k = clamp(st.cam.tile * 0.12, 6, 13), bob = reduced() ? 0 : Math.sin(t * 2.2 + n) * 1.2;
  c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.ellipse(x, y + 1, k * 1.05, k * 0.45, 0, 0, TAU); c.fill();
  if (active) { const pr = 1 + 0.15 * Math.sin(t * 4); c.strokeStyle = 'rgba(255,221,140,.9)'; c.lineWidth = 2; c.beginPath(); c.ellipse(x, y + 1, k * 1.5 * pr, k * 0.65 * pr, 0, 0, TAU); c.stroke(); }
  const top = y - k * 2.3 + bob;
  const g = c.createLinearGradient(x - k, 0, x + k, 0); g.addColorStop(0, shadeColor(color, -0.35)); g.addColorStop(0.45, color); g.addColorStop(1, shadeColor(color, -0.5));
  c.beginPath(); c.moveTo(x - k * 0.8, y); c.quadraticCurveTo(x - k * 0.75, top + k * 0.9, x - k * 0.35, top + k * 0.55); c.lineTo(x + k * 0.35, top + k * 0.55); c.quadraticCurveTo(x + k * 0.75, top + k * 0.9, x + k * 0.8, y); c.closePath(); c.fillStyle = g; c.fill();
  c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1; c.stroke();
  c.fillStyle = shadeColor(color, 0.25); c.beginPath(); c.arc(x, top + k * 0.2, k * 0.58, 0, TAU); c.fill(); c.stroke();
  c.fillStyle = '#101512'; c.font = `bold ${Math.round(k * 1.05)}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(n, x, y - k * 0.75 + bob * 0.5); c.textBaseline = 'alphabetic';
  if (opts.restrained) { c.strokeStyle = 'rgba(235,235,235,.7)'; c.lineWidth = 1; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(x - k * 1.1, top + i * k * 0.6); c.lineTo(x + k * 1.1, top + k * 0.4 + i * k * 0.5); c.stroke(); } }
  if (opts.carrier) { c.fillStyle = 'rgba(168,239,228,.85)'; c.beginPath(); c.arc(x + k * 0.9, top - k * 0.2, k * 0.35, 0, TAU); c.fill(); }
  if (active && !reduced()) { const ay = top - k * 1.2 + Math.sin(t * 3) * 2.5; c.fillStyle = '#ffdd8c'; path(c, [[x - k * 0.45, ay - k * 0.5], [x + k * 0.45, ay - k * 0.5], [x, ay]]); c.fill(); }
  return top;
}
function shadeColor(hex, f) { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, m = v => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f); return `rgb(${m(r)},${m(g)},${m(b)})`; }
function ghostSprite(c, x, y, t) {
  const T = st.cam.tile, fy = y - T * 0.45 + Math.sin(t * 1.6) * 4;
  for (let i = 5; i > 0; i--) { c.fillStyle = `rgba(160,235,245,${0.08 * i})`; c.beginPath(); c.arc(x - i * 3 + Math.sin(t * 3 + i) * 2, fy + i * 4, T * 0.05 * (6 - i) / 2, 0, TAU); c.fill(); }
  const g = c.createRadialGradient(x, fy, 1, x, fy, T * 0.2); g.addColorStop(0, 'rgba(235,255,255,.95)'); g.addColorStop(1, 'rgba(120,220,235,0)');
  c.fillStyle = g; c.beginPath(); c.arc(x, fy, T * 0.2, 0, TAU); c.fill();
  c.fillStyle = 'rgba(210,250,255,.85)'; c.beginPath(); c.moveTo(x - T * 0.1, fy + T * 0.12); c.quadraticCurveTo(x - T * 0.12, fy - T * 0.12, x, fy - T * 0.13); c.quadraticCurveTo(x + T * 0.12, fy - T * 0.12, x + T * 0.1, fy + T * 0.12); for (let i = 0; i < 4; i++) c.lineTo(x + T * 0.1 - (i + 0.5) * T * 0.05, fy + T * (i % 2 ? 0.12 : 0.17) + Math.sin(t * 5 + i) * 1.5); c.closePath(); c.fill();
  c.fillStyle = '#123'; c.beginPath(); c.arc(x - T * 0.035, fy - T * 0.03, 1.8, 0, TAU); c.arc(x + T * 0.035, fy - T * 0.03, 1.8, 0, TAU); c.fill();
  return fy;
}
function spiderSprite(c, x, y, t, stunned) {
  const T = st.cam.tile, k = T * 0.1;
  c.fillStyle = 'rgba(0,0,0,.5)'; c.beginPath(); c.ellipse(x, y + 2, k * 1.6, k * 0.6, 0, 0, TAU); c.fill();
  c.strokeStyle = stunned ? '#6c6c6c' : '#1d1414'; c.lineWidth = 2;
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { const w = stunned ? 0 : Math.sin(t * 8 + i * 1.3 + (s > 0 ? 1 : 0)) * 2; c.beginPath(); c.moveTo(x, y - k * 0.6); c.quadraticCurveTo(x + s * k * (1 + i * 0.25), y - k * (1.6 - i * 0.2) + w, x + s * k * (1.4 + i * 0.3), y + k * 0.2 * i - k * 0.2); c.stroke(); }
  c.fillStyle = stunned ? '#4a4545' : '#241818'; c.beginPath(); c.ellipse(x, y - k * 0.7, k * 0.9, k * 0.7, 0, 0, TAU); c.fill(); c.beginPath(); c.arc(x, y - k * 1.4, k * 0.45, 0, TAU); c.fill();
  if (!stunned) { c.fillStyle = '#ff4a3a'; for (const s of [-1, 1]) { c.beginPath(); c.arc(x + s * k * 0.18, y - k * 1.45, 1.5, 0, TAU); c.fill(); } }
  else { c.fillStyle = '#cfd6d8'; c.font = `${Math.round(k)}px system-ui`; c.fillText('z z', x + k, y - k * 2 - Math.sin(t * 2) * 2); }
  return y - k * 2;
}

// ---------- chips & text ----------
function chip(c, x, y, text, color, bg = 'rgba(12,17,15,.86)') {
  c.font = '600 12px system-ui,"Microsoft YaHei",sans-serif'; const w = c.measureText(text).width + 14;
  c.fillStyle = bg; roundRect(c, x - w / 2, y - 15, w, 20, 4); c.fill(); c.strokeStyle = color; c.globalAlpha = 0.6; c.lineWidth = 1; c.stroke(); c.globalAlpha = 1;
  c.fillStyle = color; c.textAlign = 'center'; c.fillText(text, x, y); return w;
}
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

// ---------- frame ----------
function frame(now) {
  st.raf = 0;
  if (!st.canvas || !st.canvas.isConnected || !st.scene || !G()) return;
  const dt = Math.min(0.05, (now - (st.last || now)) / 1000); st.last = now; st.t += dt;
  const M = st.scene, c = st.ctx, t = st.t, still = reduced();
  // camera easing
  const cam = st.cam, target = st.target, ease = still || !cam.ready ? 1 : 1 - Math.pow(0.001, dt);
  cam.u0 = lerp(cam.u0, target.u0, ease); cam.v0 = lerp(cam.v0, target.v0, ease); cam.tile = lerp(cam.tile, target.tile, ease); cam.ready = true;
  const T = cam.tile;
  c.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
  const sx = st.shake > 0 && !still ? (Math.random() - 0.5) * st.shake * 14 : 0, sy = st.shake > 0 && !still ? (Math.random() - 0.5) * st.shake * 10 : 0;
  st.shake = Math.max(0, st.shake - dt * 2.5);
  c.clearRect(0, 0, st.W, st.H);
  // backdrop
  const bg = c.createRadialGradient(st.W / 2, st.H * 0.42, 10, st.W / 2, st.H / 2, Math.max(st.W, st.H) * 0.75);
  bg.addColorStop(0, M.haunt ? '#17262a' : '#1f2a22'); bg.addColorStop(1, M.haunt ? '#05090b' : '#070b09'); c.fillStyle = bg; c.fillRect(0, 0, st.W, st.H);
  c.save(); c.translate(sx, sy);
  const lights = [];
  const hits = [];
  // corridors
  c.lineCap = 'butt';
  for (const r of M.rooms) { if (r.collapsed) continue; const [x, y] = pos(r.x, r.y); for (const n of game.neighbors(r.id)) { if (n.f !== r.f || r.id > n.id) continue; const [a, b] = pos(n.x, n.y); c.strokeStyle = '#2a2119'; c.lineWidth = T * 0.3; c.beginPath(); c.moveTo(x, y); c.lineTo(a, b); c.stroke(); c.strokeStyle = '#4a3a2a'; c.lineWidth = T * 0.2; c.beginPath(); c.moveTo(x, y); c.lineTo(a, b); c.stroke(); } }
  // rooms back-to-front
  const sorted = [...M.rooms].sort((a, b) => a.x + a.y - b.x - b.y);
  const occupants = {};
  for (const p of M.s.players) if (p.alive) (occupants[p.room] ??= []).push(p);
  for (const r of sorted) {
    const [x0, y0] = pos(r.x, r.y), rv = st.reveal[r.id], age = rv === undefined ? 9 : t - rv, k = still ? 1 : clamp(age / 0.5, 0, 1), drop = (1 - easeOut(k)) * -26;
    const x = x0, y = y0 + drop;
    c.globalAlpha = k;
    const pat = floorPattern(MATERIAL[r.name] || 'wood', r.collapsed), depth = T * 0.14, hw = pat.hw, hh = pat.hh;
    // slab sides
    path(c, [[x - hw, y], [x, y + hh], [x, y + hh + depth], [x - hw, y + depth]]); c.fillStyle = '#1b1612'; c.fill();
    path(c, [[x, y + hh], [x + hw, y], [x + hw, y + depth], [x, y + hh + depth]]); c.fillStyle = '#130f0c'; c.fill();
    c.drawImage(pat.cv, x - hw - 2, y - hh - 2, pat.cv.width / st.dpr, pat.cv.height / st.dpr);
    if (!r.collapsed) drawWalls(c, r, x, y, k);
    c.globalAlpha = k;
    if (PROP[r.name]) drawProp(c, PROP[r.name], x, y, r, t, lights);
    // front doorway notches (east / south)
    if (!r.collapsed) for (const d of r.doors) if (d === 1 || d === 2) { const [dx, dy] = DIRV[d]; const [a, b] = pos(r.x + dx * 0.44, r.y + dy * 0.44); c.fillStyle = M.neighbors.has(r.id) || r.id === M.p.room ? '#e1c27f' : '#8a7a58'; c.globalAlpha = k * 0.8; c.beginPath(); c.ellipse(a, b + drop, T * 0.07, T * 0.035, 0, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
    hits.push({ x, y, tw: hw, th: hh, room: r.id });
    if (!r.collapsed) lights.push({ x, y, r: T * 0.85, c: '210,205,190', a: 0.1 });
    if ((occupants[r.id] || []).length) lights.push({ x, y: y - T * 0.15, r: T * 1.45, c: '255,214,150', a: r.id === M.p.room ? 0.5 : 0.3 });
    if (r.id === M.p.room) lights.push({ x, y, r: T * 1.9, c: '255,220,160', a: 0.22 });
    if (r.name === '入口大厅' || r.name === '大楼梯') lights.push({ x, y, r: T * 1.1, c: '255,200,130', a: 0.12 });
  }
  // selection outlines under lighting
  const hover = st.mouse && !st.drag?.moved ? hitTest(hits.concat(candHits(M)), st.mouse.x, st.mouse.y) : null;
  // beacons light
  for (const b of M.beacons) { const r = M.rooms.find(q => q.id === b.room); const [x, y] = pos(r.x, r.y); lights.push({ x, y, r: T * 1.1, c: b.kind === 'seal' ? '190,150,255' : b.kind === 'safe' ? '255,225,140' : '220,240,220', a: 0.3 }); }
  if (M.ghost) { const r = M.rooms.find(q => q.id === M.ghost); if (r) { const [x, y] = pos(r.x, r.y); lights.push({ x: x + T * 0.3, y: y - T * 0.3, r: T * 1.2, c: '140,230,245', a: 0.35 }); } }
  // characters (tweened)
  const drawnPlayers = [];
  for (const [rid, ps] of Object.entries(occupants)) {
    const r = M.rooms.find(q => q.id === rid); if (!r) continue;
    ps.forEach((p, i) => {
      const a = st.anim[p.id] ??= { gx: r.x, gy: r.y, f: r.f };
      if (a.f !== r.f || still) { a.gx = r.x; a.gy = r.y; a.f = r.f; }
      const e = 1 - Math.pow(0.0005, dt); a.gx = lerp(a.gx, r.x, e); a.gy = lerp(a.gy, r.y, e);
      const [x, y] = pos(a.gx, a.gy), spread = Math.min(T * 0.22, 18), ox = (i - (ps.length - 1) / 2) * spread, oy = T * 0.06 + (i % 2) * 3;
      drawnPlayers.push({ p, x: x + ox, y: y + oy });
    });
  }
  drawnPlayers.sort((a, b) => a.y - b.y);
  const heads = {};
  for (const d of drawnPlayers) heads[d.p.id] = pawn(c, d.x, d.y, d.p.color, d.p.id + 1, d.p.id === M.s.active, t, { restrained: d.p.restrained, carrier: M.s.carrier === d.p.id });
  // enemies
  if (M.ghost) { const r = M.rooms.find(q => q.id === M.ghost); if (r) { const [x, y] = pos(r.x, r.y); const top = ghostSprite(c, x + T * 0.34, y, t); chip(c, x + T * 0.34, top - T * 0.2, '✧ 幽灵', '#a7edf2'); } }
  if (M.spider) { const r = M.rooms.find(q => q.id === M.spider.room); if (r) { const [x, y] = pos(r.x, r.y); const top = spiderSprite(c, x + T * 0.32, y + T * 0.08, t, M.spider.stunned); chip(c, x + T * 0.32, top - 6, M.spider.stunned ? '◆ 已击退' : '◆ 蜘蛛', '#ffb39b'); lights.push({ x: x + T * 0.3, y, r: T * 0.8, c: '255,80,60', a: M.spider.stunned ? 0 : 0.18 }); } }
  // lighting pass
  const L = st.light; const lc = L.getContext('2d'); lc.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
  lc.globalCompositeOperation = 'source-over'; lc.clearRect(0, 0, st.W, st.H);
  lc.fillStyle = M.haunt ? 'rgba(2,7,12,.6)' : 'rgba(4,7,6,.5)'; lc.fillRect(0, 0, st.W, st.H);
  lc.globalCompositeOperation = 'destination-out';
  for (const l of lights) { const flick = still ? 1 : 0.93 + 0.07 * Math.sin(t * 7 + l.x); const g = lc.createRadialGradient(l.x + sx, l.y + sy, 0, l.x + sx, l.y + sy, l.r * flick); g.addColorStop(0, `rgba(0,0,0,${Math.min(1, l.a * 2.2)})`); g.addColorStop(1, 'rgba(0,0,0,0)'); lc.fillStyle = g; lc.beginPath(); lc.arc(l.x + sx, l.y + sy, l.r * flick, 0, TAU); lc.fill(); }
  c.restore();
  c.drawImage(L, 0, 0, st.W, st.H);
  c.save(); c.translate(sx, sy);
  c.globalCompositeOperation = 'lighter';
  for (const l of lights) { const g = c.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r * 0.8); g.addColorStop(0, `rgba(${l.c},${l.a * 0.35})`); g.addColorStop(1, `rgba(${l.c},0)`); c.fillStyle = g; c.beginPath(); c.arc(l.x, l.y, l.r * 0.8, 0, TAU); c.fill(); }
  // beacon pillars
  for (const b of M.beacons) {
    const r = M.rooms.find(q => q.id === b.room); const [x, y] = pos(r.x, r.y), pulse = still ? 1 : 0.75 + 0.25 * Math.sin(t * 2 + hash(b.room) * 6);
    const g = c.createLinearGradient(0, y, 0, y - T * 1.3); const col = b.kind === 'seal' ? '190,150,255' : b.kind === 'safe' ? '255,215,120' : '200,240,225';
    g.addColorStop(0, `rgba(${col},${0.35 * pulse})`); g.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g; c.fillRect(x - T * 0.09, y - T * 1.3, T * 0.18, T * 1.3);
    if (b.kind === 'safe') { c.strokeStyle = `rgba(255,220,130,${0.5 * pulse})`; c.lineWidth = 2; path(c, diamondPts(x, y, 0.62)); c.stroke(); }
  }
  c.globalCompositeOperation = 'source-over';
  // fog & dust
  if (!still) drawAtmosphere(c, M, t, dt);
  // outlines, labels, chips (drawn above lighting so they stay readable)
  for (const r of sorted) {
    const [x, y] = pos(r.x, r.y), active = r.id === M.p.room, adj = M.neighbors.has(r.id);
    if (active) { c.lineWidth = 2; c.strokeStyle = 'rgba(232,212,154,.95)'; path(c, diamondPts(x, y, 1.0)); c.stroke(); }
    else if (adj && !M.locked) { c.lineWidth = 1.2; c.setLineDash([5, 4]); c.strokeStyle = 'rgba(219,191,129,.55)'; path(c, diamondPts(x, y, 0.98)); c.stroke(); c.setLineDash([]); }
    if (hover?.room === r.id && !active) { c.lineWidth = 2.5; c.strokeStyle = adj && !M.locked ? '#ffe7a8' : 'rgba(200,210,200,.6)'; path(c, diamondPts(x, y, 1.02)); c.stroke(); }
    if (M.focus === r.id) { c.lineWidth = 3; c.strokeStyle = '#a7e9e1'; path(c, diamondPts(x, y, 1.04)); c.stroke(); chip(c, x, y - T * 0.62, '查看位置', '#a7e9e1'); }
    const fs = clamp(T * 0.15, 11, 15); c.font = `600 ${fs}px system-ui,"Microsoft YaHei",sans-serif`; c.textAlign = 'center';
    const label = r.collapsed ? '× ' + r.name : r.name, w = c.measureText(label).width + 12, ly = y + T * 0.3;
    c.fillStyle = 'rgba(8,11,10,.62)'; roundRect(c, x - w / 2, ly - fs, w, fs + 6, 3); c.fill();
    c.fillStyle = r.collapsed ? '#c09080' : active ? '#fff3cf' : '#dfe3d2'; c.fillText(label, x, ly);
    if (r.loot?.length) { c.fillStyle = '#e9c65a'; c.beginPath(); c.arc(x + w / 2 + 6, ly - fs / 2 + 2, 3.5, 0, TAU); c.fill(); }
  }
  // beacon chips stacked above rooms
  const stack = {};
  for (const b of M.beacons) { const r = M.rooms.find(q => q.id === b.room); const [x, y] = pos(r.x, r.y), n = stack[b.room] = (stack[b.room] || 0) + 1, bob = still ? 0 : Math.sin(t * 2 + n) * 2; chip(c, x, y - T * 0.72 - (n - 1) * 23 + bob, b.label, b.color); }
  // unexplored doors
  for (const h of candHits(M)) {
    const on = hover && hover.d === h.d, pulse = still ? 1 : 0.6 + 0.4 * Math.sin(t * 3 + h.d);
    c.setLineDash([5, 6]); c.lineWidth = on ? 2 : 1.3; c.strokeStyle = on ? '#ffe7a8' : `rgba(190,205,160,${0.55 + 0.35 * pulse})`; path(c, diamondPts(h.x, h.y, 0.72)); c.fillStyle = `rgba(30,48,38,${on ? 0.55 : 0.3})`; c.fill(); c.stroke(); c.setLineDash([]);
    c.fillStyle = on ? '#fff3cf' : '#c6d1ac'; c.textAlign = 'center'; c.font = `${Math.round(clamp(T * 0.3, 16, 26))}px Georgia,serif`; c.fillText('?', h.x, h.y + 4); c.font = '12px system-ui'; c.fillText('探索', h.x, h.y + clamp(T * 0.22, 14, 22));
  }
  // guide target
  if (M.guide) { const h = M.guide.room ? hits.find(a => a.room === M.guide.room) : candHits(M).find(a => a.d === M.guide.d); if (h) { const pulse = still ? 1 : 0.7 + 0.3 * Math.sin(t * 5); c.lineWidth = 3.5; c.strokeStyle = `rgba(255,227,149,${pulse})`; path(c, diamondPts(h.x, h.y, 0.96)); c.stroke(); chip(c, h.x, h.y - h.th - 16, '下一步 · 点击移动', '#ffe395'); } }
  // objectives on other floors
  const away = Object.entries(M.elsewhere).sort((a, b) => a[0] - b[0]).map(([f, n]) => ['地下', '一层', '二层'][Number(f) + 1] + ' ×' + n);
  if (away.length) chip(c, st.W / 2 + st.offX, st.H - 58, '其他楼层还有目标 · ' + away.join(' · ') + '（按 1 / 2 / 3 切换楼层）', '#c9b6ff');
  // floating feedback
  st.floats = st.floats.filter(f => t - f.t0 < 1.9);
  for (const f of st.floats) { if (f.f !== floor) continue; const a = st.anim[f.pid]; if (!a) continue; const [x, y] = pos(a.gx, a.gy), age = t - f.t0; c.globalAlpha = clamp(1.6 - age, 0, 1); c.font = 'bold 14px system-ui'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.8)'; const yy = y - T * 0.45 - age * 26 - f.row * 17; c.strokeText(f.text, x, yy); c.fillStyle = f.color; c.fillText(f.text, x, yy); c.globalAlpha = 1; }
  c.restore();
  // vignette & urgency
  const vg = c.createRadialGradient(st.W / 2, st.H / 2, Math.min(st.W, st.H) * 0.35, st.W / 2, st.H / 2, Math.max(st.W, st.H) * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, M.urgent ? `rgba(90,10,10,${0.45 + (still ? 0 : 0.2 * Math.sin(t * 3))})` : 'rgba(0,0,0,.55)'); c.fillStyle = vg; c.fillRect(0, 0, st.W, st.H);
  // lightning / flash
  if (M.haunt && !still && !M.s.result) { if (!st.nextBolt) st.nextBolt = t + 8 + Math.random() * 14; if (t > st.nextBolt) { st.lightning = 1; st.nextBolt = t + 12 + Math.random() * 20; } }
  if (st.lightning > 0) { c.fillStyle = `rgba(200,225,255,${st.lightning * 0.22})`; c.fillRect(0, 0, st.W, st.H); st.lightning = Math.max(0, st.lightning - dt * (st.lightning > 0.6 ? 6 : 2.5)); }
  if (st.flash > 0) { c.fillStyle = st.flashColor; c.globalAlpha = st.flash; c.fillRect(0, 0, st.W, st.H); c.globalAlpha = 1; st.flash = Math.max(0, st.flash - dt * 1.8); }
  // tooltip
  if (hover && st.mouse) tooltip(c, hover, M);
  hitAreas = hits.concat(candHits(M)).reverse();
  st.canvas.style.cursor = st.drag?.moved ? 'grabbing' : hover && isClickable(hover, M) ? 'pointer' : 'grab';
  if (!still || st.shake > 0 || st.flash > 0 || st.lightning > 0 || !camSettled()) schedule();
}
function camSettled() { const c = st.cam, t = st.target; return Math.abs(c.u0 - t.u0) < 0.002 && Math.abs(c.v0 - t.v0) < 0.002 && Math.abs(c.tile - t.tile) < 0.1; }
function easeOut(k) { return 1 - Math.pow(1 - k, 3); }
function candHits(M) { return M.candidates.map(r => { const [x, y] = pos(r.x, r.y); return { x, y, tw: st.cam.tile * S * 0.75, th: st.cam.tile * 0.52 * S * 0.75, d: r.d }; }); }
function hitTest(list, x, y) { return list.find(a => a.d !== undefined && Math.abs(x - a.x) / a.tw + Math.abs(y - a.y) / a.th < 1) || list.find(a => Math.abs(x - a.x) / a.tw + Math.abs(y - a.y) / a.th < 1); }
function isClickable(h, M) { if (M.locked) return false; if (h.d !== undefined) return true; return h.room !== M.p.room && M.neighbors.has(h.room); }
function tooltip(c, h, M) {
  const lines = [];
  if (h.d !== undefined) { lines.push(['未知的门后', '#fff3cf']); lines.push([M.locked ? '现在不能行动' : M.moves < M.cost ? `移动力不足（需要 ${M.cost}）` : `探索新房间 · 消耗 ${M.cost} 移动力`, '#c6d1ac']); }
  else {
    const r = M.rooms.find(q => q.id === h.room); lines.push([r.collapsed ? r.name + '（已崩塌）' : r.name, '#fff3cf']);
    if (h.room === M.p.room) lines.push([`${M.p.name}在这里`, '#c6d1ac']);
    else if (M.neighbors.has(h.room)) lines.push([M.locked ? '相邻，但现在不能行动' : M.moves < M.cost ? `移动力不足（需要 ${M.cost}）` : `点击移动 · 消耗 ${M.cost} 移动力`, '#c6d1ac']);
    else lines.push(['不相邻或门不相通', '#9aa596']);
    const here = M.s.players.filter(p => p.alive && p.room === h.room).map(p => p.name); if (here.length) lines.push(['在场：' + here.join('、'), '#b8c4b4']);
    if (r.loot?.length) lines.push([`地面有 ${r.loot.length} 件物品`, '#e9c65a']);
  }
  c.font = '13px system-ui,"Microsoft YaHei",sans-serif';
  const w = Math.max(...lines.map(l => c.measureText(l[0]).width)) + 20, hgt = lines.length * 19 + 12;
  let x = st.mouse.x + 16, y = st.mouse.y + 18; if (x + w > st.W - 6) x = st.mouse.x - w - 10; if (y + hgt > st.H - 6) y = st.mouse.y - hgt - 10;
  c.fillStyle = 'rgba(14,20,17,.94)'; roundRect(c, x, y, w, hgt, 5); c.fill(); c.strokeStyle = 'rgba(215,187,124,.55)'; c.lineWidth = 1; c.stroke();
  c.textAlign = 'left'; lines.forEach(([s, col], i) => { c.fillStyle = col; c.font = (i ? '' : '600 ') + '13px system-ui,"Microsoft YaHei",sans-serif'; c.fillText(s, x + 10, y + 21 + i * 19); });
}
function drawAtmosphere(c, M, t, dt) {
  if (!st.dust.length) for (let i = 0; i < 46; i++) st.dust.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 1.6, v: 0.004 + Math.random() * 0.012, p: Math.random() * TAU });
  const col = M.haunt ? '170,230,240' : '240,225,190';
  for (const d of st.dust) { d.y -= d.v * dt; d.x += Math.sin(t * 0.3 + d.p) * 0.0006; if (d.y < -0.02) { d.y = 1.02; d.x = Math.random(); } c.fillStyle = `rgba(${col},${0.12 + 0.12 * Math.sin(t * 1.5 + d.p)})`; c.beginPath(); c.arc(d.x * st.W, d.y * st.H, d.s, 0, TAU); c.fill(); }
  const n = M.floor === -1 ? 4 : 2;
  for (let i = 0; i < n; i++) { const x = ((t * 0.012 * (i + 1) + i * 0.37) % 1.4 - 0.2) * st.W, y = st.H * (0.3 + 0.35 * i / n), r = Math.max(st.W, st.H) * 0.35; const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, M.haunt ? 'rgba(120,150,170,.07)' : 'rgba(170,175,160,.05)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
}

// ---------- camera targeting ----------
function computeTarget(M) {
  const coords = [...M.rooms, ...M.candidates]; if (!coords.length) return { u0: 0, v0: 0, tile: 80 };
  const us = coords.map(r => r.x - r.y), vs = coords.map(r => r.x + r.y);
  const fitTile = Math.min(128, (st.W - 120 - st.offX * 2) / (Math.max(...us) - Math.min(...us) + 2), (st.H - 150) / ((Math.max(...vs) - Math.min(...vs) + 2) * 0.52));
  const minTile = st.W < 700 ? 52 : 70;
  let tile = Math.max(fitTile, minTile), u0 = (Math.max(...us) + Math.min(...us)) / 2, v0 = (Math.max(...vs) + Math.min(...vs)) / 2;
  if (fitTile < minTile) {  // map larger than screen: follow the active character (or focused room)
    const f = M.rooms.find(r => r.id === M.focus) || (M.here.f === M.floor ? M.here : null);
    if (f) { u0 = clamp(f.x - f.y, Math.min(...us) + 1, Math.max(...us) - 1); v0 = clamp(f.x + f.y, Math.min(...vs) + 1, Math.max(...vs) - 1); }
  }
  return { u0, v0, tile: clamp(tile * st.view.zoom, 34, 190) };
}

// ---------- change detection for floats / reveals ----------
function diff(M) {
  const cur = { id: M.id, rooms: new Set(M.s.rooms.map(r => r.id)), players: M.s.players.map(p => ({ idx: [...p.idx], alive: p.alive, items: p.items.map(i => i.name) })) };
  const prev = st.prev; st.prev = cur;
  if (!prev || prev.id !== cur.id) { for (const r of M.s.rooms) st.reveal[r.id] = -9; return; }
  for (const r of M.s.rooms) if (!prev.rooms.has(r.id)) st.reveal[r.id] = st.t;
  const T = ['力量', '速度', '知识', '理智'];
  M.s.players.forEach((p, i) => {
    const q = prev.players[i]; if (!q) return; let row = 0;
    const push = (text, color) => st.floats.push({ pid: p.id, f: M.s.rooms.find(r => r.id === p.room)?.f, text, color, t0: st.t + row * 0.12, row: row++ });
    if (q.alive && !p.alive) { push('倒下', '#ff8f7a'); return; }
    p.idx.forEach((v, t) => { const d = v - q.idx[t]; if (d) push(`${d > 0 ? '+' : ''}${d} ${T[t]}`, d > 0 ? '#9fe8a8' : '#ff9d86'); });
    p.items.map(i => i.name).filter(n => !q.items.includes(n)).slice(0, 2).forEach(n => push('+ ' + n, '#f3d68c'));
    if (row && d0(q.idx, p.idx) < 0) st.shake = Math.max(st.shake, 0.35 * (root.HouseSettings?.get('shake') === false ? 0 : 1));
  });
}
function d0(a, b) { return b.reduce((n, v, i) => n + v - a[i], 0); }

// ---------- binding ----------
function bind(canvas) {
  st.canvas = canvas; st.ctx = canvas.getContext('2d');
  const box = canvas.parentElement.getBoundingClientRect();
  st.dpr = Math.min(2, root.devicePixelRatio || 1); st.W = Math.max(50, box.width); st.H = Math.max(50, box.height);
  canvas.width = Math.round(st.W * st.dpr); canvas.height = Math.round(st.H * st.dpr); canvas.style.width = st.W + 'px'; canvas.style.height = st.H + 'px';
  st.light ??= document.createElement('canvas'); st.light.width = canvas.width; st.light.height = canvas.height;
  const pt = e => { const b = canvas.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  canvas.onpointerdown = e => { st.drag = { ...pt(e), px: st.view.panX, py: st.view.panY, moved: false }; canvas.setPointerCapture?.(e.pointerId); };
  canvas.onpointermove = e => { st.mouse = pt(e); if (st.drag) { const dx = st.mouse.x - st.drag.x, dy = st.mouse.y - st.drag.y; if (Math.hypot(dx, dy) > 6) st.drag.moved = true; if (st.drag.moved) { st.view.panX = st.drag.px + dx; st.view.panY = st.drag.py + dy; } } schedule(); };
  canvas.onpointerleave = () => { st.mouse = null; schedule(); };
  canvas.onpointerup = e => { const d = st.drag; st.drag = null; if (d && !d.moved) click(pt(e)); schedule(); };
  canvas.onwheel = e => { e.preventDefault(); st.view.zoom = clamp(st.view.zoom * Math.exp(-e.deltaY * 0.0012), 0.55, 1.9); retarget(); };
  canvas.ondblclick = () => resetView();
  canvas.onclick = null;
  if (root.ResizeObserver && !st.resizeObs) st.resizeObs = new ResizeObserver(() => { if (st.canvas?.isConnected && G()) HouseBoard.draw(true); });
  if (st.resizeObs) { st.resizeObs.disconnect(); st.resizeObs.observe(canvas.parentElement); }
}
function click(p) {
  if (!G() || (typeof modal !== 'undefined' && modal.open)) return;
  const h = hitTest(hitAreas, p.x, p.y); if (!h) return;
  if (h.d !== undefined) { act('move:' + h.d); return; }
  if (h.room === game.p.room) return;
  if (!game.neighbors(game.p.room).some(r => r.id === h.room)) { const el = document.querySelector('#maphint'); if (el) el.textContent = '只能移动到相邻且门相通的房间。'; return; }
  act('room:' + h.room);
}
function retarget() { if (st.scene) st.target = computeTarget(st.scene); schedule(); }
function schedule() { if (!st.raf && root.requestAnimationFrame) st.raf = requestAnimationFrame(frame); }
function resetView() { st.view = { zoom: 1, panX: 0, panY: 0 }; retarget(); }

const HouseBoard = {
  draw(resizeOnly = false) {
    const canvas = document.querySelector('#board'); if (!canvas || !G()) return false;
    if (canvas !== st.canvas || resizeOnly) bind(canvas);
    if (!st.canvas.getContext) return false;
    const M = model();
    const hl = document.querySelector('.hud-left'); st.offX = hl && hl.children.length && st.W > 820 ? Math.min(hl.offsetWidth + 14, st.W * 0.45) / 2 : 0; st.offY = document.querySelector('.hud-top') ? 22 : 0;
    if (st.cam.floor !== M.floor || st.cam.gameId !== M.id) { st.cam.ready = false; st.cam.floor = M.floor; if (st.cam.gameId !== M.id) { st.view = { zoom: 1, panX: 0, panY: 0 }; st.anim = {}; } st.cam.gameId = M.id; }
    diff(M);
    st.scene = M; st.target = computeTarget(M);
    if (!st.cam.ready) Object.assign(st.cam, st.target);
    if (st.raf) cancelAnimationFrame(st.raf); st.raf = 0; st.last = performance.now();
    frame(st.last);
    return true;
  },
  shake(k = 0.6) { if (root.HouseSettings?.get('shake') === false) return; st.shake = Math.max(st.shake, k); schedule(); },
  flash(color = '#fff', k = 0.6) { if (reduced()) return; st.flashColor = color; st.flash = k; schedule(); },
  resetView,
  _state: st,
};
root.HouseBoard = HouseBoard;
})(typeof window !== 'undefined' ? window : globalThis);
