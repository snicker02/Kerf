// node tests/projects.test.mjs — chip carving, spoons, ball-in-cage, chain, relief, PDF writer, shop mode, offline list
import { readFileSync, readdirSync } from 'fs';
import { buildChip, buildPattern, CHIP_DEFAULT, CHIP_PARAMS } from '../engine/chip.js';
import { buildSpoon, SPOON_DEFAULT, SPOON_PARAMS, spoonGeom } from '../engine/spoon.js';
import { buildCage, buildChain, cageGeom, chainGeom, CAGE_PARAMS, CHAIN_PARAMS } from '../engine/cage.js';
import { buildRelief, sampleImage, fitGrid, levelContours, RELIEF_PARAMS } from '../engine/relief.js';
import { stagedMesh, roundAnd, stadium } from '../engine/staged.js';
import { chipSheets } from '../render/chipfig.js';
import { spoonSheets } from '../render/spoonfig.js';
import { cageSheets, chainSheets } from '../render/puzzlefig.js';
import { reliefSheets } from '../render/relieffig.js';
import { PDF, winAnsi, wrapRuns } from '../export/pdf.js';
import { parseCommand } from '../ui/shop.js';
import { MM_PER_IN as IN } from '../engine/units.js';

let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL', msg); } };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const opt = { units: 'in', jack: {} }, optMM = { units: 'mm', jack: {} };
const BLADES = new Set(['detail', 'pelican', 'hook', 'gouge', 'scorp', 'vscorp']);

