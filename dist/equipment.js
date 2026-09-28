(function(root){
'use strict';
const {Game}=root.House||(typeof require==='function'?require('./engine.js'):{}),P=Game.prototype;
P.itemReady=function(id){return this.s.itemActions?.[id]!==this.s.turnSerial&&!this.p.used.includes(id);};
P.markItem=function(id){(this.s.itemActions??={})[id]=this.s.turnSerial;};
const oldUse=P.use,oldTrade=P.trade;
P.use=function(id,trait=null){if(!this.itemReady(id))return false;const ok=oldUse.call(this,id,trait);if(ok)this.markItem(id);return ok;};
P.trade=function(id,target){if(!this.itemReady(id))return false;const ok=oldTrade.call(this,id,target);if(ok){this.markItem(id);this.count(this.p,'transfers');}return ok;};
P.drop=function(id){const p=this.p,i=p.items.find(i=>i.id===id);if(!this.canAct()||!i||i.type==='omen'||!this.itemReady(id))return false;p.items=p.items.filter(i=>i.id!==id);(this.roomNow.loot??=[]).push(i);p.used.push(id);this.markItem(id);this.s.actions++;this.log(`${p.name}将${i.name}放在${this.roomNow.name}。`);return true;};
P.pickup=function(id=null){if(!this.canAct())return false;const loot=this.roomNow.loot||[],items=loot.filter(i=>(id===null||i.id===id)&&this.itemReady(i.id));if(!items.length)return false;this.p.items.push(...items);this.roomNow.loot=loot.filter(i=>!items.includes(i));for(const i of items){this.p.used.push(i.id);this.markItem(i.id);}this.s.actions++;this.log(`${this.p.name}拾取：${items.map(i=>i.name).join('、')}。本回合不能再使用、交易或丢下这些物品。`);return true;};
const oldCan=P.canAct,oldEnd=P.endTurn,oldAttack=P.attack;
P.canAct=function(){return oldCan.call(this)&&!this.s.combatChoice;};
P.endTurn=function(){return this.s.combatChoice?false:oldEnd.call(this);};
P.attack=function(target){
 // Monster combat and noninteractive simulations retain their existing resolution.
 if(target==='ghost'||target==='spider'||!this._decision)return oldAttack.call(this,target);
 const s=this.s,p=this.p,t=s.players.find(x=>x.id===Number(target));
 if(!this.canAct()||s.attackUsed||!['burial','collapse','rescue'].includes(s.phase)||!t?.alive||t.team===p.team||t.room!==p.room||(s.phase==='rescue'&&p.team==='traitor'&&!s.rescue.eggs&&t.id===s.rescue.victim))return false;
 s.attackUsed=true;s.actions++;const a=this.roll(this.val(p,0)+(p.items.some(i=>i.type==='weapon')?2:0),p.name+'攻击'),ar=s.lastRoll,d=this.roll(this.val(t,0),t.name+'防守'),rolls=[ar,s.lastRoll],delta=a-d;
 const loot=t.items.filter(i=>i.type!=='omen'&&this.itemReady(i.id));
 if(delta>=2&&loot.length){s.combatChoice={attacker:p.id,target:t.id,damage:delta,rolls};s.report=null;
  if(this.isAI(p)){const steal=loot.find(i=>['weapon','book','charm'].includes(i.type)&&!p.items.some(j=>j.type===i.type));return this.resolveCombat(steal&&delta<4?'steal:'+steal.id:'damage');}
  return true;
 }
 if(delta>0)this.damage(t,delta);else if(delta<0)this.damage(p,-delta);
 this.report('战斗结算',delta===0?'攻防平局，无伤害。':`${delta>0?t.name:p.name}受到 ${Math.abs(delta)} 点物理伤害。`,rolls);return true;
};
P.resolveCombat=function(choice){const c=this.s.combatChoice;if(!c||this.s.result)return false;const p=this.s.players[c.attacker],t=this.s.players[c.target];if(p.id!==this.s.active)return false;
 if(choice==='damage'){delete this.s.combatChoice;this.damage(t,c.damage);this.log(`${p.name}选择造成 ${c.damage} 点伤害，不夺取物品。`);this.report('战斗结算',`${t.name}受到 ${c.damage} 点物理伤害。`,c.rolls);return true;}
 if(!choice.startsWith('steal:'))return false;const id=choice.slice(6),item=t.items.find(i=>i.id===id&&i.type!=='omen');if(!item||!this.itemReady(id))return false;
 delete this.s.combatChoice;t.items=t.items.filter(i=>i.id!==id);p.items.push(item);p.used.push(id);this.markItem(id);this.count(p,'steals');this.log(`${p.name}放弃全部 ${c.damage} 点伤害，夺取${t.name}的${item.name}。`);this.report('夺取物品',`取得${item.name}；${t.name}不受本次伤害。本回合不能再使用、交易或丢下此物品，持有型效果立即生效。`,c.rolls);return true;
};
const oldAI=P.aiStep;
P.aiStep=function(){if(this.s.combatChoice)return this.resolveCombat('damage');if(this.canAct()&&this.isAI()&&!this.s.eventChoice){
 if((this.roomNow.loot||[]).some(i=>this.itemReady(i.id)))return this.pickup();
 const allies=this.s.players.filter(q=>q.alive&&q.id!==this.p.id&&q.team===this.p.team&&q.room===this.p.room);
 for(const i of this.p.items.filter(i=>i.type!=='omen'&&this.itemReady(i.id))){const utility=q=>i.type==='heal'?7-Math.min(...q.idx):i.type==='calm'?7-q.idx[3]:i.type==='weapon'?this.val(q,0):i.type==='book'?this.val(q,2):i.type==='charm'?this.val(q,3):0;const ally=allies.filter(q=>!q.items.some(j=>j.type===i.type)).sort((a,b)=>utility(b)-utility(a))[0];if(ally&&utility(ally)>utility(this.p)+1){this.log(`${this.p.name}将补给优先交给更需要它的${ally.name}。`);return this.trade(i.id,ally.id);}}
 }return oldAI.call(this);};
root.HouseEquipment={};if(typeof module!=='undefined')module.exports=root.HouseEquipment;
})(typeof window!=='undefined'?window:globalThis);
