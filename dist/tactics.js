(function(root){
'use strict';
const {Game,TRAITS,ROOMDEFS}=root.House||(typeof require==='function'?require('./engine.js'):{});
const P=Game.prototype,copy=x=>JSON.parse(JSON.stringify(x));
// Explicit prototype lookup: row and omen column both influence the selected scenario.
const mapping=ROOMDEFS.map((r,row)=>Array.from({length:13},(_,omen)=>(row+omen)%2?'rescue':'ritual'));
const oldStart=P.startHaunt;
P.startHaunt=function(){const s=this.s;if(s.phase!=='explore')return;if(s.scenarioMode==='auto'){
 const clue=s.lastOmen||{room:this.roomNow.name,index:0,name:'验证预兆'},row=ROOMDEFS.findIndex(r=>r[0]===clue.room);
 s.scenario=mapping[Math.max(0,row)][clue.index%13];s.hauntSelection={room:clue.room,omen:clue.name,scenario:s.scenario};
 this.log(`危机揭晓：${clue.room} × ${clue.name} → ${this.scenario.title}（双剧本原型映射）。`);
 }oldStart.call(this);if(s.hauntSelection&&s.report)s.report.text=`${s.hauntSelection.room}中的${s.hauntSelection.omen}揭开了这场危机。\n`+s.report.text;};
const oldNotice=P.omenNotice;
P.omenNotice=function(){return oldNotice.call(this).replace('进入'+this.scenario.title,this.s.scenarioMode==='auto'&&this.s.phase==='explore'?'届时由房间与预兆组合揭晓剧本':'进入'+this.scenario.title);};
const events=[
 {title:'墙内的求救声',trait:3,type:'mental',text:'墙后传来熟悉的声音。回应它可能找到线索，也可能让声音留在脑中。'},
 {title:'摇摇欲坠的柜子',trait:1,type:'physical',text:'柜顶露出一个金属盒。爬上去搜查可能得到补给，也可能跌落。'},
 {title:'缠紧的暗门',trait:0,type:'physical',text:'门缝中透出微光。强行推开可能找到藏物，也可能被门框夹伤。'},
 {title:'未完成的笔记',trait:2,type:'mental',text:'最后一页似乎在描述你们。读完它可能获得知识，也可能留下恐惧。'}
];
// Original prototype events; not transcriptions of official event cards.
events.push(
 {title:'锁住的药箱',trait:2,alt:0,type:'physical',threshold:4,damage:1,reward:'item',text:'药箱的锁已经生锈。你可以研究锁芯，或尝试掰开箱盖。'},
 {title:'摇晃的吊桥',trait:1,alt:0,type:'physical',threshold:4,damage:2,reward:'trait',text:'断裂的木板下是无底的黑暗。轻巧地跨过，或抓住横梁攀行？'},
 {title:'无声的留声机',trait:3,alt:2,type:'mental',threshold:5,damage:2,reward:'both',text:'唱针在转，音乐却只在脑中响起。辨认旋律或研究机关，都可能揭开秘密。'},
 {title:'温暖的壁炉',trait:2,alt:3,type:'mental',threshold:3,damage:1,reward:'recover',text:'熄灭多年的炉火重新燃起。确认火焰没有恶意，也许能在此恢复最虚弱的属性。'},
 {title:'天花板上的行李',trait:0,alt:1,type:'physical',threshold:5,damage:2,reward:'item',text:'沉重的箱子挂在断梁上。拉下它或攀上去取回，都会惊动摇摇欲坠的木梁。'},
 {title:'镜中的指路人',trait:3,alt:2,type:'mental',threshold:4,damage:1,reward:'trait',text:'镜中人指向一扇不存在的门。抵抗它的注视，或推理手势的含义。'},
 {title:'被藤蔓封住的抽屉',trait:0,alt:2,type:'physical',threshold:3,damage:1,reward:'item',text:'抽屉里有东西轻轻碰撞。扯断藤蔓，或寻找它松动的结。'},
 {title:'倒转的钟摆',trait:1,alt:3,type:'mental',threshold:4,damage:2,reward:'recover',text:'每一次摆动都带来旧日的疲惫。跟上它的节拍，或稳住自己的心神。'}
);
function eventRule(e){return {threshold:e.threshold??4,damage:e.damage??2,reward:e.reward||'both'};}
function rewardText(e,t){const r=eventRule(e).reward;return r==='recover'?'最低轨道属性恢复 2 格（并列时优先力量、速度、知识、理智）':r==='item'?'获得一件剩余道具':r==='trait'?TRAITS[t]+'提升 1 格':TRAITS[t]+'提升 1 格并获得一件剩余道具';}
function chance(n,threshold){n=Math.max(0,Math.min(8,n));let a=[1];for(let i=0;i<n;i++){const b=Array(a.length+2).fill(0);a.forEach((v,j)=>{for(let k=0;k<3;k++)b[j+k]+=v/3});a=b;}return a.reduce((sum,v,i)=>sum+(i>=threshold?v:0),0);}
const oldDraw=P.draw;
P.draw=function(type){if(type==='O'){const i=this.s.omenDeck.at(-1);oldDraw.call(this,type);if(i!==undefined)this.s.lastOmen={index:i,name:this.p.items.at(-1).name,room:this.roomNow.name};return;}
 if(type!=='E')return oldDraw.call(this,type);
 if(!this.s.eventDeck?.length)this.s.eventDeck=this.shuffle(events.map((_,i)=>i));const e=events[this.s.eventDeck.pop()];this.s.moves=0;this.s.eventChoice={...e,playerId:this.p.id};this.s.report=null;this.log(`${this.p.name}遇到${e.title}，正在选择应对方式。`);
};
P.eventOptions=function(){const e=this.s.eventChoice;if(!e)return[];const p=this.s.players[e.playerId],spend=p.items.find(i=>['heal','calm','speed'].includes(i.type)&&!p.used.includes(i.id));const ally=this.s.players.find(q=>q.alive&&q.id!==p.id&&q.room===p.room&&(this.s.phase==='explore'||q.team===p.team)&&q.idx[e.trait]<7);
 const r=eventRule(e),check=(id,t)=>({id,label:(id==='risk'?'冒险调查':'换一种方法')+' · '+TRAITS[t],detail:`${Math.min(8,this.val(p,t,true))} 骰，总和 ≥ ${r.threshold}（成功率约 ${Math.round(chance(this.val(p,t,true),r.threshold)*100)}%）。成功：${rewardText(e,t)}；失败：${r.damage} 点${e.type==='physical'?'物理':'精神'}伤害。`});return[check('risk',e.trait),...(e.alt===undefined?[]:[check('alternate',e.alt)]),{id:'leave',label:'谨慎离开',detail:'不获得奖励，也不损失属性；抽到事件消耗的移动力不会恢复。'},{id:'spend',label:spend?'使用 '+spend.name+' 排除危险':'消耗补给排除危险',detail:'消耗一件恢复或移动补给，不检定，提升对应属性 1 格；不额外获得道具。',reason:spend?'':'没有可消耗且本回合未使用的补给。',item:spend?.id},{id:'help',label:ally?'稳定 '+ally.name+' 的状态':'帮助同房同伴',detail:`不检定，使同伴${TRAITS[e.trait]}提升 1 格；自己不获得奖励。`,reason:ally?'':'没有同房且该属性未满的友方角色。',ally:ally?.id}];
};
P.resolveEvent=function(id){const e=this.s.eventChoice,a=this.eventOptions().find(x=>x.id===id);if(!e||!a||a.reason||this.s.result)return false;const aiReason=this.isAI(this.s.players[e.playerId])?this.eventPlan()?.reason:null;this.s.eventChoice=null;const p=this.s.players[e.playerId];let text=a.detail,rolls=[];
 if(id==='risk'||id==='alternate'){const t=id==='risk'?e.trait:e.alt,r=eventRule(e),n=this.roll(this.val(p,t,true),e.title+' · '+TRAITS[t]);rolls=[this.s.lastRoll];if(n>=r.threshold){
 const rewards=[];if(['trait','both'].includes(r.reward)){this.change(p,t,1);rewards.push(TRAITS[t]+'提升 1 格（不超过上限）');}
 if(r.reward==='recover'){const low=p.idx.indexOf(Math.min(...p.idx));this.change(p,low,2);rewards.push(TRAITS[low]+'恢复 2 格（不超过上限）');}
 if(['item','both'].includes(r.reward)){if(this.s.itemDeck.length){this.draw('I');rewards.push('获得 '+p.items.at(-1).name);}else rewards.push('道具堆已空，没有获得道具');}
 text=`检定 ${n} ≥ ${r.threshold}。${rewards.join('；')}。`;
 }else{this.damage(p,r.damage,e.type);text=`检定 ${n} < ${r.threshold}，受到 ${r.damage} 点${e.type==='physical'?'物理':'精神'}伤害。`;}}

 if(id==='spend'){p.items=p.items.filter(i=>i.id!==a.item);p.used.push(a.item);this.change(p,e.trait,1);}
 if(id==='help')this.change(this.s.players[a.ally],e.trait,1);
 this.s.actions++;this.milestone('choice',e.title,`${p.name}选择${a.label}。${text}`);this.log(`${p.name}选择${a.label}：${text}`);this.report(e.title,`选择：${a.label}。${text}${aiReason?'\n判断：'+aiReason:''}`,rolls);return true;
};
const oldCan=P.canAct;P.canAct=function(){return oldCan.call(this)&&!this.s.eventChoice&&!this.s.pendingDecision;};
const oldEnd=P.endTurn;P.endTurn=function(){if(this.s.eventChoice||this.s.pendingDecision)return false;return oldEnd.call(this);};
// Atomic command replay keeps RNG, turn handoff, monster actions and victory checks
// suspended until every human damage allocation is supplied; pending data is saveable.
P.invoke=function(name,args=[],allocations=[]){if(this.s.pendingDecision||(this.s.combatChoice&&!['resolveCombat','aiStep'].includes(name)))return false;const allowed=['drop','resolveCombat','move','moveRoom','endTurn','roomAction','task','rescueAction','attack','use','pickup','trade','handoffKit','aiStep','resolveEvent'];if(!allowed.includes(name))return false;
 const baseline=copy(this.s);this._decision={allocations,cursor:0,baseline};try{return this[name](...args);}catch(e){if(!e.damageChoice)throw e;this.s=baseline;this.s.pendingDecision={name,args,allocations:copy(allocations),damage:e.damageChoice,chosen:[]};return true;}finally{this._decision=null;}
};
const oldDamage=P.damage;
P.damage=function(p,n,type='physical'){if(!this._decision||this.isAI(p))return oldDamage.call(this,p,n,type);const traits=type==='physical'?[0,1]:[2,3],d=this._decision,allocation=d.allocations[d.cursor++];
 if(!allocation){const minimum=this.s.phase==='explore'?0:-1;throw {damageChoice:{player:copy(p),n,type,traits,minimum,rolls:copy((this.s.rollHistory||[]).filter(r=>r.serial>(d.baseline.lastRoll?.serial||0)))}};}
 let applied=0;for(const t of allocation){if(!p.alive)break;if(!traits.includes(t))throw Error('Invalid damage trait');if(this.s.phase==='explore'&&p.idx[t]===0)continue;this.change(p,t,-1);applied++;}this.count(p,'damage',applied);this.log(`${p.name}分配 ${n} 点${type==='physical'?'物理':'精神'}伤害：${allocation.map(t=>TRAITS[t]).join('、')||'属性已到探索期下限'}。`);
};
P.allocateDamage=function(t){const q=this.s.pendingDecision;if(!q)return false;const d=q.damage;if(!d.traits.includes(t)||q.chosen.length>=d.n)return false;const idx=d.player.idx[t]-q.chosen.filter(x=>x===t).length;if(idx<=d.minimum)return false;q.chosen.push(t);return true;};
P.damageReady=function(){const q=this.s.pendingDecision;if(!q)return false;const d=q.damage;return q.chosen.length>=d.n||d.traits.some(t=>d.player.idx[t]-q.chosen.filter(x=>x===t).length<0)||d.traits.every(t=>d.player.idx[t]-q.chosen.filter(x=>x===t).length<=d.minimum);};
P.confirmDamage=function(){if(!this.damageReady())return false;const q=this.s.pendingDecision;delete this.s.pendingDecision;return this.invoke(q.name,q.args,[...q.allocations,q.chosen]);};
P.eventPlan=function(){const e=this.s.eventChoice;if(!e)return null;const p=this.s.players[e.playerId],o=this.eventOptions(),r=eventRule(e),t=e.alt!==undefined&&this.val(p,e.alt,true)>this.val(p,e.trait,true)?e.alt:e.trait,id=t===e.trait?'risk':'alternate',prob=chance(this.val(p,t,true),r.threshold),danger=(e.type==='physical'?[0,1]:[2,3]).reduce((n,t)=>n+Math.max(0,p.idx[t]),0);
 if(danger<=r.damage&&o.some(a=>a.id==='spend'&&!a.reason))return {id:'spend',reason:'当前承伤余量较低，消耗补给避开检定。'};
 if(prob>=.55&&danger>r.damage)return {id,reason:'选择较强属性，成功率约 '+Math.round(prob*100)+'%。'};
 if(o.some(a=>a.id==='help'&&!a.reason))return {id:'help',reason:'调查风险较高，转为帮助同房同伴。'};
 return {id:'leave',reason:'当前调查风险较高，保留属性以应对后续危机。'};};
const oldAI=P.aiStep;P.aiStep=function(){if(this.s.pendingDecision)return false;if(this.s.eventChoice){const plan=this.eventPlan();return this.resolveEvent(plan.id);}return oldAI.call(this);};

P.intent=function(p){if(!p.alive)return '已倒下';const s=this.s,prior=s.active;s.active=p.id;try{if(s.phase==='explore')return '探索未知房间，收集补给';if(s.phase==='rescue'){const goal=root.HouseScenarios?.Rescue.goal(this)||(typeof require==='function'?require('./scenarios.js').Rescue.goal(this):null);const r=s.rescue;return p.team==='traitor'?'追击可攻击的英雄，拖延救援':goal==='0:0:0'?'前往入口，开门并逃脱':goal===r.kitRoom?'负责取得医疗用品':r.kitHolder===p.id?'携带医疗用品，前往救治同伴':'前往受困同伴处，协助破网';}if(s.phase==='ritual')return '用较强的知识或理智争取仪式进度';if(p.team==='traitor')return '追击英雄，优先阻拦遗骸携带者';if(s.phase==='collapse')return '靠近幽灵，尝试驱散';return s.carrier===p.id?'优先运送遗骸到安葬点':s.carrier===null?'前往标记房间寻找遗骸':'跟随遗骸携带者，攻击同房敌人';}finally{s.active=prior;}};
root.HouseTactics={mapping,events};if(typeof module!=='undefined')module.exports=root.HouseTactics;
})(typeof window!=='undefined'?window:globalThis);
