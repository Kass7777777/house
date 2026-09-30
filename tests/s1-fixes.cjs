// S1-ENG-01 regression: coal chute (煤槽) objectives/AI routing, spider move surcharge, timeline anchors,
// single-source victim protection, config-driven rule numbers + text, and pre-fix save compatibility.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
require('../dist/tactics.js'); require('../dist/equipment.js'); require('../dist/seals.js'); require('../dist/awareness.js');
const { Game, ROOMDEFS } = require('../dist/engine.js');
const Scen = require('../dist/scenarios.js');
const RoomRules = require('../dist/rooms.js');
const Intel = require('../dist/intel.js');
const Guide = require('../dist/guide.js');
const Playlog = require('../dist/playlog.js');

const SCENARIOS = ['ritual', 'rescue', 'seals'];
const COUNTS = [3, 4, 5, 6];
const CHUTE = '煤槽';
const nameOf = (s, id) => s.rooms.find(r => r.id === id)?.name;
const inChute = (s, id) => id != null && nameOf(s, id) === CHUTE;

// Every objective / placed piece that must never sit in the chute.
function objectiveRooms(s) {
  const out = [];
  if (s.corpseRoom != null) out.push(['corpse', s.corpseRoom]);
  if (s.burialRoom != null) out.push(['burial', s.burialRoom]);
  if (s.ghost) out.push(['ghost', s.ghost.room]);
  if (s.rescue) { out.push(['nest/victim', s.players[s.rescue.victim].room], ['spider', s.rescue.spider.room]); if (s.rescue.kitRoom != null) out.push(['kit', s.rescue.kitRoom]); }
  if (s.seals) for (const n of s.seals.nodes) out.push(['seal', n.room]);
  for (const p of s.players) out.push(['player ' + p.name, p.room]);
  return out;
}
function assertNoChute(s, where) { for (const [k, id] of objectiveRooms(s)) assert(!inChute(s, id), `${where}: ${k} placed in 煤槽 (${id})`); }

// Quick-start map plus hand-placed rooms. Layout 'far': 煤槽 is the farthest dead end, so the old
// farthest-room selection (nest, seal node #1) picked it. Layout 'shortcut': 煤槽 is a two-way shortcut
// between two branches (礼拜堂 ↔ 温室), so the old BFS routed AI pieces through it. [x, y, floor, name, doors(N0 E1 S2 W3)]
const ALL = [0, 1, 2, 3];
const LAYOUTS = {
  far: [[2, 0, 0, '餐厅', ALL], [3, 0, 0, '画廊', ALL], [4, 0, 0, CHUTE, ALL]],
  shortcut: [[2, 0, 0, '餐厅', ALL], [3, 0, 0, '画廊', ALL], [3, 1, 0, '音乐室', [0, 3]], [2, 1, 0, '温室', [1, 3]], [1, 1, 0, CHUTE, [0, 1]]],
};
function quickWithChute(scenario, count, seed, layout = 'far') {
  const g = new Game({ scenario, scenarioMode: 'fixed', count, humanCount: 1, seed });
  for (const [x, y, f, name, doors] of LAYOUTS[layout]) g.s.rooms.push(g.room(x, y, f, name, '', doors));
  g.quickStart();
  g.s.players.forEach(p => p.controller = 'ai');
  return g;
}

test('objectives are never placed in 煤槽 — quick entry with a chute on the map (200 seeds × 3 scenarios × 3–6 players × 2 layouts)', () => {
  let checked = 0;
  for (const layout of Object.keys(LAYOUTS)) for (const scenario of SCENARIOS) for (const count of COUNTS) for (let i = 0; i < 200; i++) {
    const g = quickWithChute(scenario, count, `S1FIX-Q-${layout}-${i}`, layout);
    assert(g.s.rooms.some(r => r.name === CHUTE));
    assertNoChute(g.s, `${layout}/${scenario}/c${count}/${i} haunt`);
    if (scenario === 'ritual') { // hero summon draws the corpse room from every discovered room
      for (const p of g.s.players.filter(p => p.team === 'hero')) { const h = new Game({}, g.s); h.s.active = p.id; h.summon('hero'); assertNoChute(h.s, `${layout}/ritual/c${count}/${i} summon by ${p.name}`); }
    }
    checked++;
  }
  assert.equal(checked, 2 * 3 * 4 * 200);
});

