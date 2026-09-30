// S1-ENG-03 · haunt rules are frozen into the save (s.hauntRules) when the haunt starts.
// Old saves (no hauntRules) finish under the pre-tuning values; new games are immune to later config changes;
// rule code and every text surface read the frozen values. Also covers the seals-phase guards in app.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
require('../dist/tactics.js'); require('../dist/equipment.js'); require('../dist/seals.js'); require('../dist/awareness.js');
const { Game } = require('../dist/engine.js');
const { configs, Rules, Rescue } = require('../dist/scenarios.js');
const Intel = require('../dist/intel.js');
const Guide = require('../dist/guide.js');
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 's1-prefix-saves.json'), 'utf8')).saves;
const load = x => { const g = new Game({}, JSON.parse(JSON.stringify(x.state))); delete g.s.eventChoice; delete g.s.pendingDecision; delete g.s.combatChoice; g.s.players.forEach(p => p.controller = 'human'); return g; };
const snapshot = () => JSON.parse(JSON.stringify({ ritual: configs.ritual, rescue: configs.rescue, seals: configs.seals }));
const restore = snap => { for (const k of Object.keys(snap)) Object.assign(configs[k], snap[k]); };
// Scripted dice that also record every pool size requested.
function script(g, values) { const asked = []; g.roll = (n, label) => { asked.push([label, n]); const v = values.length ? values.shift() : 0; g.s.dice = [v]; g.s.lastRoll = { serial: (g.s.lastRoll?.serial || 0) + 1, label, dice: [v], total: v, round: g.s.round, playerId: g.s.active }; return v; }; return asked; }
const act = (g, p) => { g.s.active = p.id; g.turnStart(); g.s.taskUsed = false; g.s.attackUsed = false; };
const hero = g => g.s.players.find(p => p.alive && p.team === 'hero' && !p.restrained) || g.s.players.find(p => p.alive && p.team === 'hero');
function host() {
  const app = { innerHTML: '', className: '', querySelector: () => null, querySelectorAll: () => [] };
  const modal = { innerHTML: '', dataset: {}, open: false, showModal() { this.open = true }, close() { this.open = false }, querySelector: () => null, addEventListener() {} };
  const ctx = { document: { querySelector: q => q === '#app' ? app : q === '#modal' ? modal : null, querySelectorAll: () => [], addEventListener() {} }, localStorage: { getItem: () => null, setItem() {} }, clearTimeout() {}, setTimeout() {}, requestAnimationFrame() {}, matchMedia: () => ({ matches: true }) }; ctx.window = ctx; ctx.addEventListener = () => {}; vm.createContext(ctx);
  for (const f of ['scenarios.js', 'rooms.js', 'engine.js', 'tactics.js', 'equipment.js', 'seals.js', 'awareness.js', 'guide.js', 'intel.js', 'board.js', 'audio.js', 'playlog.js', 'app.js', 'shell.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', f), 'utf8'), ctx, { filename: f });
  return { run: code => vm.runInContext(code, ctx), plain: html => String(html).replace(/<[^>]+>/g, '') };
}

test('old saves fall back to the legacy haunt rules (4/4/4/4/1 …) without consuming RNG', () => {
  assert(FX.length >= 12);
  for (const x of FX) {
    assert.equal(x.state.hauntRules, undefined);
    const g = new Game({}, JSON.parse(JSON.stringify(x.state)));
    assert.equal(g.s.rng, x.state.rng);
    assert.equal(g.s.hauntRules.scenario, x.scenario); assert.equal(g.s.hauntRules.legacy, true);
    for (const [k, v] of Object.entries(Rules.LEGACY[x.scenario])) assert.deepEqual(g.s.hauntRules[k], v, `${x.seed} ${k}`);
  }
  assert.deepEqual([Rules.LEGACY.ritual.corpseThreshold, Rules.LEGACY.ritual.ghostDefense, Rules.LEGACY.rescue.webDefense, Rules.LEGACY.seals.repairThreshold, Rules.LEGACY.seals.erosion], [4, 4, 4, 4, 1]);
  // an explore-phase old save is not frozen yet: it takes the current rules at its haunt
  const e = new Game({ scenario: 'ritual', count: 4, seed: 'S1F-EXP' }), st = JSON.parse(JSON.stringify(e.s)); const f = new Game({}, st);
  assert.equal(f.s.hauntRules, undefined); f.startHaunt(); assert.equal(f.s.hauntRules.legacy, undefined); assert.equal(f.s.hauntRules.corpseThreshold, configs.ritual.corpseThreshold);
});

