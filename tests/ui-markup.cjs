// Execute rendering functions against a minimal host; no browser/visual assertions.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app={innerHTML:'',className:'',querySelector:()=>null,querySelectorAll:()=>[]};
const modal={innerHTML:'',dataset:{},open:false,showModal(){this.open=true},close(){this.open=false},querySelector:()=>null,addEventListener(){}};
const ctx={document:{querySelector:q=>q==='#app'?app:q==='#modal'?modal:null,querySelectorAll:()=>[],addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},clearTimeout(){},setTimeout(){},requestAnimationFrame(){},matchMedia:()=>({matches:true})};ctx.window=ctx;ctx.addEventListener=()=>{};vm.createContext(ctx);
for(const file of ['scenarios.js','rooms.js','engine.js','tactics.js','equipment.js','seals.js','awareness.js','guide.js','intel.js','app.js'])vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),ctx,{filename:file});
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
vm.runInContext("game=new Game({scenarioMode:'auto',count:3,humanCount:3});game.draw('E');afterAction(0);",ctx);assert(modal.innerHTML.includes('探索抉择'));assert(modal.innerHTML.includes('event:risk'));
vm.runInContext("act('event:leave');",ctx);assert(!vm.runInContext('game.s.eventChoice',ctx));assert(modal.innerHTML.includes('谨慎离开'));
vm.runInContext("game=new Game({count:3,humanCount:3});game.s.eventChoice={title:'test',trait:0,type:'physical',playerId:0};game.p.tracks=JSON.parse(JSON.stringify(game.p.tracks));game.p.tracks[0][3]=0;act('event:risk');",ctx);assert(modal.innerHTML.includes('分配伤害'));
vm.runInContext("act('damagePick:0');act('damagePick:1');act('damageConfirm');",ctx);assert(!vm.runInContext('game.s.pendingDecision',ctx));assert(modal.innerHTML.includes('受到 2 点物理伤害'));
console.log('Interactive event and damage-allocation UI flow passed.');
vm.runInContext("game=new Game({count:3,humanCount:3});game.s.reviewTurn=game.s.turnSerial;game.s.briefingCursor=0;game.invoke('endTurn');afterAction(0);",ctx);assert(!app.innerHTML.includes('刚才发生了什么'));assert(app.innerHTML.includes('当前回合'));assert(!app.innerHTML.includes('全队最近行动'));assert(app.innerHTML.includes('接下来：'));
vm.runInContext("act('briefingRead');",ctx);assert(!app.innerHTML.includes('刚才发生了什么'));
console.log('Compact turn header and removed duplicate panels verified.');

vm.runInContext("game=new Game({scenario:'rescue',quick:true,count:4,humanCount:4});render();",ctx);assert(app.innerHTML.includes('完成破网与医疗'));assert(app.innerHTML.includes('查看状态'));assert(app.innerHTML.includes('<details class="chronicle" open>'));
const actor=vm.runInContext('game.s.active',ctx);vm.runInContext("act('inspect:2');",ctx);assert(modal.innerHTML.includes('携带物品'));assert.equal(vm.runInContext('game.s.active',ctx),actor);
vm.runInContext("act('locate:1:0:0');",ctx);assert.equal(vm.runInContext('floor',ctx),1);assert.equal(vm.runInContext('game.s.active',ctx),actor);assert.equal(vm.runInContext('mapFocus',ctx),'1:0:0');
console.log('Compact state: no duplicated feeds; objectives, character inspection and cross-floor location preserve actor.');

vm.runInContext("game=new Game({count:3,humanCount:1});game.s.active=1;game.s.guide={enabled:false,lesson:3,last:[]};readingMode='confirm';game.p.idx[0]=2;game.s.eventChoice={title:'观察事件',trait:0,type:'physical',playerId:1};game.invoke('resolveEvent',['leave']);afterAction(1,true);",ctx);assert(modal.open);assert(modal.innerHTML.includes('观察事件'));assert(!vm.runInContext('game.s.eventChoice',ctx));
vm.runInContext("closeModal();game.invoke('resolveEvent',['leave']);",ctx);assert(!modal.open);
console.log('AI informational events wait for acknowledgement even without tutorials.');
vm.runInContext("game=new Game({count:3,humanCount:1});game.s.active=1;modal.close();act('route:1:0:0');",ctx);
assert(modal.innerHTML.includes('同阵营角色距此位置'));assert(modal.innerHTML.includes('相邻移动'));
assert.equal(vm.runInContext('game.s.active',ctx),1);
vm.runInContext("act('locate:1:0:0');",ctx);assert(vm.runInContext('aiPaused',ctx));
assert(app.innerHTML.includes('正在行动'));assert(app.innerHTML.includes('下一轮'));
vm.runInContext("game.s.report={title:'普通发现',text:'发现一个房间。'};game.s.awareness=[];afterAction(1,true);",ctx);
assert(vm.runInContext('game.s.report.observation',ctx));assert(modal.innerHTML.includes('reportMode'));
vm.runInContext("act('reportMode');",ctx);assert.equal(vm.runInContext('readingMode',ctx),'auto');assert(modal.open);
console.log('Route inspection preserves actor; AI map inspection pauses; turn order and report reading-mode controls verified.');
vm.runInContext("game=new Game({count:3,humanCount:3});game.s.eventChoice={...HouseTactics.events[4],playerId:0};decisionDialog();",ctx);assert(modal.innerHTML.includes('event:alternate'));assert(modal.innerHTML.includes('成功率约'));assert(modal.innerHTML.includes('物理'));
vm.runInContext("game=new Game({count:3,humanCount:3});game.p.items=[{id:'gift',name:'急救包',type:'heal'}];act('supplies');",ctx);assert(modal.innerHTML.includes('dropItem:gift'));vm.runInContext("act('dropItem:gift');act('supplies');",ctx);assert(modal.innerHTML.includes('本回合已进行物品动作'));assert(modal.innerHTML.includes('房间地面'));
vm.runInContext("game=new Game({quick:true,scenario:'rescue',count:3,humanCount:3});game.s.rescue.eggs=true;game.s.active=game.s.traitor;game.turnStart();game.s.players[0].items=[{id:'prize',name:'典籍',type:'book'}];game.s.combatChoice={attacker:game.s.active,target:0,damage:3,rolls:[]};decisionDialog();",ctx);assert(modal.innerHTML.includes('combatResolve:steal:prize'));vm.runInContext("act('close');",ctx);assert(modal.open);vm.runInContext("act('combatResolve:steal:prize');",ctx);assert(!vm.runInContext('game.s.combatChoice',ctx));assert(modal.innerHTML.includes('夺取物品'));
vm.runInContext("game=new Game({quick:true,scenario:'seals',count:4,humanCount:4});showedResult=false;render();report();",ctx);assert(app.innerHTML.includes('seal:repair'));assert(app.innerHTML.includes('seal:exit'));assert(app.innerHTML.includes('封印 1'));assert(!app.innerHTML.includes('undefined'));assert(modal.innerHTML.includes('所有人都是英雄'));assert(!modal.innerHTML.includes('成为叛徒'));
vm.runInContext("closeModal();brief();",ctx);assert(modal.innerHTML.includes('本局没有叛徒'));vm.runInContext("game.endGame('house','测试合作失败');render();",ctx);assert(modal.innerHTML.includes('测试合作失败'));assert(modal.innerHTML.includes('小屋'));assert(!modal.innerHTML.includes('获胜阵营：叛徒'));
