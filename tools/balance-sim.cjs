#!/usr/bin/env node
// S1 balance simulator — in-process, deterministic, all seats AI, browser-faithful (drives g.invoke('aiStep') like app.js).
// Read-only with respect to rules: instrumentation wraps prototype methods but never consumes RNG or alters outcomes
// (except explicit --set lever overrides, which are for sensitivity probes only and are recorded in the output).
//
// Usage (from repo root; the --require order matters):
//   node --require ./dist/tactics.js --require ./dist/equipment.js --require ./dist/seals.js --require ./dist/awareness.js \
//        tools/balance-sim.cjs [--scenarios=ritual,rescue,seals] [--counts=3,4,5,6] [--entry=quick,normal] [--n=50]
//        [--prefix=S1] [--out=production/qa/data/S1-balance.json] [--max-steps=6000] [--direct] [--quiet]
//        [--set=rescue.spiderDice=4] [--set=seals.time=-3] [--set=seals.goal=3] [--set=seals.erosion=2] [--set=ritual.goal=4]
//        --set=<scenario>.<key>=<number> writes any numeric field of HouseScenarios.configs[scenario] (S1-ENG-01 moved every
//        rule number there, e.g. ritual.dispelGoal, ritual.corpseThreshold, rescue.webGoalPerPlayer, seals.repairThreshold,
//        seals.nodeGoal, seals.timeBase, seals.erosion). Legacy aliases kept: seals.time=Δ adds Δ to seals.timeBase; seals.goal → seals.nodeGoal.
// Seeds: `${prefix}-c${count}-${entry}-${i}` — identical across scenarios, so normal-entry exploration (and haunt round) is paired.
'use strict';
const path = require('node:path'), fs = require('node:fs');
const ROOT = path.resolve(__dirname, '..');
for (const m of ['tactics', 'equipment', 'seals', 'awareness']) require(path.join(ROOT, 'dist', m + '.js')); // idempotent if already --require'd
const { Game } = require(path.join(ROOT, 'dist', 'engine.js'));
const Scen = require(path.join(ROOT, 'dist', 'scenarios.js'));
const Playlog = require(path.join(ROOT, 'dist', 'playlog.js'));
const P = Game.prototype;

// ---------- args ----------
const kv = a => { const i = a.indexOf('='); return i < 0 ? [a, true] : [a.slice(0, i), a.slice(i + 1)]; };
const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--') && !a.startsWith('--set=')).map(a => kv(a.slice(2))));
const sets = process.argv.slice(2).filter(a => a.startsWith('--set=')).map(a => { const [k, v] = kv(a.slice(6)); return [k, v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : Number.isFinite(Number(v)) ? Number(v) : String(v)]; });
const SCEN = String(args.scenarios || 'ritual,rescue,seals').split(',');
const COUNTS = String(args.counts || '3,4,5,6').split(',').map(Number);
const ENTRIES = String(args.entry || 'quick,normal').split(',');
const N = Number(args.n || 50), PREFIX = String(args.prefix || 'S1'), MAX = Number(args['max-steps'] || 6000);
const OUT = path.resolve(ROOT, String(args.out || 'production/qa/data/S1-balance.json'));
const DIRECT = !!args.direct, QUIET = !!args.quiet;

// ---------- lever overrides (sensitivity probes only) ----------
// All levers are scenario config fields now (dist/ reads them live); no prototype patching needed.
for (const [k, v] of sets) {
  const [sc, key] = k.split('.'), cfg = Scen.configs[sc];
  if (sc === 'seals' && key === 'time') { cfg.timeBase += v; continue; } // legacy alias: delta on the base
  const real = sc === 'seals' && key === 'goal' ? 'nodeGoal' : key;          // legacy alias
  // numeric keys take numbers; string keys (S1-ENG-02: ritual/rescue.traitorRule, rescue.protectUntil) take strings; traitorGoal may be null
  if (cfg && real in cfg && (typeof cfg[real] === typeof v || cfg[real] === null || v === null)) cfg[real] = v; else throw Error('unknown lever or wrong type ' + k);
}