test('old ritual saves: corpse search ≥ 4, ghost defence 4 dice, 3 dispels, and the text says so', () => {
  const saves = FX.filter(x => x.scenario === 'ritual'); assert(saves.length >= 4);
  for (const x of saves) {
    let g = load(x); assert.equal(g.s.phase, 'burial');
    const h = hero(g); act(g, h); g.s.carrier = null; h.room = g.s.corpseRoom;
    assert(Intel.checks(g).find(r => r.name === '寻找遗骸').condition.endsWith('≥ 4'));
    assert(Guide.next(g).text.includes('知识骰子总和 ≥ 4'), Guide.next(g).text);
    script(g, [4]); assert(g.task(2)); assert.equal(g.s.carrier, h.id, 'a 4 finds the remains under the old rule (new rule needs 6)');
    assert(g.s.actionFeedback.text.includes('目标 ≥ 4'));
    g = load(x); act(g, hero(g)); g.summon('traitor');
    assert(g.s.report.text.includes('胜过幽灵的 4 骰防御') && g.s.report.text.includes('累计 3 次获胜'), g.s.report.text);
    assert(Intel.checks(g).find(r => r.name === '驱散幽灵').condition.includes('幽灵 4 骰'));
    assert(Guide.next(g).text.includes('幽灵 4 颗骰子'), Guide.next(g).text);
    g.s.ghost.room = g.p.room; const asked = script(g, [9, 0]); assert(g.attack('ghost'));
    assert.deepEqual(asked.find(a => a[0] === '幽灵抵抗'), ['幽灵抵抗', 4]);
  }
});

test('old rescue saves: web defence 4, legacy protection window (eggs only), and the text says so', () => {
  const saves = FX.filter(x => x.scenario === 'rescue'); assert(saves.length >= 4);
  for (const x of saves) {
    let g = load(x), r = g.s.rescue, v = g.s.players[r.victim];
    const h = hero(g); act(g, h); h.room = v.room; r.web = 0; // keep the saved eggs/kit state consistent
    assert(g.rescueActions().find(a => a.id === 'web').detail.includes('力量对抗 4 颗骰子'));
    const checks = Intel.checks(g).map(c => c.condition).join('|'); assert(checks.includes('蛛网 4 骰') && checks.includes('≥ 6'), checks);
    const asked = script(g, [0, 0]); assert(g.rescueAction('web')); assert.deepEqual(asked.find(a => a[0] === '蛛网抵抗'), ['蛛网抵抗', 4]);
    // legacy window: attackable once eggs are handled, web still intact
    g = load(x); r = g.s.rescue; v = g.s.players[r.victim]; const t = g.s.players[g.s.traitor];
    r.eggs = true; r.web = 0; act(g, t); t.room = v.room; assert.equal(Rescue.enemyAllowed(g, v), true); script(g, [0, 0]); assert.equal(g.invoke('attack', [v.id]), true);
    g = load(x); act(g, g.s.players[g.s.traitor]); g.s.rescue.eggs = true;
    const adv = g.s.players.find(p => p.team === 'hero' && p.alive && p.id !== g.s.rescue.victim); if (adv) { adv.room = g.p.room; assert.equal(Rescue.advice(g).focus, '蜘蛛卵处理前，受困者不能被攻击。'); }
  }
});

