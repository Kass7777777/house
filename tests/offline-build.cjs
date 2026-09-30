// v21: single-file offline build stays self-contained and runs its bootstrap in a minimal host.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const { build } = require('../tools/build-offline.cjs');
const out = path.join(os.tmpdir(), `house-offline-${process.pid}.html`);
build(out);
const page = fs.readFileSync(out, 'utf8'); fs.unlinkSync(out);
const index = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
const files = [...index.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
assert(!/(src|href)="(?!data:|#)[^"]+\.(js|css|png|jpg)"/.test(page), 'no external asset references');
const blocks = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
assert.equal(blocks.length, files.length + 1, 'bootstrap + one inline script per dist file');
files.forEach((f, i) => assert(blocks[i + 1].startsWith(`/* ${f} */`), 'script order preserved: ' + f));
assert(!/(?<!HOUSE_ASSETS\[)'(house|rescue|ritual)\.png'/.test(page) && !/url\('?(house|rescue|ritual)\.png/.test(page), 'image paths rewritten');
// bootstrap defines the image table and CSS variables
const vars = {}, ctx = { document: { documentElement: { style: { setProperty: (k, v) => vars[k] = v } } } }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(blocks[0], ctx);
for (const n of ['house', 'rescue', 'ritual']) { assert(ctx.HOUSE_ASSETS[n + '.png'].startsWith('data:image/')); assert(vars['--img-' + n].startsWith('url("data:image/')); }
assert(page.length < 4 * 1024 * 1024, 'offline page stays small: ' + page.length);
console.log(`Offline build: self-contained, ${files.length} scripts in order, images inlined, ${(page.length / 1048576).toFixed(2)} MB.`);
