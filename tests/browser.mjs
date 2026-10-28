// Headless run: node tests/browser.mjs <outdir>  (expects a static server on :8765 serving the repo)
import { createRequire } from 'module';
const { chromium } = createRequire('/opt/npm-tools/node_modules/')('playwright');

const out = process.argv[2] || '.';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);
const errors = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));

const ready = () => page.waitForFunction(() => window.kerf && window.kerf.S.steps && document.getElementById('busy').hidden, null, { timeout: 120000 });
await page.goto('http://localhost:8765/index.html');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.reload();
await ready();
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/01-surface.png` });
const info = await page.evaluate(() => ({ steps: window.kerf.S.steps.length, project: window.kerf.S.project, out: window.kerf.S.plan.jack.outFrac, share: window.kerf.S.plan.jack.share, fatal: document.getElementById('fatal').hidden ? null : document.getElementById('fatal').textContent }));
console.log('surface', JSON.stringify(info));

await page.click('#v-tool');
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/02-toolmap.png` });
await page.click('#v-tool');

async function walk(prefix) {
  await page.click('#b-guide');
  await page.waitForTimeout(300);
  const n = await page.evaluate(() => window.kerf.guide.steps.length);
  const shots = new Set();
  for (let i = 0; i < n; i++) {
    await page.evaluate(i => window.kerf.guide.go(i), i);
    await page.waitForTimeout(100);
    const s = await page.evaluate(() => {
      const g = window.kerf.guide, st = g.steps[g.i];
      const fig = document.getElementById('g-fig');
      return { phase: st.phase, title: st.title, fig: st.figure.type, figH: fig.hidden ? 0 : fig.height, blades: (st.blades || []).join(','), tool: !!st.toolMap, body: document.getElementById('g-body').textContent.length };
    });
    console.log(prefix, String(i + 1).padStart(2), s.phase.padEnd(7), s.title.padEnd(40), s.fig.padEnd(10), 'figH', String(s.figH).padEnd(4), s.blades, s.tool ? 'TOOLMAP' : '');
    if (s.body < 40) errors.push(`[content] step ${i + 1} body too short`);
    const key = s.fig + s.phase + (s.tool ? 't' : '');
    if (!shots.has(key) || i === n - 1) { shots.add(key); await page.waitForTimeout(600); await page.screenshot({ path: `${out}/${prefix}-step-${String(i + 1).padStart(2, '0')}-${s.fig}.png` }); }
  }
  await page.click('#g-close');
}
await walk('surf');

// switch to the face project
await page.click('#panel .seg button[data-v="face"]');
await ready();
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/03-face.png` });
console.log('face', JSON.stringify(await page.evaluate(() => ({ steps: window.kerf.S.steps.length, cuts: window.kerf.S.model.cuts.length, ms: Math.round(window.kerf.S.ms) }))));
await walk('face');

// every face style builds, renders and walks without errors
const styles = await page.evaluate(() => [...document.querySelectorAll('#panel select')[0].options].map(o => o.value).filter(v => v !== 'custom'));
for (const st of styles) {
  await page.selectOption('#panel select >> nth=0', st);
  await page.waitForTimeout(100);
  await ready();
  await page.waitForTimeout(700);
  const info = await page.evaluate(() => ({ cuts: window.kerf.S.model.cuts.map(c => c.id).length, steps: window.kerf.S.steps.length, H: +(window.kerf.S.FP.H / 25.4).toFixed(1), ms: Math.round(window.kerf.S.ms) }));
  console.log('style', st.padEnd(8), JSON.stringify(info));
  await page.screenshot({ path: `${out}/style-${st}.png` });
  // open the guide on the last detail step and the first hat/feature step to render their figures
  await page.click('#b-guide');
  const n = await page.evaluate(() => window.kerf.guide.steps.length);
  for (const i of [n - 2, Math.min(n - 1, 10)]) { await page.evaluate(i => window.kerf.guide.go(i), i); await page.waitForTimeout(150); }
  await page.screenshot({ path: `${out}/style-${st}-guide.png` });
  await page.click('#g-close');
}
// a custom mix: change one option after a style
await page.evaluate(() => { const S = window.kerf.S; S.FP.hat = 'brimmed'; S.FP.mouth = 'open'; S.FP.style = 'custom'; window.kerf.buildPanel(); window.kerf.recompute(); });
await page.waitForTimeout(150);
await ready();
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/04-face-custom.png` });

