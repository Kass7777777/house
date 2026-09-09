const assert=require('node:assert/strict');
const {Game}=require('../dist/engine.js');
function burial(){const g=new Game({count:4,humanCount:4,quick:true});g.s.active=g.s.players.find(p=>p.team==='hero').id;g.turnStart();g.summon('hero');g.s.taskUsed=false;return g;}
let g=burial();g.p.controller='ai';g.s.carrier=g.p.id;g.s.players[g.s.traitor].room=g.p.room;g.s.moves=10;
const route=g.path(g.p.room,g.s.burialRoom);assert(route.length>1);g.aiStep();assert.equal(g.p.room,route[1]);assert.equal(g.s.attackUsed,false);
g=burial();const carrier=g.p;g.s.carrier=carrier.id;carrier.idx[0]=0;g.change(carrier,0,-1);assert.equal(g.s.carrier,null);assert.equal(g.s.corpseRoom,carrier.room);assert.equal(carrier.alive,false);
g=burial();g.roundEnd();assert.equal(g.s.countdown,6);for(let i=0;i<5;i++)g.roundEnd();assert.equal(g.s.countdown,1);assert.equal(g.s.result,null);g.roundEnd();assert.equal(g.s.result.team,'traitor');assert.equal(g.s.round,g.s.result.round);
console.log('Carrier prioritizes delivery; death drops remains; six full rounds expire exactly and terminal round remains stable.');