test('corpse placement: a draw that lands on 煤槽 advances to the next candidate; other draws are unchanged (one RNG draw)', () => {
  const g = quickWithChute('ritual', 4, 'S1FIX-CORPSE', 'far');
  const hero = g.s.players.find(p => p.team === 'hero'); g.s.active = hero.id;
  const rooms = g.s.rooms.filter(r => !r.collapsed && r.id !== hero.room), k = rooms.findIndex(r => r.name === CHUTE);
  assert(k >= 0);
  for (let i = 0; i < rooms.length; i++) {
    const h = new Game({}, g.s); let draws = 0; h.rng = () => { draws++; return (i + 0.5) / rooms.length; };
    h.summon('hero');
    assert.equal(draws, 1, 'summon consumes exactly one RNG draw');
    assert.equal(h.s.corpseRoom, i === k ? rooms[(k + 1) % rooms.length].id : rooms[i].id);
  }
});

test('objectives are never placed in 煤槽 — normal entry (explored maps, 200 seeds × 3–6 players, all 3 scenarios)', () => {
  let withChute = 0, total = 0;
  for (const count of COUNTS) for (let i = 0; i < 200; i++) {
    const g = new Game({ scenario: 'ritual', scenarioMode: 'fixed', count, humanCount: 1, seed: `S1FIX-N-c${count}-${i}` });
    g.s.players.forEach(p => p.controller = 'ai');
    // Capture the state at the moment the haunt is revealed, then replay the reveal for every scenario.
    let snap = null; g.startHaunt = function () { snap = JSON.parse(JSON.stringify(this.s)); };
    for (let k = 0; k < 4000 && !snap; k++) { g.s.report = null; g.invoke('aiStep'); }
    assert(snap, `seed ${i} c${count} never reached the haunt`);
    if (snap.rooms.some(r => r.name === CHUTE)) withChute++;
    for (const scenario of SCENARIOS) {
      const h = new Game({}, snap); h.s.scenario = scenario; h.startHaunt();
      assert.notEqual(h.s.phase, 'explore'); assertNoChute(h.s, `normal/${scenario}/c${count}/${i}`); total++;
      if (scenario === 'ritual') { const c = new Game({}, h.s); c.s.active = c.s.players.find(p => p.team === 'hero').id; c.summon('hero'); assertNoChute(c.s, `normal/ritual-summon/c${count}/${i}`); }
    }
  }
  assert.equal(total, 3 * 4 * 200);
  assert(withChute >= 50, `coverage: only ${withChute} explored maps contained 煤槽`);
});

test('path() never uses 煤槽 as a waypoint or destination; players may still step in deliberately', () => {
  const g = quickWithChute('rescue', 4, 'S1FIX-PATH', 'shortcut'), s = g.s, chute = s.rooms.find(r => r.name === CHUTE);
  for (const a of s.rooms) for (const b of s.rooms) {
    const p = g.path(a.id, b.id);
    if (a.id !== b.id) assert(!p.slice(1).some(id => id === chute.id), `path ${a.name}→${b.name} uses 煤槽`);
  }
  // The detour is found instead of the shortcut: 礼拜堂 → 温室 must go round via 餐厅/画廊/音乐室.
  assert.deepEqual(g.path('0:1:0', '0:2:1').map(id => nameOf(s, id)), ['礼拜堂', '餐厅', '画廊', '音乐室', '温室']);
  // A human can still enter the chute and slides to the basement landing.
  const hero = s.players.find(p => p.team === 'hero' && !p.restrained); s.active = hero.id; g.turnStart(); hero.room = '0:1:0'; g.s.moves = 5;
  s.rescue.spider.room = '0:0:0'; // keep the move cost at 1
  assert(g.moveRoom(chute.id)); assert.equal(hero.room, '-1:0:0');
});

