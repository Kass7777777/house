const assert=require('node:assert/strict');const {events}=require('../dist/tactics.js');const {Game}=require('../dist/engine.js');
let g=new Game({seed:'deck18',count:3,humanCount:3}),seen=new Set();
for(let i=0;i<events.length;i++){g.draw('E');assert(!seen.has(g.s.eventChoice.title));seen.add(g.s.eventChoice.title);g.resolveEvent('leave');if(i===4)g=new Game({},g.s);}
assert.equal(seen.size,12);g.draw('E');assert(seen.has(g.s.eventChoice.title));
for(const event of events){
 g=new Game({count:3,humanCount:3});g.s.eventChoice={...event,playerId:0};g.rng=()=>.999;const before=[...g.p.idx];
 const option=event.alt===undefined?'risk':'alternate',t=event.alt??event.trait;assert(g.eventOptions().some(a=>a.id===option));assert(g.resolveEvent(option));assert(!g.s.eventChoice);assert(g.s.report.rolls.length===1);
 const reward=event.reward||'both';if(reward==='item'||reward==='both')assert.equal(g.p.items.length,1);if(reward==='trait'||reward==='both')assert.equal(g.p.idx[t],before[t]+1);if(reward==='recover')assert.equal(g.p.idx[0],before[0]+2);
}
// Alternate failure survives save / human allocation with no duplicate outcome.
g=new Game({count:3,humanCount:3});g.s.eventChoice={...events[4],playerId:0};g.p.tracks=JSON.parse(JSON.stringify(g.p.tracks));g.p.tracks[0][3]=0;g.invoke('resolveEvent',['alternate']);assert(g.s.pendingDecision);g=new Game({},g.s);g.allocateDamage(1);g.confirmDamage();assert.equal(g.p.idx[1],2);assert.equal(g.s.timeline.filter(x=>x.title===events[4].title).length,1);
// Existing in-progress events without new fields retain their original rule.
g=new Game({count:3,humanCount:3});g.s.eventChoice={title:'legacy',trait:2,type:'mental',playerId:0};assert(g.eventOptions()[0].detail.includes('≥ 4'));assert(g.eventOptions()[0].detail.includes('2 点'));
// AI decision is deterministic and consumes no random state.
g.s.players[0].controller='ai';const before=JSON.stringify(g.s);g.eventPlan();assert.equal(JSON.stringify(g.s),before);
g.p.idx=[0,0,0,0];g.p.items.push({id:'supply',name:'补给',type:'heal'});assert.equal(g.eventPlan().id,'spend');
console.log('12-event nonrepeating saved deck, all reward families, alternate checks and damage replay, old event compatibility, AI risk decisions passed.');