// ---------- sim-only counterfactuals (NOT a fix; dist/ is untouched) ----------
// --fix-chute: (obsolete since S1-ENG-01 fixed dist/; kept for reproducing the S1 estimate) model 煤槽 as a one-way slide in path-finding (neighbors(煤槽) = [地下平台]; 煤槽 is never a path goal),
//              so objectives are never placed in it and AI never routes through it. Estimates post-fix balance only.
// --roster=random: seeded random cast per game (browser default is [0..count-1], which fixes traitor identity per count).
const FIX_CHUTE = !!args['fix-chute'], ROSTER = String(args.roster || 'default');
if (FIX_CHUTE) {
  const nb = P.neighbors; P.neighbors = function (id) { const r = this.s.rooms.find(x => x.id === id); if (r?.name === '煤槽') return this.s.rooms.filter(x => x.id === '-1:0:0' && !x.collapsed); return nb.call(this, id); };
  const pa = P.path; P.path = function (a, b) { if (a !== b && this.s.rooms.find(x => x.id === b)?.name === '煤槽') return []; return pa.call(this, a, b); };
}
// --cf=web-first      : hero AI will not process eggs until the web is fully broken (AI-ordering counterfactual).
// --cf=protect-freed  : victim stays untargetable until BOTH eggs done AND web broken (rule counterfactual).
const CF = String(args.cf || '').split(',').filter(Boolean);
if (CF.includes('web-first')) { const f = Scen.Rescue.actions; Scen.Rescue.actions = function (g) { const a = f.call(this, g), r = g.s.rescue; if (g.isAI() && r.web < r.webGoal) { const e = a.find(x => x.id === 'eggs'); if (e && e.available) { e.available = false; e.reason = 'sim:web-first'; } } return a; }; }
if (CF.includes('protect-freed')) { Scen.Rescue.enemyAllowed = function (g, t) { const r = g.s.rescue; return t.id !== r.victim || (r.eggs && r.web >= r.webGoal); };
  // equipment.js P.attack now calls Rescue.enemyAllowed (S1-ENG-01); this extra gate is redundant but harmless
  const f = P.attack; P.attack = function (t) { const s = this.s; if (s.phase === 'rescue' && this.p.team === 'traitor' && Number(t) === s.rescue.victim && !Scen.Rescue.enemyAllowed(this, s.players[s.rescue.victim])) return false; return f.call(this, t); }; }
function rosterFor(seed, count) { if (ROSTER !== 'random') return undefined; let h = 2166136261; for (const c of 'roster|' + seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619); const a = [0, 1, 2, 3, 4, 5]; for (let i = 5; i > 0; i--) { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; const j = h % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, count); }