// mobile
await page.setViewportSize({ width: 390, height: 844 });
await page.click('#b-guide');
await page.evaluate(() => window.kerf.guide.go(5));
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/mobile-face.png` });
await page.click('#g-close');
await page.setViewportSize({ width: 1280, height: 800 });

// print sheets for the face, then the surface
const faceHTML = await page.evaluate(async () => { const m = await import('./export/facetemplate.js'); const r = await import('./engine/facerelief.js'); const { S, VERSION } = window.kerf; const R = r.reliefMap(S.model.stages[S.model.stages.length - 1], S.model.g, { W: 200 }); const c = document.createElement('canvas'); c.width = R.W; c.height = R.H; c.getContext('2d').putImageData(new ImageData(r.shadeRelief(R, null), R.W, R.H), 0, 0); return m.buildFacePrintHTML(S.model, S.opt, VERSION, { url: c.toDataURL(), wmm: 2 * R.sMax, hmm: R.z1 - R.z0 }); });
const p2 = await browser.newPage({ viewport: { width: 900, height: 1180 } });
await p2.setContent(faceHTML);
await p2.screenshot({ path: `${out}/print-face.png` });
const stl = await page.evaluate(async () => { const m = await import('./export/stl.js'); return m.meshToSTL(window.kerf.S.mesh).size; });
console.log('face stl bytes', stl);

// ---- your model: sample, then real files through the file picker
const MODELS = process.env.KERF_MODELS;
await page.click('#panel .seg button[data-v="model"]');
await ready();
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/model-sample.png` });
console.log('model sample', JSON.stringify(await page.evaluate(() => ({ name: window.kerf.S.MP.name, block: [window.kerf.S.model.P.W, window.kerf.S.model.P.D, window.kerf.S.model.P.H].map(v => +(v / 25.4).toFixed(2)), steps: window.kerf.S.steps.length, out: window.kerf.S.plan.jack.outFrac, ms: Math.round(window.kerf.S.ms) }))));
if (MODELS) {
  for (const f of ['knot.stl', 'knot.glb', 'knot-ascii.ply', 'knot.off', 'duck.obj']) {
    await page.setInputFiles('#file-in', `${MODELS}/${f}`);
    await page.waitForFunction(n => window.kerf.S.MP.name === n, f, { timeout: 60000 });
    await ready();
    await page.waitForTimeout(600);
    const st = await page.evaluate(() => ({ name: window.kerf.S.MP.name, up: window.kerf.S.MP.up, tris: window.kerf.S.rawInfo.triangles, closed: window.kerf.S.rawInfo.watertight, block: [window.kerf.S.model.P.W, window.kerf.S.model.P.D, window.kerf.S.model.P.H].map(v => +(v / 25.4).toFixed(2)), keep: +(window.kerf.S.model.stats.keepFrac * 100).toFixed(1), out: +(window.kerf.S.plan.jack.outFrac * 100).toFixed(1), steps: window.kerf.S.steps.length, ms: Math.round(window.kerf.S.ms) }));
    console.log('model file', JSON.stringify(st));
  }
  await page.screenshot({ path: `${out}/model-duck.png` });
  // the duck with the saw on: walk the guide
  await page.evaluate(() => { window.kerf.S.opt.saw = true; window.kerf.buildPanel(); window.kerf.recompute(); });
  await page.waitForTimeout(150);
  await ready();
  await walk('duck');
  await page.click('#v-tool');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/model-duck-toolmap.png` });
  await page.click('#v-tool');
  // a reload keeps the last file
  await page.reload();
  await ready();
  console.log('after reload', JSON.stringify(await page.evaluate(() => ({ project: window.kerf.S.project, name: window.kerf.S.MP.name, tris: window.kerf.S.rawInfo && window.kerf.S.rawInfo.triangles }))));
  // a bad file shows a message instead of breaking
  await page.setInputFiles('#file-in', { name: 'broken.obj', mimeType: 'text/plain', buffer: Buffer.from('this is not a model') });
  await page.waitForTimeout(800);
  console.log('bad file toast:', await page.evaluate(() => document.getElementById('toast').textContent), '| still showing', await page.evaluate(() => window.kerf.S.MP.name));
  const sheets = await page.evaluate(async () => { const m = await import('./export/templates.js'); const { S, VERSION } = window.kerf; return m.buildPrintHTML(S.model, S.plan, S.opt, VERSION); });
  const p3 = await browser.newPage({ viewport: { width: 900, height: 1180 } });
  await p3.setContent(sheets);
  await p3.evaluate(() => window.scrollTo(0, 1 * 1056 + 30));
  await p3.screenshot({ path: `${out}/print-duck.png` });
}

// every surface preset computes without errors
await page.click('#panel .seg button[data-v="surface"]');
await ready();
const presets = await page.evaluate(() => [...document.querySelectorAll('#panel select')[0].options].map(o => o.value).filter(Boolean));
for (const p of presets) {
  await page.selectOption('#panel select >> nth=0', p);
  await page.waitForTimeout(100);
  await ready();
  const st = await page.evaluate(() => ({ steps: window.kerf.S.steps.length, ms: Math.round(window.kerf.S.ms), out: +(window.kerf.S.plan.jack.outFrac * 100).toFixed(1), hidden: Math.round(window.kerf.S.model.stats.hiddenFrac * 100) }));
  console.log('preset', p.padEnd(16), JSON.stringify(st));
}
await page.screenshot({ path: `${out}/preset-last.png` });
// drill option still works
await page.evaluate(() => { window.kerf.S.opt.drill = true; window.kerf.buildPanel(); window.kerf.recompute(); });
await page.waitForTimeout(200);
await ready();
console.log('drill on', JSON.stringify(await page.evaluate(() => ({ holes: window.kerf.S.plan.holes.flat().length, steps: window.kerf.S.steps.length }))));

console.log('\nconsole errors/warnings:', errors.length);
errors.slice(0, 20).forEach(e => console.log(e));
await browser.close();
process.exit(errors.length ? 1 : 0);
