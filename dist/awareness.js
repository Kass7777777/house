(function(root){
'use strict';
const {Game,TRAITS}=root.House||(typeof require==='function'?require('./engine.js'):{}),P=Game.prototype,invoke=P.invoke;
const room=(s,id)=>s.rooms.find(r=>r.id===id)?.name||'未知房间';
function capture(before,s){const lines=[],actor=before.players[before.active],add=(text,important=false)=>lines.push({text,important});
 for(const p of s.players){const old=before.players.find(q=>q.id===p.id);if(!old)continue;
 if(old.alive&&!p.alive)add(`${p.name}倒下了，遗落物品留在${room(s,p.room)}。`,true);
 if(old.room!==p.room)add(`${p.name}从${room(before,old.room)}来到${room(s,p.room)}。`);
 const found=p.items.filter(i=>!old.items.some(o=>o.id===i.id));if(found.length)add(`${p.name}获得：${found.map(i=>i.name).join('、')}`,true);
 for(let t=0;t<4;t++){const delta=p.idx[t]-old.idx[t];if(delta)add(`${p.name}的${TRAITS[t]} ${delta>0?'+':''}${delta} 格（${old.tracks[t][Math.max(0,old.idx[t])]} → ${p.idx[t]<0?'死亡':p.tracks[t][p.idx[t]]}）`,true);}
 }
 if(s.phase!==before.phase)add(s.result?s.result.reason:`局势变化：${{seals:'封印之夜开始，全员合作',ritual:'降魂仪式开始',rescue:'命运罗网开始',burial:'英雄控制幽灵，开始运送遗骸',collapse:'叛徒控制幽灵，房屋开始崩塌'}[s.phase]||s.phase}`,true);
 for(const [key,label]of [['heroProgress','英雄仪式'],['traitorProgress','叛徒仪式']])if(s[key]!==before[key])add(`${label} ${before[key]} → ${s[key]} / 3`,true);
 if(s.carrier!==before.carrier&&s.carrier!==null)add(`${s.players[s.carrier].name}开始携带遗骸。`,true);
 if(s.ghost&&before.ghost){if(s.ghost.hits!==before.ghost.hits)add(`驱散幽灵 ${s.ghost.hits} / 3`,true);if(s.ghost.room!==before.ghost.room)add(`幽灵移动到${room(s,s.ghost.room)}。`,true);}
 if(s.rescue&&before.rescue){const a=s.rescue,b=before.rescue;if(a.web!==b.web)add(`破网救援 ${b.web} → ${a.web} / ${a.webGoal}`,true);if(a.eggs&&!b.eggs)add('蜘蛛卵已处理。',true);if(a.door&&!b.door)add('前门已打开，下一轮起可执行逃脱。',true);if(a.kitHolder!==b.kitHolder&&a.kitHolder!==null)add(`${s.players[a.kitHolder].name}携带专用医疗用品。`,true);if(a.spider.room!==b.spider.room)add(`蜘蛛追到${room(s,a.spider.room)}。`,true);if(a.spider.stunned&&!b.spider.stunned)add('蜘蛛被击退，将跳过下一次行动。',true);}
 if(s.seals&&before.seals)for(const n of s.seals.nodes){const old=before.seals.nodes.find(x=>x.room===n.room);if(old&&old.progress!==n.progress)add(`${room(s,n.room)}封印 ${old.progress} → ${n.progress}/${n.goal}`,true);}
 if(s.countdown!==before.countdown&&['rescue','burial','seals'].includes(s.phase))add(`时限剩余 ${s.countdown} 轮。`,true);
 for(const r of s.rooms)if(r.collapsed&&!before.rooms.find(x=>x.id===r.id)?.collapsed)add(`${r.name}已崩塌。`,true);
 const fresh=s.logs.filter(l=>(l.seq||0)>(before.logSeq||0));if(!lines.length){const msg=fresh.filter(l=>!l.msg.startsWith('AI ·')).at(-1)?.msg;if(msg)add(msg,/未成功|失败|未取得|伤害/.test(msg));else if(s.active!==before.active||s.round!==before.round)add(`${actor.name}结束回合。`);}
 if(!lines.length)return;
 s.awarenessSeq=(s.awarenessSeq||0)+1;s.awareness??=[];s.awareness.push({id:s.awarenessSeq,actor:actor.id,name:actor.name,round:before.round,lines,rolls:(s.rollHistory||[]).filter(r=>r.serial>(before.lastRoll?.serial||0))});s.awareness=s.awareness.slice(-100);
}
P.invoke=function(name,args=[],allocations=[]){const before=JSON.parse(JSON.stringify(this.s)),ok=invoke.call(this,name,args,allocations);if(ok&&!this.s.pendingDecision)capture(before,this.s);return ok;};
root.HouseAwareness={capture};if(typeof module!=='undefined')module.exports=root.HouseAwareness;
})(typeof window!=='undefined'?window:globalThis);
