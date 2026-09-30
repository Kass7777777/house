#!/usr/bin/env node
// Build a single self-contained HTML file from dist/ (all CSS, JS and compressed images inlined).
// Usage: node tools/build-offline.cjs [output.html]
// The result runs by double-clicking; saves use the browser's localStorage for file:// pages.
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), dist = path.join(root, 'dist'), assets = path.join(__dirname, 'offline-assets');
const DEFAULT_OUT = path.join(root, 'release', '山中小屋_离线版.html');

function build(outPath = DEFAULT_OUT) {
const out = path.resolve(outPath);

const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
if (!scripts.length || !scripts.includes('app.js')) throw Error('No scripts found in dist/index.html');

// images: prefer compressed JPEGs, fall back to the original PNGs
const images = {};
for (const name of ['house', 'rescue', 'ritual']) {
  const jpg = path.join(assets, name + '.jpg'), png = path.join(dist, name + '.png');
  const file = fs.existsSync(jpg) ? jpg : png;
  images[name + '.png'] = `data:image/${file.endsWith('.jpg') ? 'jpeg' : 'png'};base64,` + fs.readFileSync(file).toString('base64');
}
const inlineSafe = s => s.replace(/<\/(script|style)/gi, '<\\/$1');

const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]);
let css = sheets.map(f => fs.readFileSync(path.join(dist, f), 'utf8')).join('\n');
let cssRefs = 0;
css = css.replace(/url\('?([a-z]+)\.png'?\)/g, (m, n) => { cssRefs++; return `var(--img-${n})`; });

const js = scripts.map(file => {
  let src = fs.readFileSync(path.join(dist, file), 'utf8');
  if (file === 'app.js') src = src.replace(/'(house|rescue|ritual)\.png'/g, (m, n) => `HOUSE_ASSETS['${n}.png']`);
  // one <script> per file keeps each file's 'use strict' directive and top-level scope semantics
  return `<script>/* ${file} */\n${inlineSafe(src)}\n</script>`;
}).join('\n');

const boot = `window.HOUSE_ASSETS=${JSON.stringify(images)};window.HOUSE_OFFLINE=true;` +
  `for(const [k,v] of Object.entries(HOUSE_ASSETS))document.documentElement.style.setProperty('--img-'+k.replace('.png',''),'url("'+v+'")');`;

const page = html
  .replace(/<link rel="stylesheet" href="[^"]+">/g, (m, i) => '')
  .replace('</head>', () => `<style>\n${inlineSafe(css)}\n</style></head>`)
  .replace(/<script src="[^"]+"><\/script>/g, '')
  .replace('</body>', () => `<script>\n${inlineSafe(boot)}\n</script>\n${js}\n</body>`)
  .replace('<title>', '<!-- Built by tools/build-offline.cjs from dist/. Edit dist/, then rebuild. -->\n<title>');

if (/(src|href)="[^"#][^"]*\.(js|css|png)"/.test(page)) throw Error('Unresolved external asset reference left in page');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
return { out, bytes: page.length, scripts: scripts.length, cssRefs };
}

module.exports = { build, DEFAULT_OUT };
if (require.main === module) {
  const r = build(process.argv[2] || DEFAULT_OUT);
  console.log(`offline build: ${path.relative(root, r.out)}  ${(r.bytes / 1024 / 1024).toFixed(2)} MB  scripts=${r.scripts} cssImageRefs=${r.cssRefs}`);
}
