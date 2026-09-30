const assert=require('node:assert/strict');require('../dist/tactics.js');const {Game}=require('../dist/engine.js');
const clone=g=>new Game({},g.s);
for(let i=0;i<13;i++){let g=new Game({scenarioMode:'auto'});g.s.lastOmen={room:'礼拜堂',index:i,name:'test'};g.startHaunt();assert.equal(g.s.scenario,['rescue','seals','ritual'][i%3]);assert(g.s.report.text.includes('test'));}
let g=new Game({count:3,humanCount:3});g.draw('E');assert(g.s.eventChoice);assert.equal(g.endTurn(),false);assert.equal(g.move(1),false);assert(g.resolveEvent('leave'));assert.equal(g.s.eventChoice,null);
g=new Game({count:3,humanCount:3});g.draw('E');g.p.items.push({id:'supply',name:'补给',type:'heal'});assert(g.resolveEvent('spend'));assert(!g.p.items.some(i=>i.id==='supply'));
g=new Game({count:3,humanCount:3});g.draw('E');const t=g.s.eventChoice.trait;assert(g.resolveEvent('help'));assert.equal(g.s.players[1].idx[t],4);
// Force physical event failure using seeded, unmodified RNG and a zero-dice track.
g=new Game({seed:'allocation',count:3,humanCount:3});g.s.eventChoice={title:'test',trait:0,type:'physical',playerId:0};g.p.tracks=JSON.parse(JSON.stringify(g.p.tracks));g.p.tracks[0][3]=0;
const initial=clone(g);g.invoke('resolveEvent',['risk']);assert(g.s.pendingDecision);assert.equal(g.s.actions,initial.s.actions);assert.equal(g.s.rng,initial.s.rng);assert.equal(g.s.eventChoice.title,'test');assert(!g.allocateDamage(2));g.allocateDamage(0);g.allocateDamage(1);const restored=clone(g);assert(restored.confirmDamage());assert.equal(restored.p.idx[0],2);assert.equal(restored.p.idx[1],2);assert.equal(restored.s.actions,1);assert.equal(restored.s.timeline.filter(e=>e.title==='test').length,1);assert(!restored.s.pendingDecision);assert(!restored.s.eventChoice);
// Command completion, RNG and logs match an identical allocation without a reload.
g.confirmDamage();assert.deepEqual(restored.s,g.s);
// AI attacks / end-of-round damage must pause for the human victim and resume exactly once.
let found=false;
for(let seed=0;seed<60&&!found;seed++){g=new Game({seed:'enemy'+seed,quick:true,scenario:'rescue',humanCount:1});g.s.rescue.eggs=true;g.s.rescue.web=g.s.rescue.webGoal;g.s.rescue.spider.room=g.s.players[0].room;g.s.active=g.s.traitor;g.p.room=g.s.players[0].room;g.invoke('attack',['0']);if(!g.s.pendingDecision)continue;found=true;assert.equal(g.s.pendingDecision.damage.player.id,0);while(!g.damageReady())g.allocateDamage(g.s.pendingDecision.damage.traits.sort((a,b)=>g.s.pendingDecision.damage.player.idx[b]-g.s.pendingDecision.damage.player.idx[a])[0]);g.confirmDamage();assert(g.s.attackUsed);}
assert(found);
// Complete automatic-exploration sessions through the actual interactive command API.
let outcomes=new Set();for(let seed=0;seed<12;seed++){g=new Game({seed:'interactive'+seed,scenarioMode:'auto'});g.s.players.forEach(p=>p.controller='ai');for(let turn=0;turn<2500&&!g.s.result;turn++)g.invoke('aiStep');assert(g.s.result,'session stuck '+seed);assert(g.s.hauntSelection);outcomes.add(g.s.scenario);}assert.equal(outcomes.size,3);
console.log('Tactics: matrix, event choices, blocked pending actions, save/replay allocation, human damage during enemy actions, 12 automatic-selection full sessions passed.');
