(function(root){
'use strict';
const names=['力量','速度','知识','理智'];
function next(g){
 const s=g.s,p=g.p,r=g.roomNow;
 if(s.result)return{title:'本局已结束',text:s.result.reason,focus:'结束后可以导出日志复盘，或返回菜单开始新对局。',action:null};
 if(!p.alive)return{title:'当前角色已倒下',text:'作祟后任意属性降到骷髅格就会死亡。这个角色不能再行动。',focus:'点击结束回合，让其他存活角色继续。',action:'end'};
 if(g.isAI())return{title:'现在观察 AI 的行动',text:`${p.name}由电脑控制，不需要你替它点击移动或结束回合。AI 和你遵守相同的移动、抽卡与检定规则。`,focus:'关注地图上的位置变化和「房屋纪事」。轮到手动角色时，操作按钮会恢复。',action:null};
 if(s.phase==='explore'){
  if(s.moves===0)return{title:'移动结束了，回合还没结束',text:s.drawnOmen?`本回合抽到了预兆。点击结束回合后会掷 6 颗骰子，总和严格小于当前 ${s.omen} 个预兆时，作祟开始。相等不会触发。`:'发现带卡牌的房间会让剩余移动归零；重新进入已发现房间不会再次抽牌。你仍可使用道具。',focus:'看看左侧有没有可使用的道具；准备好后点击「结束回合」。',action:'end'};
  const e=g.exits().find(e=>e.open&&!e.target);
  return{title:e?'打开一扇未知的门':'沿相通的门继续探索',text:`你正在控制${p.name}，位于${r.name}，剩余 ${s.moves} 点移动。${e?'点击虚线框中的「＋」，或下方标有「探索」的方向按钮。':'点击相邻且门相通的房间。楼层按钮只切换视图，换楼层需要站在楼梯或平台上。'}`,focus:'目标是扩展地图并积累道具。速度决定移动预算；右侧预兆越多，结束回合时触发作祟的风险越高。',action:e?'move:'+e.d:null};
 }
 if(s.phase==='ritual')return{title:s.taskUsed?'本回合仪式已尝试':'尝试一次降魂仪式',text:`你是${p.team==='hero'?'英雄':'叛徒'}。知识或理智任选一项检定，骰子总和 ≥ 4 就成功；${p.team==='hero'?'英雄成功增加 1 点':'叛徒成功增加 2 点'}，先到 3 点的一方控制幽灵。`,focus:s.taskUsed?'无论成功或失败，每名角色每回合只能尝试一次。可以结束回合，等待下次机会。':'优先选数值更高的属性。每颗骰子只出 0、1、2；属性值表示骰子数量，不保证成功。仪式阶段不能攻击。',action:s.taskUsed?'end':'task:'+(g.val(p,2,true)>=g.val(p,3,true)?2:3)};
 if(p.team==='traitor')return{title:s.phase==='burial'?'阻止英雄安葬遗骸':'配合幽灵追击英雄',text:s.phase==='burial'?`英雄还有 ${s.countdown} 轮。寻找携带遗骸的英雄，移动到同一房间后攻击，拖过期限即可获胜。`:'幽灵会在轮末自动行动。你可以追击英雄，并在同一房间攻击。全部英雄倒下，叛徒获胜。',focus:'每回合最多攻击一次。力量为攻击骰池；攻击败北也可能受伤。离开敌人所在房间需要更多移动力。',action:null};
 if(s.phase==='collapse')return{title:'靠近幽灵并驱散它',text:`已成功驱散 ${s.ghost.hits}/3 次。与幽灵同房时使用「驱散幽灵」，以理智骰池对抗幽灵 4 颗骰子；严格高于对方才成功。`,focus:s.attackUsed?'本回合已经攻击过。结束回合后才可再次驱散。':'成功会击晕幽灵；失败可能承受精神伤害。注意每轮的崩塌和角色属性余量。',action:s.attackUsed?'end':s.ghost.room===p.room?'attack:ghost':null};
 const burial=s.rooms.find(r=>r.id===s.burialRoom),corpse=s.rooms.find(r=>r.id===s.corpseRoom);
 if(s.carrier===p.id)return{title:`把遗骸送往${burial.name}`,text:`你正在携带遗骸，剩余 ${s.countdown} 轮。沿门和楼梯到达安葬点，再执行「安葬遗骸」才算完成；仅仅走进房间不会获胜。`,focus:s.taskUsed?'本回合已经尝试任务，需要下回合才能安葬。':'在地图寻找 ◎ 标记。换层要用楼梯，避免与叛徒纠缠。',action:p.room===s.burialRoom&&!s.taskUsed?'task:2':null};
 if(s.carrier===null)return{title:`前往${corpse.name}寻找遗骸`,text:`在标记房间点击「寻找遗骸」，知识检定 ≥ 4 才会找到。之后还要携带它前往${burial.name}安葬。剩余 ${s.countdown} 轮。`,focus:s.taskUsed?'这回合已经尝试任务，失败也要等到下回合重试。':'知识高的角色更适合搜索。关注右侧目标和倒计时。',action:p.room===s.corpseRoom&&!s.taskUsed?'task:2':null};
 return{title:`协助${s.players[s.carrier].name}运送遗骸`,text:`遗骸已由${s.players[s.carrier].name}携带，其他英雄不必重复搜索。目标是让携带者到达${burial.name}并安葬。`,focus:`剩余 ${s.countdown} 轮。可接近叛徒牵制它，或使用道具恢复属性；无事可做时结束回合。`,action:null};
}
function impact(before,after,type){
 const p=before.players[before.active],q=after.players[p.id],out=[];
 if(q.room!==p.room){const room=after.rooms.find(r=>r.id===q.room);out.push(`${p.name}从${before.rooms.find(r=>r.id===p.room).name}移动到${room.name}。`)}
 if(after.rooms.length>before.rooms.length)out.push('发现新房间，首次进入时的卡牌效果已结算；抽卡让本回合剩余移动归零。');
 if(before.active===after.active&&before.round===after.round&&before.moves!==after.moves)out.push(`剩余移动：${before.moves} → ${after.moves}。`);
 for(const old of before.players){const now=after.players[old.id];for(let t=0;t<4;t++)if(now.idx[t]!==old.idx[t])out.push(`${old.name}的${names[t]}轨移动 ${now.idx[t]-old.idx[t]} 格（${old.tracks[t][Math.max(0,old.idx[t])]} → ${now.idx[t]<0?'骷髅':now.tracks[t][now.idx[t]]}）。`);if(old.alive&&!now.alive)out.push(`${old.name}倒下，物品掉落在房间中。`)}
 const added=q.items.filter(i=>!p.items.some(x=>x.id===i.id));const removed=p.items.filter(i=>!q.items.some(x=>x.id===i.id));
 if(added.length)out.push('获得：'+added.map(i=>i.name).join('、')+'。');if(removed.length)out.push('离开背包：'+removed.map(i=>i.name).join('、')+'。');
 if(after.omen!==before.omen)out.push(`全局预兆 ${before.omen} → ${after.omen}。预兆不是生命值；它提高作祟触发风险。`);
 if(type==='end'){out.push(`${p.name}的回合结束。`);if(before.drawnOmen&&before.phase==='explore')out.push(after.phase==='explore'?'本次 6 骰检定没有触发作祟，继续探索。':'本次 6 骰检定触发了作祟，阵营和目标已改变。');}
 if(type==='give')out.push(...after.logs.slice(-1).map(l=>l.msg));
 if(type==='task'||type==='attack')out.push(...after.logs.slice(-4).map(l=>l.msg));
 if(before.phase!==after.phase)out.push('阶段发生变化，请重新查看下方「下一步」和右侧目标。');
 if(before.carrier!==after.carrier&&after.carrier!==null)out.push(`${after.players[after.carrier].name}现在携带遗骸。`);
 if(!out.length)out.push(type==='give'?'道具已移交，同一件物品本回合不能再次执行物品动作。':type==='pickup'?'遗落道具已拾取，本回合不能再次操作这些物品。':'操作已结算。查看当前目标决定下一步。');
 return [...new Set(out)].slice(0,8);
}
root.HouseGuide={next,impact};if(typeof module!=='undefined')module.exports=root.HouseGuide;
})(typeof window!=='undefined'?window:globalThis);