// connected pieces of wood in a lattice (6-connectivity), ignoring specks
function pieces(model, k) {
  const L = model.lattice(k), [sx, sy, sz] = model.s, lab = new Int32Array(L.length).fill(-1), sizes = [];
  const st = [];
  for (let i = 0; i < L.length; i++) if (L[i] > 0 && lab[i] < 0) {
    let c = 0; lab[i] = sizes.length; st.push(i);
    while (st.length) {
      const p = st.pop(); c++;
      const x = p % sx, y = ((p / sx) | 0) % sy, z = (p / (sx * sy)) | 0;
      const nb = [x > 0 ? p - 1 : -1, x < sx - 1 ? p + 1 : -1, y > 0 ? p - sx : -1, y < sy - 1 ? p + sx : -1, z > 0 ? p - sx * sy : -1, z < sz - 1 ? p + sx * sy : -1];
      for (const q of nb) if (q >= 0 && L[q] > 0 && lab[q] < 0) { lab[q] = sizes.length; st.push(q); }
    }
    sizes.push(c);
  }
  return sizes.filter(c => c > 30);
}
// wood only comes off: each stage's field is never above the previous one
function monotonic(model, name, n = 4000) {
  const [a, b, c] = model.dims;
  let worst = 0;
  for (let t = 0; t < n; t++) {
    const x = (Math.random() - 0.5) * a, y = (Math.random() - 0.5) * b, z = (Math.random() - 0.5) * c;
    let prev = model.stages[0](x, y, z);
    for (let k = 1; k < model.stages.length; k++) {
      const v = model.stages[k](x, y, z);
      if (prev > 0.05 || v > 0.05) worst = Math.max(worst, Math.min(v, 5) - Math.min(prev, 5));
      prev = v;
    }
  }
  ok(worst <= 0.05, `${name}: a later stage puts wood back (${worst.toFixed(3)} mm)`);
}
// each stage removes some wood (no empty steps)
function eachStageCuts(model, name) {
  let prevN = Infinity;
  for (let k = 0; k < model.stages.length; k++) {
    const L = model.lattice(k); let n = 0; for (const v of L) if (v > 0) n++;
    ok(n < prevN || k === 0, `${name}: stage ${k} removes nothing (${n})`);
    prevN = n;
  }
}
function stepsOK(steps, model, name, figTypes) {
  ok(steps.length >= 5, `${name}: ${steps.length} steps`);
  const ids = new Set();
  for (const st of steps) {
    ok(!ids.has(st.id), `${name}: duplicate step id ${st.id}`); ids.add(st.id);
    ok(typeof st.title === 'string' && st.title.length > 3, `${name}: title`);
    ok(st.html && st.html.length > 60, `${name}: "${st.title}" body too short`);
    ok(!/undefined|NaN|\[object|Infinity/.test(st.html + st.title + (st.speak || '') + st.checks.join(' ')), `${name}: "${st.title}" has a broken value`);
    ok(Number.isInteger(st.state) && st.state >= 0 && st.state < model.stages.length, `${name}: "${st.title}" state ${st.state}`);
    ok((st.blades || []).every(b => BLADES.has(b)), `${name}: "${st.title}" unknown blade ${st.blades}`);
    ok(figTypes.includes(st.figure.type), `${name}: "${st.title}" figure ${st.figure.type}`);
    ok(st.phase && /^[A-Z][a-z]+$/.test(st.phase), `${name}: phase ${st.phase}`);
    if (st.view) ok(isFinite(st.view.yaw) && isFinite(st.view.pitch), `${name}: view`);
    // balanced tags
    for (const t of ['p', 'ul', 'ol', 'li', 'b', 'div']) {
      const o = (st.html.match(new RegExp(`<${t}[ >]`, 'g')) || []).length, c = (st.html.match(new RegExp(`</${t}>`, 'g')) || []).length;
      ok(o === c, `${name}: "${st.title}" <${t}> ${o} open vs ${c} closed`);
    }
  }
}
function sheetOK(html, name) {
  ok(html.startsWith('<!doctype html>') && html.includes('<svg'), `${name}: sheets`);
  ok(!/NaN|undefined|Infinity/.test(html), `${name}: sheets have broken numbers`);
  ok((html.match(/<section class="sheet">/g) || []).length >= 1, `${name}: at least one page`);
  ok(html.includes('check with a ruler'), `${name}: calibration bar`);
}
function meshOK(model, name) {
  const m = stagedMesh(model, model.stages.length - 1);
  ok(m.nv > 100 && m.nt > 100, `${name}: final mesh ${m.nv} verts`);
  let bad = 0; for (let i = 0; i < m.nv * 3; i++) if (!isFinite(m.pos[i])) bad++;
  ok(bad === 0, `${name}: mesh has non-finite positions`);
}
function schemaOK(params, def, name) {
  for (const f of params) {
    if (f.section) continue;
    ok(f.key in def, `${name}: schema key ${f.key} has no default`);
    ok(['seg', 'select', 'len', 'int', 'range', 'check'].includes(f.type), `${name}: schema type ${f.type}`);
    if (f.type === 'len' || f.type === 'int' || f.type === 'range') ok(def[f.key] >= f.min && def[f.key] <= f.max, `${name}: default ${f.key}=${def[f.key]} outside ${f.min}..${f.max}`);
    if (f.options) ok(f.options.some(o => o[0] === String(def[f.key])), `${name}: default ${f.key} not an option`);
  }
}

// ---------------------------------------------------------------- staged helpers
near(roundAnd(5, 5, 1), 5, 1e-9, 'roundAnd deep inside');
near(roundAnd(0.5, 10, 1), 0.5, 1e-9, 'roundAnd near one face');
ok(roundAnd(0.2, 0.2, 1) < 0.2, 'roundAnd rounds the edge');
near(stadium(0, 0, 10, 3), 3, 1e-9, 'stadium centre');
near(stadium(13, 0, 10, 3), 0, 1e-9, 'stadium end');

// ---------------------------------------------------------------- chip carving
{
  schemaOK(CHIP_PARAMS, CHIP_DEFAULT, 'chip');
  const pat = buildPattern(CHIP_DEFAULT);
  ok(pat.chips.length > 40, `chip default ${pat.chips.length} chips`);
  // three-corner chip: deepest point at the incentre, depth = inradius × tan(wall angle); walls at the wall angle
  const tri = pat.chips.find(c => c.type === 'tri');
  const [A, B, C] = tri.pts, la = Math.hypot(B[0] - C[0], B[1] - C[1]), lb = Math.hypot(A[0] - C[0], A[1] - C[1]), lc = Math.hypot(A[0] - B[0], A[1] - B[1]);
  const area = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])) / 2, rin = 2 * area / (la + lb + lc);
  const tanA = Math.tan(CHIP_DEFAULT.angle * Math.PI / 180);
  near(tri.depth(tri.centre[0], tri.centre[1]), rin * tanA, 1e-6, 'chip depth at incentre');
  // slope across the edge AB: step inward along its normal
  const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, ex = B[0] - A[0], ey = B[1] - A[1], L = Math.hypot(ex, ey);
  let nx = -ey / L, ny = ex / L;
  if ((tri.centre[0] - mx) * nx + (tri.centre[1] - my) * ny < 0) { nx = -nx; ny = -ny; }
  const d1 = tri.depth(mx + nx * 0.2, my + ny * 0.2), d2 = tri.depth(mx + nx * 0.4, my + ny * 0.4);
  near(Math.atan((d2 - d1) / 0.2) * 180 / Math.PI, CHIP_DEFAULT.angle, 0.01, 'chip wall angle');
  ok(tri.depth(A[0] + 0.001, A[1] + 0.001) < 0.05, 'chip depth ~0 at a corner');
  // no chip escapes the board, none overlap much
  const h = CHIP_DEFAULT.size / 2;
  ok(pat.chips.every(c => c.pts.every(([x, y]) => Math.abs(x) <= h + 1e-6 && Math.abs(y) <= h + 1e-6)), 'chips inside the board');
  ok(pat.maxDepth < CHIP_DEFAULT.thickness * 0.6, `chips shallower than the board (${pat.maxDepth})`);
  for (const shape of ['square', 'round']) for (const pattern of ['rosette+border', 'rosette', 'border', 'allover']) for (const folds of [5, 8, 12]) {
    const P = { ...CHIP_DEFAULT, shape, pattern, folds, seed: folds };
    const { model, steps } = buildChip(P, folds === 8 ? optMM : opt);
    const name = `chip ${shape} ${pattern} ${folds}`;
    ok(model.pat.chips.length > 0, `${name}: no chips`);
    if (shape === 'round') ok(model.pat.chips.every(c => c.pts.every(([x, y]) => Math.hypot(x, y) <= h + 1e-6)), `${name}: chips inside the round board`);
    stepsOK(steps, model, name, ['chipPattern', 'chipHow', 'chipGroup', 'none']);
    if (folds === 8) { monotonic(model, name, 1500); meshOK(model, name); sheetOK(chipSheets(model, opt, 'test'), name); }
  }
  const { model } = buildChip(CHIP_DEFAULT, opt);
  eachStageCuts(model, 'chip default');
}