test('AI never enters 煤槽 during the haunt (full AI games, both layouts + normal entry) — Bug-02 guard', () => {
  let slides = 0; const arrive = RoomRules.arrive;
  RoomRules.arrive = function (g, first) { if (g.s.phase !== 'explore' && g.roomNow?.name === CHUTE) slides++; return arrive.call(this, g, first); };
  try {
    let games = 0, finished = 0;
    const run = (g, label) => {
      for (let k = 0; k < 6000 && !g.s.result; k++) {
        g.s.report = null; g.invoke('aiStep');
        if (g.s.phase !== 'explore') assertNoChute(g.s, `${label} step ${k}`);
      }
      games++; if (g.s.result) finished++;
    };
    for (const layout of Object.keys(LAYOUTS)) for (const scenario of SCENARIOS) for (const count of COUNTS) for (let i = 0; i < 6; i++) run(quickWithChute(scenario, count, `S1FIX-AI-${layout}-${i}`, layout), `${layout}/${scenario}/c${count}/${i}`);
    for (const scenario of SCENARIOS) for (const count of COUNTS) for (let i = 0; i < 6; i++) { const g = new Game({ scenario, scenarioMode: 'fixed', count, humanCount: 1, seed: `S1FIX-AIN-${i}` }); g.s.players.forEach(p => p.controller = 'ai'); run(g, `normal/${scenario}/c${count}/${i}`); }
    assert.equal(slides, 0, `AI slid down the chute ${slides} times during the haunt`);
    assert.equal(finished, games, 'every AI game reaches a result');
  } finally { RoomRules.arrive = arrive; }
});

test('cost(): movement surcharges are additive — spider +1, each enemy +1', () => {
  const g = new Game({ scenario: 'rescue', quick: true, count: 4, humanCount: 4, seed: 'S1FIX-COST' }), s = g.s, r = s.rescue;
  const hero = s.players.find(p => p.team === 'hero' && p.id !== r.victim), traitor = s.players[s.traitor];
  s.active = hero.id; g.turnStart();
  const room = s.rooms.find(x => x.id !== s.players[r.victim].room && x.id !== traitor.room && x.id !== '0:0:0').id;
  hero.room = room; r.spider.room = room; r.spider.stunned = false;
  for (const p of s.players) if (p.id !== hero.id && p.room === room) p.room = '0:0:0';
  assert.equal(g.cost(), 2, 'spider alone');
  traitor.room = room; assert.equal(g.cost(), 3, 'spider + traitor');
  r.spider.stunned = true; assert.equal(g.cost(), 2, 'stunned spider no longer adds');
  r.spider.stunned = false; r.spider.room = '0:0:0'; assert.equal(g.cost(), 2, 'traitor alone');
  // Traitors are never slowed by their own spider.
  s.active = traitor.id; r.spider.room = room; hero.room = '0:0:0'; for (const p of s.players) if (p.team === 'hero' && p.room === room) p.room = '0:0:0';
  assert.equal(g.cost(), 1);
});

test("timeline keeps 'start' and 'haunt' anchors past the 100-entry cap (Bug-03)", () => {
  const g = new Game({ scenario: 'ritual', quick: true, count: 4, seed: 'S1FIX-TL' });
  const haunt = g.s.timeline.find(t => t.kind === 'haunt'); assert(haunt);
  for (let i = 0; i < 180; i++) { g.s.round = 2 + (i >> 3); g.milestone('route', '煤槽滑落', 'x' + i); }
  assert.equal(g.s.timeline.length, 100);
  assert.equal(g.s.timeline[0].kind, 'start'); assert.equal(g.s.timeline[1].kind, 'haunt');
  assert.equal(g.s.timeline.at(-1).text, 'x179', 'newest entries are kept');
  g.endGame('hero', 'test'); assert.equal(g.s.timeline.length, 100); assert(g.s.timeline.some(t => t.kind === 'haunt'));
  assert.equal(Playlog.row(g, 0).hauntRound, haunt.round);
});

