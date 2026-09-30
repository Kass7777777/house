// S1-ENG-02 · tuning plan B: scaled ritual targets (frozen in s.ritualGoals), victim protected until freed,
// shrinking rescue deadline, harder seals, cautious hero AI, sanity-roll traitor selection, config-driven text,
// old-save compatibility, and "legacy settings reproduce S1-ENG-01 exactly".
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
require('../dist/tactics.js'); require('../dist/equipment.js'); require('../dist/seals.js'); require('../dist/awareness.js');
const { Game } = require('../dist/engine.js');
const Scen = require('../dist/scenarios.js');
const Intel = require('../dist/intel.js');
const Guide = require('../dist/guide.js');
const { trace } = require('./fixtures/s1-trace.cjs');
const { configs, Rescue, Ritual } = Scen;
const COUNTS = [3, 4, 5, 6];
const snapshot = () => JSON.parse(JSON.stringify({ ritual: configs.ritual, rescue: configs.rescue, seals: configs.seals }));
const restore = snap => { for (const k of Object.keys(snap)) { for (const key of Object.keys(configs[k])) if (!(key in snap[k])) delete configs[k][key]; Object.assign(configs[k], snap[k]); } };
const LEGACY = {
  ritual: { goal: 3, goalPerHero: 0, traitorGoal: null, rounds: 6, roundsPerHero: 0, dispelGoal: 3, dispelGoalPerHero: 0, corpseThreshold: 4, ghostDefense: 4, traitorRule: 'lowest', aiCautious: false },
  rescue: { webDefense: 4, rounds: 12, roundsPerPlayer: 1, protectUntil: 'eggs', traitorRule: 'lowest' },
  seals: { repairThreshold: 4, nodeMin: 2, nodeMax: 4, timeBase: 8, erosion: 1 },
};
function fixRoll(g, values) { g.roll = (n, label) => { const v = values.length ? values.shift() : 0; g.s.dice = [v]; g.s.lastRoll = { serial: (g.s.lastRoll?.serial || 0) + 1, label, dice: [v], total: v, round: g.s.round, playerId: g.s.active }; (g.s.rollHistory ??= []).push(g.s.lastRoll); return v; }; }
const heroOf = g => g.s.players.find(p => p.team === 'hero' && p.alive);

test('shipped config = plan B values', () => {
  assert.deepEqual(Object.fromEntries(['threshold', 'goal', 'goalPerHero', 'heroGain', 'traitorGain', 'traitorGoal', 'rounds', 'roundsPerHero', 'corpseThreshold', 'dispelGoal', 'dispelGoalPerHero', 'ghostDefense', 'traitorRule', 'aiCautious'].map(k => [k, configs.ritual[k]])),
    { threshold: 4, goal: 0, goalPerHero: 1.5, heroGain: 1, traitorGain: 2, traitorGoal: 2, rounds: 7, roundsPerHero: -1, corpseThreshold: 6, dispelGoal: 0, dispelGoalPerHero: 1, ghostDefense: 5, traitorRule: 'roll', aiCautious: true });
  assert.deepEqual(Object.fromEntries(['webDefense', 'rounds', 'roundsPerPlayer', 'protectUntil', 'traitorRule', 'medicineThreshold', 'doorThreshold', 'spiderDice'].map(k => [k, configs.rescue[k]])),
    { webDefense: 5, rounds: 16, roundsPerPlayer: -3, protectUntil: 'freed', traitorRule: 'roll', medicineThreshold: 4, doorThreshold: 6, spiderDice: 3 });
  assert.deepEqual(Object.fromEntries(['repairThreshold', 'nodeGoal', 'nodeMin', 'nodeMax', 'timeBase', 'erosion'].map(k => [k, configs.seals[k]])),
    { repairThreshold: 5, nodeGoal: 2, nodeMin: 3, nodeMax: 5, timeBase: 4, erosion: 2 });
});

