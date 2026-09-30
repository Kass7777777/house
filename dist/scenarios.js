(function(root){
'use strict';
// Scenario data: entry, balancing parameters, and prerequisite graph.
const configs={
 ritual:{id:'ritual',title:'降魂仪式',source:'v0.3 §31.2 / #2 结构适配',summary:'英雄与叛徒争夺幽灵的控制权，再安葬遗骸或驱散幽灵。',// S1-ENG-02 (tuning plan B). Scaled values are max(1, round(base + perHero × h)), h = heroes at the haunt, frozen into s.ritualGoals.
  // Neutral/legacy settings: goal 3, goalPerHero 0, traitorGoal null (= hero goal), rounds 6, roundsPerHero 0, dispelGoal 3, dispelGoalPerHero 0.
  threshold:4,goal:0,goalPerHero:1.5,heroGain:1,traitorGain:2,traitorGoal:2,rounds:7,roundsPerHero:-1,corpseThreshold:6,dispelGoal:0,dispelGoalPerHero:1,ghostDefense:5,ghostMoveDice:2,ghostAttackDice:4,traitorRule:'roll',aiCautious:true,objectives:[{id:'ritual',requires:[]},{id:'finale',requires:['ritual']}]},
 rescue:{id:'rescue',title:'命运罗网',source:'v0.3 §31.3 / #4 结构适配',summary:'救出被蛛网困住的同伴，处理蜘蛛卵，在追击中打开前门逃走。',// protectUntil: 'freed' = victim untargetable until eggs handled AND web broken; 'eggs' = legacy (eggs only). traitorRule: 'roll' | 'lowest'.
  webDefense:5,webGoalBase:0,webGoalPerPlayer:1,medicineThreshold:4,doorThreshold:6,spiderDice:3,spiderMove:1,rounds:16,roundsPerPlayer:-3,protectUntil:'freed',traitorRule:'roll',objectives:[{id:'web',requires:[]},{id:'eggs',requires:[]},{id:'door',requires:['web','eggs']},{id:'escape',requires:['door']}]}
};
function validate(c){if(!c||!c.id||!c.title||!Array.isArray(c.objectives))throw Error('剧本缺少入口或目标');const ids=new Set();for(const n of c.objectives){if(ids.has(n.id)||n.requires.some(id=>!ids.has(id)))throw Error('剧本目标有重复、循环或无效前置');ids.add(n.id);}return true;}
Object.values(configs).forEach(validate);
// Haunt rules: every tunable number/rule of the active scenario is copied into s.hauntRules when the haunt starts, and
// all rule code and text read it through Rules.of(). Saves made before S1-ENG-03 lack it and fall back to LEGACY (the
// pre-tuning S1-ENG-01 values), so a game in progress always finishes under the numbers it started with.
const Rules={
 SKIP:['id','title','source','summary','objectives'],
 LEGACY:{
  ritual:{threshold:4,goal:3,goalPerHero:0,heroGain:1,traitorGain:2,traitorGoal:null,rounds:6,roundsPerHero:0,corpseThreshold:4,dispelGoal:3,dispelGoalPerHero:0,ghostDefense:4,ghostMoveDice:2,ghostAttackDice:4,traitorRule:'lowest',aiCautious:false},
  rescue:{webDefense:4,webGoalBase:0,webGoalPerPlayer:1,medicineThreshold:4,doorThreshold:6,spiderDice:3,spiderMove:1,rounds:12,roundsPerPlayer:1,protectUntil:'eggs',traitorRule:'lowest'},
  seals:{repairThreshold:4,nodeGoal:2,nodeMin:2,nodeMax:4,timeBase:8,erosion:1}
 },
 freeze(id){const c=configs[id]||configs.ritual,o={scenario:id};for(const k of Object.keys(c))if(!this.SKIP.includes(k))o[k]=c[k];return o;},
 legacy(id){return {...this.LEGACY[id],scenario:id,legacy:true};},
 // g may be a Game or a raw state. Frozen values when this game's haunt used scenario id, otherwise the live config.
 of(g,id){const s=g&&g.s||g||{};id=id||s.scenario||'ritual';return s.hauntRules&&s.hauntRules.scenario===id?s.hauntRules:this.freeze(id);}
};
const passThrough=r=>(root.HouseRooms||(typeof require==='function'?require('./rooms.js'):{})).passThrough?.(r);
// Ritual targets scale with the hero count h and are frozen at the haunt (s.ritualGoals); saves from before S1-ENG-02 use LEGACY.
const Ritual={
 LEGACY:{hero:3,traitor:3,burialRounds:6,dispel:3},
 scale(base,per,h){return Math.max(1,Math.round((Number(base)||0)+(Number(per)||0)*h));},
 goalsFor(h,c=configs.ritual){const hero=this.scale(c.goal,c.goalPerHero,h);return {hero,traitor:c.traitorGoal==null?hero:this.scale(c.traitorGoal,0,h),burialRounds:this.scale(c.rounds,c.roundsPerHero,h),dispel:this.scale(c.dispelGoal,c.dispelGoalPerHero,h)};},
 // For pre-haunt text: '3' when constant, otherwise the 3/4/5/6-player values ('3/5/6/8').
 span(field,c=configs.ritual){const v=[2,3,4,5].map(h=>this.goalsFor(h,c)[field]);return v.every(x=>x===v[0])?String(v[0]):v.join('/');},
 varies(field,c=configs.ritual){return this.span(field,c).includes('/');},
 tries(points,gain){return Math.max(1,Math.ceil(points/Math.max(1,gain)));}
};
const Rescue={
 webGoalFor(n,c=configs.rescue){return Math.max(1,Math.round(c.webGoalBase+c.webGoalPerPlayer*n));},
 webGoalText(c=configs.rescue){return c.webGoalBase===0&&c.webGoalPerPlayer===1?'队伍人数':c.webGoalPerPlayer===0?`${c.webGoalBase} 次`:`${c.webGoalBase?c.webGoalBase+'＋':''}${c.webGoalPerPlayer===1?'':c.webGoalPerPlayer+'×'}人数`;},
 roundsFor(n,c=configs.rescue){return Math.max(1,c.rounds+(n-3)*c.roundsPerPlayer);},
 roundsText(c=configs.rescue){const v=[3,4,5,6].map(n=>this.roundsFor(n,c));return c.roundsPerPlayer>0?`${v[0]}–${v[3]} 个完整轮次（随人数增加）`:c.roundsPerPlayer<0?`${v.join('/')} 个完整轮次（3–6 人；人越多时限越短）`:`${v[0]} 个完整轮次`;},
 setup(g){
  const s=g.s,c=Rules.of(g,'rescue'),heroes=s.players.filter(p=>p.team==='hero');
  const victim=heroes.find(p=>p.id===s.revealer)||heroes[0];
  // Pick discovered, reachable rooms; never depend on an undrawn room card; never a pass-through room (煤槽).
  const rooms=s.rooms.filter(r=>!r.collapsed&&!passThrough(r)&&g.path('0:0:0',r.id).length).sort((a,b)=>g.path('0:0:0',b.id).length-g.path('0:0:0',a.id).length||a.id.localeCompare(b.id));
  const nest=rooms.find(r=>r.id!=='0:0:0')||rooms[0];
  const supply=rooms.find(r=>r.id!==nest.id&&r.id!=='0:0:0')||s.rooms.find(r=>r.id==='0:0:0');
  victim.room=nest.id;victim.restrained=true;
  s.phase='rescue';s.rescue={victim:victim.id,web:0,webGoal:this.webGoalFor(s.players.length,c),eggs:false,kitHolder:null,kitRoom:supply.id,door:false,openedTurn:null,spider:{room:nest.id,stunned:false},remaining:this.roundsFor(s.players.length,c),startedRound:s.round};
  s.countdown=s.rescue.remaining;
  g.report('命运罗网',`${victim.name}被蛛网困在${nest.name}。英雄需要破网救人，并从${supply.name}取得专用医疗用品处理蜘蛛卵；两项完成后，去入口大厅开门，下回合再逃脱。叛徒与蜘蛛阻止救援。蜘蛛每轮追击一次，倒计时归零则英雄失败。`);
  g.log(`命运罗网开始：${victim.name}受困于${nest.name}，限时 ${s.countdown} 个完整轮次。`);
 },
 room(g){return g.s.players[g.s.rescue.victim].room;},
 ready(g,id){const r=g.s.rescue,done={web:r.web>=r.webGoal,eggs:r.eggs,door:r.door};return configs.rescue.objectives.find(n=>n.id===id).requires.every(k=>done[k]);},
 actions(g){
  const s=g.s,r=s.rescue,p=g.p,c=Rules.of(g,'rescue'),atVictim=p.room===this.room(g),name=id=>s.rooms.find(x=>x.id===id).name;
  const common=!g.canAct()?'角色无法行动。':p.team!=='hero'?'只有英雄可以完成救援任务。':'';
  const task=common||(s.taskUsed?'本回合已尝试任务，下回合可再试。':'');
  const attack=common||(s.attackUsed?'本回合已攻击，需下回合再试。':'');
  return [
   {id:'web',label:'撕开蛛网',reason:attack||(r.web>=r.webGoal?'蛛网已破除。':!atVictim?`前往${name(this.room(g))}救援。`:''),detail:`力量对抗 ${c.webDefense} 颗骰子，成功 +1；需 ${r.webGoal} 次。失败不受伤，占用攻击次数。`},
   {id:'kit',label:'取得医疗用品',reason:task||(r.eggs?'蜘蛛卵已处理。':r.kitHolder!==null?`医疗用品由${s.players[r.kitHolder].name}携带，可同房交接。`:p.room!==r.kitRoom?`前往${name(r.kitRoom)}取用品。`:''),detail:'专用医疗用品无需检定，占用一次任务；不会被自动当作恢复道具消耗。'},
   {id:'eggs',label:'处理蜘蛛卵',reason:task||(r.eggs?'蜘蛛卵已处理。':r.kitHolder!==p.id?'需要携带专用医疗用品。':!atVictim?`需要与${s.players[r.victim].name}同房。`:''),detail:`知识总和 ≥ ${c.medicineThreshold} 成功；可与破网并行。失败保留用品，次数仍消耗。`},
   {id:'door-might',label:'力量破门',reason:task||(r.door?'前门已经打开。':!this.ready(g,'door')?'先完成破网和蜘蛛卵处理。':p.room!=='0:0:0'?'需要到达入口大厅。':''),detail:`力量总和 ≥ ${c.doorThreshold} 开门。成功后本回合不能移动，下一轮起可逃脱。`},
   {id:'door-knowledge',label:'知识开锁',reason:task||(r.door?'前门已经打开。':!this.ready(g,'door')?'先完成破网和蜘蛛卵处理。':p.room!=='0:0:0'?'需要到达入口大厅。':''),detail:`知识总和 ≥ ${c.doorThreshold} 开门。成功后本回合不能移动，下一轮起可逃脱。`},
   {id:'escape',label:'逃出小屋',reason:common||(!this.ready(g,'escape')?'前门尚未打开。':s.round<=r.openedTurn?'门已打开；请等到下一轮再逃脱。':p.room!=='0:0:0'?'需要到达入口大厅。':''),detail:'至少一名英雄执行逃脱，全体英雄阵营获胜。无需掷骰。'}
  ].map(a=>({...a,available:!a.reason}));
 },
 action(g,id){
  const s=g.s,r=s.rescue,p=g.p,c=Rules.of(g,'rescue'),a=this.actions(g).find(x=>x.id===id);
  if(!a?.available)return false;
  const rolls=[];const roll=(n,label)=>{const v=g.roll(n,label);rolls.push({...s.lastRoll,dice:[...s.dice]});return v;};
  let title=a.label,text='';
  if(id==='escape'){g.endGame('hero',`${p.name}成功逃出小屋；同伴已获救，蜘蛛卵已处理。`);return true;}
  if(id==='web'){
   s.attackUsed=true;const v=roll(g.val(p,0)+(p.items.some(i=>i.type==='weapon')?2:0),'破网力量'),d=roll(c.webDefense,'蛛网抵抗');
   if(v>d){r.web++;title='破网成功';text=`救援进度 ${r.web}/${r.webGoal}。`;if(r.web>=r.webGoal){s.players[r.victim].restrained=false;text+=`${s.players[r.victim].name}已恢复移动。`;}}
   else{title='破网未成功';text='进度不变；蛛网不会反伤，本回合攻击次数已用。';}
  }else{
   s.taskUsed=true;
   if(id==='kit'){r.kitHolder=p.id;r.kitRoom=null;text='医疗用品已携带，请前往受困同伴所在房间。';}
   if(id==='eggs'){const v=roll(g.val(p,2,true),'处理蜘蛛卵');if(v>=c.medicineThreshold){r.eggs=true;r.kitHolder=null;title='蜘蛛卵已处理';text='医疗用品已使用；倒计时仍继续，完成破网后前往入口。';}else{title='处理未成功';text=`知识总和未达到 ${c.medicineThreshold}；用品保留，下回合可重试。`;}}
   if(id.startsWith('door-')){const t=id==='door-might'?0:2,v=roll(g.val(p,t,true),'打开前门');if(v>=c.doorThreshold){r.door=true;r.openedTurn=s.round;p.doorWait=true;s.moves=0;title='前门已打开';text='本回合无法继续移动。请结束回合，下一轮起到入口执行「逃出小屋」才能获胜。';}else{title='开门未成功';text=`骰子总和未达到 ${c.doorThreshold}；下回合可以再次尝试，或让同伴来开门。`;}}
  }
  s.actions++;g.count(p,'tasks');if((id==='web'&&r.web>=r.webGoal)||(id==='eggs'&&r.eggs)||(id.startsWith('door-')&&r.door))g.milestone('objective',title,`${p.name}：${text}`);g.log(`${p.name} · ${title}：${text}`);s.actionFeedback={player:p.name,title,text,rolls};
  if(!g.isAI())g.report(title,text,rolls);
  return true;
 },
 attackSpider(g){
  const s=g.s,p=g.p,r=s.rescue,c=Rules.of(g,'rescue');if(!g.canAct()||p.team!=='hero'||s.attackUsed||r.spider.room!==p.room)return false;
  s.attackUsed=true;const a=g.roll(g.val(p,0)+(p.items.some(i=>i.type==='weapon')?2:0),'攻击蜘蛛'),ar=s.lastRoll,d=g.roll(c.spiderDice,'蜘蛛防守');
  if(a>d){r.spider.stunned=true;g.log('蜘蛛被击退，将跳过下一次轮末行动。');}else if(d>a)g.damage(p,d-a);
  s.actionFeedback={player:p.name,title:a>d?'蜘蛛被击退':a===d?'攻防平局':'蜘蛛反击',text:a>d?'蜘蛛跳过下一次轮末行动；仍需救人并逃脱才能获胜。':a===d?'双方均未受伤。':`受到 ${d-a} 点物理伤害。`,rolls:[ar,s.lastRoll]};s.actions++;return true;
 },
 // Single source of truth for victim protection (engine attack, equipment attack, spider targeting, traitor goal).
 enemyAllowed(g,target){const r=g.s.rescue;return target.id!==r.victim||(r.eggs&&(Rules.of(g,'rescue').protectUntil==='eggs'||r.web>=r.webGoal));},
 round(g){
  const s=g.s,r=s.rescue,c=Rules.of(g,'rescue');if(s.result)return;
  if(r.spider.stunned){r.spider.stunned=false;g.log('蜘蛛被击退，本轮无法追击。');}
  else{
   const targets=s.players.filter(p=>p.alive&&p.team==='hero'&&this.enemyAllowed(g,p)).map(p=>({p,path:g.path(r.spider.room,p.room)})).filter(x=>x.path.length).sort((a,b)=>a.path.length-b.path.length||a.p.id-b.p.id);
   if(targets.length){const t=targets[0];r.spider.room=t.path[Math.min(c.spiderMove,t.path.length-1)];g.log(`蜘蛛追至${s.rooms.find(x=>x.id===r.spider.room).name}。`);if(r.spider.room===t.p.room){const a=g.roll(c.spiderDice,'蜘蛛袭击'),d=g.roll(g.val(t.p,0),`${t.p.name}抵挡蜘蛛`);if(a>d)g.damage(t.p,a-d);else if(d>a){r.spider.stunned=true;g.log('防御反制使蜘蛛暂时退却。');}}}
  }
  if(!s.result&&s.round>r.startedRound){r.remaining--;s.countdown=r.remaining;g.log(`逃脱时限剩余 ${r.remaining} 轮。`);if(r.remaining<=0)g.endGame('traitor','逃脱时限耗尽，蜘蛛封死了所有出路。');}
 },
 goal(g){
  const s=g.s,r=s.rescue,p=g.p;
  if(p.team==='traitor')return s.players.filter(t=>t.alive&&t.team==='hero'&&this.enemyAllowed(g,t)).map(t=>({id:t.room,path:g.path(p.room,t.room)})).filter(x=>x.path.length).sort((a,b)=>a.path.length-b.path.length)[0]?.id;
  if(r.web>=r.webGoal&&r.eggs)return '0:0:0';
  if(!r.eggs&&r.kitHolder===p.id)return this.room(g);
  if(!r.eggs&&r.kitHolder===null&&!p.restrained){
   const eligible=s.players.filter(q=>q.alive&&q.team==='hero'&&!q.restrained).map(q=>({p:q,path:g.path(q.room,r.kitRoom)})).filter(x=>x.path.length).sort((a,b)=>(a.path.length*2-g.val(a.p,2,true))-(b.path.length*2-g.val(b.p,2,true))||a.p.id-b.p.id);
   if(eligible[0]?.p.id===p.id)return r.kitRoom;
  }
  return this.room(g);
 },
 advice(g){
  const s=g.s,r=s.rescue,p=g.p,goal=this.goal(g),choices=this.actions(g),pick=id=>choices.find(a=>a.id===id&&a.available);
  let task=pick('escape')||pick('eggs')||(goal===r.kitRoom?pick('kit'):null)||pick(g.val(p,0)>g.val(p,2,true)?'door-might':'door-knowledge')||pick('web');
  if(p.team==='hero'&&task)return {title:task.label,text:task.detail,focus:'高亮按钮是当前建议；你也可以选择其他合法行动。',action:'rescue:'+task.id};
  const enemy=s.players.find(t=>t.alive&&t.team!==p.team&&t.room===p.room&&this.enemyAllowed(g,t));
  if(p.team==='traitor'&&enemy&&!s.attackUsed)return {title:'阻止救援',text:'拖过时限或消灭英雄获胜。蜘蛛每轮自动追击。',focus:Rules.of(g,'rescue').protectUntil==='eggs'?'蜘蛛卵处理前，受困者不能被攻击。':'受困者获救（破网并处理蜘蛛卵）前不会被攻击。',action:'attack:'+enemy.id};
  const path=goal?g.path(p.room,goal):[];
  if(!p.restrained&&!p.doorWait&&s.moves>=g.cost()&&path.length>1){const room=path[1],e=g.exits().find(e=>e.target?.id===room);return {title:'前往'+s.rooms.find(x=>x.id===goal).name,text:p.team==='hero'?'按任务标记分工救援，留意蜘蛛所在房间。':'接近其他英雄，阻止救援和开门。',focus:'经过敌人所在房间会多消耗移动力。',action:e?'move:'+e.d:'room:'+room,room};}
  if(p.team==='hero'&&p.room===r.spider.room&&!s.attackUsed)return{title:'击退蜘蛛',text:'力量对抗蜘蛛，成功让它跳过下次行动；失败可能受伤。',focus:'击退蜘蛛不会直接获胜。',action:'attack:spider'};
  return {title:'结束当前回合',text:p.restrained?'你暂时不能移动；每回合可以尝试破网，也可以使用或交换道具。':r.door&&s.round<=r.openedTurn?'前门已打开，下一轮起可以执行逃脱。':'本回合可用的任务已完成，可结束回合等待同伴。',focus:`剩余 ${r.remaining} 轮。`,action:'end'};
 },
 ai(g){const p=g.p,r=g.s.rescue;if(p.team==='hero'&&r.kitHolder===p.id&&!g.s.taskUsed){const medic=g.s.players.filter(q=>q.alive&&q.team==='hero'&&q.id!==p.id&&q.room===p.room&&g.val(q,2,true)>g.val(p,2,true)).sort((a,b)=>g.val(b,2,true)-g.val(a,2,true))[0];if(medic&&g.handoffKit(medic.id))return true;}const tip=this.advice(g),a=tip.action||'end';if(a.startsWith('rescue:'))return this.action(g,a.slice(7));if(a.startsWith('attack:'))return g.attack(a.slice(7));if(a.startsWith('move:'))return g.move(Number(a.slice(5)));if(a.startsWith('room:'))return g.moveRoom(a.slice(5));return g.endTurn();}
};
root.HouseScenarios={configs,validate,Rescue,Ritual,Rules};if(typeof module!=='undefined')module.exports=root.HouseScenarios;
})(typeof window!=='undefined'?window:globalThis);
