const assert=require('node:assert/strict');const {Game}=require('../dist/engine.js');const Rooms=require('../dist/rooms.js');
const copy=g=>JSON.parse(JSON.stringify(g.s));
let g=new Game({count:4,humanCount:4});const vault=g.room(1,0,0,'宝库','',[0,1,2,3]);g.s.rooms.push(vault);g.p.room=vault.id;
function roll(n){g.roll=(count,label)=>{g.s.dice=[n];g.s.lastRoll={label,dice:[n],total:n,round:g.s.round};return n;};}
roll(3);const items=g.s.itemDeck.length;assert(g.roomAction('vault'));assert(!vault.vaultOpened);assert(!g.roomAction('vault'));assert.equal(g.s.itemDeck.length,items);
g.turnStart();roll(4);assert(g.roomAction('vault'));assert(vault.vaultOpened);assert.equal(g.s.itemDeck.length,items-1);assert.equal(g.s.moves,0);g.turnStart();assert(!g.roomAction('vault'));assert(g.s.timeline.some(e=>e.title==='宝库已打开'));
// Coal chute works every time, not only on discovery.
const chute=g.room(2,0,0,'煤槽','E',[0,1,2,3]);g.s.rooms.push(chute);g.s.moves=10;assert(g.moveRoom(chute.id));assert.equal(g.p.room,'-1:0:0');g.p.room=vault.id;g.s.moves=10;assert(g.moveRoom(chute.id));assert.equal(g.p.room,'-1:0:0');
// Collapse first encounter and optional later jump are separate decisions.
const fall=g.room(1,1,1,'塌陷房间','',[0,1,2,3]);g.s.rooms.push(fall);g.p.room=fall.id;roll(2);Rooms.arrive(g,true);assert.equal(g.p.room,'0:0:0');assert.equal(g.s.report.rolls[0].total,2);g.p.room=fall.id;Rooms.arrive(g,false);assert.equal(g.p.room,fall.id);g.s.moves=0;assert(!g.roomAction('jump'));g.s.moves=1;assert(g.roomAction('jump'));assert.equal(g.s.moves,0);
// Medicine target selection and no consumption on illegal/maxed target.
g=new Game({count:4,humanCount:4});g.p.items.push({id:'heal-test',type:'heal',name:'测试急救包'});g.p.idx=[7,1,2,3];assert(!g.use('heal-test',0));assert(!g.use('heal-test',9));assert(g.use('heal-test',2));assert.deepEqual(g.p.idx,[7,1,4,3]);assert(!g.p.items.some(i=>i.id==='heal-test'));
const restored=new Game({},copy(g));assert.deepEqual(restored.s.stats,g.s.stats);assert.deepEqual(restored.s.timeline,g.s.timeline);
console.log('Room/session: vault retry and single reward, repeated chute, collapse/jump, targeted healing and saved recap passed.');
