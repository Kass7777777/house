// S1-DES-02 调参提案用的「仅模拟」预加载脚本（不改 dist/，不进游戏）。
// 用来在程序实现前，预演三类还没有配置键的改动：叛徒选取规则、按英雄数缩放的参数、AI 修正。
// 用法（在 house/ 下，放在 awareness.js 之后、balance-sim.cjs 之前）：
//   NODE --require ./dist/tactics.js --require ./dist/equipment.js --require ./dist/seals.js --require ./dist/awareness.js \
//        --require ./design/gdd/balance/sim/s1-proposal-preload.cjs tools/balance-sim.cjs --out=... [--cf=protect-freed] [--set=...]
// 环境变量：
//   TRAITOR=roll|random|revealer   叛徒选取（缺省 = 现规则：理智最低）。roll = 每名存活者掷理智骰（含护符），总和最低者；平局比当前理智，再比座位。
//   SCALE='ritual.goal=0+1.5h;ritual.rounds=7-1h'   作祟时按人数写入配置：值 = round(基数 + 系数 × x)，x 为 n（人数）或 h（英雄数 = 人数 − 1），下限 1。
//   AIFIX=noselfharm               英雄 AI 在安葬 / 崩塌阶段，只有攻击骰 ≥ 对方力量时才主动攻击叛徒。
'use strict';
const path = require('node:path');
const D = f => path.resolve(process.cwd(), 'dist', f);
const { Game } = require(D('engine.js')); const S = require(D('scenarios.js')); const P = Game.prototype;
const spec = (process.env.SCALE || '').split(';').filter(Boolean).map(x => { const m = x.match(/^(\w+)\.(\w+)=(-?[\d.]+)([+-][\d.]+)([nh])$/); if (!m) throw Error('bad SCALE ' + x); return { sc: m[1], key: m[2], base: +m[3], per: +m[4], v: m[5] }; });
if (spec.length) { const start = P.startHaunt; P.startHaunt = function () { if (this.s.phase === 'explore') { const n = this.s.players.length; for (const t of spec) S.configs[t.sc][t.key] = Math.max(1, Math.round(t.base + t.per * (t.v === 'n' ? n : n - 1))); } return start.apply(this, arguments); }; }
const mode = process.env.TRAITOR || '';
if (mode) { const start = P.startHaunt; P.startHaunt = function () {
  const s = this.s; if (s.phase !== 'explore') return start.apply(this, arguments);
  const alive = s.players.filter(p => p.alive); let pick;
  if (mode === 'revealer') pick = this.p;
  else if (mode === 'random') pick = alive[Math.floor(this.rng() * alive.length)];
  else if (mode === 'roll') { const r = alive.map(p => { const k = Math.min(8, this.val(p, 3, true)); let t = 0; for (let i = 0; i < k; i++) t += Math.floor(this.rng() * 3); return { p, t }; }); r.sort((a, b) => a.t - b.t || this.val(a.p, 3) - this.val(b.p, 3) || a.p.id - b.p.id); pick = r[0].p; }
  else throw Error('bad TRAITOR ' + mode);
  const own = Object.prototype.hasOwnProperty.call(this, 'val'), orig = this.val;
  this.val = function (p, t, roll) { if (t === 3 && !roll) return p.id === pick.id ? -99 : 99; return P.val.call(this, p, t, roll); }; // 只影响 startHaunt 里的「理智最低」比较
  try { return start.apply(this, arguments); } finally { if (own) this.val = orig; else delete this.val; }
}; }
if ((process.env.AIFIX || '').split(',').includes('noselfharm')) { const att = P.attack; P.attack = function (t) { const s = this.s, p = this.p;
  if (this.isAI() && p.team === 'hero' && ['burial', 'collapse'].includes(s.phase) && t !== 'ghost' && t !== 'spider') { const q = s.players.find(x => x.id === Number(t)); if (q && this.val(p, 0) + (p.items.some(i => i.type === 'weapon') ? 2 : 0) < this.val(q, 0)) return false; }
  return att.call(this, t); }; }
