(function(root){
'use strict';
const TRAITS=['力量','速度','知识','理智'];
const CAST=[['薇拉','探险家','#d6aa67',[[2,3,3,4,5,6,7,8],[2,3,4,4,5,6,7,8],[1,2,3,4,4,5,6,7],[1,2,3,4,5,5,6,7]]],['林默','学者','#8dc4c7',[[1,2,2,3,4,5,6,7],[2,2,3,4,4,5,6,7],[2,3,4,5,5,6,7,8],[2,3,3,4,5,6,7,8]]],['艾琳','灵媒','#b4a3cc',[[1,2,3,3,4,5,6,7],[2,3,3,4,5,6,7,8],[2,3,3,4,5,6,7,8],[2,3,4,5,6,6,7,8]]],['罗伊','守夜人','#c78175',[[2,3,4,5,6,6,7,8],[2,3,3,4,5,6,7,8],[1,2,3,3,4,5,6,7],[1,2,2,3,4,5,6,7]]],['米娅','摄影师','#93b581',[[1,2,3,3,4,5,6,7],[2,3,4,5,6,6,7,8],[2,3,3,4,5,6,7,8],[1,2,3,4,4,5,6,7]]],['奥斯卡','医生','#c3bb8c',[[1,2,3,4,4,5,6,7],[2,3,3,4,5,6,7,8],[2,3,4,5,6,6,7,8],[1,2,3,4,5,6,7,8]]]];
const DIRS=[[0,-1,'北'],[1,0,'东'],[0,1,'南'],[-1,0,'西']];
const ROOMDEFS=[['图书室','E',[0,1],[0,1,2]],['礼拜堂','O',[0,1],[0,2,3]],['储藏室','I',[-1,0],[0,1,2,3]],['餐厅','O',[0],[0,1,2]],['画廊','O',[0,1],[0,1,2,3]],['卧室','E',[1],[0,2,3]],['书房','I',[0,1],[0,1,2]],['音乐室','O',[0,1],[0,1,3]],['温室','O',[0],[0,1,2]],['古物室','O',[-1,1],[0,1,2]],['地窖','I',[-1],[0,1,2,3]],['墓穴','O',[-1],[0,2,3]],['锅炉房','E',[-1],[0,1,2]],['实验室','I',[-1,1],[0,1,3]],['阁楼','O',[1],[0,1,2]],['客厅','O',[0,1],[0,1,2,3]],['煤槽','E',[0],[0,2,3]],['密室','O',[-1,0,1],[0,1,2]],['观星台','I',[1],[0,1,2]],['长廊','E',[-1,0,1],[0,1,2,3]],['镜厅','O',[-1,0,1],[0,2,3]],['旧教室','O',[-1,0,1],[0,1,2]],['祭器室','I',[-1,0,1],[0,1,2]],['幽暗回廊','O',[-1,0,1],[0,1,2,3]]];
const ITEMS=[['急救包','恢复最弱属性 2 格；消耗。','heal'],['镇静剂','恢复理智 2 格；消耗。','calm'],['旧斧','攻击时力量骰 +2；防守不加成。','weapon'],['典籍','知识检定骰 +1。','book'],['护符','理智检定骰 +1。','charm'],['能量饮料','本回合移动 +2；消耗。','speed']];
const OMENS=['裂纹圣像','陌生人的肖像','染血戒指','黑羽','古老面具','铜铃','封蜡信件','失踪者的吊坠','旧怀表','乌鸦雕像','碎裂镜片','兽骨','最后的预言'];
function hash(str){let h=2166136261;for(const c of String(str))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0||1}
class Game{
 constructor(options={},saved){if(saved){
  this.s=JSON.parse(JSON.stringify(saved));
  if(this.s.version===1){
   this.s.legacyAutoTraitor=this.s.mode==='solo'&&this.s.phase==='explore';
   this.s.players.forEach((p,i)=>{p.castId??=i;p.controller=this.s.mode==='solo'&&p.team==='traitor'?'ai':'human'});
   this.s.version=2;
  }
  this.s.aiBlocked??=[];this.s.aiSteps??=0;return
 }this.s={version:2,aiBlocked:[],aiSteps:0,seed:String(options.seed||'HOUSE-03'),rng:hash(options.seed||'HOUSE-03'),mode:options.mode||'solo',players:[],rooms:[],deck:[],phase:'explore',active:0,round:1,omen:0,drawnOmen:false,moves:0,attackUsed:false,taskUsed:false,logs:[],dice:[],report:null,heroProgress:0,traitorProgress:0,controller:null,hauntRound:0,countdown:6,ghost:null,corpseRoom:null,carrier:null,burialRoom:null,result:null,actions:0,startedAt:Date.now(),testStart:!!options.quick};let s=this.s;let n=Math.max(3,Math.min(6,Math.trunc(Number(options.count)||4)));
 let humanCount=Math.max(1,Math.min(n,Math.trunc(Number(options.humanCount)||(s.mode==='solo'?1:n))));
 const supplied=options.roster||Array.from({length:n},(_,i)=>i);
 if(supplied.length!==n||new Set(supplied).size!==n||supplied.some(i=>!Number.isInteger(i)||!CAST[i]))throw Error('请选择不重复的有效角色');
 s.players=supplied.map((castId,i)=>{const c=CAST[castId];return{id:i,castId,controller:i<humanCount?'human':'ai',name:c[0],role:c[1],color:c[2],tracks:c[3],idx:[3,3,3,3],room:'0:0:0',team:'explorer',alive:true,items:[],used:[]}});s.rooms=[this.room(0,0,0,'入口大厅','', [0,1,2,3]),this.room(0,-1,0,'大楼梯','',[0,1,2,3]),this.room(0,0,1,'上层平台','',[0,1,2,3]),this.room(0,0,-1,'地下平台','',[0,1,2,3])];s.deck=this.shuffle(ROOMDEFS.map((_,i)=>i));s.itemDeck=this.shuffle(ITEMS.map((_,i)=>i));s.omenDeck=this.shuffle(OMENS.map((_,i)=>i));this.log('大门在身后关闭。打开未知的门，探索这座房屋。');this.turnStart();if(options.quick)this.quickStart();}
 room(x,y,f,name,card,doors){return{id:`${f}:${x}:${y}`,x,y,f,name,card,doors,collapsed:false}}
 rng(){let x=this.s.rng;x^=x<<13;x^=x>>>17;x^=x<<5;this.s.rng=x>>>0;return(x>>>0)/4294967296}
 shuffle(a){for(let i=a.length-1;i>0;i--){let j=Math.floor(this.rng()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
 isAI(p=this.p){return p.controller==='ai'}
 get p(){return this.s.players[this.s.active]}
 get roomNow(){return this.s.rooms.find(r=>r.id===this.p.room)}
 val(p,t,roll=false){let n=p.tracks[t][Math.max(0,p.idx[t])];if(roll&&t===2&&p.items.some(i=>i.type==='book'))n++;if(roll&&t===3&&p.items.some(i=>i.type==='charm'))n++;return n}
 roll(n,label){const dice=Array.from({length:Math.max(0,Math.min(8,n))},()=>Math.floor(this.rng()*3));this.s.dice=dice;const total=dice.reduce((a,b)=>a+b,0);this.log(`${label}：${dice.join(' + ')} = ${total}`);return total}
 log(msg){this.s.logs.push({round:this.s.round,msg});if(this.s.logs.length>250)this.s.logs.shift()}
 report(title,text){this.s.report={title,text}}
 turnStart(){this.s.moves=this.val(this.p,1);this.s.attackUsed=false;this.s.taskUsed=false;this.s.drawnOmen=false;this.p.used=[];this.s.aiSteps=0}
 change(p,t,n){p.idx[t]=Math.min(7,Math.max(this.s.phase==='explore'?0:-1,p.idx[t]+n));if(p.idx[t]<0){p.alive=false;this.log(`${p.name}倒下了。物品留在原地。`);const r=this.s.rooms.find(x=>x.id===p.room);r.loot=(r.loot||[]).concat(p.items);p.items=[];if(this.s.carrier===p.id){this.s.carrier=null;this.s.corpseRoom=p.room}this.checkVictory()}}
 damage(p,n,type='physical'){let traits=type==='physical'?[0,1]:[2,3];for(let i=0;i<n&&p.alive;i++){const t=p.idx[traits[0]]>=p.idx[traits[1]]?traits[0]:traits[1];this.change(p,t,-1)}this.log(`${p.name}承受 ${n} 点${type==='physical'?'物理':'精神'}伤害（自动分配到余量较多的属性轨）。`)}
 canAct(){return !this.s.result&&this.p.alive}
 neighbors(id){const r=this.s.rooms.find(x=>x.id===id);if(!r||r.collapsed)return[];let a=[];for(const d of r.doors){const[dx,dy]=DIRS[d];let n=this.s.rooms.find(x=>x.f===r.f&&x.x===r.x+dx&&x.y===r.y+dy);if(n&&!n.collapsed&&n.doors.includes((d+2)%4))a.push(n)}if(r.name==='大楼梯')a.push(...this.s.rooms.filter(x=>['上层平台','地下平台'].includes(x.name)&&!x.collapsed));if(['上层平台','地下平台'].includes(r.name))a.push(...this.s.rooms.filter(x=>x.name==='大楼梯'&&!x.collapsed));return a}
 exits(){const r=this.roomNow;return DIRS.map(([dx,dy,label],d)=>{let target=this.s.rooms.find(x=>x.f===r.f&&x.x===r.x+dx&&x.y===r.y+dy);let open=r.doors.includes(d)&&(!target||(!target.collapsed&&target.doors.includes((d+2)%4)));return{d,label,target,open}})}
 cost(){let n=0;if(this.s.phase!=='explore'){n=this.s.players.filter(p=>p.alive&&p.room===this.p.room&&p.team!==this.p.team).length;if(this.s.ghost&&this.s.ghost.room===this.p.room&&this.s.controller!==this.p.team&&!this.s.ghost.stunned)n++}return 1+n}
 moveRoom(id){if(!this.canAct())return false;const target=this.neighbors(this.p.room).find(r=>r.id===id);if(!target||this.s.moves<this.cost())return false;this.s.moves-=this.cost();this.p.room=id;this.s.actions++;this.log(`${this.p.name}进入${target.name}。`);return true}
 move(d){const ex=this.exits()[d];if(!this.canAct()||!ex.open||this.s.moves<this.cost())return false;if(ex.target)return this.moveRoom(ex.target.id);return this.discover(d)}
 discover(d){let s=this.s,r=this.roomNow;const[dx,dy]=DIRS[d];let chosen=-1,doors;for(let i=0;i<s.deck.length;i++){const def=ROOMDEFS[s.deck[i]];if(!def[2].includes(r.f))continue;let best=-1;for(let rot=0;rot<4;rot++){const ds=def[3].map(v=>(v+rot)%4);if(!ds.includes((d+2)%4))continue;let score=0,frontier=0;for(const nd of ds){const[a,b]=DIRS[nd];const near=s.rooms.find(z=>z.f===r.f&&z.x===r.x+dx+a&&z.y===r.y+dy+b);if(!near){score++;frontier++}else if(near.doors.includes((nd+2)%4))score+=3}if(frontier&&score>best){best=score;doors=ds;chosen=i}}if(chosen>=0)break}if(chosen<0){this.report('无法继续探索','当前楼层没有可合法放置的房间，请使用其他门或楼梯。');return false}const def=ROOMDEFS[s.deck.splice(chosen,1)[0]],nr=this.room(r.x+dx,r.y+dy,r.f,def[0],def[1],doors);s.rooms.push(nr);s.aiBlocked=[];s.moves-=this.cost();this.p.room=nr.id;s.actions++;this.log(`${this.p.name}发现${nr.name}。`);this.draw(nr.card);if(nr.name==='煤槽'){this.p.room='-1:0:0';this.log('煤槽将探索者送往地下平台。')}return true}
 omenNotice(){return this.s.phase==='explore'?`你获得了预兆，当前累计 ${this.s.omen} 个。当前尚未触发作祟。回合结束时才会掷 6 颗骰子：只有总和小于 ${this.s.omen}，才会触发作祟，进入降魂仪式；总和等于或大于 ${this.s.omen}，则继续探索。`:'作祟已经触发，本次获得预兆不会再次进行作祟检定。';}
 draw(type){let s=this.s;s.moves=0;if(type==='I'){if(!s.itemDeck.length){this.report('空置的柜子','道具牌堆已耗尽。');return}const i=s.itemDeck.pop(),it=ITEMS[i];this.p.items.push({id:`item-${i}`,name:it[0],desc:it[1],type:it[2]});this.log(`获得道具：${it[0]}。`);this.report('道具 · '+it[0],it[1]+' 抽卡后本回合移动结束，仍可使用物品。');}else if(type==='O'){if(!s.omenDeck.length){this.report('寂静','预兆牌堆已耗尽。');return}const i=s.omenDeck.pop();s.omen++;s.drawnOmen=true;this.p.items.push({id:`omen-${i}`,name:OMENS[i],type:'omen',desc:'预兆纪念物。此验证版不附加独立能力。'});this.log(`预兆：${OMENS[i]}。累计 ${s.omen}。`);this.report('预兆 · '+OMENS[i],this.omenNotice());}else{const events=[['墙内的低语',3,'mental'],['腐朽的地板',1,'physical'],['黑暗中的触碰',0,'physical'],['无法读懂的日记',2,'mental'],['镜中的陌生人',3,'mental'],['尘封的机关',2,'physical']];const e=events[Math.floor(this.rng()*events.length)],v=this.roll(this.val(this.p,e[1],true),e[0]);if(v>=4){this.change(this.p,e[1],1);this.report('事件 · '+e[0],`${TRAITS[e[1]]}检定 ${v} ≥ 4。对应属性提升 1 格。`)}else{this.damage(this.p,1,e[2]);this.report('事件 · '+e[0],`检定 ${v} < 4，承受 1 点${e[2]==='mental'?'精神':'物理'}伤害。`)}}}
 use(id){if(!this.canAct())return false;let p=this.p,it=p.items.find(x=>x.id===id);if(!it||p.used.includes(id))return false;if(it.type==='heal')this.change(p,p.idx.indexOf(Math.min(...p.idx)),2);else if(it.type==='calm')this.change(p,3,2);else if(it.type==='speed')this.s.moves+=2;else return false;p.used.push(id);p.items=p.items.filter(x=>x.id!==id);this.log(`${p.name}使用${it.name}。`);this.s.actions++;return true}
 trade(id,targetId){if(!this.canAct())return false;const it=this.p.items.find(x=>x.id===id),t=this.s.players.find(p=>p.id===targetId);if(!it||it.type==='omen'||!t||t.id===this.p.id||!t.alive||t.room!==this.p.room||this.p.used.includes(id))return false;this.p.items=this.p.items.filter(x=>x.id!==id);t.items.push(it);this.p.used.push(id);this.log(`${this.p.name}将${it.name}交给${t.name}。`);return true}
 pickup(){if(!this.canAct()||!this.roomNow.loot?.length)return false;this.p.items.push(...this.roomNow.loot);this.p.used.push(...this.roomNow.loot.map(i=>i.id));this.roomNow.loot=[];this.log(`${this.p.name}拾取了遗落道具。`);return true}
 quickStart(){let s=this.s;for(const [x,y,f,name]of[[1,0,0,'礼拜堂'],[1,-1,0,'图书室'],[-1,0,0,'书房'],[1,0,1,'卧室'],[0,-1,1,'古物室'],[1,0,-1,'墓穴'],[0,-1,-1,'地窖']])s.rooms.push(this.room(x,y,f,name,'',[0,1,2,3]));s.deck=s.deck.filter(i=>!s.rooms.some(r=>r.name===ROOMDEFS[i][0]));s.omen=6;s.omenDeck=s.omenDeck.slice(6);s.players[0].items.push({id:'item-0',name:ITEMS[0][0],desc:ITEMS[0][1],type:'heal'});s.itemDeck=s.itemDeck.filter(i=>i!==0);this.startHaunt();this.log('验证入口：预置地图和 6 个预兆，跳过探索。')}
 startHaunt(){let s=this.s;if(s.phase!=='explore')return;s.phase='ritual';let candidates=s.players.filter(p=>p.alive);let tr=candidates.reduce((a,b)=>this.val(a,3)<=this.val(b,3)?a:b);for(const p of s.players)p.team=p.id===tr.id?'traitor':'hero';s.traitor=tr.id;if(s.legacyAutoTraitor){tr.controller='ai';s.legacyAutoTraitor=false}s.active=s.players.findIndex(p=>p.alive&&p.team==='hero');s.hauntRound=1;this.turnStart();this.log(`作祟降临：${tr.name}成为叛徒。降魂仪式开始。`);this.report('降魂仪式',`${tr.name}成为叛徒。英雄与叛徒竞逐仪式；先达到 3 点进度的一方掌控幽灵。仪式期间禁止普通攻击。每名角色每回合可在任意房间用知识或理智检定一次，目标值 4；英雄成功 +1，叛徒成功 +2。`)}
 taskAvailability(){
 const s=this.s,p=this.p,name=id=>s.rooms.find(r=>r.id===id)?.name||'目标房间';
 let label='任务',reason='当前阶段没有任务行动。';
 if(s.phase==='ritual'){label='仪式';reason='';}
 if(s.phase==='burial'&&p.team==='hero'){
  label=s.carrier===p.id?'安葬遗骸':'寻找遗骸';
  reason=s.carrier!==null&&s.carrier!==p.id?`遗骸已由${s.players[s.carrier].name}携带，无需再次搜索。`:p.room!==(s.carrier===p.id?s.burialRoom:s.corpseRoom)?`需要前往${name(s.carrier===p.id?s.burialRoom:s.corpseRoom)}；当前在${name(p.room)}。`:'';
 }
 if(!this.canAct())reason=s.result?'对局已经结束。':'当前角色已倒下。';
 else if(s.taskUsed)reason='本回合已尝试任务，请下回合再试；失败也会消耗尝试次数。';
 return {label,reason,available:!reason};
 }
 task(trait=2){let s=this.s,p=this.p;if(!this.taskAvailability().available)return false;if(s.phase==='ritual'){if(![2,3].includes(trait))return false;s.taskUsed=true;const n=this.roll(this.val(p,trait,true),`${p.name}的${TRAITS[trait]}仪式检定`);s.actionFeedback={player:p.name,title:n>=4?'仪式成功':'仪式失败',text:`${TRAITS[trait]}检定：${s.dice.join(' + ')} = ${n}，目标 ≥ 4。${n>=4?'阵营进度增加 '+(p.team==='hero'?1:2)+' 点。':'进度不变。'}本回合任务次数已使用。`};if(n>=4){const key=p.team==='hero'?'heroProgress':'traitorProgress';s[key]+=p.team==='hero'?1:2;this.log(`${p.team==='hero'?'英雄':'叛徒'}仪式进度 ${s[key]}/3。`);if(s[key]>=3)this.summon(p.team)}else this.log('仪式未取得进展。');s.actions++;return true}if(s.phase==='burial'&&p.team==='hero'){if(s.carrier===null&&p.room===s.corpseRoom){s.taskUsed=true;const v=this.roll(this.val(p,2,true),'寻找遗骸');s.actionFeedback={player:p.name,title:v>=4?'找到遗骸':'未找到遗骸',text:`知识检定：${s.dice.join(' + ')} = ${v}，目标 ≥ 4。${v>=4?'你已携带遗骸，前往安葬点完成任务。':'遗骸仍在这里，下回合可以再次搜索。'}本回合任务次数已使用。`};this.log(s.actionFeedback.text);if(v>=4){s.carrier=p.id;this.log(`${p.name}找到了遗骸，需送往${this.s.rooms.find(r=>r.id===s.burialRoom).name}。`)}return true}if(s.carrier===p.id&&p.room===s.burialRoom){s.taskUsed=true;this.endGame('hero','遗骸被安葬，幽灵获得安息。');return true}}return false}
 summon(team){let s=this.s;s.controller=team;s.ghost={room:this.p.room,stunned:false,hits:0};s.countdown=6;if(team==='hero'){s.phase='burial';s.summonRound=s.round;let rooms=s.rooms.filter(r=>!r.collapsed&&r.id!==this.p.room);s.corpseRoom=rooms[Math.floor(this.rng()*rooms.length)].id;s.burialRoom=s.rooms.find(r=>r.name==='墓穴')?.id||'-1:0:0';this.report('幽灵回应了英雄','在标记房间以知识 ≥ 4 寻找遗骸，携带它到安葬点并执行安葬。6 个完整轮次后幽灵失控。叛徒可以攻击英雄，阻止安葬。');this.log('控制权转移：英雄。寻找遗骸并完成安葬。')}else{s.phase='collapse';this.report('幽灵回应了叛徒','房屋开始崩塌。英雄需与幽灵同房，每回合以理智攻击一次；胜过幽灵的 4 骰防御可积累 1 次驱散，累计 3 次获胜。幽灵自动追击，叛徒仍可行动。');this.log('控制权转移：叛徒。世界状态切换为崩塌。')}}
 attack(target){let s=this.s,p=this.p;if(!this.canAct()||s.attackUsed||!['burial','collapse'].includes(s.phase))return false;if(target==='ghost'){if(s.phase!=='collapse'||p.team!=='hero'||s.ghost.room!==p.room)return false;s.attackUsed=true;const a=this.roll(this.val(p,3,true),'驱散幽灵'),d=this.roll(4,'幽灵抵抗');if(a>d){s.ghost.hits++;s.ghost.stunned=true;this.log(`驱散进度 ${s.ghost.hits}/3；幽灵被击晕。`);if(s.ghost.hits>=3)this.endGame('hero','幽灵被彻底驱散，房屋停止崩塌。')}else if(d>a)this.damage(p,d-a,'mental');return true}const t=s.players.find(x=>x.id===Number(target));if(!t||!t.alive||t.team===p.team||t.room!==p.room)return false;s.attackUsed=true;s.actions++;const w=p.items.some(i=>i.type==='weapon')?2:0,a=this.roll(this.val(p,0)+w,`${p.name}攻击`),d=this.roll(this.val(t,0),`${t.name}防守`);if(a>d)this.damage(t,a-d);else if(d>a)this.damage(p,d-a);else this.log('攻防平局，无伤害。');return true}
 path(start,goal){let q=[[start]],seen=new Set([start]);while(q.length){let p=q.shift(),last=p.at(-1);if(last===goal)return p;for(const n of this.neighbors(last))if(!seen.has(n.id)){seen.add(n.id);q.push([...p,n.id])}}return[]}
 ghostTurn(){const s=this.s,g=s.ghost;if(s.phase!=='collapse'||!g)return;if(g.stunned){g.stunned=false;this.log('幽灵从击晕中恢复，本轮不行动。');return}let targets=s.players.filter(p=>p.alive&&p.team==='hero').map(p=>({p,path:this.path(g.room,p.room)})).filter(x=>x.path.length).sort((a,b)=>a.path.length-b.path.length);if(!targets.length)return;const t=targets[0];let move=this.roll(2,'幽灵移动');g.room=t.path[Math.min(move,t.path.length-1)];this.log(`幽灵移动至${s.rooms.find(r=>r.id===g.room).name}。`);if(g.room===t.p.room){const a=this.roll(4,'幽灵精神攻击'),d=this.roll(this.val(t.p,3,true),`${t.p.name}理智防御`);if(a>d)this.damage(t.p,a-d,'mental');else if(d>a){g.stunned=true;this.log('幽灵被防御反制击晕。')}}}
 roundEnd(){const s=this.s;if(s.result)return;if(s.phase==='collapse'){const protectedIds=new Set(['0:0:0','0:0:-1','1:0:0','-1:0:0',s.ghost.room]);const opts=s.rooms.filter(r=>!r.collapsed&&!protectedIds.has(r.id)&&this.neighbors(r.id).length<=1);if(opts.length){let r=opts[Math.floor(this.rng()*opts.length)];const exit=this.neighbors(r.id)[0];if(exit){for(const p of s.players.filter(p=>p.alive&&p.room===r.id)){this.damage(p,1);p.room=exit.id}r.collapsed=true;this.log(`${r.name}崩塌！在场探索者受伤后撤离。`)}}}if(s.phase==='burial'&&s.round>s.summonRound){s.countdown--;this.log(`安葬剩余 ${s.countdown} 轮。`);if(s.countdown<=0)this.endGame('traitor','未能及时安葬遗骸，幽灵吞没了房屋。')}if(s.result)return;s.round++;if(s.phase!=='explore')s.hauntRound++}
 order(){const ps=this.s.players.filter(p=>p.alive);return this.s.phase==='explore'?ps:ps.filter(p=>p.team==='hero').concat(ps.filter(p=>p.team==='traitor'))}
 endTurn(){let s=this.s;if(s.result)return false;s.actions++;if(s.phase==='explore'&&s.drawnOmen){const v=this.roll(6,'作祟检定');s.lastHauntCheck={serial:(s.lastHauntCheck?.serial||0)+1,total:v,omen:s.omen,dice:[...s.dice],playerId:s.active,round:s.round};if(v<s.omen){this.startHaunt();return true}this.log(`检定 ${v} ≥ ${s.omen}，暂时安全。`)}const order=s.phase==='explore'?s.players:s.players.filter(p=>p.team==='hero').concat(s.players.filter(p=>p.team==='traitor'));let i=order.findIndex(p=>p.id===s.active);let next=order.slice(i+1).find(p=>p.alive);if(!next){this.ghostTurn();this.roundEnd();next=this.order()[0]}if(!s.result&&next){s.active=next.id;this.turnStart()}this.checkVictory();return true}

 // Controller is independent from faction. Each AI action consumes normal rules.
 aiStep(){
  const s=this.s,p=this.p;if(!this.isAI()||s.result)return false;
  if(!p.alive||++s.aiSteps>40){this.endTurn();return true}
  const heal=p.items.find(i=>!p.used.includes(i.id)&&((i.type==='heal'&&Math.min(...p.idx)<=2)||(i.type==='calm'&&p.idx[3]<=2)));
  if(heal&&this.use(heal.id))return true;
  if(this.roomNow.loot?.length&&this.pickup())return true;
  if(s.phase==='ritual'){
   if(!s.taskUsed){this.task(this.val(p,2,true)>=this.val(p,3,true)?2:3);return true}
   this.endTurn();return true;
  }
  if(s.phase==='explore'){
   if(s.moves<=0){this.endTurn();return true}
   const plans=[];
   for(const room of s.rooms.filter(r=>!r.collapsed)){
    const path=this.path(p.room,room.id);if(!path.length)continue;
    for(const d of room.doors){const[dx,dy]=DIRS[d];
     if(!s.rooms.some(r=>r.f===room.f&&r.x===room.x+dx&&r.y===room.y+dy)&&!s.aiBlocked.includes(room.id+'/'+d))plans.push({room,d,path});
    }
   }
   plans.sort((a,b)=>a.path.length-b.path.length||a.room.id.localeCompare(b.room.id)||a.d-b.d);
   const plan=plans[0];
   if(plan){
    if(plan.path.length>1&&this.moveRoom(plan.path[1]))return true;
    if(plan.path.length===1){
     if(this.move(plan.d))return true;
     s.aiBlocked.push(plan.room.id+'/'+plan.d);s.report=null;return true;
    }
   }
   this.endTurn();return true;
  }
  let targetRoom=null,attackTarget=null;
  const enemies=s.players.filter(t=>t.alive&&t.team!==p.team).map(t=>({p:t,path:this.path(p.room,t.room)})).filter(t=>t.path.length).sort((a,b)=>(s.carrier===b.p.id)-(s.carrier===a.p.id)||a.path.length-b.path.length);
  if(p.team==='traitor'){
   const enemy=enemies[0];if(enemy){targetRoom=enemy.p.room;attackTarget=enemy.p.id}
  }else if(s.phase==='collapse'){
   targetRoom=s.ghost.room;attackTarget='ghost';
  }else if(s.phase==='burial'){
   if(s.carrier===p.id)targetRoom=s.burialRoom;
   else if(s.carrier===null)targetRoom=s.corpseRoom;
   else targetRoom=s.players[s.carrier].room;
   if(!s.taskUsed&&this.task(2))return true;
   // A carrier prioritizes delivering the objective over optional combat.
   if(s.carrier===p.id&&p.room!==s.burialRoom){
    const route=this.path(p.room,s.burialRoom);
    if(route.length>1){
     if(this.moveRoom(route[1]))return true;
     const boost=p.items.find(i=>i.type==='speed'&&!p.used.includes(i.id));
     if(boost&&this.use(boost.id))return true;
    }
   }
   const nearby=enemies.find(t=>t.p.room===p.room);
   if(nearby)attackTarget=nearby.p.id;
  }
  if(!s.attackUsed&&attackTarget!==null){
   const room=attackTarget==='ghost'?s.ghost.room:s.players[attackTarget].room;
   if(room===p.room&&this.attack(attackTarget))return true;
  }
  if(targetRoom&&targetRoom!==p.room){
   const path=this.path(p.room,targetRoom);
   if(path.length>1){
    if(this.moveRoom(path[1]))return true;
    const speed=p.items.find(i=>i.type==='speed'&&!p.used.includes(i.id));
    if(speed&&this.use(speed.id))return true;
   }
  }
  this.endTurn();return true;
 }
 aiTurn(){
  if(!this.isAI()||this.s.result)return false;
  const active=this.s.active,round=this.s.round;
  for(let i=0;i<45&&!this.s.result&&this.s.active===active&&this.s.round===round;i++)this.aiStep();
  return true;
 }

 checkVictory(){if(this.s.phase==='explore'||this.s.result)return;if(!this.s.players.some(p=>p.alive&&p.team==='hero'))this.endGame('traitor','所有英雄都已倒下。');else if(this.s.phase==='ritual'&&!this.s.players.some(p=>p.alive&&p.team==='traitor'))this.summon('hero')}
 endGame(team,reason){if(this.s.result)return;this.s.result={team,reason,round:this.s.round,actions:this.s.actions};this.s.phase='end';this.log(`${team==='hero'?'英雄':'叛徒'}获胜：${reason}`)}
}
root.House={Game,TRAITS,CAST,DIRS,ROOMDEFS,ITEMS};if(typeof module!=='undefined')module.exports=root.House;
})(typeof window!=='undefined'?window:globalThis);