// ---------- instrumentation (no RNG) ----------
let REC = null; const ctx = [];
const wrap = (obj, name, label) => { const f = obj[name]; obj[name] = function (...a) { ctx.push(typeof label === 'function' ? label.apply(this, a) : label); try { return f.apply(this, a); } finally { ctx.pop(); } }; };
wrap(P, 'attack', function (t) { return t === 'ghost' ? 'hero→ghost' : t === 'spider' ? 'hero→spider' : this.p.team + '→player'; });
wrap(P, 'ghostTurn', 'ghost'); wrap(P, 'resolveEvent', 'event'); wrap(P, 'draw', 'draw'); wrap(P, 'roundEnd', 'roundEnd');
wrap(Scen.Rescue, 'round', 'spider'); wrap(Scen.Rescue, 'attackSpider', 'hero→spider');
{ const f = P.damage; P.damage = function (p, n, type) {
    const src = ctx.at(-1) || 'other';
    if (REC && this.s.phase !== 'explore') { const k = `${src}>${p.team}`; REC.dmg[k] = (REC.dmg[k] || 0) + n; }
    else if (REC) REC.dmgExplore += n;
    return f.call(this, p, n, type); }; }
{ const f = P.change; P.change = function (p, t, n) { const was = p.alive; const r = f.call(this, p, t, n); if (REC && was && !p.alive) REC.deaths.push({ id: p.id, team: p.team, round: this.s.round, phase: this.s.phase, src: ctx.at(-1) || 'other', victim: this.s.rescue?.victim === p.id, restrained: !!p.restrained, room: this.s.rooms.find(x => x.id === p.room)?.name }); return r; }; }
{ const f = P.summon; P.summon = function (team) { if (REC) { REC.summon = { team, round: this.s.round, hero: this.s.heroProgress, traitor: this.s.traitorProgress }; } return f.call(this, team); }; }
{ const f = P.turnStart; P.turnStart = function () { const r = f.call(this); if (REC && this.s.phase !== 'explore' && !this.s.result) { const p = this.p; if (p.team === 'traitor' && p.alive) {
    REC.tTurns++; const d = this.s.players.filter(q => q.alive && q.team === 'hero' && !(this.s.phase === 'rescue' && !Scen.Rescue.enemyAllowed(this, q))).map(q => this.path(p.room, q.room).length - 1).filter(x => x >= 0);
    if (d.length) { REC.tDist.push(Math.min(...d)); if (Math.min(...d) === 0) REC.tSameRoom++; }
    if (this.s.carrier !== null && this.s.carrier !== undefined && this.s.players[this.s.carrier]) REC.tCarrierDist.push(this.path(p.room, this.s.players[this.s.carrier].room).length - 1); } } return r; }; }
// haunt setup geometry (read-only; path() does not consume RNG)
{ const f = P.startHaunt; P.startHaunt = function () { const pre = this.s.phase; const r = f.apply(this, arguments); const s = this.s; if (REC && pre === 'explore' && s.phase !== 'explore') REC.hauntAt = s.round; if (REC) {
    if (s.rescue) { const nest = s.players[s.rescue.victim].room; REC.nestStart = s.rooms.find(x => x.id === nest)?.name; REC.nestToHall = this.path(nest, '0:0:0').length - 1; REC.kitRoomStart = { name: s.rooms.find(x => x.id === s.rescue.kitRoom)?.name, toNest: this.path(s.rescue.kitRoom, nest).length - 1 }; }
    if (s.seals) { REC.nodeDist = {}; for (const n of s.seals.nodes) REC.nodeDist[n.room] = this.path('0:0:0', n.room).length - 1; REC.playerDistToNodes = s.players.map(p => Math.min(...s.seals.nodes.map(n => this.path(p.room, n.room).length - 1))); }
  } return r; }; }
// chute slides during the haunt (AI routing through 煤槽 gets teleported to 地下平台)
{ const RR = require(path.join(ROOT, 'dist', 'rooms.js')), f = RR.arrive; RR.arrive = function (g, first) { if (REC && g.s.phase !== 'explore' && g.roomNow?.name === '煤槽') REC.chute++; return f.call(this, g, first); }; }
// attack outcome bookkeeping (traitor attacks on players)
{ const f = P.attack; P.attack = function (t) { const pre = this.s.attackUsed, team = this.p.team; const ok = f.call(this, t); if (REC && ok && !pre && this.s.attackUsed) { const k = t === 'ghost' ? 'ghost' : t === 'spider' ? 'spider' : team; REC.attacks[k] = (REC.attacks[k] || 0) + 1; } return ok; }; }
{ const f = P.resolveCombat; P.resolveCombat = function (c) { const ok = f.call(this, c); if (REC && ok && String(c).startsWith('steal:')) REC.steals++; return ok; }; }
{ const f = P.task; P.task = function (tr) { const s = this.s, pre = s.carrier; const ok = f.call(this, tr); if (REC && ok && s.phase === 'burial' && pre === null && s.carrier !== null && REC.carrierFound === null) REC.carrierFound = s.round; if (REC && ok && s.phase === 'ritual') REC.ritualTries[this.p.team] = (REC.ritualTries[this.p.team] || 0) + 1; return ok; }; }