test('old seals saves: repair ≥ 4, erosion 1, and the text says so', () => {
  const saves = FX.filter(x => x.scenario === 'seals'); assert(saves.length >= 4);
  for (const x of saves) {
    let g = load(x); const n = g.s.seals.nodes.find(k => k.progress < k.goal); assert(n, x.seed);
    const p = g.s.players.find(q => q.alive); act(g, p); p.room = n.room;
    assert(g.sealActions()[0].detail.startsWith('总和 ≥ 4'), g.sealActions()[0].detail); assert(Intel.checks(g)[0].condition.endsWith('≥ 4'));
    const before = n.progress; script(g, [4]); assert(g.sealAction('repair')); assert.equal(n.progress, before + 1, '4 repairs under the old rule (new rule needs 5)');
    g = load(x); g.s.active = g.order().at(-1).id; g.s.round = g.s.seals.startedRound + 1;
    assert(Intel.endTurn(g).join('').includes('受到 1 点'), Intel.endTurn(g).join(''));
    const safe = new Set(g.s.seals.nodes.filter(k => k.progress >= k.goal).map(k => k.room)), idx = g.s.players.map(q => q.idx.reduce((a, b) => a + b, 0));
    g.roundEnd();
    g.s.players.forEach((q, i) => { if (x.state.players[i].alive) assert.equal(idx[i] - q.idx.reduce((a, b) => a + b, 0), safe.has(q.room) ? 0 : 1, `${x.seed} ${q.name}`); });
  }
});

test('old saves render the old values in the app (help, briefing, objective panels) and all finish', () => {
  const H = host();
  const want = {
    ritual: { yes: ['最低理智者成为叛徒', '先到 3 点控制幽灵', '知识 ≥ 4 找遗骸', '6 轮内安葬', '幽灵 4 骰', '驱散 3 次获胜', '搜索需知识 ≥ 4'], no: ['掷理智骰', '3/5/6/8', '≥ 6 找遗骸'] },
    rescue: { yes: ['蛛网 4 骰', '卵处理前受困者不可被敌人攻击', '12–15 个完整轮次（随人数增加）', '破网用力量对抗 4 骰'], no: ['16/13/10/7', '蛛网 5 骰', '获救（破网并处理蜘蛛卵）前不会被敌人攻击'] },
    seals: { yes: ['2–4 处可达封印', '（≥4）', '受到 1 点', '8＋人数轮', '总和 ≥ 4；尚需'], no: ['3–5 处', '（≥5）', '4＋人数轮', '总和 ≥ 5'] },
  };
  for (const x of FX.filter(x => x.hit !== 'none')) {
    H.run(`game=new Game({},${JSON.stringify(x.state)});`);
    const text = H.plain(H.run('help();modal.innerHTML') + H.run('objectiveDetailPanel()') + H.run('priorObjectivePanel()'));
    for (const w of want[x.scenario].yes) assert(text.includes(w), `${x.seed} (${x.scenario}) should show: ${w}`);
    for (const w of want[x.scenario].no) assert(!text.includes(w), `${x.seed} (${x.scenario}) should not show: ${w}`);
  }
  for (const x of FX) { const g = new Game({}, JSON.parse(JSON.stringify(x.state))); g.s.players.forEach(p => p.controller = 'ai'); for (let k = 0; k < 6000 && !g.s.result; k++) { g.s.report = null; g.invoke('aiStep'); } assert(g.s.result, x.seed + ' finishes'); }
});

