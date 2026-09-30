// S1-QA-02 copy spot-check: 3 scenarios × {3,6} players, quick start, 1 human.
// Captures: haunt report (modal), private briefing, help page, objective/status sidebar; plus frozen rules for comparison.
// Usage: node s1-copy.cjs out.json
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const exe = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1208/chrome-win64/chrome.exe');
const OUT = process.argv[2] || path.join(__dirname, 's1-copy.json');
const URL = process.env.URL || 'http://127.0.0.1:4173/';
(async () => {
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const res = [];
  for (const sc of ['ritual', 'rescue', 'seals']) for (const cnt of [3, 6]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await page.goto(URL);
    await page.evaluate(c => { act('mode:solo'); act('scenarioMode:fixed'); act('scenario:' + c.sc); setupConfig.count = c.cnt; setupConfig.humanCount = 1; setup();
      document.querySelector('#seed').value = 'COPY-' + c.sc + c.cnt; document.querySelector('#guideEnabled').checked = false; HouseSettings.set('reducedMotion', true); aiPace = 5; readingMode = 'confirm'; }, { sc, cnt });
    // help page before the haunt (pre-haunt wording)
    const helpPre = await page.evaluate(() => { help(); const t = modal.innerText; closeModal(); return t; });
    await page.evaluate(() => act('quick'));
    await page.waitForTimeout(600);
    // collect every modal until the human's turn with no modal
    const modals = [];
    for (let i = 0; i < 60; i++) {
      const st = await page.evaluate(() => ({ open: modal.open, text: modal.open ? modal.innerText : '', human: game && !game.isAI(), beat: typeof beat !== 'undefined' && !!beat }));
      if (st.open) { modals.push(st.text); await page.evaluate(() => { const b = [...modal.querySelectorAll('button:not([disabled])')]; const x = b.find(b => b.classList.contains('primary')) || b.find(b => !/关闭|取消|返回/.test(b.textContent)) || b[0]; x ? x.click() : modal.close(); }); await page.waitForTimeout(150); continue; }
      if (st.human && !st.beat) break;
      await page.waitForTimeout(100);
    }
    const snap = await page.evaluate(() => {
      const s = game.s; help(); const helpPost = modal.innerText; closeModal();
      let briefText = ''; try { if (typeof brief === 'function') { brief(); briefText = modal.innerText; closeModal(); } } catch (e) { briefText = 'ERR ' + e.message; }
      const side = [...document.querySelectorAll('.objective, .objective-state, aside, .sidebar, #status, .status, .panel')].map(e => e.innerText).join('\n---\n');
      return { helpPost, briefText, side, body: document.body.innerText, state: { scenario: s.scenario, count: s.players.length, hauntRules: s.hauntRules, ritualGoals: s.ritualGoals || null, traitorRoll: s.traitorRoll ? { rows: s.traitorRoll.rows, tied: s.traitorRoll.tied } : null, traitor: s.players[s.traitor]?.name ?? null,
        countdown: s.countdown, rescue: s.rescue ? { webGoal: s.rescue.webGoal, remaining: s.rescue.remaining } : null, seals: s.seals ? { nodes: s.seals.nodes.length, goal: s.seals.nodes[0].goal, remaining: s.seals.remaining } : null, firstReport: s.report?.text || '', logs: s.logs.slice(-30).map(l => l.msg) } };
    });
    res.push({ sc, cnt, helpPre, modals, ...snap, errs });
    await ctx.close();
  }
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  await browser.close(); process.exit(0);
})();