test('derived targets for 3–6 players (ritual h = n−1, rescue, seals)', () => {
  const EXP = { ritual: { hero: [3, 5, 6, 8], traitor: [2, 2, 2, 2], burialRounds: [5, 4, 3, 2], dispel: [2, 3, 4, 5] }, rescue: [16, 13, 10, 7], sealNodes: [3, 3, 4, 5], sealTime: [7, 8, 9, 10] };
  COUNTS.forEach((n, i) => {
    for (const quick of [true, false]) {
      // ritual (quick: straight to the haunt; normal: AI explores until the reveal)
      let g = new Game({ scenario: 'ritual', scenarioMode: 'fixed', count: n, quick, humanCount: 1, seed: 'S1T-D-' + n }); g.s.players.forEach(p => p.controller = 'ai');
      for (let k = 0; k < 4000 && g.s.phase === 'explore'; k++) { g.s.report = null; g.invoke('aiStep'); }
      assert.equal(g.s.players.filter(p => p.team === 'hero').length, n - 1);
      assert.deepEqual(g.s.ritualGoals, { hero: EXP.ritual.hero[i], traitor: 2, burialRounds: EXP.ritual.burialRounds[i], dispel: EXP.ritual.dispel[i] }, `ritual n=${n} quick=${quick}`);
      // rescue
      g = new Game({ scenario: 'rescue', count: n, quick: true, seed: 'S1T-R-' + n });
      assert.equal(g.s.rescue.remaining, EXP.rescue[i]); assert.equal(g.s.countdown, EXP.rescue[i]); assert.equal(g.s.rescue.webGoal, n);
      // seals
      g = new Game({ scenario: 'seals', count: n, quick: true, seed: 'S1T-S-' + n });
      assert.equal(g.s.seals.nodes.length, EXP.sealNodes[i]); assert.equal(g.s.countdown, EXP.sealTime[i]); assert(g.s.seals.nodes.every(x => x.goal === 2));
    }
    assert.equal(Rescue.roundsFor(n), EXP.rescue[i]);
  });
  // formula edges: JS rounding (4.5 → 5), floor of 1, and the deadline floor
  assert.equal(Ritual.scale(0, 1.5, 3), 5); assert.equal(Ritual.scale(7, -1, 9), 1); assert.equal(Ritual.scale(0, 0, 4), 1);
  const snap = snapshot(); try { configs.rescue.rounds = 2; assert.equal(Rescue.roundsFor(6), 1); } finally { restore(snap); }
});

test('ritual targets drive the rules and are frozen for the game (deaths and reloads do not rescale)', () => {
  let g = new Game({ scenario: 'ritual', quick: true, count: 5, humanCount: 5, seed: 'S1T-RULE' }); const G = { ...g.s.ritualGoals };
  // a single traitor success (+2) summons; heroes need G.hero points
  const traitor = g.s.players[g.s.traitor]; g.s.active = traitor.id; g.turnStart(); fixRoll(g, [9]);
  assert(g.task(3)); assert.equal(g.s.traitorProgress, 2); assert.equal(g.s.phase, 'collapse');
  g = new Game({ scenario: 'ritual', quick: true, count: 5, humanCount: 5, seed: 'S1T-RULE' });
  g.s.players.find(p => p.team === 'hero' && p.id !== g.s.active).alive = false; // a death after the haunt
  g = new Game({}, JSON.parse(JSON.stringify(g.s))); assert.deepEqual(g.s.ritualGoals, G);
  for (let k = 1; k <= G.hero; k++) { g.s.active = heroOf(g).id; g.turnStart(); fixRoll(g, [9]); assert(g.task(2)); assert.equal(g.s.phase, k < G.hero ? 'ritual' : 'burial', 'hero point ' + k); }
  assert.equal(g.s.countdown, G.burialRounds);
  // dispel target
  g = new Game({ scenario: 'ritual', quick: true, count: 5, humanCount: 5, seed: 'S1T-RULE' }); g.s.active = heroOf(g).id; g.summon('traitor');
  for (let k = 1; k <= G.dispel; k++) { g.s.active = heroOf(g).id; g.turnStart(); g.s.ghost.room = g.p.room; fixRoll(g, [9, 0]); assert(g.attack('ghost')); assert.equal(!!g.s.result, k === G.dispel, 'dispel ' + k); }
  assert.equal(g.s.result.team, 'hero');
});

