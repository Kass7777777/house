// Presentation shell (loaded after app.js): title screen, settings, pause menu, single-screen HUD layout,
// haunt cinematic, turn banner and keyboard shortcuts. Wraps app.js globals; never changes rules or RNG.
(function (root) {
'use strict';
if (typeof render !== 'function' || typeof act !== 'function') return;
const VERSION = 'v24';
const KEY = 'house-settings';
const DEFAULTS = { aiPace: 'normal', reading: null, uiScale: 1, reducedMotion: false, shake: true };
const PACE = { slow: 2000, normal: 1100, fast: 200 };
const store = (() => { try { return root.localStorage; } catch { return null; } })();
let settings = { ...DEFAULTS };
try { settings = { ...DEFAULTS, ...JSON.parse(store?.getItem(KEY) || '{}') }; } catch { }
const HouseSettings = {
  get: k => settings[k],
  set(k, v) { settings[k] = v; try { store?.setItem(KEY, JSON.stringify(settings)); } catch { } apply(); },
  all: () => ({ ...settings }),
};
root.HouseSettings = HouseSettings;
function apply() {
  try { aiPace = PACE[settings.aiPace] || 1100; } catch { }
  if (settings.reading) try { readingMode = settings.reading; } catch { }
  const de = root.document?.documentElement;
  if (de?.style) { de.style.setProperty('--ui-scale', String(settings.uiScale || 1)); de.classList?.toggle('reduce-motion', !!settings.reducedMotion); }
}
apply();
const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const B = (label, action, cls = '', disabled = false) => `<button class="${cls}" data-action="${action}" ${disabled ? 'disabled' : ''}>${label}</button>`;
const motion = () => !settings.reducedMotion && !(root.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const desktop = () => !!root.matchMedia?.('(min-width: 1100px) and (min-height: 640px)').matches;

// ---------- title screen ----------
function title() {
  clearTimeout(aiTimer); game = null; showedResult = false; pendingHandoff = false;
  if (modal.open) modal.close();
  const s = saved(), sc = s && HouseScenarios.configs[s.scenario];
  const cont = s ? `<button class="title-item primary" data-action="resume"><span>继续上次对局</span><small>第 ${s.round} 轮 · ${s.phase === 'explore' ? '探索中' : E(sc?.title || '')} · ${s.players.length} 名角色</small></button>` : '';
  const motes = Array.from({ length: 26 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${8 + (i * 7) % 11}s;--delay:${-(i * 1.3) % 9}s;--s:${1 + (i % 3)}px"></i>`).join('');
  app.className = 'title-mode';
  app.innerHTML = `<section class="title-screen"><div class="title-art" aria-hidden="true"></div><div class="title-fog f1"></div><div class="title-fog f2"></div><div class="title-motes" aria-hidden="true">${motes}</div>
<div class="title-panel"><div class="eyebrow">THE HOUSE ON THE HILL · ${VERSION}</div><h1 class="title-logo">山中小屋</h1>
<p class="title-sub">推开每一扇门，积攒勇气与遗物。<br>直到小屋露出真面目，有人会站到另一边。</p>
<nav class="title-menu" aria-label="主菜单">${cont}
<button class="title-item ${s ? '' : 'primary'}" data-action="titleNew"><span>新的探索</span><small>组建 3–6 人的队伍，选择剧本入口</small></button>
<button class="title-item" data-action="settings"><span>设置</span><small>声音、AI 节奏、界面缩放、动效</small></button>
<button class="title-item" data-action="playlog"><span>试玩数据</span><small>${window.HousePlaylog ? HousePlaylog.load().length + ' 局记录 · 导出 CSV' : '每局自动记录'}</small></button>
<button class="title-item" data-action="help"><span>规则说明</span><small>探索、预兆、作祟与三个剧本</small></button>
<button class="title-item" data-action="credits"><span>制作说明</span><small>版本、素材来源与已知边界</small></button></nav></div>
<footer class="title-foot"><span>进度自动保存在本机浏览器</span><span>Esc 菜单 · H 快捷键</span></footer></section>`;
  window.HouseAudio?.observe(null);
  requestAnimationFrame?.(() => app.querySelector('.title-item')?.focus());
}
function credits() {
  openModal(`<div class="eyebrow">CREDITS</div><h2>制作说明</h2>
<p>《山中小屋》依据《山中小屋 游戏策划案 v0.3》制作，目前是可以完整游玩的试玩版：探索、作祟和三个剧本都已可玩。</p>
<ul class="credits"><li><strong>规则与剧本</strong>降魂仪式、命运罗网为策划案样本的原型适配；封印之夜为原创合作剧本。均非官方内容的复刻。</li>
<li><strong>画面</strong>开场与剧本插图来自策划案概念图；棋盘场景、角色、光影全部由程序实时绘制。</li>
<li><strong>声音</strong>全部由浏览器实时合成，没有使用录音素材。</li>
<li><strong>存档</strong>保存在当前浏览器，不上传任何数据。</li>
<li><strong>版本</strong>${VERSION} · 本地单人 / 同机多人。尚未包含联机与完整 HD-2D 实机画面。</li></ul>
<div class="dialogactions">${B('关闭', 'close', 'primary')}</div>`);
}

// ---------- settings ----------
let settingsTab = 'game';
function settingsDialog(tab = settingsTab) {
  settingsTab = tab;
  const tabs = [['game', '游戏'], ['display', '显示'], ['sound', '声音']].map(([k, l]) => `<button class="tab ${k === tab ? 'on' : ''}" data-action="settingsTab:${k}">${l}</button>`).join('');
  const opt = (key, value, label, cur) => `<button class="seg ${cur === value ? 'on' : ''}" data-action="setting:${key}:${value}">${label}</button>`;
  const row = (label, help, ctl) => `<div class="set-row"><div><strong>${label}</strong><small>${help}</small></div><div class="seg-group">${ctl}</div></div>`;
  let body = '';
  if (tab === 'game') {
    const rm = readingMode;
    body = row('AI 行动节奏', '电脑角色每一步之间的停顿。', opt('aiPace', 'slow', '慢', settings.aiPace) + opt('aiPace', 'normal', '正常', settings.aiPace) + opt('aiPace', 'fast', '快', settings.aiPace))
      + row('AI 与队友的行动结果', '逐条确认：每条结果都等你点继续。自动继续：停留一会儿后自己关闭。只看关键：只在作祟、死亡、目标进展时弹出，其余写进房屋纪事。', opt('reading', 'confirm', '逐条确认', rm) + opt('reading', 'auto', '自动继续', rm) + opt('reading', 'fast', '只看关键', rm))
      + row('新手引导', '新开对局时是否默认开启。局内可随时跳过。', opt('guide', 'on', '开启', guidePreference() ? 'on' : 'off') + opt('guide', 'off', '关闭', guidePreference() ? 'on' : 'off'));
  } else if (tab === 'display') {
    body = row('界面缩放', '侧栏、行动栏和弹窗的文字大小，不影响地图。', [0.9, 1, 1.1, 1.25].map(v => opt('uiScale', v, Math.round(v * 100) + '%', settings.uiScale)).join(''))
      + row('屏幕震动', '受伤、作祟时地图轻微震动。', opt('shake', true, '开', settings.shake) + opt('shake', false, '关', settings.shake))
      + row('减少动态', '关闭粒子、闪电、补间和过场动画。系统开启"减少动态"时也会自动遵守。', opt('reducedMotion', false, '关', settings.reducedMotion) + opt('reducedMotion', true, '开', settings.reducedMotion));
  }
  if (tab === 'sound' && window.HouseAudio) {
    openModal(`<div class="settings-tabs">${tabs}</div>${HouseAudio.settingsHTML()}`);
    HouseAudio.bind(modal); modal.dataset.panel = 'settings'; return;
  }
  openModal(`<div class="settings-tabs">${tabs}</div><div class="eyebrow">SETTINGS</div><h2>设置</h2><div class="set-list">${body}</div><div class="dialogactions">${B('完成', 'close', 'primary')}</div>`);
  modal.dataset.panel = 'settings';
}
function setSetting(key, raw) {
  const v = raw === 'true' ? true : raw === 'false' ? false : isNaN(Number(raw)) ? raw : Number(raw);
  if (key === 'reading') { readingMode = v; try { localStorage.setItem('house-reading', v); } catch { } HouseSettings.set('reading', v); }
  else if (key === 'guide') setGuidePreference(v === 'on');
  else HouseSettings.set(key, v);
  if (key === 'aiPace') scheduleAI?.();
  settingsDialog(settingsTab);
  if (game && ['uiScale', 'reducedMotion'].includes(key)) setTimeout(() => { render(); if (modal.open) settingsDialog(settingsTab); }, 0);
}

// ---------- pause menu & shortcuts ----------
function pauseMenu() {
  const s = game.s;
  openModal(`<div class="pause-menu"><div class="eyebrow">PAUSED · 第 ${s.round} 轮</div><h2>暂停</h2><p class="helper">对局已自动保存。AI 在菜单打开期间不会行动。</p>
<nav class="pause-list">${B('继续游戏', 'close', 'primary')}${B('设置', 'settings')}${B('对局回顾', 'recap')}${B('规则说明', 'help')}${B('重新开启新手引导', 'guideOn')}${B('快捷键', 'shortcuts')}${B('导出复盘日志', 'export')}${B('保存并返回标题', 'toTitle')}</nav></div>`);
  modal.dataset.panel = 'pause';
}
function shortcuts() {
  const k = [['W A S D / 方向键', '向北、西、南、东移动或探索'], ['空格', '结束回合'], ['F', '镜头回到当前角色'], ['1 / 2 / 3', '查看地下 / 一层 / 二层'], ['P', '暂停或继续 AI'], ['Esc', '打开菜单 / 关闭窗口'], ['H', '显示本表'], ['鼠标滚轮', '缩放地图'], ['拖动地图', '平移镜头；双击复位']];
  openModal(`<div class="eyebrow">CONTROLS</div><h2>快捷键</h2><table class="keys">${k.map(([a, b]) => `<tr><td><kbd>${a}</kbd></td><td>${b}</td></tr>`).join('')}</table><div class="dialogactions">${B('知道了', 'close', 'primary')}</div>`);
}

// ---------- HUD layout ----------
let wasDeskLayout = false;
function hud() {
  if (!game || !app.querySelector('.game')) return;
  const desk = desktop();
  app.classList.toggle('desk', desk);
  // compact top bar: keep only turn-flow controls; everything else lives in the pause menu
  const tools = app.querySelector('.toptools');
  if (tools) {
    const s = game.s, human = s.players.filter(q => !game.isAI(q)).length;
    // AI pace and event reading live in Settings; the bar keeps only what you reach for mid-turn
    const hasAI = s.players.length > human;
    tools.innerHTML = `<span id="saveStatus" class="helper">已自动保存</span>`
      + (hasAI ? B(aiPaused ? '▶ 继续 AI' : 'Ⅱ 暂停 AI', 'aiPause', 'small' + (aiPaused ? ' on' : '')) : '')
      + `${B(sound ? '♪ 声音开' : '♪ 声音关', 'sound', 'small icon', false)}${B('设置', 'settings', 'small')}${B('☰ 菜单', 'menu', 'small')}`;
  }
  if (!desk) { if (wasDeskLayout) window.HouseBoard?.draw(true); wasDeskLayout = false; return; }
  wasDeskLayout = true;
  const wrap = app.querySelector('.mapwrap'), center = app.querySelector('.center');
  if (!wrap || !center) return;
  const top = document.createElement('div'); top.className = 'hud-top';
  const status = center.querySelector('.compact-status'), head = center.querySelector('.maphead');
  if (head) top.append(head); if (status) top.append(status);
  const left = document.createElement('div'); left.className = 'hud-left';
  center.querySelectorAll(':scope > .guide-panel').forEach(e => left.append(e));
  const right = document.createElement('div'); right.className = 'hud-right';
  center.querySelectorAll(':scope > .action-feedback').forEach(e => right.append(e));
  const hint = center.querySelector(':scope > .maphint');
  wrap.append(top, left, right); if (hint) wrap.append(hint);
  const bar = center.querySelector('.actionbar');
  if (bar && !bar.querySelector('.dock-side')) {
    const main = document.createElement('div'), side = document.createElement('div'); main.className = 'dock-main'; side.className = 'dock-side';
    [...bar.children].forEach(el => (el.matches('.end-forecast,.endrow') ? side : main).append(el));
    bar.append(main, side);
  }
  window.HouseBoard?.draw(true);
}
// ---------- turn banner ----------
let lastTurn = null;
function banner() {
  if (!game || game.s.result) return;
  const s = game.s, key = s.seed + '|' + s.startedAt + '|' + s.turnSerial;
  if (key === lastTurn) return; const first = lastTurn === null || !lastTurn.startsWith(s.seed + '|' + s.startedAt); lastTurn = key;
  if (first && !s.turnSerial) return;
  const wrap = app.querySelector('.mapwrap'); if (!wrap) return;
  wrap.querySelectorAll('.turn-banner').forEach(e => e.remove());
  const p = game.p, ai = game.isAI(), el = document.createElement('div');
  el.className = 'turn-banner' + (ai ? ' ai' : ''); el.style.setProperty('--c', p.color);
  const team = s.phase !== 'explore' ? ' · ' + (p.team === 'traitor' ? '叛徒' : '英雄') : '';
  el.innerHTML = ai
    ? `<strong>${E(p.name)}的回合</strong><span>电脑 AI 行动中${team}</span>`
    : `<small>ROUND ${String(s.round).padStart(2, '0')}${s.phase === 'explore' ? ' · 探索' : ' · ' + E(game.scenario.title)}</small><strong>${E(p.name)}的回合</strong><span>移动力 ${s.moves}${team}</span>`;
  // centre on the part of the map the side panels leave visible
  const hl = wrap.querySelector('.hud-left'), wr = wrap.getBoundingClientRect(), lr = hl && hl.children.length ? hl.getBoundingClientRect() : null;
  if (lr && lr.width && wr.width > 820) el.style.left = ((lr.right - wr.left) + wr.width) / 2 + 'px';
  wrap.append(el); setTimeout(() => el.remove(), ai ? 1500 : motion() ? 2300 : 1600);
}
// ---------- haunt cinematic ----------
const HAUNT = ['封印之夜', '降魂仪式', '命运罗网', '幽灵回应了英雄', '幽灵回应了叛徒'];
const seenCine = new Set();
function cinematic() {
  const r = game?.s.report; if (!r || !HAUNT.includes(r.title) || !modal.open) return;
  const key = game.s.seed + '|' + game.s.startedAt + '|' + r.title; if (seenCine.has(key)) return; seenCine.add(key);
  window.HouseBoard?.flash('#e8f2ff', 0.5); window.HouseBoard?.shake(1);
  if (!motion()) return;
  const sc = game.scenario, el = document.createElement('div');
  el.className = 'haunt-cine'; modal.classList.add('no-anim'); el.setAttribute('role', 'presentation');
  const sub = r.title.startsWith('幽灵') ? r.title : sc.summary || '';
  el.innerHTML = `<div class="hc-flash"></div><div class="hc-inner"><div class="eyebrow">THE HAUNT BEGINS · 作祟降临</div><h1>${E(r.title.startsWith('幽灵') ? sc.title : r.title)}</h1><p>${E(sub)}</p><small>点击任意处继续</small></div>`;
  const done = () => { el.classList.add('out'); setTimeout(() => { el.remove(); modal.classList.remove('no-anim'); }, 500); };
  el.addEventListener('click', e => { e.stopPropagation(); done(); });
  modal.append(el); setTimeout(done, 3600);
}

// ---------- wrap app functions ----------
const _render = render, _act = act, _report = report, _setup = setup, _openModal = openModal;
root.render = render = function () { const r = _render.apply(this, arguments); hud(); banner(); return r; };
root.report = report = function () { const r = _report.apply(this, arguments); try { cinematic(); } catch { } return r; };
root.openModal = openModal = function () { delete modal.dataset.panel; return _openModal.apply(this, arguments); };
root.setup = setup = function () {
  const r = _setup.apply(this, arguments);
  app.className = 'setup-mode';
  if (!app.innerHTML.includes('data-action="toTitle"')) app.innerHTML = app.innerHTML.replace('<div class="setup">', '<div class="setup">' + B('← 返回标题', 'toTitle', 'small back-title'));
  return r;
};
root.act = act = function (action) {
  const [type, ...bits] = String(action).split(':'), arg = bits.join(':');
  if (type !== 'close') window.HouseAudio?.play?.('ui');
  switch (type) {
    case 'titleNew': setup(); return;
    case 'toTitle': if (game) persist(); title(); return;
    case 'settings': settingsDialog(); return;
    case 'settingsTab': settingsDialog(arg); return;
    case 'setting': { const [k, ...v] = bits; setSetting(k, v.join(':')); return; }
    case 'credits': credits(); return;
    case 'shortcuts': shortcuts(); return;
    case 'menu': if (game) { pauseMenu(); return; } break;
    case 'pace': { const r = _act(action); HouseSettings.set('aiPace', { 1100: 'normal', 200: 'fast', 2000: 'slow' }[aiPace] || 'normal'); return r; }
    case 'readingMode': { const r = _act(action); HouseSettings.set('reading', readingMode); return r; }
    case 'new': if (modal.open) modal.close(); title(); return;
  }
  return _act(action);
};
// keep AI still while a menu is on screen
const _schedule = scheduleAI;
root.scheduleAI = scheduleAI = function () { if (modal.open && ['pause', 'settings'].includes(modal.dataset.panel)) { clearTimeout(aiTimer); return; } return _schedule.apply(this, arguments); };

// ---------- keyboard ----------
document.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName;
  if (e.key === 'Escape') {
    if (modal.open) { if (modal.dataset.panel === 'pause' || modal.dataset.panel === 'settings') { e.preventDefault(); closeModal(); } return; }
    if (game) { e.preventDefault(); pauseMenu(); } else if (app.classList.contains('setup-mode')) { e.preventDefault(); title(); }
    return;
  }
  if (modal.open || ['INPUT', 'SELECT', 'TEXTAREA'].includes(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'h' || k === '?') { e.preventDefault(); shortcuts(); return; }
  if (!game) return;
  if (k === 'f') { e.preventDefault(); act('focus'); }
  else if (k === '1' || k === '2' || k === '3') { e.preventDefault(); act('floor:' + (Number(k) - 2)); }
  else if (k === 'p') { e.preventDefault(); act('aiPause'); }
}, true);
let wasDesk = desktop();
root.addEventListener?.('resize', () => { const d = desktop(); if (d !== wasDesk && game) { wasDesk = d; render(); } });

root.HouseShell = { title, settingsDialog, pauseMenu, shortcuts, credits, VERSION };
if (!game && !modal.open) title();
})(typeof window !== 'undefined' ? window : globalThis);