test('new games freeze the current config at the haunt; changing config mid-game (or across a reload) changes nothing', () => {
  const snap = snapshot();
  try {
    for (const scenario of ['ritual', 'rescue', 'seals']) for (const quick of [true, false]) {
      const g = new Game({ scenario, scenarioMode: 'fixed', count: 4, quick, humanCount: 1, seed: 'S1F-NEW-' + scenario }); g.s.players.forEach(p => p.controller = 'ai');
      for (let k = 0; k < 4000 && g.s.phase === 'explore'; k++) { g.s.report = null; g.invoke('aiStep'); }
      assert.deepEqual(g.s.hauntRules, Rules.freeze(scenario), scenario + ' frozen = config');
    }
    // ritual: corpse threshold and ghost defence stay at their frozen values
    let g = new Game({ scenario: 'ritual', quick: true, count: 4, humanCount: 4, seed: 'S1F-MID' }); const frozen = { ...g.s.hauntRules };
    Object.assign(configs.ritual, { corpseThreshold: 2, ghostDefense: 1, threshold: 1, aiCautious: false });
    g = new Game({}, JSON.parse(JSON.stringify(g.s)));
    act(g, hero(g)); g.summon('hero'); assert(g.s.report.text.includes(`知识 ≥ ${frozen.corpseThreshold}`));
    g.p.room = g.s.corpseRoom; script(g, [frozen.corpseThreshold - 1]); assert(g.task(2)); assert.equal(g.s.carrier, null);
    assert(Intel.checks(g).find(r => r.name === '寻找遗骸').condition.endsWith(`≥ ${frozen.corpseThreshold}`));
    g = new Game({ scenario: 'ritual', quick: true, count: 4, humanCount: 4, seed: 'S1F-MID' }); // fresh game picks up the new config
    assert.equal(g.s.hauntRules.corpseThreshold, 2); restore(snap);
    g = new Game({ scenario: 'ritual', quick: true, count: 4, humanCount: 4, seed: 'S1F-MID' }); configs.ritual.ghostDefense = 1; act(g, hero(g)); g.summon('traitor');
    g.s.ghost.room = g.p.room; let asked = script(g, [9, 0]); assert(g.attack('ghost')); assert.deepEqual(asked.find(a => a[0] === '幽灵抵抗'), ['幽灵抵抗', frozen.ghostDefense]);
    assert(Intel.checks(g).find(r => r.name === '驱散幽灵').condition.includes(`幽灵 ${frozen.ghostDefense} 骰`)); restore(snap);
    // rescue: web defence and protection window
    g = new Game({ scenario: 'rescue', quick: true, count: 4, humanCount: 4, seed: 'S1F-MID' }); Object.assign(configs.rescue, { webDefense: 1, protectUntil: 'eggs', doorThreshold: 1 });
    const r = g.s.rescue, v = g.s.players[r.victim], h = hero(g); act(g, h); h.room = v.room;
    asked = script(g, [0, 0]); assert(g.rescueAction('web')); assert.deepEqual(asked.find(a => a[0] === '蛛网抵抗'), ['蛛网抵抗', snap.rescue.webDefense]);
    assert(Intel.checks(g).map(c => c.condition).join('|').includes(`蛛网 ${snap.rescue.webDefense} 骰`));
    r.eggs = true; assert.equal(Rescue.enemyAllowed(g, v), false, 'still protected until freed'); restore(snap);
    // seals: repair threshold and erosion
    g = new Game({ scenario: 'seals', quick: true, count: 4, humanCount: 4, seed: 'S1F-MID' }); Object.assign(configs.seals, { repairThreshold: 1, erosion: 5 });
    g = new Game({}, JSON.parse(JSON.stringify(g.s)));
    const node = g.s.seals.nodes[0]; g.p.room = node.room; script(g, [snap.seals.repairThreshold - 1]); assert(g.sealAction('repair')); assert.equal(node.progress, 0);
    assert(g.sealActions()[0].detail.includes(`≥ ${snap.seals.repairThreshold}`));
    g.s.players.forEach(p => p.controller = 'ai'); g.s.round = g.s.seals.startedRound + 1; const idx = g.s.players.map(q => q.idx.reduce((a, b) => a + b, 0)); const safe = new Set(g.s.seals.nodes.filter(k => k.progress >= k.goal).map(k => k.room));
    g.roundEnd(); g.s.players.forEach((q, i) => assert.equal(idx[i] - q.idx.reduce((a, b) => a + b, 0), safe.has(q.room) ? 0 : snap.seals.erosion));
  } finally { restore(snap); }
});