test('rescue: victim protected until freed (eggs AND web) on both attack paths and from the spider', () => {
  const make = () => { const g = new Game({ scenario: 'rescue', quick: true, count: 4, humanCount: 4, seed: 'S1T-PROT' }), s = g.s, t = s.players[s.traitor], v = s.players[s.rescue.victim]; s.active = t.id; g.turnStart(); t.room = v.room; return { g, s, v }; };
  const hit = (g, v, invoke) => invoke ? g.invoke('attack', [v.id]) : g.attack(v.id);
  for (const invoke of [false, true]) {
    let { g, s, v } = make(); s.rescue.eggs = true; s.rescue.web = s.rescue.webGoal - 1;
    assert.equal(hit(g, v, invoke), false, 'eggs done, web not broken → protected (invoke=' + invoke + ')');
    assert.equal(Rescue.enemyAllowed(g, v), false);
    ({ g, s, v } = make()); s.rescue.web = s.rescue.webGoal; s.rescue.eggs = false;
    assert.equal(hit(g, v, invoke), false, 'web broken, eggs pending → protected');
    ({ g, s, v } = make()); s.rescue.eggs = true; s.rescue.web = s.rescue.webGoal; v.restrained = false;
    assert.equal(hit(g, v, invoke), true, 'freed → attackable');
  }
  // spider never chases a protected victim, even if the victim is the only hero it can reach
  const { g, s, v } = make(); s.rescue.eggs = true; s.rescue.spider.room = v.room; s.rescue.spider.stunned = false;
  for (const p of s.players) if (p.team === 'hero' && p.id !== v.id) p.alive = false;
  const idx = [...v.idx]; s.round++; Rescue.round(g); assert.deepEqual(v.idx, idx);
  // rollback lever: protectUntil 'eggs' restores the old window
  const snap = snapshot(); try { configs.rescue.protectUntil = 'eggs'; const m = make(); m.s.rescue.eggs = true; assert.equal(m.g.attack(m.v.id), true); } finally { restore(snap); }
});

test('traitor by sanity roll: deterministic per seed, one roll per living candidate, tie-breaks, shown in report', () => {
  const a = new Game({ scenario: 'ritual', quick: true, count: 6, seed: 'S1T-TR' }), b = new Game({ scenario: 'ritual', quick: true, count: 6, seed: 'S1T-TR' });
  assert.equal(a.s.traitor, b.s.traitor); assert.deepEqual(a.s.traitorRoll, b.s.traitorRoll); assert.equal(a.s.rng, b.s.rng);
  const tr = a.s.traitorRoll; assert.equal(tr.rows.length, 6); assert.equal(tr.rolls.length, 6); assert.equal(tr.traitor, a.s.traitor);
  assert.equal(Math.min(...tr.rows.map(r => r.total)), tr.rows.find(r => r.id === a.s.traitor).total);
  for (const r of tr.rows) assert(a.s.report.text.includes(`${r.name} ${r.total}`), a.s.report.text);
  assert(a.s.report.text.startsWith('理智检定（总和最低者成为叛徒）')); assert.equal(a.s.report.rolls.length, 6);
  assert(a.s.logs.some(l => l.msg.includes('的理智抗拒')));
  // not always the lowest-sanity seat
  const picks = new Set(); for (let i = 0; i < 40; i++) picks.add(new Game({ scenario: 'rescue', quick: true, count: 6, seed: 'S1T-TR-' + i }).s.traitor);
  assert(picks.size >= 3, 'traitor varies across seeds: ' + [...picks]);
  // tie-breaks: equal totals → lower current sanity; equal sanity too → lower seat
  const tie = (totals, sanity) => { const g = new Game({ scenario: 'ritual', count: 4, seed: 'S1T-TIE' }); g.s.players.forEach((p, i) => { p.tracks = JSON.parse(JSON.stringify(p.tracks)); p.tracks[3][p.idx[3]] = sanity[i]; });
    fixRoll(g, [...totals]); g.startHaunt(); return g; };
  let g = tie([2, 2, 5, 2], [4, 3, 3, 3]); assert.equal(g.s.traitor, 1); assert(g.s.traitorRoll.tied); assert(g.s.report.text.includes('薇拉、林默、罗伊并列最低（2），比较当前理智、再按座位顺序，由林默成为叛徒。'), g.s.report.text);
  g = tie([3, 1, 1, 4], [5, 5, 5, 5]); assert.equal(g.s.traitor, 1); assert(g.s.report.text.includes('林默、艾琳并列最低（1），当前理智也相同，按座位顺序，由林默成为叛徒。'), g.s.report.text);
  g = tie([2, 2, 5, 3], [4, 3, 5, 5]); assert.equal(g.s.traitor, 1); assert(g.s.report.text.includes('薇拉、林默并列最低（2），比较当前理智后，由林默成为叛徒。'), g.s.report.text);
  g = tie([0, 4, 4, 4], [2, 2, 2, 2]); assert.equal(g.s.traitor, 0); assert(!g.s.traitorRoll.tied); assert(g.s.report.text.includes('总和最低：薇拉成为叛徒。'));
  assert(!/\n薇拉成为叛徒。/.test(g.s.report.text), 'ritual report does not repeat the verdict');
  // haunt check via end of turn: the report keeps the haunt roll first, then the sanity rolls
  g = new Game({ scenario: 'ritual', count: 4, seed: 'S1T-HC' }); g.s.drawnOmen = true; g.s.omen = 13; g.invoke('endTurn');
  assert.notEqual(g.s.phase, 'explore'); assert.equal(g.s.report.rolls[0].label, '作祟检定'); assert.equal(g.s.report.rolls.length, 1 + 4);
  // legacy rule is still available; seals never rolls
  const snap = snapshot(); try { configs.ritual.traitorRule = 'lowest'; g = new Game({ scenario: 'ritual', quick: true, count: 4, seed: 'S1T-TR' });
    assert.equal(g.s.traitorRoll, undefined); const low = g.s.players.reduce((x, y) => g.val(x, 3) <= g.val(y, 3) ? x : y); assert.equal(g.s.traitor, low.id); } finally { restore(snap); }
  g = new Game({ scenario: 'seals', quick: true, count: 4, seed: 'S1T-TR' }); assert.equal(g.s.traitorRoll, undefined); assert.equal(g.s.traitor, null);
});

