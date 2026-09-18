const assert=require('node:assert/strict');const {Game}=require('../dist/engine.js');const I=require('../dist/intel.js');
for(const scenario of ['ritual','rescue']){
 const g=new Game({scenario,quick:true,count:4,humanCount:4});const before=JSON.stringify(g.s);
 assert(I.situation(g).goal);assert(I.checks(g).length);I.endTurn(g);assert.equal(JSON.stringify(g.s),before,'information must not mutate gameplay or RNG');
 g.s.active=g.order().at(-1).id;
 if(scenario==='rescue'){
  assert(I.endTurn(g).join('').includes('不扣减'));g.s.round++;assert(I.endTurn(g).join('').includes('减 1'));
  g.s.rescue.door=true;g.s.rescue.openedTurn=g.s.round;assert(I.situation(g).next.includes('尚未获胜'));g.s.round++;assert(I.situation(g).next.includes('点击逃脱'));
 }else{
  g.s.active=g.s.players.find(p=>p.team==='hero').id;g.p.items.push({type:'book'});assert.equal(I.checks(g)[0].dice,g.val(g.p,2)+1);
  g.summon('hero');g.s.active=g.order().at(-1).id;assert(I.endTurn(g).join('').includes('不追击'));
 }
 // An eliminated active actor still has a next turn (rather than restarting the order).
 g.s.active=g.order()[0].id;g.p.alive=false;assert(I.endTurn(g).join('').includes('交给'));
 g.endGame('hero','验收结局');assert.equal(I.situation(g).risk,'验收结局');assert.deepEqual(I.endTurn(g),['对局已结束。']);
}
console.log('Information is read-only; phase goals, actual item dice, delayed escape, round deadlines and dead-actor handoff verified.');
