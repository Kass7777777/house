// Execute rendering functions against a minimal host; no browser/visual assertions.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app={innerHTML:'',className:'',querySelector:()=>null,querySelectorAll:()=>[]};
const modal={innerHTML:'',dataset:{},open:false,showModal(){this.open=true},close(){this.open=false},querySelector:()=>null,addEventListener(){}};
const ctx={document:{querySelector:q=>q==='#app'?app:q==='#modal'?modal:null,querySelectorAll:()=>[],addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},clearTimeout(){},setTimeout(){},requestAnimationFrame(){},matchMedia:()=>({matches:true})};ctx.window=ctx;ctx.addEventListener=()=>{};vm.createContext(ctx);
for(const file of ['scenarios.js','rooms.js','engine.js','guide.js','app.js'])vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),ctx,{filename:file});
assert(app.innerHTML.includes('命运罗网'));assert(app.innerHTML.includes('scenario:rescue'));
for(const scenario of ['ritual','rescue']){
 vm.runInContext(`game=new Game({scenario:'${scenario}',quick:true,count:4,humanCount:4});floor=game.roomNow.f;render();report();`,ctx);
 assert(!app.innerHTML.includes('undefined'));assert(!modal.innerHTML.includes('undefined'));
 if(scenario==='rescue'){assert(app.innerHTML.includes('rescue:web'));assert(app.innerHTML.includes('rescue:escape'));assert(app.innerHTML.includes('医疗'));assert(modal.innerHTML.includes('rescue.png'));}
 vm.runInContext("game.endGame('hero','验收胜利');render();",ctx);assert(modal.innerHTML.includes('验收胜利'));
 vm.runInContext('showedResult=false;modal.close();',ctx);
}
vm.runInContext("game=new Game({count:4,humanCount:4});game.roll(4,'过去的事件');game.draw('O');report();",ctx);assert(!modal.innerHTML.includes('class="die"'));
vm.runInContext('game.s.omen=0;game.endTurn();report();',ctx);assert.equal((modal.innerHTML.match(/class="die"/g)||[]).length,6);assert(modal.innerHTML.includes('本次未触发'));
console.log('UI markup: scenario picker, both scenario renders and results, rescue controls, omen without stale dice, safe-check six dice passed.');

vm.runInContext("game=new Game({count:4,humanCount:2});recap();",ctx);assert(modal.innerHTML.includes('这一夜的经过'));assert(modal.innerHTML.includes('进入小屋'));
vm.runInContext("healingChoice('test-kit');",ctx);assert.equal((modal.innerHTML.match(/heal:test-kit:/g)||[]).length,4);assert(!modal.innerHTML.includes('undefined'));
console.log('Session recap and four healing options render passed.');