test('hero AI does not attack a stronger traitor in the burial phase', () => {
  const setup = (heroMight, traitorMight) => {
    const g = new Game({ scenario: 'ritual', quick: true, count: 4, humanCount: 1, seed: 'S1T-AI' }); g.s.players.forEach(p => p.controller = 'ai');
    const hero = g.s.players.find(p => p.team === 'hero'), t = g.s.players[g.s.traitor]; g.s.active = hero.id; g.summon('hero'); g.turnStart();
    for (const [p, m] of [[hero, heroMight], [t, traitorMight]]) { p.tracks = JSON.parse(JSON.stringify(p.tracks)); p.tracks[0][p.idx[0]] = m; p.items = []; }
    t.room = hero.room; g.s.corpseRoom = g.s.rooms.find(r => r.id !== hero.room).id; g.s.taskUsed = true; g.s.moves = 0; return { g, hero, t };
  };
  let { g, t } = setup(3, 5); const idx = [...t.idx]; g.aiStep(); assert.equal(g.s.attackUsed, false); assert.deepEqual(t.idx, idx);
  ({ g } = setup(5, 5)); g.aiStep(); assert.equal(g.s.attackUsed, true, 'equal might still attacks');
  ({ g } = setup(3, 5)); const h = g.p; h.items = [{ id: 'axe', name: '旧斧', type: 'weapon' }]; g.aiStep(); assert.equal(g.s.attackUsed, true, 'axe counts');
});