test('app: seals-phase objective panels no longer throw', () => {
  const H = host();
  H.run("game=new Game({scenario:'seals',quick:true,count:4,humanCount:4,seed:'S1F-UI'});");
  for (const f of ['objectiveHTML()', 'priorObjectivePanel()', 'objectiveDetailPanel()']) { const html = H.run(f); assert(H.plain(html).includes('封印'), f); assert(!html.includes('undefined'), f); }
});

test('S1-ENG-04 copy: traitor verdict in report/log/briefing (C-01); ritual briefing states the successes needed (C-02)', () => {
  // C-01 — rescue 6p tie from the QA sign-off (米娅 2、奥斯卡 2)
  const verdict = '米娅、奥斯卡并列最低（2），当前理智也相同，按座位顺序，由米娅成为叛徒。';
  const g = new Game({ scenario: 'rescue', quick: true, count: 6, humanCount: 6, seed: 'COPY-rescue6' });
  assert.equal(g.s.players[g.s.traitor].name, '米娅');
  assert(g.s.report.text.split('\n')[0].endsWith(verdict), g.s.report.text);
  assert(g.s.logs.some(l => l.msg.includes('成为叛徒') && l.msg.endsWith(verdict)));
  const H = host();
  H.run("game=new Game({scenario:'rescue',quick:true,count:6,humanCount:6,seed:'COPY-rescue6'});game.s.active=game.s.traitor;");
  assert(H.plain(H.run('brief();modal.innerHTML')).includes(verdict));
  // ritual: single lowest → '总和最低：X成为叛徒。', not repeated in the next line
  const r = new Game({ scenario: 'ritual', quick: true, count: 4, humanCount: 4, seed: 'S1T-TXT-4' }), name = r.s.players[r.s.traitor].name;
  assert(r.s.report.text.includes(`总和最低：${name}成为叛徒。`) || r.s.report.text.includes(`由${name}成为叛徒。`), r.s.report.text);
  assert(!r.s.report.text.split('\n')[1].startsWith(name + '成为叛徒'));
  // C-02 — new games: traitor needs 1 success; heroes need G.hero successes
  for (const n of [3, 4, 5, 6]) {
    H.run(`game=new Game({scenario:'ritual',quick:true,count:${n},humanCount:${n},seed:'S1F-BRIEF-${n}'});game.s.active=game.s.traitor;`);
    const G = H.run('game.s.ritualGoals'), t = H.plain(H.run('brief();modal.innerHTML'));
    assert(t.includes(`累计 ${G.traitor} 点即召唤幽灵——成功 1 次即可`), t);
    H.run("game.s.active=game.s.players.find(p=>p.team==='hero').id;");
    assert(H.plain(H.run('brief();modal.innerHTML')).includes(`英雄累计 ${G.hero} 点，需成功 ${G.hero} 次`));
  }
  // old saves (frozen legacy 3/3, +1/+2): traitor needs 2 successes, heroes 3
  for (const x of FX.filter(x => x.scenario === 'ritual')) {
    H.run(`game=new Game({},${JSON.stringify(x.state)});game.s.active=game.s.traitor;`);
    assert(H.plain(H.run('brief();modal.innerHTML')).includes('累计 3 点即召唤幽灵——成功 2 次即可'), x.seed);
    H.run("game.s.active=game.s.players.find(p=>p.team==='hero'&&p.alive).id;");
    assert(H.plain(H.run('brief();modal.innerHTML')).includes('英雄累计 3 点，需成功 3 次'), x.seed);
  }
});