// ---------------------------------------------------------------- spoons
{
  schemaOK(SPOON_PARAMS, SPOON_DEFAULT, 'spoon');
  const G = spoonGeom(SPOON_DEFAULT);
  ok(G.hookR.across >= 0.75 * IN, `default bowl takes the 3/4″ hook (${G.hookR.across.toFixed(1)})`);
  const { model, steps } = buildSpoon(SPOON_DEFAULT, opt);
  stepsOK(steps, model, 'spoon', ['spoonViews', 'spoonTop', 'spoonSide', 'spoonSection', 'none']);
  monotonic(model, 'spoon');
  eachStageCuts(model, 'spoon');
  meshOK(model, 'spoon');
  ok(pieces(model, model.stages.length - 1).length === 1, 'spoon is one piece');
  // bowl bottom thickness ≈ wall: scan down through the bowl centre
  const f = model.stages[model.stages.length - 1], zc = G.zc;
  let top = null, bot = null;
  for (let z = G.blank[2] / 2; z > -G.blank[2] / 2; z -= 0.05) { const v = f(G.bx, 0, z); if (v > 0 && top === null) top = z; if (top !== null && v <= 0) { bot = z; break; } }
  ok(top !== null && bot !== null, 'bowl bottom found');
  near(top - bot, G.wall, 0.6, 'bowl wall thickness at the bottom');
  near(G.zr - (top + zc), G.depth, 0.6, 'bowl depth');
  // crank: the bowl rim sits above the handle by the crank
  near(G.spine(G.x1) - G.spine(G.x0), SPOON_DEFAULT.crank, 0.01, 'crank rise');
  sheetOK(spoonSheets(model, opt, 'test'), 'spoon');
  // a tight bowl warns about the hook knife
  const tight = buildSpoon({ ...SPOON_DEFAULT, bowlWidth: 1 * IN, bowlDepth: 0.6 * IN }, opt);
  ok(/class="warn"/.test(tight.steps[0].html), 'tight bowl warns about the hook knife');
  for (const v of [{ bowlShape: 'round' }, { bowlShape: 'pointed', end: 'pointed' }, { crank: 0, end: 'square' }, { length: 12 * IN, bowlLen: 4 * IN, bowlWidth: 2.5 * IN, crank: 1.1 * IN }, { length: 5 * IN, bowlLen: 1.2 * IN, bowlWidth: 0.9 * IN, bowlDepth: 5, thick: 0.3 * IN }]) {
    const name = 'spoon ' + JSON.stringify(v);
    const r = buildSpoon({ ...SPOON_DEFAULT, ...v }, optMM);
    stepsOK(r.steps, r.model, name, ['spoonViews', 'spoonTop', 'spoonSide', 'spoonSection', 'none']);
    ok(pieces(r.model, r.model.stages.length - 1).length === 1, `${name}: one piece`);
    sheetOK(spoonSheets(r.model, optMM, 'test'), name);
  }
  ok((spoonSheets(buildSpoon({ ...SPOON_DEFAULT, length: 13 * IN }, opt).model, opt, 't').match(/<section class="sheet">/g) || []).length === 2, 'long spoon splits over two pages');
}

