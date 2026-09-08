const assert = require('node:assert/strict');
const {Game, CAST} = require('../dist/engine.js');

// Every supported team size and manual-count combination keeps a unique cast.
for (let count = 3; count <= 6; count++) {
  for (let humanCount = 1; humanCount <= count; humanCount++) {
    const roster = [3, 5, 1, 0, 4, 2].slice(0, count);
    const g = new Game({count, humanCount, roster});
    assert.deepEqual(g.s.players.map(p => p.castId), roster);
    assert.equal(g.s.players.filter(p => !g.isAI(p)).length, humanCount);
    g.s.players.forEach(p => assert.deepEqual(p.tracks, CAST[p.castId][3]));
    const owners = g.s.players.map(p => p.controller);
    const before = JSON.stringify(g.s);
    assert.equal(g.aiStep(), false); // AI never drives a manual turn.
    assert.equal(JSON.stringify(g.s), before);
    g.startHaunt();
    assert.deepEqual(g.s.players.map(p => p.controller), owners);
    const restore = new Game({}, g.s);
    assert.deepEqual(restore.s, g.s);
  }
}
assert.throws(() => new Game({count:3, roster:[0,0,1]}));

// A selected human can play the traitor rather than being replaced by AI.
const humanTraitor = new Game({count:4,humanCount:1,roster:[3,0,1,2],quick:true});
assert.equal(humanTraitor.s.players[0].team, 'traitor');
assert.equal(humanTraitor.isAI(humanTraitor.s.players[0]), false);
for (let i=0; i<200 && humanTraitor.s.active!==0; i++) {
  humanTraitor.aiStep();
}
assert.equal(humanTraitor.s.active, 0);
assert.equal(humanTraitor.isAI(), false);

// Old saves retain their previous party-control semantics.
for (const phase of ['explore','ritual']) {
  const g = new Game({mode:'solo', quick:phase==='ritual'});
  g.s.version = 1;
  for (const p of g.s.players) delete p.controller;
  const restored = new Game({},g.s);
  assert.equal(restored.s.version,2);
  if (phase==='explore') restored.startHaunt();
  assert.equal(restored.s.players.filter(p=>restored.isAI(p)).length,1);
  assert.equal(restored.s.players.find(p=>restored.isAI(p)).team,'traitor');
}

// Bounded full-game simulations exercise exploration, items, objectives and turns.
let completed=0, ghosts=0;
for (let count=3;count<=6;count++) for(let seed=0;seed<8;seed++) {
  const g=new Game({count,seed:'AI-'+seed,roster:[5,4,3,2,1,0].slice(0,count)});
  g.s.players.forEach(p=>p.controller='ai'); // Test harness, not an exposed zero-human mode.
  for(let step=0;step<2000&&!g.s.result;step++) {
    g.aiStep();
    g.s.report=null;
    if(step===12) {
      const restored = new Game({},g.s);
      g.aiStep();restored.aiStep();
      assert.deepEqual(restored.s,g.s); // Mid-AI-turn resume preserves RNG/decisions.
    }
  }
  assert(g.s.result,`AI stalled: ${count} players, seed ${seed}`);
  assert(g.s.rooms.length>4,'AI must discover rooms');
  assert(g.s.omen>0,'AI must draw cards and run haunt checks');
  assert(g.s.controller,'AI must resolve the ritual');
  if(g.s.controller==='traitor')ghosts++;
  completed++;
}
// Explicitly cover hostile-ghost objectives even when normal balance favors heroes.
const hostile = new Game({quick:true,count:4,seed:'hostile-ai'});
hostile.s.players.forEach(p=>p.controller='ai');
hostile.s.active=hostile.s.traitor;
hostile.summon('traitor');
hostile.s.active=0;hostile.turnStart();
for(let step=0;step<1200&&!hostile.s.result;step++) hostile.aiStep();
assert(hostile.s.result,'Hostile ghost game must finish');
console.log(`Passed ownership, role selection, human traitor, legacy migration and deterministic resume; ${completed} exploration games plus hostile-ghost scenario completed.`);
