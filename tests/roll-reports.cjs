const assert=require('node:assert/strict');const {Game}=require('../dist/engine.js');
for(const scenario of ['ritual','rescue']){
 const g=new Game({scenario,count:4,humanCount:4});g.roll(4,'先前事件');const earlier=[...g.s.dice];g.draw('O');assert.deepEqual(g.s.report.rolls,[]);assert.deepEqual(g.s.dice,earlier);
 g.s.omen=0;g.endTurn();assert.equal(g.s.report.title,'作祟检定');assert.equal(g.s.report.rolls[0].dice.length,6);assert.equal(g.s.report.rolls[0].total,g.s.lastHauntCheck.total);
 const snapshot=JSON.stringify(g.s.report.rolls);g.roll(3,'后来事件');assert.equal(JSON.stringify(g.s.report.rolls),snapshot);
 g.s.drawnOmen=true;g.s.omen=13;g.endTurn();assert.equal(g.s.phase,scenario==='rescue'?'rescue':'ritual');assert.equal(g.s.report.rolls[0].label,'作祟检定');assert.equal(g.s.report.rolls[0].dice.length,6);
 const saved=new Game({},g.s);assert.deepEqual(saved.s.report.rolls,g.s.report.rolls);
}
console.log('Dice reports: omen cards contain no stale dice; safe/triggered checks bind exact six dice; later rolls and save restoration preserve report results.');
