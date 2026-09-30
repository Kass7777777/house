// Deterministic behaviour + rule-text trace of full AI games, used by tests/s1-tuning.cjs.
// The golden file tests/fixtures/s1-eng01-golden.json was produced from the S1-ENG-01 build (before tuning plan B):
//   node tests/fixtures/s1-trace.cjs <path-to-S1-ENG-01-dist> tests/fixtures/s1-eng01-golden.json
// The test runs the same trace on the current dist/ with every S1-ENG-02 key set to its legacy/neutral value and
// requires identical hashes, i.e. the new keys are pure levers: behaviour, RNG order and player-facing text unchanged.
'use strict';
const path = require('node:path'), crypto = require('node:crypto');
function load(dist) {
  for (const m of ['tactics', 'equipment', 'seals', 'awareness']) require(path.join(dist, m + '.js'));
  return { Game: require(path.join(dist, 'engine.js')).Game, Intel: require(path.join(dist, 'intel.js')), Guide: require(path.join(dist, 'guide.js')), Scen: require(path.join(dist, 'scenarios.js')) };
}
function trace(dist, prepare) {
  const M = load(dist); if (prepare) prepare(M);
  const { Game, Intel, Guide } = M, out = [];
  for (const scenario of ['ritual', 'rescue', 'seals']) for (const count of [3, 4, 5, 6]) for (const quick of [true, false]) for (let i = 0; i < 2; i++) {
    const seed = `S1-TRACE-${scenario}-${count}-${quick}-${i}`;
    const g = new Game({ scenario, scenarioMode: 'fixed', count, quick, humanCount: 1, seed }); g.s.players.forEach(p => p.controller = 'ai');
    const h = crypto.createHash('sha256'), texts = new Set();
    const note = () => { const s = g.s; if (s.report) texts.add('R|' + s.report.title + '|' + s.report.text);
      if (s.phase !== 'end') { texts.add('I|' + JSON.stringify(Intel.situation(g)) + JSON.stringify(Intel.checks(g)) + JSON.stringify(Intel.endTurn(g))); const n = Guide.next(g); texts.add('G|' + n.title + '|' + n.text + '|' + n.focus); } };
    note();
    for (let k = 0; k < 6000 && !g.s.result; k++) { g.s.report = null; g.invoke('aiStep'); note(); }
    const s = g.s;
    for (const t of texts) h.update(t + '\n');
    h.update(JSON.stringify(s.logs.map(l => l.msg))); h.update(JSON.stringify(s.timeline)); h.update(JSON.stringify((s.awareness || []).map(a => a.lines)));
    out.push({ seed, result: s.result && { team: s.result.team, reason: s.result.reason, round: s.result.round }, rng: s.rng, texts: texts.size, hash: h.digest('hex') });
  }
  return out;
}
module.exports = { trace };
if (require.main === module) {
  const fs = require('node:fs'), dist = path.resolve(process.argv[2]), outFile = process.argv[3];
  const games = trace(dist);
  fs.writeFileSync(outFile, JSON.stringify({ generatedFrom: 'S1-ENG-01 dist (pre tuning plan B)', games }, null, 1) + '\n');
  console.log(games.length, 'games →', outFile);
}