// ---------- invariants ----------
function invariants(g) {
  const s = g.s, bad = [];
  for (const p of s.players) { if (p.idx.some(i => i < -1 || i > 7)) bad.push(`idx out of range ${p.name}`); if (!p.alive && p.items.length) bad.push(`dead ${p.name} holds items`); if (p.alive && s.rooms.find(r => r.id === p.room)?.collapsed) bad.push(`${p.name} alive in collapsed room`); if (p.alive && !s.rooms.find(r => r.id === p.room)) bad.push(`${p.name} in unknown room ${p.room}`); }
  if (s.rescue) { const r = s.rescue; if (r.web > r.webGoal) bad.push('web>goal'); if (r.web >= r.webGoal && s.players[r.victim].restrained) bad.push('victim restrained after web done'); if (r.remaining < 0) bad.push('rescue remaining<0'); }
  if (s.seals) for (const n of s.seals.nodes) if (n.progress > n.goal) bad.push('seal progress>goal');
  if (s.carrier !== null && s.carrier !== undefined && !s.players[s.carrier]?.alive) bad.push('carrier is dead');
  return bad;
}

// ---------- one game ----------
function play(scenario, count, entry, seed) {
  REC = { dmg: {}, dmgExplore: 0, deaths: [], attacks: {}, steals: 0, tTurns: 0, tSameRoom: 0, tDist: [], tCarrierDist: [], summon: null, carrierFound: null, ritualTries: {}, violations: [], chute: 0 };
  const g = new Game({ scenario, scenarioMode: 'fixed', quick: entry === 'quick', count, humanCount: 1, seed, roster: rosterFor(seed, count) });
  g.s.players.forEach(p => p.controller = 'ai');
  let steps = 0, fails = 0, capHits = 0, stall = null;
  while (!g.s.result && steps < MAX) {
    if (g.s.aiSteps >= 40) capHits++;
    g.s.report = null;
    const ok = DIRECT ? g.aiStep() : g.invoke('aiStep'); steps++;
    if (!ok) { if (++fails > 50) { stall = `invoke false ×50 phase=${g.s.phase} active=${g.p.name} pending=${!!g.s.pendingDecision} event=${!!g.s.eventChoice} combat=${!!g.s.combatChoice}`; break; } } else fails = 0;
    if (steps % 10 === 0 || g.s.result) for (const v of invariants(g)) if (!REC.violations.includes(v)) REC.violations.push(v);
  }
  if (!g.s.result && !stall) stall = `step cap ${MAX} phase=${g.s.phase} round=${g.s.round}`;
  const s = g.s, r = s.result || { team: 'none', reason: stall, round: s.round };
  const rn = id => s.rooms.find(x => x.id === id)?.name || id, dist = (a, b) => g.path(a, b).length - 1;
  const ms = t => (s.timeline || []).find(x => x.kind === 'objective' && x.title === t)?.round ?? null;
  const row = s.result ? Playlog.row(g, 0) : null;
  const hauntMark = (s.timeline || []).find(t => t.kind === 'haunt');
  // timeline is capped at 100 entries (engine.js milestone); chute slides can evict the haunt mark, so fall back to the hook
  const hauntRound = hauntMark ? hauntMark.round : (REC.hauntAt ?? null);
  const timelineLostHaunt = !hauntMark && REC.hauntAt != null;
  const o = { scenario, count, entry, seed, winner: r.team, reason: r.reason, endRound: r.round, hauntRound, hauntRounds: hauntRound ? r.round - hauntRound + 1 : null,
    deaths: s.players.filter(p => !p.alive).length, heroDeaths: s.players.filter(p => !p.alive && p.team === 'hero').length, traitorDead: s.players.some(p => !p.alive && p.team === 'traitor'),
    survivors: s.players.filter(p => p.alive).length, chuteSlides: REC.chute, roster: s.players.map(p => p.name), traitorName: s.players[s.traitor]?.name ?? null, steps, capHits, stall, violations: REC.violations, omens: s.omen, rooms: s.rooms.length,
    dmg: REC.dmg, dmgExplore: REC.dmgExplore, deathLog: REC.deaths, attacks: REC.attacks, steals: REC.steals,
    traitor: s.traitor !== null && s.traitor !== undefined ? { turns: REC.tTurns, sameRoomStarts: REC.tSameRoom, avgDistToHero: avg(REC.tDist), avgDistToCarrier: REC.tCarrierDist.length ? avg(REC.tCarrierDist) : null } : null,
    playlogHauntRounds: row ? row.hauntRounds : null, timelineLostHaunt };
  if (scenario === 'ritual') o.obj = { summon: REC.summon, heroProgress: s.heroProgress, traitorProgress: s.traitorProgress, controller: s.controller, carrierFound: REC.carrierFound,
    countdown: s.controller === 'hero' ? s.countdown : null, ghostHits: s.ghost?.hits ?? null, collapsed: s.rooms.filter(x => x.collapsed).length, ritualTries: REC.ritualTries,
    burialRoomIsCrypt: s.burialRoom ? s.rooms.find(x => x.id === s.burialRoom)?.name === '墓穴' : null, burialRoomName: s.burialRoom ? s.rooms.find(x => x.id === s.burialRoom)?.name || '(未发现)' : null,
    corpseRoom: s.corpseRoom ? rn(s.corpseRoom) : null, corpseToBurial: s.corpseRoom && s.burialRoom && s.rooms.some(x => x.id === s.burialRoom) ? dist(s.corpseRoom, s.burialRoom) : null, traitorId: s.traitor, traitorName: s.players[s.traitor]?.name };
  if (scenario === 'rescue' && s.rescue) { const x = s.rescue; o.obj = { web: x.web, webGoal: x.webGoal, eggs: x.eggs, door: x.door, kitTaken: x.kitHolder !== null || x.eggs, remaining: x.remaining, start: Scen.Rescue.roundsFor(count), victimAlive: s.players[x.victim].alive,
    nest: REC.nestStart, kitRoomStart: REC.kitRoomStart, nestToHall: REC.nestToHall, webDoneRound: ms('破网成功'), eggsRound: ms('蜘蛛卵已处理'), doorRound: ms('前门已打开'), traitorName: s.players[s.traitor]?.name }; }
  if (scenario === 'seals' && s.seals) { const h = s.seals; o.obj = { nodes: h.nodes.length, done: h.nodes.filter(n => n.progress >= n.goal).length, progress: h.nodes.reduce((a, n) => a + n.progress, 0), goalSum: h.nodes.reduce((a, n) => a + n.goal, 0), remaining: h.remaining, start: Scen.configs.seals.timeBase + count,
    nodeRooms: h.nodes.map(n => `${rn(n.room)}(${['力','速','知','理'][n.trait]}${n.progress}/${n.goal},d${REC.nodeDist?.[n.room] ?? '?'})`) }; }
  REC = null; return o;
}