// ---------------------------------------------------------------- ball in a cage
{
  schemaOK(CAGE_PARAMS, (await import('../engine/cage.js')).CAGE_DEFAULT, 'cage');
  for (const v of [{}, { balls: 2, height: 5 * IN }, { balls: 3 }, { width: 2 * IN, post: 0.375 * IN, ball: 1.5 * IN }, { ball: 0.3 * IN }, { ball: 2 * IN }]) {
    const name = 'cage ' + JSON.stringify(v);
    const G = cageGeom(v);
    ok(G.d > G.gap, `${name}: ball ${G.d.toFixed(2)} bigger than the gap ${G.gap.toFixed(2)} (stays caged)`);
    ok(G.d / 2 < (G.a / 2 - G.p) * Math.SQRT2, `${name}: ball clears the posts`);
    ok(G.d <= G.a, `${name}: ball fits the block`);
    const { model, steps } = buildCage(v, opt);
    stepsOK(steps, model, name, ['cageSection', 'none']);
    const pc = pieces(model, model.stages.length - 1);
    ok(pc.length === G.n + 1, `${name}: ${pc.length} pieces, want cage + ${G.n} ball(s)`);
    monotonic(model, name, 2000);
    sheetOK(cageSheets(model, opt, 'test'), name);
    if (v.ball && (v.ball < G.dMin || v.ball > G.dMax)) ok(G.notes.length > 0, `${name}: out-of-range ball is noted`);
  }
  const { model } = buildCage({}, opt);
  eachStageCuts(model, 'cage');
  meshOK(model, 'cage');
  // before the balls are rounded and freed, it is all one piece
  ok(pieces(model, 2).length === 1, 'cage still one piece after the core is rounded');
  const bad = cageGeom({ width: 1 * IN, post: 0.3 * IN });
  ok(!bad.ok || bad.d > bad.gap, 'impossible cage is flagged');
}

// ---------------------------------------------------------------- chain
{
  schemaOK(CHAIN_PARAMS, (await import('../engine/cage.js')).CHAIN_DEFAULT, 'chain');
  for (const v of [{}, { links: 2 }, { links: 6, wood: 4 }, { links: 3, linkWidth: 1.25 * IN, linkLen: 2 * IN, wood: 0.375 * IN }, { linkLen: 0.8 * IN }, { linkWidth: 0.5 * IN }]) {
    const name = 'chain ' + JSON.stringify(v);
    const G = chainGeom(v);
    ok(G.w - 2 * G.t > G.t, `${name}: a link's wood passes through the next link's hole`);
    ok(G.q > 0 && G.q < G.Ll, `${name}: pitch ${G.q}`);
    const { model, steps } = buildChain(v, opt);
    stepsOK(steps, model, name, ['chainSide', 'chainEnd', 'none']);
    const last = model.stages.length - 1;
    ok(pieces(model, last).length === G.n, `${name}: ${pieces(model, last).length} pieces, want ${G.n} links`);
    ok(pieces(model, last - 1).length === G.n, `${name}: links free before rounding`);
    ok(pieces(model, last - 2).length === 1, `${name}: still joined before the last freeing cuts`);
    monotonic(model, name, 2000);
    sheetOK(chainSheets(model, opt, 'test'), name);
  }
  const { model } = buildChain({}, opt);
  eachStageCuts(model, 'chain');
  meshOK(model, 'chain');
}

