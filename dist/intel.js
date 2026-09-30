(function(root){
'use strict';
// Rule numbers shown to players come from scenario config so tuning never desyncs the text.
// Values come from the game's frozen haunt rules (Rules.of), falling back to live config before the haunt.
const RULES=(g,id)=>(root.HouseScenarios||(typeof require==='function'?require('./scenarios.js'):{})).Rules.of(g,id);
function situation(g){const s=g.s,p=g.p,R=RULES(g,'ritual'),G=g.ritualGoals();
 if(s.result)return {goal:(s.result.team==='hero'?'英雄':s.result.team==='house'?'小屋':'叛徒')+'获胜',risk:s.result.reason,next:'可查看本局回顾，或保留队伍再开一局。'};
 if(s.phase==='seals')return {goal:'合作修复全部封印，再由一名英雄在入口执行撤离',risk:'全员倒下或时限归零则失败。已修复的房间抵挡侵蚀；入口不自动安全。',next:'已修复 '+s.seals.nodes.filter(n=>n.progress>=n.goal).length+'/'+s.seals.nodes.length+' 处；剩余 '+s.countdown+' 轮。'};
 if(s.phase==='explore')return {goal:'探索房间，积累物品与属性',risk:'抽到预兆不等于已触发作祟。仅该角色回合结束时进行检定。',next:s.drawnOmen?'本回合结束：6 骰总和 < '+s.omen+' 才触发危机。':'继续探索；抽到卡牌会停止移动，仍可使用物品。'};
 const hero=p.team==='hero';
 if(s.phase==='ritual')return {goal:'先获得 '+(hero?G.hero:G.traitor)+' 点仪式进度，争夺幽灵控制权',risk:(G.hero===G.traitor?'':(hero?'叛徒':'英雄')+'只需 '+(hero?G.traitor:G.hero)+' 点。')+'控制幽灵后仍需完成后续目标，并非立即获胜。',next:hero?'英雄控制 → 寻找并安葬遗骸；叛徒控制 → 驱散幽灵。':'控制幽灵后消灭英雄，并阻止他们驱散幽灵。'};
 if(s.phase==='burial')return {goal:hero?'找到遗骸，送至安葬点并执行安葬':'阻止英雄安葬，拖过时限或消灭所有英雄',risk:'安葬时限耗尽或英雄全灭，叛徒获胜。',next:'尚余 '+s.countdown+' 轮；携带者到达安葬点后仍需点击安葬。'};
 if(s.phase==='collapse')return {goal:hero?'累计成功驱散幽灵 '+G.dispel+' 次':'消灭所有英雄，阻止 '+G.dispel+' 次驱散',risk:'轮末可能发生末端房间崩塌，幽灵持续追击。',next:'驱散 '+s.ghost.hits+'/'+G.dispel+'；平局不增加进度，失败可能受到精神伤害。'};
 const r=s.rescue;return {goal:hero?'破网 + 医疗 → 开门 → 下一轮起执行逃脱':'阻止逃脱，拖过时限或消灭英雄',risk:'受困者死亡、英雄全灭或时限耗尽，叛徒获胜。',next:r.door?(s.round>r.openedTurn?'前门已开：英雄到入口点击逃脱即可获胜。':'前门已开：下一轮起才能逃脱，尚未获胜。'):'开门前需同时完成破网和医疗；两项可并行。'};
}
function endTurn(g){const s=g.s,order=s.phase==='explore'?s.players:s.players.filter(p=>p.team==='hero').concat(s.players.filter(p=>p.team==='traitor')),i=order.findIndex(p=>p.id===s.active),next=order.slice(i+1).find(p=>p.alive),last=!next,out=[];
 if(s.result)return ['对局已结束。'];
 if(s.phase==='explore'&&s.drawnOmen)out.push('先掷 6 骰；总和小于 '+s.omen+' 触发作祟并重排行动顺序。');
 if(!last){out.push((s.phase==='explore'&&s.drawnOmen?'若未触发作祟，':'')+'交给 '+next.name+(s.phase==='explore'?'。':'；这一轮还没结束，时限不变。'));return out;}
 if(s.phase==='seals')out.push(s.round===s.seals.startedRound?'作祟当轮不侵蚀、不扣时限。':`安全房间外的英雄受到 ${RULES(g,'seals').erosion} 点${(s.round-s.seals.startedRound)%2?'精神':'物理'}伤害；随后时限减 1。`);
 if(s.phase==='rescue'){out.push(s.rescue.spider.stunned?'蜘蛛跳过本次追击并解除击退状态。':'蜘蛛追击英雄，接触目标时可能攻击。');out.push(s.round>s.rescue.startedRound?'随后逃脱时限减 1 轮。':'作祟开始的这一轮不扣减逃脱时限。');}
 if(s.phase==='burial')out.push(s.round>s.summonRound?'安葬时限减 1 轮；此阶段幽灵不追击。':'召唤当轮不扣减安葬时限；此阶段幽灵不追击。');
 if(s.phase==='collapse')out.push('结算幽灵行动；符合条件的末端房间可能崩塌，在场角色受伤后撤离。');
 out.push('本轮结算后开始下一轮；若结算触发胜负则立即结束。');return out;
}
function checks(g){const s=g.s,p=g.p,C={ritual:RULES(g,'ritual'),rescue:RULES(g,'rescue'),seals:RULES(g,'seals')},R=C.ritual,rows=[],add=(name,dice,condition,cost,result)=>rows.push({name,dice:Math.min(8,dice),condition,cost,result});
 if(s.phase==='seals'){const n=s.seals.nodes.find(n=>n.room===p.room);if(n&&n.progress<n.goal)add('修复封印',g.val(p,n.trait,true),'总和 ≥ '+C.seals.repairThreshold,'一次任务；不消耗移动','成功 +1；失败无额外损失；每处需 '+n.goal+' 次成功。');}
 if(s.phase==='ritual')for(const [t,n]of [[2,'知识仪式'],[3,'理智仪式']])add(n,g.val(p,t,true),'总和 ≥ '+R.threshold,'一次任务；失败也消耗','成功为阵营增加 '+(p.team==='hero'?R.heroGain:R.traitorGain)+' 点；失败不增加。');
 if(s.phase==='burial'&&p.team==='hero'&&s.carrier===null)add('寻找遗骸',g.val(p,2,true),'总和 ≥ '+R.corpseThreshold,'一次任务；需在遗骸房间','成功后由当前角色携带；失败可下回合重试。');
 if(s.phase==='rescue'&&p.team==='hero'){
 const r=s.rescue;if(r.web<r.webGoal)add('撕开蛛网',g.val(p,0)+(p.items.some(i=>i.type==='weapon')?2:0),'严格大于蛛网 '+C.rescue.webDefense+' 骰','一次攻击；需与受困者同房','成功 +1；平局或失败不推进，也不反伤。');
 if(!r.eggs)add('处理蜘蛛卵',g.val(p,2,true),'总和 ≥ '+C.rescue.medicineThreshold,'一次任务；需携带用品并与受困者同房','成功处理；失败保留用品，任务次数仍消耗。');
 if(!r.door)for(const [t,n]of [[0,'力量破门'],[2,'知识开锁']])add(n,g.val(p,t,true),'总和 ≥ '+C.rescue.doorThreshold,'一次任务；完成救援并到达入口','成功后本回合不能移动；下一轮起才可逃脱。');
 }
 if(s.phase==='collapse'&&p.team==='hero')add('驱散幽灵',g.val(p,3,true),'严格大于幽灵 '+R.ghostDefense+' 骰','一次攻击；需与幽灵同房','成功 +1 并击晕；失败时受到差值精神伤害；平局无效果。');
 if(['rescue','burial','collapse'].includes(s.phase))add('普通攻击',g.val(p,0)+(p.items.some(i=>i.type==='weapon')?2:0),'严格大于同房敌人的力量骰','一次攻击','胜方对败方造成差值物理伤害；你也可能被反击，平局无伤害。');
 return rows;
}
function important(log){return /作祟|仪式|遗骸|安葬|驱散|蜘蛛|医疗|破网|前门|逃脱|倒下|死亡|崩塌|获胜|伤害|预兆|时限|控制权/.test(log.msg);}
root.HouseIntel={situation,endTurn,checks,important};if(typeof module!=='undefined')module.exports=root.HouseIntel;
})(typeof window!=='undefined'?window:globalThis);