test('player-facing text follows the frozen / configured values (ritual 3–6, rescue deadline, seal count)', () => {
  for (const n of COUNTS) {
    const g = new Game({ scenario: 'ritual', quick: true, count: n, humanCount: n, seed: 'S1T-TXT-' + n }), G = g.s.ritualGoals, rep = g.s.report.text;
    assert(G.hero === G.traitor ? rep.includes(`先达到 ${G.hero} 点`) : rep.includes(`英雄累计 ${G.hero} 点`) && rep.includes(`叛徒累计 ${G.traitor} 点（成功 1 次）`), rep);
    g.s.active = heroOf(g).id; g.turnStart();
    assert(Intel.situation(g).goal.includes(`先获得 ${G.hero} 点`)); assert(Intel.situation(g).risk.includes(`叛徒只需 ${G.traitor} 点`));
    assert(Guide.next(g).text.includes(`英雄先到 ${G.hero} 点、叛徒先到 ${G.traitor} 点`), Guide.next(g).text);
    fixRoll(g, [9]); g.invoke('task', [2]); const aw = g.s.awareness.at(-1).lines.map(l => l.text).join('|');
    assert(aw.includes(`英雄仪式 0 → 1 / ${G.hero}`), aw);
    assert(g.s.logs.at(-1).msg.includes(`/${G.hero}`) || g.s.logs.some(l => l.msg.includes(`英雄仪式进度 1/${G.hero}`)));
    const b = new Game({}, JSON.parse(JSON.stringify(g.s))); b.s.active = heroOf(b).id; b.summon('hero');
    assert(b.s.report.text.includes(`${G.burialRounds} 个完整轮次`)); assert(Intel.situation(b).next.includes(`尚余 ${G.burialRounds} 轮`));
    const c = new Game({}, JSON.parse(JSON.stringify(g.s))); c.s.active = heroOf(c).id; c.summon('traitor');
    assert(c.s.report.text.includes(`累计 ${G.dispel} 次获胜`) && c.s.report.text.includes('5 骰防御'), c.s.report.text);
    assert(Intel.situation(c).goal.includes(`驱散幽灵 ${G.dispel} 次`)); assert(Guide.next(c).text.includes(`0/${G.dispel} 次`));
    // no stale literal "/3" in any ritual surface when the target is not 3
    if (G.hero !== 3) for (const t of [rep, JSON.stringify(Intel.situation(g)), Guide.next(g).text, aw]) assert(!/\/ ?3(?![0-9])/.test(t.replace(/3–6/g, '')), t);
    const r = new Game({ scenario: 'rescue', quick: true, count: n, humanCount: n, seed: 'S1T-TXT-' + n });
    assert(r.s.logs.some(l => l.msg.includes(`限时 ${Rescue.roundsFor(n)} 个完整轮次`)));
    const s = new Game({ scenario: 'seals', quick: true, count: n, humanCount: n, seed: 'S1T-TXT-' + n });
    assert(s.s.report.text.includes(`地图上有 ${s.s.seals.nodes.length} 处封印`) && s.s.report.text.includes(`时限 ${s.s.countdown} 轮`) && s.s.report.text.includes('受到 2 点侵蚀') && s.s.report.text.includes('总和 ≥ 5'));
    s.p.room = s.s.seals.nodes[0].room; assert(Intel.checks(s)[0].condition.includes('≥ 5'));
  }
  // rescue traitor advice + help page (rendered in a minimal host like tests/ui-markup.cjs)
  const r = new Game({ scenario: 'rescue', quick: true, count: 4, humanCount: 4, seed: 'S1T-ADV' }), v = r.s.players[r.s.rescue.victim]; r.s.active = r.s.traitor; r.turnStart(); r.p.room = v.room; r.s.rescue.eggs = true;
  const other = r.s.players.find(p => p.team === 'hero' && p.id !== v.id); other.room = v.room;
  assert.deepEqual([Rescue.advice(r).action, Rescue.advice(r).focus], ['attack:' + other.id, '受困者获救（破网并处理蜘蛛卵）前不会被攻击。']);
  const app = { innerHTML: '', className: '', querySelector: () => null, querySelectorAll: () => [] };
  const modal = { innerHTML: '', dataset: {}, open: false, showModal() { this.open = true }, close() { this.open = false }, querySelector: () => null, addEventListener() {} };
  const ctx = { document: { querySelector: q => q === '#app' ? app : q === '#modal' ? modal : null, querySelectorAll: () => [], addEventListener() {} }, localStorage: { getItem: () => null, setItem() {} }, clearTimeout() {}, setTimeout() {}, requestAnimationFrame() {}, matchMedia: () => ({ matches: true }) }; ctx.window = ctx; ctx.addEventListener = () => {}; vm.createContext(ctx);
  for (const f of ['scenarios.js', 'rooms.js', 'engine.js', 'tactics.js', 'equipment.js', 'seals.js', 'awareness.js', 'guide.js', 'intel.js', 'board.js', 'audio.js', 'playlog.js', 'app.js', 'shell.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', f), 'utf8'), ctx, { filename: f });
  const help = vm.runInContext('help();modal.innerHTML', ctx).replace(/<[^>]+>/g, '');
  for (const want of ['作祟时每人掷理智骰，总和最低者成为叛徒', '英雄先到 3/5/6/8 点、叛徒先到 2 点', '知识 ≥ 6 找遗骸', '5/4/3/2 轮内安葬', '幽灵 5 骰', '驱散 2/3/4/5 次', '依次对应 3、4、5、6 人', '3–5 处可达封印', '（≥5）', '受到 2 点', '4＋人数轮', '蛛网 5 骰', '获救（破网并处理蜘蛛卵）前不会被敌人攻击', '16/13/10/7 个完整轮次（3–6 人；人越多时限越短）'])
    assert(help.includes(want), 'help page: ' + want);
  for (const stale of ['最低理智者成为叛徒', '先到 3 点控制幽灵', '6 轮内安葬', '驱散 3 次获胜', '2–4 处', '8＋人数', '随人数增加', '卵处理前受困者']) assert(!help.includes(stale), 'stale help text: ' + stale);
  const brief = vm.runInContext("game=new Game({scenario:'rescue',quick:true,count:4,humanCount:4,seed:'S1T'});game.s.active=game.s.traitor;brief();modal.innerHTML", ctx);
  assert(brief.includes('获救（破网并处理蜘蛛卵）前不会被攻击') && brief.includes('理智检定（总和最低者成为叛徒）'), brief);
});

