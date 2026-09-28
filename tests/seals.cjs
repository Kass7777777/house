const assert=require('node:assert/strict');require('../dist/tactics.js');require('../dist/equipment.js');require('../dist/seals.js');const {Game}=require('../dist/engine.js');
let g=new Game({quick:true,scenario:'seals',count:4,humanCount:4});assert.equal(g.s.phase,'seals');assert(g.s.players.every(p=>p.team==='hero'));assert.equal(g.s.traitor,null);assert(g.s.seals.nodes.every(n=>g.path('0:0:0',n.room).length));
let before=g.s.countdown;g.s.active=g.order().at(-1).id;g.invoke('endTurn');assert(!g.s.pendingDecision);assert.equal(g.s.countdown,before);
// Repair uses one task even on failure, and does not silently win on final node.
let n=g.s.seals.nodes[0];g.p.room=n.room;const originalRoll=g.roll;g.roll=()=>0;assert(g.invoke('sealAction',['repair']));assert.equal(n.progress,0);assert(!g.invoke('sealAction',['repair']));g.roll=originalRoll;
// Atomic whole-round damage, including save between every person's allocation.
g=new Game({quick:true,scenario:'seals',count:4,humanCount:4});g.s.round++;g.s.active=g.order().at(-1).id;g.s.seals.nodes[0].progress=2;g.s.players[0].room=g.s.seals.nodes[0].room;const tracks=g.s.players.map(p=>[...p.idx]),round=g.s.round,time=g.s.countdown;g.invoke('endTurn');assert(g.s.pendingDecision);let choices=0;
while(g.s.pendingDecision){g=new Game({},g.s);assert(g.allocateDamage(2));g.confirmDamage();choices++;assert(choices<=3);}
assert.equal(choices,3);assert.deepEqual(g.s.players[0].idx,tracks[0]);for(const p of g.s.players.slice(1))assert.equal(p.idx[2],tracks[p.id][2]-1);assert.equal(g.s.round,round+1);assert.equal(g.s.countdown,time-1);
// Completion requires explicit exit at entrance, survives save; no auto win.
g.s.seals.nodes.forEach(n=>n.progress=2);g.p.room=g.s.seals.nodes[0].room;assert(!g.sealAction('exit'));assert(!g.s.result);g=new Game({},g.s);g.p.room='0:0:0';assert(g.invoke('sealAction',['exit']));assert.equal(g.s.result.team,'hero');
// Both failure modes use house, never a fabricated traitor.
g=new Game({quick:true,scenario:'seals'});g.s.round++;g.s.seals.remaining=1;g.s.players.forEach(p=>p.controller='ai');g.roundEnd();assert.equal(g.s.result.team,'house');
g=new Game({quick:true,scenario:'seals'});for(const p of g.s.players)g.change(p,0,-10);assert.equal(g.s.result.team,'house');
// Real exploration and all party sizes with deterministic restored state.
for(const count of [3,4,5,6])for(const quick of [false,true]){g=new Game({scenario:'seals',count,quick,seed:'cooperative-'+count+quick});g.s.players.forEach(p=>p.controller='ai');for(let step=0;step<2200&&!g.s.result;step++){g.invoke('aiStep');if(step===25)g=new Game({},g.s);}assert(g.s.result);assert(g.s.seals);assert(g.s.players.every(p=>p.team==='hero'));}
console.log('Cooperative scenario: reachable objectives, task costs, safe rooms, multi-player atomic damage/reload, explicit exit, both loss modes, 3–6-player full games passed.');