// ---------------------------------------------------------------- relief
{
  schemaOK(RELIEF_PARAMS, (await import('../engine/relief.js')).RELIEF_DEFAULT, 'relief');
  const img = sampleImage();
  ok(img.w > 100 && img.data.every(v => v >= 0 && v <= 1), 'sample image');
  const big = { w: 1200, h: 800, data: new Float32Array(1200 * 800).map((_, i) => (i % 1200) / 1200), name: 'ramp' };
  const fg = fitGrid(big, 260);
  ok(fg.w === 260 && Math.abs(fg.h - 173) <= 1, `fitGrid ${fg.w}×${fg.h}`);
  near(fg.data[0], (big.data[0] + big.data[4]) / 2, 0.01, 'fitGrid averages');
  for (const v of [{}, { style: 'smooth' }, { levels: 2 }, { levels: 7, invert: true, blur: 0 }, { frame: 0, width: 12 * IN }, { depth: 0.75 * IN, thickness: 0.5 * IN }]) {
    const name = 'relief ' + JSON.stringify(v);
    const { model, steps } = buildRelief(v, opt, img);
    const G = model.G;
    stepsOK(steps, model, name, ['reliefMap', 'reliefOutline', 'reliefLayer', 'none']);
    ok(G.D <= G.T * 0.7 + 1e-9, `${name}: depth limited by the panel`);
    const levs = new Set(G.lev); ok(levs.size >= 2 && levs.size <= G.L, `${name}: ${levs.size} levels used`);
    let maxD = 0; for (const d of G.finalD) maxD = Math.max(maxD, d);
    ok(maxD <= G.D + 1e-6, `${name}: final depth ${maxD} within ${G.D}`);
    const cont = levelContours(G);
    ok(cont.length === G.L - 1 && cont.some(c => c.segs.length > 0), `${name}: outlines`);
    // frame untouched
    if (G.fr > 2) ok(model.depthStages[model.depthStages.length - 1](G.W / 2 - G.fr / 2, 0) === 0, `${name}: frame is not carved`);
    // depth stages only get deeper
    let worst = 0;
    for (let t = 0; t < 3000; t++) { const x = (Math.random() - 0.5) * G.W, y = (Math.random() - 0.5) * G.Hp; for (let k = 1; k < model.depthStages.length; k++) worst = Math.max(worst, model.depthStages[k - 1](x, y) - model.depthStages[k](x, y)); }
    ok(worst <= 1e-9, `${name}: depth stages get shallower (${worst})`);
    sheetOK(reliefSheets(model, opt, 'test'), name);
    if (!v.style) meshOK(model, name);
  }
  // light is high by default, dark is high when inverted
  const a = buildRelief({ levels: 3 }, opt, img).model.G, b = buildRelief({ levels: 3, invert: true }, opt, img).model.G;
  const sun = img.data.indexOf(1);
  ok(a.stepped[0] !== undefined && a.lev[a.lev.length - 1] < a.lev[Math.round(0.28 * img.h) * img.w + Math.round(0.7 * img.w)], 'light parts are higher');
  ok(b.lev[b.lev.length - 1] > b.lev[Math.round(0.28 * img.h) * img.w + Math.round(0.7 * img.w)], 'inverted: dark parts are higher');
  void sun;
  const wide = buildRelief({ width: 15 * IN }, opt, img).model;
  ok((reliefSheets(wide, opt, 't').match(/<section class="sheet">/g) || []).length >= 2, 'wide relief tiles over pages');
}