test('old saves: pre-tuning ritual saves keep 3/3/6/3 and finish; rescue/seals saves finish', () => {
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 's1-prefix-saves.json'), 'utf8'));
  for (const x of fx.saves) {
    assert.equal(x.state.ritualGoals, undefined);
    const g = new Game({}, JSON.parse(JSON.stringify(x.state)));
    if (x.scenario === 'ritual') { assert.deepEqual({ ...g.s.ritualGoals, legacy: undefined }, { ...Ritual.LEGACY, legacy: undefined }); assert.equal(g.s.countdown, x.state.countdown); }
    g.s.players.forEach(p => p.controller = 'ai');
    for (let k = 0; k < 6000 && !g.s.result; k++) { g.s.report = null; g.invoke('aiStep'); }
    assert(g.s.result, `${x.seed} (${x.scenario}) finishes`);
  }
  // An old save still in the ritual race: targets stay 3 for both sides.
  const cur = new Game({ scenario: 'ritual', quick: true, count: 6, humanCount: 6, seed: 'S1T-OLD' }); const old = JSON.parse(JSON.stringify(cur.s)); delete old.ritualGoals; delete old.traitorRoll;
  const g = new Game({}, old); assert.deepEqual([g.s.ritualGoals.hero, g.s.ritualGoals.traitor, g.s.ritualGoals.burialRounds, g.s.ritualGoals.dispel], [3, 3, 6, 3]);
  g.s.active = g.s.traitor; g.turnStart(); fixRoll(g, [9]); assert(g.task(3)); assert.equal(g.s.phase, 'ritual', 'old save: +2 is not enough for the old target 3');
  assert(Intel.situation(g).goal.includes('先获得 3 点'));
  // explore-phase saves are rescaled at their (future) haunt
  const e = new Game({ scenario: 'ritual', count: 6, seed: 'S1T-OLD2' }), es = JSON.parse(JSON.stringify(e.s)); const f = new Game({}, es); assert.equal(f.s.ritualGoals, undefined); f.startHaunt(); assert.equal(f.s.ritualGoals.hero, 8);
});

test('legacy/neutral settings reproduce the S1-ENG-01 build exactly (48 full AI games: behaviour, RNG, text)', () => {
  const gold = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 's1-eng01-golden.json'), 'utf8')).games;
  const snap = snapshot();
  try {
    const now = trace(path.join(__dirname, '..', 'dist'), () => { for (const k of Object.keys(LEGACY)) Object.assign(configs[k], LEGACY[k]); });
    assert.equal(now.length, gold.length);
    now.forEach((g, i) => { assert.equal(g.seed, gold[i].seed); assert.deepEqual(g.result, gold[i].result, g.seed); assert.equal(g.rng, gold[i].rng, g.seed + ' rng'); assert.equal(g.hash, gold[i].hash, g.seed + ' text/log hash'); });
  } finally { restore(snap); }
});