test('player attacks route victim protection through Rescue.enemyAllowed (both combat paths)', () => {
  const orig = Scen.Rescue.enemyAllowed, calls = [];
  const setup = () => { const g = new Game({ scenario: 'rescue', quick: true, count: 4, humanCount: 4, seed: 'S1FIX-PROT' }), s = g.s, t = s.players[s.traitor], v = s.players[s.rescue.victim]; s.active = t.id; g.turnStart(); t.room = v.room; return { g, t, v }; };
  try {
    // Default rule: protected until eggs are handled.
    for (const viaInvoke of [false, true]) { const { g, v } = setup(); assert.equal(viaInvoke ? g.invoke('attack', [v.id]) : g.attack(v.id), false); }
    // Overriding the single predicate changes both paths.
    Scen.Rescue.enemyAllowed = (g, target) => { calls.push(target.id); return true; };
    for (const viaInvoke of [false, true]) { const { g, v } = setup(); calls.length = 0; assert.equal(viaInvoke ? g.invoke('attack', [v.id]) : g.attack(v.id), true, 'attack allowed by predicate (invoke=' + viaInvoke + ')'); assert(calls.includes(v.id)); }
    Scen.Rescue.enemyAllowed = () => false;
    for (const viaInvoke of [false, true]) { const { g, v } = setup(); g.s.rescue.eggs = true; assert.equal(viaInvoke ? g.invoke('attack', [v.id]) : g.attack(v.id), false); }
  } finally { Scen.Rescue.enemyAllowed = orig; }
});

test('rule numbers are config-driven: ritual.dispelGoal=4 changes the rule and every text surface', () => {
  const c = Scen.configs.ritual, keep = { ...c };
  try {
    // Neutral scaling (S1-ENG-02 keys) so dispelGoal/goal are the literal targets, as they were in S1-ENG-01.
    Object.assign(c, { goal: 3, goalPerHero: 0, traitorGoal: null, rounds: 6, roundsPerHero: 0, dispelGoalPerHero: 0 });
    c.dispelGoal = 4; c.ghostDefense = 5;
    const g = new Game({ scenario: 'ritual', quick: true, count: 4, humanCount: 4, seed: 'S1FIX-CFG' });
    const hero = g.s.players.find(p => p.team === 'hero'); g.s.active = hero.id; g.turnStart();
    g.summon('traitor'); assert.equal(g.s.phase, 'collapse');
    assert(g.s.report.text.includes('累计 4 次获胜') && g.s.report.text.includes('5 骰防御'), g.s.report.text);
    const dice = []; g.roll = (n, label) => { dice.push([label, n]); const v = label === '驱散幽灵' ? 9 : 0; g.s.dice = [v]; g.s.lastRoll = { serial: (g.s.lastRoll?.serial || 0) + 1, label, dice: [v], total: v, round: g.s.round, playerId: g.s.active }; return v; };
    g.s.ghost.room = hero.room; g.s.ghost.hits = 2;
    assert(g.attack('ghost')); assert.equal(g.s.ghost.hits, 3); assert.equal(g.s.result, null, '3 hits no longer win');
    assert.deepEqual(dice.find(d => d[0] === '幽灵抵抗'), ['幽灵抵抗', 5]);
    g.s.attackUsed = false; assert(g.attack('ghost')); assert.equal(g.s.result?.team, 'hero', '4th hit wins');
    // Text surfaces
    const h = new Game({ scenario: 'ritual', quick: true, count: 4, humanCount: 4, seed: 'S1FIX-CFG' }); h.s.active = h.s.players.find(p => p.team === 'hero').id; h.summon('traitor');
    assert(Intel.situation(h).goal.includes('4 次'), Intel.situation(h).goal);
    assert(Intel.situation(h).next.includes('/4'), Intel.situation(h).next);
    assert(Intel.checks(h).find(r => r.name === '驱散幽灵').condition.includes('5 骰'));
    assert(Guide.next(h).text.includes('/4 次') && Guide.next(h).text.includes('5 颗骰子'), Guide.next(h).text);
    // Ritual race numbers flow into intel / guide / reveal report too.
    c.goal = 5; c.threshold = 3; c.traitorGain = 3;
    const r = new Game({ scenario: 'ritual', quick: true, count: 4, humanCount: 4, seed: 'S1FIX-CFG2' });
    assert(r.s.report.text.includes('先达到 5 点') && r.s.report.text.includes('目标值 3') && r.s.report.text.includes('叛徒成功 +3'), r.s.report.text);
    assert(Intel.situation(r).goal.includes('5 点')); assert(Intel.checks(r)[0].condition.includes('≥ 3'));
    assert(Guide.next(r).text.includes('≥ 3') && Guide.next(r).text.includes('先到 5 点'), Guide.next(r).text);
  } finally { Object.assign(c, keep); }
});