// ---------------------------------------------------------------- PDF writer
{
  ok(winAnsi('A’B“C”—–…×½°é″').join(',') === [65, 0x92, 66, 0x93, 67, 0x94, 0x97, 0x96, 0x85, 0xD7, 0xBD, 0xB0, 0xE9, 34].join(','), 'WinAnsi mapping');
  ok(winAnsi('→').length === 2 && winAnsi('日').join() === '63', 'WinAnsi fallbacks');
  const p = new PDF({ title: 'Test (1)' });
  p.addPage(); p.text(50, 50, 'Hello (world) \\ 3/4″', 12, { bold: true }); p.rect(10, 10, 50, 20, { fill: '#abc', stroke: '#000' }); p.line(0, 0, 100, 100);
  const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]);
  const id = p.addImage(jpeg, 1, 1); p.image(id, 0, 0, 10, 10);
  p.addPage(); p.image(id, 0, 0, 612, 792);
  const bytes = p.finish(), txt = Buffer.from(bytes).toString('latin1');
  ok(txt.startsWith('%PDF-1.4') && txt.trimEnd().endsWith('%%EOF'), 'PDF header and trailer');
  const sx = +txt.match(/startxref\n(\d+)/)[1];
  ok(txt.slice(sx, sx + 4) === 'xref', 'startxref points at the xref table');
  const xr = txt.slice(sx).split('\n'), count = +xr[1].split(' ')[1];
  let offOK = true;
  for (let i = 1; i < count; i++) { const off = +xr[2 + i].slice(0, 10); if (!txt.startsWith(`${i} 0 obj`, off)) offOK = false; }
  ok(offOK, 'every xref offset points at its object');
  ok(/\/Count 2/.test(txt) && /\(Hello \\\(world\\\) \\\\ 3\/4"\) Tj/.test(txt), 'PDF page count and escaped text');
  ok(/\/Filter \/DCTDecode \/Length 4/.test(txt), 'JPEG image object');
  const lens = [...txt.matchAll(/<< \/Length (\d+) >>\nstream\n/g)];
  ok(lens.every(m => txt.slice(m.index + m[0].length + +m[1], m.index + m[0].length + +m[1] + 10) === '\nendstream'), 'stream lengths are exact');
  const lines = wrapRuns([{ t: 'one two three four five six seven eight nine ten' }, { t: ' bold words', bold: true }], 10, 60, (t, s) => t.length * s * 0.5);
  ok(lines.length > 2 && lines.every(l => l.reduce((a, r) => a + r.t.length * 5, 0) <= 60 + 1e-9 || l.length === 1), 'wrap fits the width');
  ok(lines.flat().map(r => r.t).join(' ').replace(/\s+/g, ' ').trim() === 'one two three four five six seven eight nine ten bold words', 'wrap keeps every word');
  ok(lines[lines.length - 1].some(r => r.bold), 'wrap keeps bold runs');
}

// ---------------------------------------------------------------- shop mode voice commands
{
  const cases = { 'next': 'next', 'Next step please': 'next', 'go back': 'back', 'previous': 'back', 'repeat': 'repeat', 'say again': 'repeat', 'done': 'done', "I'm finished": 'done', 'stropped': 'stropped', 'strop done': 'stropped', 'hello there': null, 'stop listening': 'mute' };
  for (const [t, want] of Object.entries(cases)) ok(parseCommand(t) === want, `voice "${t}" -> ${parseCommand(t)}, want ${want}`);
}

// ---------------------------------------------------------------- offline: the service worker caches every file the app loads
{
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const listed = new Set([...sw.slice(sw.indexOf('FILES = ['), sw.indexOf('];')).matchAll(/'([^'\n]+)'/g)].map(m => m[1]));
  const root = new URL('../', import.meta.url);
  const need = ['index.html', 'style.css', 'main.js', 'manifest.webmanifest', 'icon.svg'];
  for (const d of ['engine', 'export', 'render', 'ui']) for (const f of readdirSync(new URL(d + '/', root))) if (f.endsWith('.js')) need.push(`${d}/${f}`);
  for (const f of need) ok(listed.has(f), `sw.js does not cache ${f}`);
  const ver = readFileSync(new URL('../main.js', import.meta.url), 'utf8').match(/VERSION = '([^']+)'/)[1];
  ok(sw.includes(`kerf-${ver}`), 'sw cache name matches the app version');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['g-shop', 'shopbar', 'strop-time', 'strop-every', 'strop-now', 'mic', 'heard', 'shop-exit', 'strop-alert', 'strop-ok', 'strop-snooze', 'img-in', 'credit']) ok(html.includes(`id="${id}"`), `index.html has #${id}`);
  ok(html.includes('Created with help from Claude AI'), 'credit line');
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  ok(readme.trimEnd().endsWith('Created with help from Claude AI'), 'README ends with the credit line');
}

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
