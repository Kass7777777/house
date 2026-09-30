const assert=require('node:assert/strict');
const {Game}=require('../dist/engine.js');const {configs,validate}=require('../dist/scenarios.js');const Guide=require('../dist/guide.js');
const copy=g=>JSON.parse(JSON.stringify(g.s));
function make(count=4){return new Game({scenario:'rescue',quick:true,count,humanCount:count,seed:'RESCUE-TEST'});}
function fakeRoll(g,values){g.roll=(n,label)=>{const total=values.shift();assert.notEqual(total,undefined);g.s.dice=[total];g.s.lastRoll={label,total,dice:[total],round:g.s.round,playerId:g.s.active,serial:(g.s.lastRoll?.serial||0)+1};return total;};}
assert(validate(configs.rescue));assert.throws(()=>validate({id:'bad',title:'bad',objectives:[{id:'a',requires:['b']}]}));
let g=make(),r=g.s.rescue,v=g.s.players[r.victim];g.s.active=v.id;g.turnStart();const location=v.room;
assert(v.restrained);assert(!g.moveRoom(g.neighbors(v.room)[0].id));assert(!g.move(0));assert.equal(v.room,location);
let tracks=[...v.idx];fakeRoll(g,[1,4]);assert(g.rescueAction('web'));assert.equal(r.web,0);assert.deepEqual(v.idx,tracks);assert(!g.rescueAction('web'));
for(let i=0;i<r.webGoal;i++){g.s.attackUsed=false;fakeRoll(g,[5,4]);assert(g.rescueAction('web'));}assert(!v.restrained);assert.equal(r.web,r.webGoal);
assert(!g.rescueActions().find(a=>a.id==='door-might').available);g.s.taskUsed=false;v.room=r.kitRoom;assert(g.rescueAction('kit'));assert.equal(r.kitHolder,v.id);
// Victim location is used for medicine, including after they can move.
g.s.taskUsed=false;fakeRoll(g,[3]);assert(g.rescueAction('eggs'));assert(!r.eggs);assert.equal(r.kitHolder,v.id);g.s.taskUsed=false;fakeRoll(g,[4]);assert(g.rescueAction('eggs'));assert(r.eggs);assert.equal(r.kitHolder,null);
v.room='0:0:0';g.s.taskUsed=false;fakeRoll(g,[6]);assert(g.rescueAction('door-knowledge'));assert(r.door);assert(!g.rescueAction('escape'));assert(!g.moveRoom('0:0:-1'));g.s.round++;g.turnStart();assert(g.rescueAction('escape'));assert.equal(g.s.result.team,'hero');
// Medicine handoff cannot duplicate supplies or cross rooms.
g=make();r=g.s.rescue;const receiver=g.s.players.find(p=>p.team==='hero'&&p.id!==g.p.id);r.kitHolder=g.p.id;receiver.room=g.p.room;assert(g.handoffKit(receiver.id));assert.equal(r.kitHolder,receiver.id);assert(g.s.taskUsed);assert(!g.handoffKit(receiver.id));
// Protected victim, drop/recover supplies, death failure, and six player setup.
g=make(6);r=g.s.rescue;assert.equal(r.webGoal,6);assert.equal(r.remaining,Math.max(1,configs.rescue.rounds+3*configs.rescue.roundsPerPlayer));g.s.active=g.s.traitor;g.p.room=g.s.players[r.victim].room;assert(!g.attack(r.victim));
g=make();r=g.s.rescue;const helper=g.s.players.find(p=>p.team==='hero'&&p.id!==r.victim);r.kitHolder=helper.id;helper.idx[0]=0;g.change(helper,0,-1);assert.equal(r.kitHolder,null);assert.equal(r.kitRoom,helper.room);assert(!g.s.result);
g=make();r=g.s.rescue;r.spider.stunned=true;const start=r.remaining;g.roundEnd();assert.equal(r.remaining,start);for(let i=0;i<start;i++){r.spider.stunned=true;g.roundEnd();}assert.equal(g.s.result.team,'traitor');
g=make();r=g.s.rescue;g.s.players[r.victim].idx[0]=0;g.change(g.s.players[r.victim],0,-1);assert.equal(g.s.result.team,'traitor');
// Save restoration preserves the chosen scenario and deterministic AI decisions.
g=make();g.s.players.forEach(p=>p.controller='ai');g.s.report=null;const restored=new Game({},copy(g));for(let i=0;i<35;i++){g.aiStep();restored.aiStep();}assert.deepEqual(copy(g),copy(restored));assert(Guide.next(make()).action.startsWith('rescue:'));
// All-AI uses the same operations as manual play, for both entry points and sizes.
let outcomes={hero:0,traitor:0};for(const quick of [true,false])for(const count of [3,4,5,6])for(let seed=0;seed<5;seed++){
 const x=new Game({scenario:'rescue',quick,count,humanCount:1,seed:`RESCUE-${quick}-${count}-${seed}`});x.s.players.forEach(p=>p.controller='ai');let steps=0;
 while(!x.s.result&&steps++<2500){x.s.report=null;x.aiStep();}
 assert(x.s.result,`did not finish ${quick}/${count}/${seed} phase ${x.s.phase}`);assert(x.s.rescue);assert(x.s.rescue.web<=x.s.rescue.webGoal);outcomes[x.s.result.team]++;
}
console.log('Rescue: objective dependencies, restraint, no web retaliation, medicine retry, delayed escape, protection, drops, timeout, death, deterministic resume and 40 full AI games passed.',outcomes);
