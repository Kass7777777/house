// S1-QA-02: pre-tuning saves (house/tests/fixtures/s1-prefix-saves.json) resumed in the real browser app, played to the end.
// Usage: node s1-legacy.cjs out.jsonl
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const exe = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1208/chrome-win64/chrome.exe');
const OUT = process.argv[2] || path.join(__dirname, 's1-legacy.jsonl');
const URL = process.env.URL || 'http://127.0.0.1:4173/';
const FIX = require(path.join(__dirname, '..', 'house', 'tests', 'fixtures', 's1-prefix-saves.json')).saves;
const tick = () => {
  const s = game.s;
  if (s.result) return { done: 1, result: s.result, modalTitle: modal.querySelector('h2')?.textContent, logged: JSON.parse(localStorage.getItem('house-playlog') || '[]').length, hauntRules: s.hauntRules };
  if (typeof beat !== 'undefined' && beat) return { beat: 1, t: Date.now() };
  if (modal.open) { const bs = [...modal.querySelectorAll('button:not([disabled])')]; const picks = bs.filter(b => (b.dataset.action || '').startsWith('damagePick'));
    const b = (picks.length ? picks[0] : null) || bs.find(b => b.classList.contains('primary')) || bs.find(b => !/关闭|取消|返回/.test(b.textContent)) || bs[0];
    window.__botStep = true; try { b ? b.click() : modal.close(); } finally { window.__botStep = false; } return { modal: 1, round: s.round, phase: s.phase }; }
  if (!game.isAI()) { if (!Game.prototype.__botPatched) { const o = Game.prototype.isAI; Game.prototype.isAI = function (p = this.p) { return o.call(this, p) || (!!window.__botStep && p.id === this.s.active); }; Game.prototype.__botPatched = 1; }
    const before = s.active; window.__botStep = true; try { game.invoke('aiStep'); } finally { window.__botStep = false; } afterAction(before, false); return { human: 1, round: s.round, active: s.active, seq: s.logSeq }; }
  if (!window.__sched || Date.now() - window.__sched > 3000) { window.__sched = Date.now(); scheduleAI(); }
  return { ai: 1, round: s.round, active: s.active, seq: s.logSeq };
};
(async () => {
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  fs.writeFileSync(OUT, '');
  for (const [i, f] of FIX.entries()) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await page.goto(URL);
    await page.evaluate(st => { localStorage.setItem('house-v03-save', JSON.stringify(st)); }, f.state);
    await page.reload();
    const t0 = Date.now();
    const pre = await page.evaluate(() => { const hasBtn = !!document.querySelector('[data-action="resume"]'); act('resume'); HouseSettings.set('reducedMotion', true); aiPace = 5; readingMode = 'fast';
      const s = game.s; const panel = document.body.innerText; help(); const h = modal.innerText; closeModal();
      return { hasBtn, scenario: s.scenario, phase: s.phase, round: s.round, hauntRules: s.hauntRules, ritualGoals: s.ritualGoals || null, countdown: s.countdown, panel: panel.replace(/\s+/g, ' '), help: h.replace(/\s+/g, ' ') }; });
    let last = '', same = 0, st, ticks = 0;
    while (ticks++ < 8000) { st = await page.evaluate(tick); if (st.done) break; const k = JSON.stringify(st); same = k === last ? same + 1 : 0; last = k; if (same > 150) { st = { STALL: st }; break; } await page.waitForTimeout(st.ai ? 12 : st.beat ? 40 : 2); }
    const rec = { i, scenario: f.scenario, count: f.count, seed: f.seed, hit: f.hit, ...pre, end: st, ms: Date.now() - t0, errs };
    fs.appendFileSync(OUT, JSON.stringify(rec) + '\n');
    await ctx.close();
  }
  fs.appendFileSync(OUT, 'BATCH_DONE\n'); await browser.close(); process.exit(0);
})();
