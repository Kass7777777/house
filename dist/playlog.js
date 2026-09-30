// Playtest data table: one row per finished game, stored locally, exportable as CSV.
// Read-only with respect to game state; never consumes RNG.
(function (root) {
'use strict';
const KEY = 'house-playlog', LIMIT = 300;
const TEAM = { hero: '英雄', traitor: '叛徒', house: '小屋' };
const COLUMNS = [
  ['date', '日期'], ['scenario', '剧本'], ['entry', '入口'], ['reveal', '揭晓方式'], ['mode', '模式'], ['count', '角色数'], ['humans', '手动角色'],
  ['seed', '种子'], ['hauntRound', '作祟轮'], ['endRound', '结束轮'], ['hauntRounds', '作祟后轮数'], ['winner', '胜方'], ['reason', '结束原因'],
  ['traitors', '叛徒'], ['deaths', '死亡角色'], ['survivors', '存活'], ['omens', '预兆数'], ['rooms', '已发现房间'], ['items', '剩余道具'],
  ['actions', '行动数'], ['minutes', '用时(分)'], ['partial', '统计不完整'],
];
function row(game, now = Date.now()) {
  const s = game.s, r = s.result; if (!r) return null;
  // the timeline milestone is authoritative: some scenarios advance rounds without touching s.hauntRound
  const mark = (s.timeline || []).find(t => t.kind === 'haunt');
  const haunted = !!mark || (s.phase !== 'explore' && (s.hauntRound || 0) > 0);
  const hauntRound = mark ? mark.round : haunted ? Math.max(1, s.round - s.hauntRound + 1) : '';
  const names = f => s.players.filter(f).map(p => p.name).join('、');
  const d = new Date(s.startedAt || now), pad = n => String(n).padStart(2, '0');
  return {
    id: s.seed + '|' + (s.startedAt || 0),
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
    scenario: game.scenario?.title || s.scenario, entry: s.testStart ? '直接作祟' : '正常探索',
    reveal: s.scenarioMode === 'auto' ? '探索中揭晓' : '指定剧本', mode: s.mode === 'local' ? '本地多人' : '单人',
    count: s.players.length, humans: s.players.filter(p => p.controller !== 'ai').length, seed: s.seed,
    hauntRound, endRound: r.round ?? s.round, hauntRounds: haunted ? (r.round ?? s.round) - hauntRound + 1 : '',
    winner: TEAM[r.team] || r.team, reason: r.reason, traitors: names(p => p.team === 'traitor') || '无',
    deaths: names(p => !p.alive) || '无', survivors: s.players.filter(p => p.alive).length, omens: s.omen || 0,
    rooms: s.rooms.length, items: s.players.reduce((n, p) => n + (p.alive ? p.items.length : 0), 0), actions: r.actions ?? s.actions,
    minutes: s.startedAt ? Math.max(0, Math.round((now - s.startedAt) / 6000) / 10) : '', partial: s.statsPartial ? '是' : '',
  };
}
function load(store = root.localStorage) { try { const v = JSON.parse(store.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function save(list, store = root.localStorage) { try { store.setItem(KEY, JSON.stringify(list.slice(-LIMIT))); return true; } catch { return false; } }
// Adds the finished game once (keyed by seed + start time). Returns the row if newly added.
function record(game, store = root.localStorage, now = Date.now()) {
  if (!game?.s?.result) return null;
  const r = row(game, now), list = load(store);
  if (list.some(x => x.id === r.id)) return null;
  list.push(r); return save(list, store) ? r : null;
}
function clear(store = root.localStorage) { try { store.removeItem(KEY); } catch { } }
function csvCell(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function csv(list) { return '\ufeff' + [COLUMNS.map(c => c[1]).join(','), ...list.map(r => COLUMNS.map(c => csvCell(r[c[0]])).join(','))].join('\r\n'); }
function summary(list) {
  const by = {};
  for (const r of list) { const k = r.scenario; by[k] ??= { games: 0, hero: 0, rounds: 0, deaths: 0 }; const b = by[k]; b.games++; if (r.winner === '英雄') b.hero++; b.rounds += Number(r.endRound) || 0; b.deaths += r.deaths === '无' ? 0 : String(r.deaths).split('、').length; }
  return Object.entries(by).map(([k, b]) => ({ scenario: k, games: b.games, heroRate: Math.round(b.hero / b.games * 100), avgRounds: Math.round(b.rounds / b.games * 10) / 10, avgDeaths: Math.round(b.deaths / b.games * 10) / 10 }));
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function dialogHTML(list = load()) {
  const shown = ['date', 'scenario', 'entry', 'count', 'humans', 'hauntRound', 'endRound', 'winner', 'deaths', 'reason'];
  const head = COLUMNS.filter(c => shown.includes(c[0]));
  const sum = summary(list);
  return `<div class="eyebrow">PLAYTEST DATA</div><h2>试玩数据表</h2><p class="helper">每局结束自动记录一行，保存在当前浏览器。导出 CSV 含全部 ${COLUMNS.length} 列（种子、叛徒、预兆数、行动数、用时等），可直接用 Excel 打开，用于按剧本汇总胜负、局长和卡点。</p>
${list.length ? `<div class="playlog-summary">${sum.map(b => `<div><strong>${esc(b.scenario)}</strong><span>${b.games} 局 · 英雄胜率 ${b.heroRate}% · 平均 ${b.avgRounds} 轮 · 平均死亡 ${b.avgDeaths}</span></div>`).join('')}</div>
<div class="playlog-wrap"><table class="playlog"><thead><tr>${head.map(c => `<th>${c[1]}</th>`).join('')}</tr></thead><tbody>${list.slice().reverse().slice(0, 60).map(r => `<tr>${head.map(c => `<td>${esc(r[c[0]])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${list.length > 60 ? `<p class="helper">仅显示最近 60 局，导出包含全部 ${list.length} 局。</p>` : ''}` : '<p>还没有完成的对局。打完一局后这里会出现记录。</p>'}
<div class="dialogactions">${list.length ? '<button data-action="playlogClear">清空记录</button><button data-action="playlogCsv">导出 CSV</button>' : ''}<button class="primary" data-action="close">关闭</button></div>`;
}
function download(list = load()) {
  const blob = new Blob([csv(list)], { type: 'text/csv;charset=utf-8' }), a = root.document.createElement('a');
  const d = new Date(), pad = n => String(n).padStart(2, '0');
  a.href = URL.createObjectURL(blob); a.download = `house-playtest-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const api = { KEY, COLUMNS, row, load, save, record, clear, csv, summary, dialogHTML, download };
if (typeof module === 'object' && module.exports) module.exports = api;
if (root) root.HousePlaylog = api;
})(typeof window !== 'undefined' ? window : globalThis);
