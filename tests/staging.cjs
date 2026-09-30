// v23 staging: when the board is animating, an AI action's dialog waits for the walk instead of covering it.
// Also: a click during the wait skips it without applying the click; the AI waits for its own walk;
// with reduced motion (or no board) everything stays synchronous exactly as before.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const app = { innerHTML: '', className: '', classList: { add() {}, remove() {}, contains: () => false, toggle() {} }, querySelector: () => null, querySelectorAll: () => [] };
const modal = { innerHTML: '', dataset: {}, open: false, showModal() { this.open = true }, close() { this.open = false }, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, classList: { add() {}, remove() {} } };
const timers = new Map(); let nextId = 1;
const ctx = { document: { querySelector: q => q === '#app' ? app : q === '#modal' ? modal : null, querySelectorAll: () => [], addEventListener() {} }, localStorage: { getItem: () => null, setItem() {} },
  setTimeout(fn, ms) { const id = nextId++; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); }, requestAnimationFrame() {}, matchMedia: () => ({ matches: true }), console };
ctx.window = ctx; ctx.addEventListener = () => {}; vm.createContext(ctx);
for (const file of ['scenarios.js', 'rooms.js', 'engine.js', 'tactics.js', 'equipment.js', 'seals.js', 'awareness.js', 'guide.js', 'intel.js', 'board.js', 'audio.js', 'playlog.js', 'app.js', 'shell.js'])
  vm.runInContext(fs.readFileSync('dist/' + file, 'utf8'), ctx, { filename: file });
const run = src => vm.runInContext(src, ctx);

// reduced motion / no canvas: dialogs open synchronously (old behaviour)
run("game=new Game({count:4,humanCount:1,seed:'STAGE-1'});readingMode='confirm';floor=game.roomNow.f;render();");
assert.equal(run('HouseBoard.animating()'), false);
run("game.s.report={title:'道具 · 旧斧',text:'x'};stage(report,300,cueFor(0));");
assert.equal(modal.open, true, 'no animation: dialog opens immediately');
assert.equal(run('beat'), null);
run('modal.close();game.s.report=null;');

// animating board: the dialog waits for the walk, the AI waits too
const cues = [];
run('HouseBoard.animating=()=>true;HouseBoard.busyMs=()=>600;');
ctx.HouseBoard.cue = (...a) => cues.push(a);
timers.clear();
run("game.s.report={title:'预兆 · 黑羽',text:'lore\\n\\nnotice',actor:0};stage(report,500,cueFor(0));");
assert.equal(modal.open, false, 'dialog is held back while the board animates');
assert.ok(run('beat'), 'beat pending');
const held = [...timers.values()].find(t => t.ms === 1100);
assert.ok(held, 'wait = board time + hold');
assert.ok(cues.some(c => c[0] === 0 && String(c[1]).includes('黑羽')), 'bubble over the actor names what was found');
// a click during the wait skips it and is not applied
const moves = run('game.s.moves'), room = run('game.p.room');
run("act('move:1')");
assert.equal(modal.open, true, 'click flushes the beat and shows the dialog');
assert.equal(run('beat'), null);
assert.equal(run('game.s.moves'), moves); assert.equal(run('game.p.room'), room, 'the skipping click did not move anyone');
run('modal.close();game.s.report=null;');
// AI pacing honours the walk
run('aiPace=200;');
assert.equal(run('aiDelay()'), 720, 'fast AI waits for walk + short pause');
run('aiPace=1100;');
assert.equal(run('aiDelay()'), 1100, 'normal pace already longer than the walk');
run('HouseBoard.busyMs=()=>0;');
assert.equal(run('aiDelay()'), 1100);

// leaving to the title during a beat drops it
run("HouseBoard.busyMs=()=>600;game.s.report={title:'x',text:'y'};stage(report,0);setup();");
assert.equal(run('beat'), null, 'setup clears pending beat');
console.log('staging: dialogs wait for the board, clicks skip the wait, AI waits for its walk, reduced motion unchanged.');
