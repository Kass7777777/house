#!/usr/bin/env node
// S1-QA-02: evaluate B1–B8 (production/qa/S1-qa-plan.md) + edge cases from balance-sim JSON and signoff-probe JSON.
// Usage: node tools/signoff-analyze.cjs <sim-default.json> <sim-random.json> [probe-default.json] [probe-random.json]
'use strict';
const path = require('node:path');
const [fd, fr, pd, pr] = process.argv.slice(2).map(f => f && require(path.resolve(f)));
const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 100) / 100 : null;
const med = a => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const pct = (k, n) => n ? Math.round(k / n * 1000) / 10 : null;
const hero = gs => pct(gs.filter(g => g.winner === 'hero').length, gs.length);
const by = (gs, f) => { const o = {}; for (const g of gs) (o[f(g)] ??= []).push(g); return o; };
const S = (d, sc) => d.games.filter(g => g.scenario === sc);
const out = {};
function B(d, tag) {
  const r = {};
  // B1
  const chuteObj = d.games.filter(g => g.chuteSlides > 0 || g.obj?.nest === '煤槽' || g.obj?.kitRoomStart?.name === '煤槽' || g.obj?.corpseRoom === '煤槽' || (g.obj?.nodeRooms || []).some(x => x.startsWith('煤槽')));
  r.B1 = { chuteGames: chuteObj.length, slidesTotal: d.games.reduce((a, g) => a + g.chuteSlides, 0), stalls: d.games.filter(g => g.stall).length, violations: [...new Set(d.games.flatMap(g => g.violations))] };
  // B2 / B4 / B6 per count
  for (const [k, sc] of [['B2', 'seals'], ['B4', 'rescue'], ['B6', 'ritual']]) {
    const gs = S(d, sc), bc = by(gs, g => g.count), cells = Object.fromEntries(Object.entries(bc).map(([c, x]) => [c, hero(x)]));
    const sub = Object.fromEntries(Object.entries(by(gs, g => g.count + g.entry[0])).map(([c, x]) => [c, hero(x)]));
    const v = Object.values(cells); r[k] = { all: hero(gs), perCount: cells, range: Math.round((Math.max(...v) - Math.min(...v)) * 10) / 10, perCell: sub };
  }
  // B3
  const se = S(d, 'seals'), sw = se.filter(g => g.winner === 'hero'), sl = se.filter(g => g.winner !== 'hero');
  r.B3 = { ratioMeanOfRatios: avg(sw.map(g => g.obj.remaining / g.obj.start)), ratioOfMeans: Math.round(avg(sw.map(g => g.obj.remaining)) / avg(sw.map(g => g.obj.start)) * 1000) / 1000,
    leftAtWin: avg(sw.map(g => g.obj.remaining)), startAvg: avg(sw.map(g => g.obj.start)), losses: sl.length,
    timeoutPct: pct(sl.filter(g => /时限/.test(g.reason)).length, sl.length), wipePct: pct(sl.filter(g => /倒下/.test(g.reason)).length, sl.length),
    perCount: Object.fromEntries(Object.entries(by(se, g => g.count)).map(([c, x]) => { const w = x.filter(g => g.winner === 'hero'), l = x.filter(g => g.winner !== 'hero'); return [c, { ratio: Math.round(avg(w.map(g => g.obj.remaining)) / avg(w.map(g => g.obj.start)) * 100) / 100, timeoutPct: pct(l.filter(g => /时限/.test(g.reason)).length, l.length), wipePct: pct(l.filter(g => /倒下/.test(g.reason)).length, l.length) }]; })) };
  // B5
  const re = S(d, 'rescue'); r.B5 = { restrainedVictimDeaths: re.flatMap(g => g.deathLog).filter(x => x.victim && x.restrained).length, victimDeaths: re.flatMap(g => g.deathLog).filter(x => x.victim).length, games: re.length };
  // B7
  r.B7 = Object.fromEntries(['ritual', 'rescue', 'seals'].map(sc => { const a = S(d, sc).map(g => g.hauntRounds).filter(x => x != null); return [sc, { mean: avg(a), median: med(a), perCellMedianMin: Math.min(...Object.values(by(S(d, sc), g => g.count + g.entry[0])).map(x => med(x.map(g => g.hauntRounds)))) }]; }));
  out[tag] = r; return r;
}
const rd = B(fd, 'default'), rr = B(fr, 'random');
out.B8 = Object.fromEntries(['B2', 'B4', 'B6'].map(k => [k, { aggDiff: Math.round(Math.abs(rd[k].all - rr[k].all) * 10) / 10, perCountDiff: Object.fromEntries(Object.keys(rd[k].perCount).map(c => [c, Math.round(Math.abs(rd[k].perCount[c] - rr[k].perCount[c]) * 10) / 10])) }]));
// ---------- edge cases (probe data preferred: reads frozen state directly) ----------
function edges(p, d, tag) {
  const e = {};
  const G = p.games, sim = d.games;
  // winner cross-check probe vs sim
  const key = g => `${g.scenario}|${g.seed}`, m = new Map(sim.map(g => [key(g), g]));
  const mism = G.filter(g => { const s = m.get(key(g)); return !s || s.winner !== g.winner || s.endRound !== g.endRound; });
  e.crossCheck = { compared: G.length, mismatches: mism.length, examples: mism.slice(0, 3).map(g => g.scenario + ' ' + g.seed) };
  e.playlogHauntMissing = G.filter(g => g.winner !== 'none' && (g.rowHaunt === '' || g.rowHaunt == null)).length;
  // frozen rules present & match config snapshot shape
  e.hauntRulesMissing = G.filter(g => !g.hauntRules).length;
  // rescue 6p: deadline + remaining at win distribution
  const r6 = G.filter(g => g.scenario === 'rescue' && g.count === 6), r6w = r6.filter(g => g.winner === 'hero');
  const dist = a => { const o = {}; for (const x of a) o[x] = (o[x] || 0) + 1; return o; };
  e.rescue6 = { games: r6.length, heroPct: hero(r6), start: dist(r6.map(g => g.cd0)), remainingAtWin: dist(r6w.map(g => g.res.remaining)), winsWith0or1Left: r6w.filter(g => g.res.remaining <= 1).length,
    lossReasons: dist(r6.filter(g => g.winner !== 'hero').map(g => g.reason.slice(0, 10))), perEntry: Object.fromEntries(Object.entries(by(r6, g => g.entry)).map(([k, x]) => [k, hero(x)])) };
  e.rescueByCount = Object.fromEntries(Object.entries(by(G.filter(g => g.scenario === 'rescue'), g => g.count)).map(([c, x]) => [c, { start: dist(x.map(g => g.cd0)), heroPct: hero(x), avgLeftAtWin: avg(x.filter(g => g.winner === 'hero').map(g => g.res.remaining)), timeoutPctOfLoss: pct(x.filter(g => /时限/.test(g.reason)).length, x.filter(g => g.winner !== 'hero').length) }]));
  // ritual 3p: dispel goal 2 — how fast is collapse won?
  const rit = G.filter(g => g.scenario === 'ritual');
  e.ritualByCount = Object.fromEntries(Object.entries(by(rit, g => g.count)).map(([c, x]) => {
    const col = x.filter(g => g.rit.summon?.team === 'traitor'), bur = x.filter(g => g.rit.summon?.team === 'hero');
    return [c, { goals: x[0].goals, heroPct: hero(x), traitorWinsRacePct: pct(col.length, x.length), collapseHeroWinPct: hero(col), collapseRoundsToDispelWin: dist(col.filter(g => g.winner === 'hero').map(g => g.endRound - g.rit.summon.round + 1)),
      collapseMedianRounds: med(col.filter(g => g.winner === 'hero').map(g => g.endRound - g.rit.summon.round + 1)), burialHeroWinPct: hero(bur), burialLeftAtWin: dist(bur.filter(g => g.winner === 'hero').map(g => g.rit.countdownEnd)),
      raceRounds: avg(x.filter(g => g.rit.summon).map(g => g.rit.summon.round - g.hauntAt + 1)), reasons: dist(x.map(g => g.winner + '|' + g.reason.slice(0, 8))) }];
  }));
  // seals 3p: time 7, 3 seals — failure composition
  const s3 = G.filter(g => g.scenario === 'seals' && g.count === 3), s3l = s3.filter(g => g.winner !== 'hero');
  e.seals3 = { games: s3.length, heroPct: hero(s3), start: dist(s3.map(g => g.cd0)), nodes: dist(s3.map(g => g.sea.nodes)), losses: s3l.length, reasons: dist(s3l.map(g => g.reason.slice(0, 10))),
    lossSealsDone: dist(s3l.map(g => g.sea.done + '/' + g.sea.nodes)), lossProgress: dist(s3l.map(g => g.sea.progress + '/' + g.sea.goalSum)), perEntry: Object.fromEntries(Object.entries(by(s3, g => g.entry)).map(([k, x]) => [k, hero(x)])) };
  e.sealsByCount = Object.fromEntries(Object.entries(by(G.filter(g => g.scenario === 'seals'), g => g.count)).map(([c, x]) => { const l = x.filter(g => g.winner !== 'hero'); return [c, { start: dist(x.map(g => g.cd0)), nodes: dist(x.map(g => g.sea.nodes)), heroPct: hero(x), timeoutPct: pct(l.filter(g => /时限/.test(g.reason)).length, l.length), wipePct: pct(l.filter(g => /倒下/.test(g.reason)).length, l.length) }]; }));
  // traitor roll
  const tr = G.filter(g => g.troll);
  e.traitorRoll = { games: tr.length, sealsWithRoll: G.filter(g => g.scenario === 'seals' && g.troll).length, tiedPct: pct(tr.filter(g => g.troll.tied).length, tr.length), tieDepth: dist(tr.map(g => g.tieDepth)),
    traitorNotLowestSanityPct: pct(tr.filter(g => !g.traitorWasLowestSanity).length, tr.length), minTotal: dist(tr.map(g => g.minTotal)),
    tieBrokenBySeatPct: pct(tr.filter(g => { if (!g.troll.tied) return false; const low = g.troll.rows.filter(r => r.total === g.minTotal); return new Set(low.map(r => r.sanity)).size === 1; }).length, tr.length),
    byName: Object.fromEntries(Object.entries(by(tr, g => g.traitorName)).map(([k, x]) => [k, { n: x.length, pct: pct(x.length, tr.length), heroPct: hero(x) }])),
    bySeat: dist(tr.map(g => g.traitor)), byCountName: Object.fromEntries(Object.entries(by(tr, g => g.scenario[0] + g.count)).map(([k, x]) => [k, dist(x.map(g => g.traitorName))])),
    tieBreakCorrect: tr.every(g => { const s = [...g.troll.rows].sort((a, b) => a.total - b.total || a.sanity - b.sanity || a.id - b.id); return s[0].id === g.troll.traitor; }),
    rowsPerLivingCandidate: tr.every(g => g.troll.rows.length === g.count) };
  // normal entry: haunt timing buckets
  const nm = G.filter(g => g.entry === 'normal');
  e.hauntTiming = Object.fromEntries(['ritual', 'rescue', 'seals'].map(sc => { const x = nm.filter(g => g.scenario === sc); return [sc, Object.fromEntries(Object.entries(by(x, g => g.hauntAt <= 2 ? 'r1-2' : g.hauntAt <= 4 ? 'r3-4' : g.hauntAt <= 6 ? 'r5-6' : 'r7+')).sort().map(([k, v]) => [k, { n: v.length, heroPct: hero(v), avgDeaths: avg(v.map(g => g.deaths)) }]))]; }));
  e.hauntAtDist = dist(nm.map(g => g.hauntAt));
  // sub-cells at 0% / 100% (n ≥ 10): scenario × count × entry × {traitor, hauntBucket}
  const extremes = [];
  const scan = (label, f) => { for (const [k, x] of Object.entries(by(G, f))) { if (x.length < 10) continue; const h = hero(x); if (h === 0 || h === 100) extremes.push({ cut: label, cell: k, n: x.length, heroPct: h }); } };
  scan('scenario×count×entry', g => `${g.scenario}|${g.count}|${g.entry}`);
  scan('scenario×count×entry×traitor', g => `${g.scenario}|${g.count}|${g.entry}|${g.traitorName}`);
  scan('scenario×count×traitor', g => `${g.scenario}|${g.count}|${g.traitorName}`);
  scan('scenario×entry×hauntAt', g => `${g.scenario}|${g.entry}|h${g.hauntAt}`);
  scan('scenario×count×entry×hauntAt', g => `${g.scenario}|${g.count}|${g.entry}|h${g.hauntAt}`);
  e.extremes = extremes;
  // small-n extremes (5–9 games) for awareness
  const small = []; for (const [k, x] of Object.entries(by(G, g => `${g.scenario}|${g.count}|${g.entry}|${g.traitorName}`))) { if (x.length >= 5 && x.length < 10) { const h = hero(x); if (h === 0 || h === 100) small.push({ cell: k, n: x.length, heroPct: h }); } }
  e.smallExtremes = small;
  out['edges-' + tag] = e;
}
if (pd) edges(pd, fd, 'default'); if (pr) edges(pr, fr, 'random');
console.log(JSON.stringify(out, null, 1));