// ---------- stats ----------
function avg(a) { return a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 100) / 100 : null; }
function median(a) { if (!a.length) return null; const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
const pct = (k, n) => n ? Math.round(k / n * 1000) / 10 : 0;
function summarize(games) {
  const n = games.length, win = t => games.filter(g => g.winner === t).length, heroWins = games.filter(g => g.winner === 'hero'), losses = games.filter(g => g.winner !== 'hero');
  const reasons = {}; for (const g of games) { const k = `${g.winner}｜${g.reason}`; reasons[k] = (reasons[k] || 0) + 1; }
  const sum = { games: n, heroPct: pct(win('hero'), n), traitorPct: pct(win('traitor'), n), housePct: pct(win('house'), n), stalls: games.filter(g => g.stall).length,
    avgEnd: avg(games.map(g => g.endRound)), medEnd: median(games.map(g => g.endRound)), avgHaunt: avg(games.map(g => g.hauntRound).filter(x => x != null)),
    avgAfter: avg(games.map(g => g.hauntRounds).filter(x => x != null)), medAfter: median(games.map(g => g.hauntRounds).filter(x => x != null)),
    avgDeaths: avg(games.map(g => g.deaths)), avgHeroDeaths: avg(games.map(g => g.heroDeaths)), traitorDeathPct: pct(games.filter(g => g.traitorDead).length, n),
    reasons, violations: [...new Set(games.flatMap(g => g.violations))], capHitGames: games.filter(g => g.capHits).length,
    timelineLostHaunt: games.filter(g => g.timelineLostHaunt).length, chuteGames: games.filter(g => g.chuteSlides).length, chuteGamesHeroPct: pct(games.filter(g => g.chuteSlides && g.winner === 'hero').length, games.filter(g => g.chuteSlides).length), avgChuteSlides: avg(games.map(g => g.chuteSlides)) };
  const dsum = {}; for (const g of games) for (const [k, v] of Object.entries(g.dmg)) dsum[k] = (dsum[k] || 0) + v; for (const k in dsum) dsum[k] = Math.round(dsum[k] / n * 100) / 100; sum.dmgPerGame = dsum;
  const asum = {}; for (const g of games) for (const [k, v] of Object.entries(g.attacks)) asum[k] = (asum[k] || 0) + v; for (const k in asum) asum[k] = Math.round(asum[k] / n * 100) / 100; sum.attacksPerGame = asum;
  const tr = games.filter(g => g.traitor); if (tr.length) sum.traitor = { turnsPerGame: avg(tr.map(g => g.traitor.turns)), sameRoomStartPct: pct(tr.reduce((a, g) => a + g.traitor.sameRoomStarts, 0), tr.reduce((a, g) => a + g.traitor.turns, 0)), avgDistToHero: avg(tr.map(g => g.traitor.avgDistToHero).filter(x => x != null)), avgDistToCarrier: avg(tr.map(g => g.traitor.avgDistToCarrier).filter(x => x != null)), stealsPerGame: avg(tr.map(g => g.steals)) };
  const sc = games[0]?.scenario;
  if (sc === 'ritual') {
    const sm = games.filter(g => g.obj.summon);
    sum.ritual = { heroSummonPct: pct(sm.filter(g => g.obj.summon.team === 'hero').length, n), traitorSummonPct: pct(sm.filter(g => g.obj.summon.team === 'traitor').length, n),
      avgRitualRounds: avg(sm.map(g => g.obj.summon.round - (g.hauntRound || 1) + 1)), traitorProgressAtHeroSummon: avg(sm.filter(g => g.obj.summon.team === 'hero').map(g => g.obj.summon.traitor)),
      heroProgressAtTraitorSummon: avg(sm.filter(g => g.obj.summon.team === 'traitor').map(g => g.obj.summon.hero)),
      carrierFoundPct: pct(games.filter(g => g.obj.carrierFound != null).length, games.filter(g => g.obj.controller === 'hero').length),
      burialCountdownAtHeroWin: avg(heroWins.filter(g => g.obj.controller === 'hero').map(g => g.obj.countdown)), burialInCryptPct: pct(games.filter(g => g.obj.burialRoomIsCrypt).length, games.filter(g => g.obj.controller === 'hero').length),
      burialTimeouts: games.filter(g => /未能及时安葬/.test(g.reason)).length, collapseGhostHitsAtLoss: avg(losses.filter(g => g.obj.controller === 'traitor').map(g => g.obj.ghostHits)) };
  }
  if (sc === 'rescue') {
    sum.rescue = { countdownAtHeroWin: avg(heroWins.map(g => g.obj.remaining)), startCountdown: games[0].obj.start, lossWebPct: avg(losses.map(g => g.obj.web / g.obj.webGoal * 100)), lossEggsPct: pct(losses.filter(g => g.obj.eggs).length, losses.length),
      lossDoorPct: pct(losses.filter(g => g.obj.door).length, losses.length), lossWebDonePct: pct(losses.filter(g => g.obj.web >= g.obj.webGoal).length, losses.length), victimDeathLosses: losses.filter(g => !g.obj.victimAlive).length };
  }
  if (sc === 'seals') {
    sum.seals = { countdownAtHeroWin: avg(heroWins.map(g => g.obj.remaining)), usedRoundsAtHeroWin: avg(heroWins.map(g => g.obj.start - g.obj.remaining)), startCountdown: games[0].obj.start, nodes: games[0].obj.nodes,
      lossDonePct: avg(losses.map(g => g.obj.done / g.obj.nodes * 100)), lossProgressPct: avg(losses.map(g => g.obj.progress / g.obj.goalSum * 100)), survivorsAtHeroWin: avg(heroWins.map(g => g.survivors)) };
  }
  return sum;
}

// ---------- run ----------
const t0 = Date.now(), cells = [], all = [];
for (const scenario of SCEN) for (const count of COUNTS) for (const entry of ENTRIES) {
  const games = []; for (let i = 0; i < N; i++) games.push(play(scenario, count, entry, `${PREFIX}-c${count}-${entry}-${i}`));
  const sum = summarize(games); cells.push({ scenario, count, entry, ...sum }); all.push(...games);
}
const agg = {}; for (const scenario of SCEN) for (const entry of [...ENTRIES, 'all']) { const g = all.filter(x => x.scenario === scenario && (entry === 'all' || x.entry === entry)); if (g.length) agg[`${scenario}/${entry}`] = summarize(g); }
const ms = Date.now() - t0;
const out = { meta: { tool: 'tools/balance-sim.cjs', driver: DIRECT ? 'aiStep (direct)' : "invoke('aiStep') (browser path)", n: N, prefix: PREFIX, scenarios: SCEN, counts: COUNTS, entries: ENTRIES, maxSteps: MAX, levers: sets, fixChute: FIX_CHUTE, roster: ROSTER, counterfactuals: CF, games: all.length, ms, node: process.version },
  cells, aggregate: agg, games: all };
fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(out, null, 1));

