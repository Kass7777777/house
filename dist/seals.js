(function(root){
'use strict';
const {Game,ROOMDEFS}=root.House||(typeof require==='function'?require('./engine.js'):{}),S=root.HouseScenarios||(typeof require==='function'?require('./scenarios.js'):{}),T=root.HouseTactics||(typeof require==='function'?require('./tactics.js'):{}),P=Game.prototype;
S.configs.seals={id:'seals',title:'封印之夜',source:'原创验证：分散仪式 + 全局侵蚀',summary:'没有叛徒。分头修复封印，躲进安全房间抵挡侵蚀，最后从入口撤离。',objectives:[{id:'seals',requires:[]},{id:'exit',requires:['seals']}]};S.validate(S.configs.seals);
const start=P.startHaunt;
P.startHaunt=function(){const s=this.s;if(s.phase!=='explore')return;let chosen=s.scenario,clue;
 if(s.scenarioMode==='auto'){clue=s.lastOmen||{room:this.roomNow.name,index:0,name:'验证预兆'};const row=ROOMDEFS.findIndex(r=>r[0]===clue.room);chosen=T.mapping[Math.max(0,row)][clue.index%13];}
 if(chosen!=='seals')return start.call(this);
 s.scenario='seals';s.revealer=s.active;s.traitor=null;s.ghost=null;s.phase='seals';s.players.forEach(p=>{p.team='hero';p.restrained=false;});
 const rooms=s.rooms.filter(r=>r.id!=='0:0:0'&&!r.collapsed&&this.path('0:0:0',r.id).length).sort((a,b)=>this.path('0:0:0',b.id).length-this.path('0:0:0',a.id).length||a.id.localeCompare(b.id));
 s.seals={nodes:rooms.slice(0,Math.min(4,Math.max(2,s.players.length-1))).map((r,i)=>({room:r.id,trait:i%2?3:2,progress:0,goal:2})),remaining:8+s.players.length,startedRound:s.round};s.countdown=s.seals.remaining;
 if(clue)s.hauntSelection={room:clue.room,omen:clue.name,scenario:'seals'};
 s.active=s.players.find(p=>p.alive).id;this.turnStart();this.milestone('haunt','封印之夜',`全员合作，修复 ${s.seals.nodes.length} 处封印后从入口撤离。`);
 this.log('封印之夜开始：没有叛徒，所有角色共同对抗小屋。');this.report('封印之夜',`${clue?clue.room+'中的'+clue.name+'揭开了这场危机。\n':''}所有人都是英雄。地图上有 ${s.seals.nodes.length} 处封印，每处需要 2 次指定属性检定成功（总和 ≥ 4）。每人每回合可尝试一次，失败不受额外伤害。修好的封印房间可免疫轮末侵蚀。\n从下一轮末起，未在安全房间的角色受到 1 点侵蚀伤害，精神与物理交替；时限 ${s.countdown} 轮。全部封印完成后，任一英雄回入口执行撤离，全队获胜。超时或全员倒下则失败。`);
};
P.sealActions=function(){const s=this.s,h=s.seals;if(!h||s.phase!=='seals')return[];const node=h.nodes.find(n=>n.room===this.p.room),all=h.nodes.every(n=>n.progress>=n.goal),common=!this.canAct()?'当前无法行动。':'';
 return [{id:'repair',label:node?'修复封印 · '+['力量','速度','知识','理智'][node.trait]+' '+Math.min(8,this.val(this.p,node.trait,true))+' 骰':'修复封印',reason:common||(!node?'请先到达标记的封印房间。':node.progress>=node.goal?'此封印已完成，房间可抵挡侵蚀。':s.taskUsed?'本回合已尝试任务。':''),detail:'总和 ≥ 4，成功 +1；每处需 2 次成功。消耗一次任务，失败不受额外伤害。'}, {id:'exit',label:'全队撤离',reason:common||(!all?'先完成全部封印。':this.p.room!=='0:0:0'?'请到入口大厅执行撤离。':''),detail:'无需掷骰；至少一名存活英雄执行，全队获胜。'}].map(a=>({...a,available:!a.reason}));
};
P.sealAction=function(id){const a=this.sealActions().find(a=>a.id===id);if(!a?.available)return false;const s=this.s;if(id==='exit'){this.endGame('hero',`${this.p.name}开启退路，封印之夜的幸存者逃出小屋。`);return true;}
 const n=s.seals.nodes.find(n=>n.room===this.p.room);s.taskUsed=true;s.actions++;this.count(this.p,'tasks');const v=this.roll(this.val(this.p,n.trait,true),'修复封印');if(v>=4)n.progress++;
 const text=`${this.roomNow.name}：检定 ${v} ${v>=4?'≥':'<'} 4，封印 ${n.progress}/${n.goal}。${n.progress>=n.goal?'此房间现在可以抵挡侵蚀。':'下回合或其他角色可继续尝试。'}`;this.log(text);s.actionFeedback={player:this.p.name,title:'封印检定',text,rolls:[s.lastRoll]};this.report(n.progress>=n.goal?'封印已修复':'封印检定',text,[s.lastRoll]);if(n.progress>=n.goal)this.milestone('objective','封印已修复',this.roomNow.name+'成为安全房间。');return true;};
const round=P.roundEnd;
P.roundEnd=function(){const s=this.s;if(s.phase!=='seals')return round.call(this);const h=s.seals;if(s.round>h.startedRound){const type=(s.round-h.startedRound)%2?'mental':'physical',safe=new Set(h.nodes.filter(n=>n.progress>=n.goal).map(n=>n.room));
 this.log(`轮末${type==='mental'?'精神':'物理'}侵蚀：安全房间外的每位英雄受到 1 点伤害。`);
 for(const p of s.players.filter(p=>p.alive)){if(safe.has(p.room))this.log(p.name+'受到封印庇护。');else this.damage(p,1,type);if(s.result)return;}
 h.remaining--;s.countdown=h.remaining;this.log(`封印之夜剩余 ${h.remaining} 轮。`);if(h.remaining<=0){this.endGame('house','时限耗尽，小屋吞没了尚未撤离的队伍。');return;}}
 s.round++;};
const end=P.endGame;P.endGame=function(team,reason){if(this.s.scenario!=='seals')return end.call(this,team,reason);const s=this.s;if(s.result)return;team=team==='hero'?'hero':'house';this.milestone('end',team==='hero'?'全队获胜':'合作失败',reason);s.result={team,reason,round:s.round,actions:s.actions};s.phase='end';this.log(reason);};
P.sealGoal=function(p=this.p){const s=this.s,open=s.seals.nodes.filter(n=>n.progress<n.goal);if(!open.length)return '0:0:0';
 // Greedy assignment discourages all AI from marching to the same farthest seal.
 const load=new Map(open.map(n=>[n.room,0])),assigned=new Map();for(const q of s.players.filter(q=>q.alive).sort((a,b)=>a.id-b.id)){const candidates=open.map(n=>({n,path:this.path(q.room,n.room)})).filter(x=>x.path.length).sort((a,b)=>(a.path.length*2-this.val(q,a.n.trait,true)+load.get(a.n.room)*4)-(b.path.length*2-this.val(q,b.n.trait,true)+load.get(b.n.room)*4)||a.n.room.localeCompare(b.n.room));if(candidates[0]){assigned.set(q.id,candidates[0].n.room);load.set(candidates[0].n.room,load.get(candidates[0].n.room)+1);}}
 return assigned.get(p.id)||open[0].room;};
P.sealAdvice=function(){const s=this.s,p=this.p,actions=this.sealActions(),ready=actions.find(a=>a.available),goal=this.sealGoal(),path=this.path(p.room,goal);if(ready)return {title:ready.label,text:ready.detail,focus:'已修复房间可以抵挡轮末侵蚀。',action:'seal:'+ready.id};
 if(s.taskUsed)return {title:'本回合封印已尝试',text:'可使用补给或等待其他同伴推进。',focus:'每名角色每回合一次；完成封印后所在房间变为安全区。',action:'end'};
 if(path.length>1&&s.moves>=this.cost())return {title:'前往'+s.rooms.find(r=>r.id===goal).name,text:'分头推进封印；全部完成后回入口撤离。',focus:'注意下一次侵蚀与剩余时限。',action:'room:'+path[1],room:path[1]};
 return {title:'结束回合',text:'当前移动或任务机会已用尽。',focus:'安全房间可免疫侵蚀，其他位置需要分配伤害。',action:'end'};};
const ai=P.aiStep;P.aiStep=function(){if(this.s.phase!=='seals'||this.s.eventChoice||this.s.pendingDecision)return ai.call(this);if(!this.isAI()||this.s.result)return false;if(!this.p.alive)return this.endTurn();const heal=this.p.items.find(i=>this.itemReady(i.id)&&((i.type==='heal'&&Math.min(...this.p.idx)<=2)||(i.type==='calm'&&this.p.idx[3]<=2)));if(heal&&this.use(heal.id))return true;
 const tip=this.sealAdvice();if(tip.action.startsWith('seal:'))return this.sealAction(tip.action.slice(5));if(tip.action.startsWith('room:'))return this.moveRoom(tip.action.slice(5));return this.endTurn();};
const intent=P.intent;P.intent=function(p){if(this.s.phase!=='seals')return intent.call(this,p);if(!p.alive)return '已倒下';const room=this.s.rooms.find(r=>r.id===this.sealGoal(p));return '前往'+room.name+(room.id==='0:0:0'?'，执行全队撤离':'，协助修复封印');};
root.HouseSeals={};if(typeof module!=='undefined')module.exports=root.HouseSeals;
})(typeof window!=='undefined'?window:globalThis);
