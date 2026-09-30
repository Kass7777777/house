// v21: audio cue diffing and playtest data table. Pure logic only; no Web Audio or browser.
const assert = require('node:assert/strict');
const { Game } = require('../dist/engine.js');
const A = require('../dist/audio.js');
const L = require('../dist/playlog.js');
const copy = o => JSON.parse(JSON.stringify(o));
const store = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

// 1. snapshot / cues never mutate state or consume RNG
{
  const g = new Game({ scenario: 'ritual', count: 4, humanCount: 1, seed: 'AUDIO-1' });
  const before = copy(g.s);
  for (let i = 0; i < 5; i++) { A.snapshot(g.s); A.cues(A.snapshot(g.s), A.snapshot(g.s)); }
  assert.deepEqual(g.s, before, 'audio layer must be read-only');
  assert.deepEqual(A.cues(null, A.snapshot(g.s)), [], 'fresh game is silent');
  assert.deepEqual(A.cues(A.snapshot(g.s), A.snapshot(g.s)), [], 'no change, no cue');
}
// 2. an entire AI game produces the expected cue families, and a different game id resets the diff
{
  const g = new Game({ scenario: 'ritual', scenarioMode: 'fixed', count: 4, humanCount: 1, seed: 'AUDIO-2' });
  g.s.players.forEach(p => p.controller = 'ai');
  const seen = new Set(); let prev = A.snapshot(g.s), moods = new Set([A.mood(prev)]);
  for (let i = 0; i < 4000 && !g.s.result; i++) { g.aiStep(); const snap = A.snapshot(g.s); A.cues(prev, snap).forEach(k => seen.add(k)); moods.add(A.mood(snap)); prev = snap; }
  assert(g.s.result, 'AI game finishes');
  for (const k of ['step', 'reveal', 'dice', 'haunt']) assert(seen.has(k), 'missing cue ' + k);
  assert(seen.has('victory') || seen.has('defeat'), 'ending cue');
  assert(moods.has('explore') && moods.has('end') && (moods.has('haunt') || moods.has('urgent')), 'mood follows phase');
  const other = A.snapshot(new Game({ seed: 'OTHER' }).s);
  assert.deepEqual(A.cues(prev, other), [], 'switching games does not fire cues');
}
// 3. targeted diffs: haunt suppresses minor cues, countdown ticks only in the last three rounds, death beats hurt
{
  const g = new Game({ scenario: 'seals', scenarioMode: 'fixed', quick: true, count: 4, humanCount: 1, seed: 'AUDIO-3' });
  const a = A.snapshot(g.s);
  const exploreSnap = { ...a, phase: 'explore', countdown: null };
  const hauntSnap = { ...a, rooms: a.rooms + 1, players: a.players.map((p, i) => i ? p : { ...p, room: p.room + 99 }) };
  const c = A.cues(exploreSnap, hauntSnap);
  assert(c.includes('haunt') && !c.includes('reveal') && !c.includes('step'), 'haunt stinger owns the moment: ' + c);
  assert(!A.cues({ ...a, countdown: 6 }, { ...a, countdown: 5 }).includes('tick'));
  assert(A.cues({ ...a, countdown: 4 }, { ...a, countdown: 3 }).includes('tick'));
  assert.equal(A.mood({ ...a, countdown: 3 }), 'urgent');
  const dead = { ...a, players: a.players.map((p, i) => i ? p : { ...p, alive: false, idx: p.idx.map(v => v - 1) }) };
  const dc = A.cues(a, dead); assert(dc.includes('death') && !dc.includes('hurt'));
  assert.deepEqual(A.cues(a, { ...a, result: 'house' }), ['defeat']);
  assert.deepEqual(A.cues(a, { ...a, result: 'hero' }), ['victory']);
}
// 4. settings load with defaults and survive corrupt storage
{
  const s = store(); assert.deepEqual(A.loadSettings(s), A.DEFAULTS);
  s.setItem(A.KEY, '{bad'); assert.deepEqual(A.loadSettings(s), A.DEFAULTS);
  s.setItem(A.KEY, JSON.stringify({ enabled: true, music: 0.2 })); const v = A.loadSettings(s);
  assert.equal(v.enabled, true); assert.equal(v.music, 0.2); assert.equal(v.sfx, A.DEFAULTS.sfx);
}
// 5. playlog: one row per finished game, read-only, idempotent, CSV-safe
{
  const s = store();
  const g = new Game({ scenario: 'rescue', scenarioMode: 'fixed', quick: true, count: 5, humanCount: 2, seed: 'LOG-1' });
  assert.equal(L.record(g, s), null, 'unfinished game not recorded');
  const owners = g.s.players.map(p => p.controller);
  g.s.players.forEach(p => p.controller = 'ai');
  for (let i = 0; i < 4000 && !g.s.result; i++) g.aiStep();
  assert(g.s.result);
  g.s.players.forEach((p, i) => p.controller = owners[i]);
  const before = copy(g.s);
  const r = L.record(g, s, g.s.startedAt + 12 * 60000);
  assert.deepEqual(g.s, before, 'recording is read-only');
  assert(r && r.scenario === '命运罗网' && r.entry === '直接作祟' && r.count === 5 && r.humans === 2 && r.hauntRound === 1);
  assert.equal(r.minutes, 12); assert.equal(r.endRound, g.s.result.round);
  assert.equal(L.record(g, s), null, 'same game recorded once');
  assert.equal(L.load(s).length, 1);
  const g2 = new Game({ scenario: 'seals', scenarioMode: 'fixed', quick: true, count: 3, humanCount: 1, seed: 'LOG,"2"' });
  g2.s.players.forEach(p => p.controller = 'ai'); for (let i = 0; i < 4000 && !g2.s.result; i++) g2.aiStep();
  L.record(g2, s);
  const csv = L.csv(L.load(s)), lines = csv.split('\r\n');
  assert(csv.startsWith('\ufeff日期,剧本'), 'BOM + Chinese header for Excel');
  assert.equal(lines.length, 3); assert(lines[2].includes('"LOG,""2"""'), 'CSV escaping');
  assert.equal(lines[0].split(',').length, L.COLUMNS.length);
  const sum = L.summary(L.load(s)); assert.equal(sum.length, 2); assert(sum.every(x => x.games === 1));
  const html = L.dialogHTML(L.load(s)); assert(html.includes('命运罗网') && html.includes('playlogCsv') && !html.includes('undefined'));
  assert(!L.dialogHTML([]).includes('playlogCsv'));
  L.clear(s); assert.equal(L.load(s).length, 0);
}
// 6. haunt round comes from the real transition, including rescue (which does not advance s.hauntRound)
for (const scenario of ['rescue', 'ritual', 'seals']) {
  const g = new Game({ scenario, scenarioMode: 'fixed', count: 4, humanCount: 1, seed: 'HR-' + scenario });
  g.s.players.forEach(p => p.controller = 'ai');
  let actual = null;
  for (let i = 0; i < 5000 && !g.s.result; i++) { const ph = g.s.phase; g.aiStep(); if (ph === 'explore' && g.s.phase !== 'explore') actual = g.s.round; }
  const r = L.row(g);
  assert.equal(r.hauntRound, actual, scenario + ' haunt round');
  assert.equal(r.hauntRounds, r.endRound - actual + 1);
}
console.log('Audio cue diff (read-only, mood, haunt priority, countdown, death/victory) and playtest data table (idempotent, CSV, summary) passed.');
