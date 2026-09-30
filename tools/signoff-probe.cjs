#!/usr/bin/env node
// S1-QA-02 independent probe. It does NOT use balance-sim.cjs instrumentation: plain Game + invoke('aiStep'),
// reads outcomes straight from game state (s.hauntRules / s.traitorRoll / s.ritualGoals / s.rescue / s.seals / s.ghost).
// Purpose: (1) cross-check the simulator's winners per seed, (2) edge-case data for the sign-off.
// Usage: node --require ./dist/tactics.js --require ./dist/equipment.js --require ./dist/seals.js --require ./dist/awareness.js \
//        tools/signoff-probe.cjs [--prefix=QA2] [--n=100] [--roster=default|random] [--out=production/qa/data/signoff/probe-*.json]
'use strict';
const path = require('node:path'), fs = require('node:fs'), ROOT = path.resolve(__dirname, '..');
for (const m of ['tactics', 'equipment', 'seals', 'awareness']) require(path.join(ROOT, 'dist', m + '.js'));
const { Game } = require(path.join(ROOT, 'dist', 'engine.js'));
const Playlog = require(path.join(ROOT, 'dist', 'playlog.js'));
const kv = a => { const i = a.indexOf('='); return i < 0 ? [a, true] : [a.slice(0, i), a.slice(i + 1)]; };
const args = Object.fromEntries(process.argv.slice(2).map(a => kv(a.replace(/^--/, ''))));
const PREFIX = String(args.prefix || 'QA2'), N = Number(args.n || 100), ROSTER = String(args.roster || 'default');
const OUT = path.resolve(ROOT, String(args.out || `production/qa/data/signoff/probe-${ROSTER}-${PREFIX}-n${N}.json`));
// identical to balance-sim.cjs rosterFor, so seeds line up game-for-game
function rosterFor(seed, count) { if (ROSTER !== 'random') return undefined; let h = 2166136261; for (const c of 'roster|' + seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619); const a = [0, 1, 2, 3, 4, 5]; for (let i = 5; i > 0; i--) { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; const j = h % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, count); }
const games = [];
for (const scenario of ['ritual', 'rescue', 'seals']) for (const count of [3, 4, 5, 6]) for (const entry of ['quick', 'normal']) for (let i = 0; i < N; i++) {
  const seed = `${PREFIX}-c${count}-${entry}-${i}`;
  const g = new Game({ scenario, scenarioMode: 'fixed', quick: entry === 'quick', count, humanCount: 1, seed, roster: rosterFor(seed, count) });
  g.s.players.forEach(p => p.controller = 'ai');
  let steps = 0, hauntRules = null, goals = null, troll = null, summon = null, hauntAt = null, cd0 = null;
  while (!g.s.result && steps < 6000) {
    g.s.report = null; g.invoke('aiStep'); steps++;
    const s = g.s;
    if (hauntAt === null && s.phase !== 'explore') { hauntAt = s.round; cd0 = s.countdown; hauntRules = s.hauntRules ? JSON.parse(JSON.stringify(s.hauntRules)) : null; goals = s.ritualGoals ? { ...s.ritualGoals } : null; troll = s.traitorRoll ? { tied: s.traitorRoll.tied, rows: s.traitorRoll.rows.map(r => ({ ...r })), traitor: s.traitorRoll.traitor } : null; }
    if (!summon && s.controller) summon = { team: s.controller, round: s.round, countdown: s.countdown };
  }
  const s = g.s, r = s.result, row = r ? Playlog.row(g, 0) : null;
  const o = { scenario, count, entry, seed, winner: r?.team ?? 'none', reason: r?.reason ?? 'stall', endRound: r?.round ?? s.round, hauntAt, steps,
    rowHaunt: row?.hauntRound, deaths: s.players.filter(p => !p.alive).length, survivors: s.players.filter(p => p.alive).length,
    traitor: s.traitor ?? null, traitorName: s.players[s.traitor]?.name ?? null, roster: s.players.map(p => p.name), hauntRules, goals, troll, cd0 };
  if (troll) { const min = Math.min(...troll.rows.map(x => x.sanity)); o.traitorWasLowestSanity = troll.rows.find(x => x.id === troll.traitor).sanity === min; o.minTotal = Math.min(...troll.rows.map(x => x.total)); o.tieDepth = troll.rows.filter(x => x.total === o.minTotal).length; }
  if (scenario === 'ritual') o.rit = { summon, heroProgress: s.heroProgress, traitorProgress: s.traitorProgress, ghostHits: s.ghost?.hits ?? null, countdownEnd: s.countdown, carrier: s.carrier };
  if (scenario === 'rescue' && s.rescue) { const x = s.rescue; o.res = { remaining: x.remaining, web: x.web, webGoal: x.webGoal, eggs: x.eggs, door: x.door, victimAlive: s.players[x.victim].alive }; }
  if (scenario === 'seals' && s.seals) { const h = s.seals; o.sea = { nodes: h.nodes.length, done: h.nodes.filter(n => n.progress >= n.goal).length, progress: h.nodes.reduce((a, n) => a + n.progress, 0), goalSum: h.nodes.reduce((a, n) => a + n.goal, 0), remaining: h.remaining }; }
  games.push(o);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify({ meta: { prefix: PREFIX, n: N, roster: ROSTER }, games }, null, 1));
console.log(`probe ${games.length} games → ${path.relative(ROOT, OUT)} · stalls ${games.filter(g => g.winner === 'none').length}`);
