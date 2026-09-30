(function(root){
'use strict';
const RoomRules={
 // Rooms nobody can stay in (arrive() moves the entrant on). They are never an objective,
 // an AI waypoint or an AI destination; players may still step in deliberately.
 passThrough(r){return r?.name==='煤槽';},
 outlet(r){return r?.name==='煤槽'?'-1:0:0':null;},
 describe(g){const r=g.roomNow;
  if(r.name==='宝库')return r.vaultOpened?'宝库已开启，珍藏已被取走。':'可以尝试知识检定 ≥ 4 开启宝库。成功获得一件道具，失败不受伤；每回合一次。';
  if(r.name==='塌陷房间')return '首次发现者进行速度检定 ≥ 4，失败坠至下一层平台。之后可自愿跳下；没有向上的捷径。';
  if(r.name==='煤槽')return '进入后会立即滑至地下平台，不会停留在煤槽。';
  return r.card==='O'?'首次发现会获得预兆；再次进入不会重新抽牌。':r.card==='I'?'首次发现会获得道具；再次进入不会重新抽牌。':r.card==='E'?'首次发现会结算事件；再次进入不会重新抽牌。':'沿相通的门移动，楼梯可前往其他楼层。';
 },
 actions(g){const s=g.s,p=g.p,r=g.roomNow,blocked=!g.canAct()?'角色无法行动。':p.restrained?'先挣脱蛛网。':p.doorWait?'开门后请先结束回合。':'';
  if(r.name==='宝库')return [{id:'vault',label:'开启宝库',detail:'知识 ≥ 4，成功获得道具并停止移动。每回合仅一次。',reason:blocked||(r.vaultOpened?'宝库已被开启。':s.roomActionUsed?'本回合已尝试房间行动。':!s.itemDeck.length?'道具已全部被取走。':'')}];
  if(r.name==='塌陷房间')return [{id:'jump',label:'跳到下一层',detail:'消耗 1 移动力，跳到下一层平台。不需要再次检定。',reason:blocked||(s.moves<1?'需要至少 1 点移动力。':'')}];
  return [];
 },
 arrive(g,first=false){const s=g.s,p=g.p,r=g.roomNow;
  if(this.passThrough(r)){
   p.room=this.outlet(r);g.log(`${p.name}滑过煤槽，落在地下平台。`);g.milestone('route','煤槽滑落',`${p.name}被送往地下平台。`);
   return;
  }
  if(r.name==='塌陷房间'&&first){
   const value=g.roll(g.val(p,1),'避开塌陷'),roll=s.lastRoll;
   if(value<4){p.room=r.f===1?'0:0:0':'-1:0:0';g.log(`${p.name}没能避开塌陷，坠至${g.roomNow.name}。`);}
   g.report(value>=4?'跨过裂口':'地板塌陷',value>=4?'速度总和达到 4，你安全停在房间内。以后可选择消耗 1 点移动力跳到下一层。':`速度总和小于 4，你落到${g.roomNow.name}；坠落没有造成伤害。`,[roll]);
   g.milestone('room','发现塌陷房间',`${p.name}${value>=4?'避开裂口':'坠至下一层平台'}。`);
  }
 },
 action(g,id){const s=g.s,p=g.p,r=g.roomNow,a=this.actions(g).find(a=>a.id===id);if(!a||a.reason)return false;
  if(id==='jump'){s.moves--;p.room=r.f===1?'0:0:0':'-1:0:0';s.actions++;g.count(p,'moves');g.log(`${p.name}从塌陷房间跳至${g.roomNow.name}。`);g.report('跳到下一层',`已到达${g.roomNow.name}，消耗 1 点移动力。此处没有返回上层的捷径。`);s.actionFeedback={player:p.name,title:s.report.title,text:s.report.text,rolls:[]};return true;}
  s.roomActionUsed=true;const n=g.roll(g.val(p,2,true),'开启宝库'),roll=s.lastRoll;s.actions++;
  if(n>=4){r.vaultOpened=true;g.draw('I');g.count(p,'roomsOpened');g.milestone('room','宝库已打开',`${p.name}在宝库取出${p.items.at(-1)?.name||'道具'}。`);g.report('宝库开启成功',`知识总和 ${n} ≥ 4。获得${p.items.at(-1)?.name||'道具'}；剩余移动归零。`,[roll]);}
  else g.report('宝库尚未打开',`知识总和 ${n} < 4。没有损失道具或属性；下回合可以再试，也可以继续移动。`,[roll]);
  s.actionFeedback={player:p.name,title:s.report.title,text:s.report.text,rolls:s.report.rolls};return true;
 }
};
root.HouseRooms=RoomRules;if(typeof module!=='undefined')module.exports=RoomRules;
})(typeof window!=='undefined'?window:globalThis);