test('seal and rescue numbers are config-driven (rule + text)', () => {
  const sc = Scen.configs.seals, rc = Scen.configs.rescue, ks = { ...sc }, kr = { ...rc };
  try {
    sc.repairThreshold = 5; sc.nodeGoal = 3; sc.timeBase = 5; sc.erosion = 2;
    const g = new Game({ scenario: 'seals', quick: true, count: 4, humanCount: 4, seed: 'S1FIX-SEAL' });
    assert(g.s.seals.nodes.every(n => n.goal === 3)); assert.equal(g.s.countdown, 5 + 4);
    assert(g.s.report.text.includes('3 次') && g.s.report.text.includes('≥ 5') && g.s.report.text.includes('受到 2 点侵蚀'), g.s.report.text);
    const n = g.s.seals.nodes[0]; g.p.room = n.room;
    assert(g.sealActions()[0].detail.includes('≥ 5') && g.sealActions()[0].detail.includes('需 3 次'));
    assert(Intel.checks(g)[0].condition.includes('≥ 5'));
    g.roll = () => 4; assert(g.sealAction('repair')); assert.equal(n.progress, 0, '4 < 5 fails');
    // erosion amount
    const e = new Game({ scenario: 'seals', quick: true, count: 3, seed: 'S1FIX-SEAL2' }); e.s.players.forEach(p => p.controller = 'ai'); e.s.round++;
    const before = e.s.players.map(p => p.idx[2] + p.idx[3]); e.roundEnd();
    e.s.players.forEach((p, i) => assert.equal(before[i] - (p.idx[2] + p.idx[3]), 2));
    rc.doorThreshold = 7; rc.webDefense = 5; rc.webGoalBase = 1; rc.webGoalPerPlayer = 0; rc.roundsPerPlayer = 0; rc.medicineThreshold = 5;
    const r = new Game({ scenario: 'rescue', quick: true, count: 5, humanCount: 5, seed: 'S1FIX-RES' });
    assert.equal(r.s.rescue.webGoal, 1); assert.equal(r.s.rescue.remaining, rc.rounds);
    r.s.active = r.s.players.find(p => p.team === 'hero').id;
    const checks = Intel.checks(r).map(x => x.condition).join('|');
    assert(checks.includes('蛛网 5 骰') && checks.includes('≥ 7') && checks.includes('≥ 5'), checks);
    assert.equal(Scen.Rescue.webGoalText(), '1 次');
  } finally { Object.assign(sc, ks); Object.assign(rc, kr); }
  assert.equal(Scen.Rescue.webGoalText(), '队伍人数', 'default wording unchanged');
});

test('saves: JSON round-trip mid-game, and saves produced by the pre-fix build (incl. objectives in 煤槽) load and finish', () => {
  // Round-trip of a state built by this build.
  for (const scenario of SCENARIOS) {
    let g = new Game({ scenario, count: 4, humanCount: 1, seed: 'S1FIX-SAVE-' + scenario }); g.s.players.forEach(p => p.controller = 'ai');
    for (let k = 0; k < 6000 && !g.s.result; k++) { g.s.report = null; g.invoke('aiStep'); if (k % 150 === 75) g = new Game({}, JSON.parse(JSON.stringify(g.s))); }
    assert(g.s.result, scenario + ' round-trip game finished');
  }
  // Fixtures were generated with git HEAD 4b9f0d7 (before S1-ENG-01) — see tests/fixtures/s1-prefix-saves.json.
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 's1-prefix-saves.json'), 'utf8'));
  assert(fx.saves.length >= 12);
  assert(fx.saves.filter(x => x.hit !== 'none').length >= 6, 'fixture includes saves with objectives in 煤槽');
  for (const x of fx.saves) {
    const hadChute = objectiveRooms(x.state).some(([, id]) => inChute(x.state, id));
    assert.equal(hadChute, x.hit !== 'none', x.seed + ' fixture sanity');
    const g = new Game({}, JSON.parse(JSON.stringify(x.state)));
    assertNoChute(g.s, 'loaded ' + x.seed);                      // repaired on load, no RNG consumed
    assert.equal(g.s.rng, x.state.rng, 'loading must not consume RNG');
    g.s.players.forEach(p => p.controller = 'ai');
    for (let k = 0; k < 6000 && !g.s.result; k++) { g.s.report = null; g.invoke('aiStep'); }
    assert(g.s.result, `${x.scenario} ${x.seed} (${x.hit}) runs to a result`);
  }
});