if (!QUIET) {
  const pad = (v, w) => String(v ?? '-').padEnd(w);
  console.log(`\n${all.length} games in ${(ms / 1000).toFixed(1)}s · driver=${out.meta.driver} · N=${N}/cell · levers=${JSON.stringify(sets)} · fixChute=${FIX_CHUTE} · roster=${ROSTER}`);
  console.log(pad('scenario', 8) + pad('n', 3) + pad('entry', 7) + pad('hero%', 7) + pad('trait%', 7) + pad('house%', 7) + pad('avgEnd', 7) + pad('medEnd', 7) + pad('haunt', 6) + pad('after', 6) + pad('deaths', 7) + pad('stall', 6) + 'left@heroWin');
  for (const c of cells) console.log(pad(c.scenario, 8) + pad(c.count, 3) + pad(c.entry, 7) + pad(c.heroPct, 7) + pad(c.traitorPct, 7) + pad(c.housePct, 7) + pad(c.avgEnd, 7) + pad(c.medEnd, 7) + pad(c.avgHaunt, 6) + pad(c.avgAfter, 6) + pad(c.avgDeaths, 7) + pad(c.stalls, 6) + (c.rescue?.countdownAtHeroWin ?? c.seals?.countdownAtHeroWin ?? c.ritual?.burialCountdownAtHeroWin ?? '-'));
  const v = [...new Set(all.flatMap(g => g.violations))], st = all.filter(g => g.stall);
  console.log(`\nstalls: ${st.length}${st.length ? ' e.g. ' + st[0].seed + ' ' + st[0].stall : ''} · invariant violations: ${v.length ? v.join('; ') : 'none'}`);
  console.log('JSON →', path.relative(ROOT, OUT));
}
