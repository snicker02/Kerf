// Kerf — step-by-step carving guides for the Flexcut Carvin' Jack:
// mathematical surfaces (gyroids and other TPMS), classic corner faces, your own 3D models,
// chip carving, spoons, ball-in-cage and chain puzzles, and reliefs from a photo.

import { SURFACES, MODES, BOUNDS } from './engine/tpms.js';
import { buildModel, latticeFor } from './engine/model.js';
import { makePlan, DEFAULT_OPT } from './engine/plan.js';
import { buildSteps, difficulty } from './engine/steps.js';
import { surfaceNets, remaining } from './engine/mesh.js';
import { applyToolData } from './engine/reach.js';
import { JACK_DEFAULT, JACK_FIELDS } from './engine/jack.js';
import { buildFaceModel, FACE_DEFAULT, FACE_OPTIONS, FACE_STYLES, normalizeFace, minStickLength } from './engine/face.js';
import { buildFaceSteps } from './engine/facesteps.js';
import { reliefMap, shadeRelief } from './engine/facerelief.js';
import { parseMesh, weld, checkMesh, placeMesh, trefoilKnot, MESH_EXTS } from './engine/meshio.js';
import { meshSDF, meshField } from './engine/meshsdf.js';
import { fmtLen, toUnits, fromUnits, MM_PER_IN } from './engine/units.js';
import { View3D } from './render/view3d.js';
import { drawFigure } from './render/figures.js';
import { drawFaceFigure } from './render/facefig.js';
import { buildPrintHTML } from './export/templates.js';
import { buildFacePrintHTML } from './export/facetemplate.js';
import { meshToSTL } from './export/stl.js';
import { Guide } from './ui/guide.js';
import { el, section, row, select, segmented, slider, numberField } from './ui/controls.js';
import { stagedMesh } from './engine/staged.js';
import { buildChip, CHIP_DEFAULT, CHIP_PARAMS } from './engine/chip.js';
import { buildSpoon, SPOON_DEFAULT, SPOON_PARAMS } from './engine/spoon.js';
import { buildCage, buildChain, CAGE_DEFAULT, CAGE_PARAMS, CHAIN_DEFAULT, CHAIN_PARAMS } from './engine/cage.js';
import { buildRelief, RELIEF_DEFAULT, RELIEF_PARAMS, sampleImage } from './engine/relief.js';
import { drawChipFigure, chipSheets } from './render/chipfig.js';
import { drawSpoonFigure, spoonSheets } from './render/spoonfig.js';
import { drawPuzzleFigure, cageSheets, chainSheets } from './render/puzzlefig.js';
import { drawReliefFigure, reliefSheets } from './render/relieffig.js';
import { Shop } from './ui/shop.js';
import { buildBooklet } from './export/booklet.js';

export const VERSION = '2.0.0';
const $ = id => document.getElementById(id);
const IN = MM_PER_IN;
const MAX_TRIANGLES = 3e6;

const PRESETS = [
  { id: 'gyroid-small', name: 'Gyroid block, 3″: best fit for the Jack', P: { surface: 'gyroid', mode: 'netA', cell: 4 * IN, fill: 0, thickness: 0.5 * IN, phase: [0, 0, 0], W: 3 * IN, D: 3 * IN, H: 3 * IN, bound: 'box' } },
  { id: 'gyroid-block', name: 'Gyroid block, 4″', P: { surface: 'gyroid', mode: 'netA', cell: 4 * IN, fill: 0, thickness: 0.5 * IN, phase: [0, 0, 0], W: 4 * IN, D: 4 * IN, H: 4 * IN, bound: 'box' } },
  { id: 'p-lattice', name: 'Schwarz P: plumber’s nightmare', P: { surface: 'schwarzP', mode: 'netA', cell: 4 * IN, fill: -0.1 * IN, thickness: 0.5 * IN, phase: [0.5, 0.5, 0.5], W: 4 * IN, D: 4 * IN, H: 4 * IN, bound: 'box' } },
  { id: 'neovius-tower', name: 'Neovius tower', P: { surface: 'neovius', mode: 'netB', cell: 3 * IN, fill: 0.1 * IN, thickness: 0.5 * IN, phase: [0.5, 0.5, 0], W: 3 * IN, D: 3 * IN, H: 6 * IN, bound: 'box' } },
  { id: 'iwp-cylinder', name: 'I-WP cylinder (advanced)', P: { surface: 'iwp', mode: 'netA', cell: 3 * IN, fill: 0, thickness: 0.5 * IN, phase: [0, 0, 0], W: 4 * IN, D: 4 * IN, H: 5 * IN, bound: 'cylinder' } },
  { id: 'gyroid-sphere', name: 'Gyroid sphere (advanced)', P: { surface: 'gyroid', mode: 'netA', cell: 3 * IN, fill: 0.2 * IN, thickness: 0.5 * IN, phase: [0.125, 0.125, 0.125], W: 4.5 * IN, D: 4.5 * IN, H: 4.5 * IN, bound: 'sphere' } },
  { id: 'diamond-sheet', name: 'Diamond sheet (advanced)', P: { surface: 'schwarzD', mode: 'sheet', cell: 4 * IN, fill: 0, thickness: 0.5 * IN, phase: [0, 0, 0], W: 4 * IN, D: 4 * IN, H: 4 * IN, bound: 'box' } },
];

const SAMPLE_NAME = 'Trefoil knot (sample)';
const MP_DEFAULT = { name: SAMPLE_NAME, source: 'sample', up: 'z', turn: 0, flip: false, size: 4 * IN, margin: IN / 8, res: 96 };

const PROJECTS = [
  { id: 'surface', name: 'Math surface (gyroid and friends)' },
  { id: 'face', name: 'Corner face' },
  { id: 'model', name: 'Your 3D model' },
  { id: 'chip', name: 'Chip carving' },
  { id: 'spoon', name: 'Spoon' },
  { id: 'cage', name: 'Ball in a cage' },
  { id: 'chain', name: 'Wooden chain' },
  { id: 'relief', name: 'Relief from a photo' },
];
const fmtU = (mm, u) => fmtLen(mm, u);
// projects built as an ordered list of cuts (engine/staged.js)
const STAGED = {
  chip: {
    key: 'CP', def: CHIP_DEFAULT, params: CHIP_PARAMS, build: (P, opt) => buildChip(P, opt), draw: drawChipFigure, sheets: chipSheets,
    home: [-Math.PI / 2, 1.05], title: P => `Chip-carved ${P.shape} board`, slug: (P, u) => `chip-${P.pattern.replace('+', '-')}-${Math.round(toUnits(P.size, u) * 100) / 100}${u}`,
    hud: (m, u) => { const pat = m.pat; return { rows: [['Board', `${fmtU(m.P.size, u)} ${m.P.shape}`], ['Chips', pat.chips.length], ['Rings and borders', pat.groups.length], ['Deepest chip', fmtU(pat.maxDepth, u)]], diff: pat.chips.length < 60 ? ['easy', 'Good first pattern'] : pat.chips.length < 160 ? ['mid', 'An afternoon’s work'] : ['hard', 'Lots of chips'] }; },
  },
  spoon: {
    key: 'SP', def: SPOON_DEFAULT, params: SPOON_PARAMS, build: (P, opt) => buildSpoon(P, opt), draw: drawSpoonFigure, sheets: spoonSheets,
    home: [-0.95, 0.55], title: P => `${P.bowlShape[0].toUpperCase() + P.bowlShape.slice(1)}-bowl spoon`, slug: (P, u) => `spoon-${Math.round(toUnits(P.length, u) * 100) / 100}${u}`,
    hud: (m, u, opt) => { const G = m.G, hookR = opt.jack.hookR; const fits = hookR <= G.hookR.across; return { rows: [['Blank', `${fmtU(G.blank[0], u)} × ${fmtU(G.blank[1], u)} × ${fmtU(G.blank[2], u)}`], ['Bowl', `${fmtU(m.P.bowlLen, u)} × ${fmtU(m.P.bowlWidth, u)}, ${fmtU(G.depth, u)} deep`], ['Crank', fmtU(m.P.crank, u)], ['Hook knife', fits ? '<b class="good">Fits the bowl</b>' : '<b class="bad">Bowl too tight</b>']], diff: G.depth > 15 || m.P.crank > 20 ? ['mid', 'Moderate'] : ['easy', 'Good first spoon'] }; },
  },
  cage: {
    key: 'KP', def: CAGE_DEFAULT, params: CAGE_PARAMS, build: (P, opt) => buildCage(P, opt), draw: drawPuzzleFigure, sheets: cageSheets,
    home: [-0.8, 0.35], title: P => `Ball in a cage${P.balls > 1 ? ` (${P.balls} balls)` : ''}`, slug: (P, u) => `cage-${Math.round(toUnits(P.width, u) * 100) / 100}${u}`,
    hud: (m, u) => { const G = m.G; return { rows: [['Block', `${fmtU(G.a, u)} × ${fmtU(G.a, u)} × ${fmtU(G.H, u)}`], ['Ball', fmtU(G.d, u)], ['Gap between posts', fmtU(G.gap, u)], ['Ball stays caged', G.ok ? '<b class="good">Yes</b>' : '<b class="bad">No</b>']], diff: G.n > 1 ? ['hard', 'Advanced'] : ['mid', 'Moderate'], warn: G.notes.map(t => t.replace(/ to %[dh].*| so .*/, '')) }; },
  },
  chain: {
    key: 'NP', def: CHAIN_DEFAULT, params: CHAIN_PARAMS, build: (P, opt) => buildChain(P, opt), draw: drawPuzzleFigure, sheets: chainSheets,
    home: [-0.8, 0.3], title: P => `Wooden chain, ${P.links} links`, slug: (P, u) => `chain-${P.links}-links`,
    hud: (m, u) => { const G = m.G; return { rows: [['Stick', `${fmtU(G.w, u)} × ${fmtU(G.w, u)} × ${fmtU(G.len, u)}`], ['Links', G.n], ['Link', `${fmtU(G.Ll, u)} × ${fmtU(G.w, u)}`], ['Link wood', fmtU(G.t, u)]], diff: G.t < 5 ? ['hard', 'Fiddly'] : ['mid', 'Moderate'], warn: G.notes.map(t => t.replace(/ to %[wl].*| so .*/, '')) }; },
  },
  relief: {
    key: 'RP', def: RELIEF_DEFAULT, params: RELIEF_PARAMS, build: (P, opt) => buildRelief(P, opt, S.img), draw: drawReliefFigure, sheets: reliefSheets,
    home: [-Math.PI / 2, 0.95], title: () => `Relief: ${(S.img && S.img.name) || 'picture'}`, slug: (P, u) => `relief-${(S.imgName || 'picture').replace(/\.[^.]*$/, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
    hud: (m, u) => { const G = m.G; return { rows: [['Panel', `${fmtU(G.W, u)} × ${fmtU(G.Hp, u)} × ${fmtU(G.T, u)}`], ['Levels', `${G.L}, ${fmtLen(G.step, u, { den: 32 })} apart`], ['Deepest', fmtU(G.D, u)], ['Style', G.P.style]], diff: G.L <= 3 ? ['easy', 'Good first relief'] : G.L <= 5 ? ['mid', 'Moderate'] : ['hard', 'Lots of levels'] }; },
  },
};

const S = {
  project: 'surface',
  P: { ...PRESETS[0].P, res: 96 },
  FP: { ...FACE_DEFAULT },
  MP: { ...MP_DEFAULT },
  CP: { ...CHIP_DEFAULT }, SP: { ...SPOON_DEFAULT }, KP: { ...CAGE_DEFAULT }, NP: { ...CHAIN_DEFAULT }, RP: { ...RELIEF_DEFAULT },
  img: null, imgName: 'sample', imgSource: 'sample', imgHash: 'sample',
  opt: { ...DEFAULT_OPT, jack: { ...JACK_DEFAULT }, grain: 'z' },
  raw: null, rawInfo: null, rawHash: 'sample',
  model: null, plan: null, steps: null, mesh: null, toolMap: false, proj: null,
};

// ---------------------------------------------------------------- persistence
function loadSaved() {
  try {
    const s = JSON.parse(localStorage.getItem('kerf:params') || 'null');
    if (!s) return;
    if (s.P) Object.assign(S.P, s.P);
    if (s.v >= 2) {
      if (s.FP) S.FP = normalizeFace({ ...S.FP, ...s.FP });
      if (s.MP) Object.assign(S.MP, s.MP);
      if (s.opt) { const j = { ...JACK_DEFAULT, ...(s.opt.jack || {}) }; Object.assign(S.opt, s.opt); S.opt.jack = j; }
      for (const k of ['CP', 'SP', 'KP', 'NP', 'RP']) if (s[k]) Object.assign(S[k], s[k]);
      if (s.img && s.img.source === 'file') { S.imgSource = 'file'; S.imgName = s.img.name; }
      if (PROJECTS.some(p => p.id === s.project)) S.project = s.project;
    } else if (s.opt) { S.opt.units = s.opt.units || S.opt.units; S.opt.grain = s.opt.grain || S.opt.grain; }
  } catch (e) { /* storage unavailable */ }
}
function save() {
  try { localStorage.setItem('kerf:params', JSON.stringify({ v: 3, project: S.project, P: S.P, FP: S.FP, MP: S.MP, CP: S.CP, SP: S.SP, KP: S.KP, NP: S.NP, RP: S.RP, img: { source: S.imgSource, name: S.imgName }, opt: S.opt })); } catch (e) { /* ignore */ }
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
function designKey() {
  const o = S.opt;
  const sp = STAGED[S.project];
  if (sp) return hashStr(JSON.stringify([S.project, S[sp.key], S.project === 'relief' ? S.imgHash : '']));
  const parts = S.project === 'face' ? ['face', S.FP]
    : S.project === 'model' ? ['model', S.rawHash, S.MP, o.drill, o.saw, o.bandStep, o.roughMargin, o.drillMargin]
      : ['surface', S.P, o.drill, o.saw, o.bandStep, o.roughMargin, o.drillMargin];
  return hashStr(JSON.stringify(parts));
}

// the last model file, kept in IndexedDB (it can be far too big for localStorage)
function idb() {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open('kerf', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
async function storeFile(name, buffer, key = 'model') {
  try { const db = await idb(); db.transaction('files', 'readwrite').objectStore('files').put({ name, buffer }, key); } catch (e) { /* storage unavailable */ }
}
async function loadStoredFile(key = 'model') {
  try {
    const db = await idb();
    return await new Promise(res => { const r = db.transaction('files').objectStore('files').get(key); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); });
  } catch (e) { return null; }
}

// ---------------------------------------------------------------- UI
let view, guide, shop;
const ctl = {};
const U = mm => fmtLen(mm, S.opt.units);
const uv = mm => +toUnits(mm, S.opt.units).toFixed(S.opt.units === 'in' ? 3 : 1);
const isFace = () => S.project === 'face';
const isModel = () => S.project === 'model';
const isStaged = () => !!STAGED[S.project];

function check(label, value, onChange) {
  const id = 'c-' + label.toLowerCase().replace(/[^a-z]+/g, '-');
  const i = el('input', { type: 'checkbox', id });
  i.checked = !!value;
  i.addEventListener('change', () => onChange(i.checked));
  return el('label', { class: 'tog', for: id }, i, ' ' + label);
}

function buildPanel() {
  const p = $('panel');
  p.innerHTML = '';
  const sp0 = section(p, 'Project');
  row(sp0, 'Carve', select(PROJECTS, S.project, v => {
    S.project = v; buildPanel(); recompute(true);
  }));
  if (isFace()) buildFacePanel(p); else if (isModel()) buildModelPanel(p); else if (isStaged()) buildStagedPanel(p); else buildSurfacePanel(p);
  buildJackPanel(p);
  buildPlanPanel(p);
  const se = section(p, 'Export', false);
  se.append(el('div', { class: 'btns' },
    el('button', { type: 'button', class: 'primary-light', onclick: makeBooklet }, 'PDF booklet'),
    el('button', { type: 'button', onclick: printSheets }, isFace() ? 'Print layout sheet' : 'Print templates'),
    el('button', { type: 'button', onclick: saveSheets }, 'Save sheets (.html)'),
    el('button', { type: 'button', onclick: saveSTL }, 'Download STL'),
  ));
  se.append(el('div', { class: 'hint' }, 'The PDF booklet has the whole guide and the true-scale templates in one file. The STL is the finished shape at true size: a 3D-printed copy makes a good reference to hold while you carve.'));
  $('b-print').textContent = isFace() ? 'Print layout' : 'Print templates';
  $('v-tool-wrap').hidden = isFace() || isStaged();
}

function buildSurfacePanel(p) {
  const sp = section(p, 'Design');
  row(sp, 'Start from', ctl.preset = select([{ id: '', name: 'Custom' }, ...PRESETS], '', id => {
    const pr = PRESETS.find(x => x.id === id);
    if (!pr) return;
    Object.assign(S.P, JSON.parse(JSON.stringify(pr.P)));
    syncSurface(); recompute();
  }));
  row(sp, 'Surface', ctl.surface = select(SURFACES, S.P.surface, v => { S.P.surface = v; custom(); recompute(); }));
  row(sp, 'Solid', ctl.mode = segmented(MODES.map(m => ({ id: m.id, name: m.id === 'netA' ? 'Network' : m.id === 'netB' ? 'Other side' : 'Sheet', title: m.long })), S.P.mode, v => { S.P.mode = v; syncSurface(); custom(); recompute(); }));
  ctl.thickRow = row(sp, 'Wall thickness', ctl.thickness = slider({ min: 2, max: 40, step: 0.5, value: S.P.thickness, fmt: U, onInput: v => { S.P.thickness = v; preview(); }, onChange: v => { S.P.thickness = v; custom(); recompute(); } }));
  ctl.fillRow = row(sp, 'Fill', ctl.fill = slider({ min: -20, max: 20, step: 0.5, value: S.P.fill, fmt: v => (v > 0 ? '+' : '') + U(v), onInput: v => { S.P.fill = v; preview(); }, onChange: v => { S.P.fill = v; custom(); recompute(); } }), 'More fill makes the wood fatter and the tunnels narrower. Negative fill opens the tunnels for the Jack.');
  row(sp, 'Cell size', ctl.cell = slider({ min: 20, max: 300, step: 0.5, value: S.P.cell, fmt: U, onInput: v => { S.P.cell = v; preview(); }, onChange: v => { S.P.cell = v; custom(); recompute(); } }), 'One full repeat of the pattern. Bigger cells mean bigger passages that the Jack reaches more easily.');
  ctl.phase = ['X', 'Y', 'Z'].map((ax, i) => row(sp, `Shift ${ax}`, slider({ min: 0, max: 1, step: 0.01, value: S.P.phase[i], fmt: v => `${Math.round(v * 100)}% of a cell`, onInput: v => { S.P.phase[i] = v; preview(); }, onChange: v => { S.P.phase[i] = v; custom(); recompute(); } })).lastChild);

  const sb = section(p, 'Block');
  ctl.dims = ['W', 'D', 'H'].map((k, i) => row(sb, ['Width', 'Depth', 'Height'][i], numberField({ value: uv(S.P[k]), step: S.opt.units === 'in' ? 0.25 : 5, min: 0.5, suffix: S.opt.units, onChange: v => { S.P[k] = Math.max(15, Math.min(400, fromUnits(v, S.opt.units))); custom(); recompute(); } })).lastChild);
  row(sb, 'Final form', ctl.bound = segmented(BOUNDS, S.P.bound, v => { S.P.bound = v; custom(); recompute(); }));
  grainRow(sb);
  syncSurface();
}

function grainRow(parent) {
  row(parent, 'Grain runs', segmented([{ id: 'x', name: 'Left–right' }, { id: 'y', name: 'Front–back' }, { id: 'z', name: 'Up–down' }], S.opt.grain, v => { S.opt.grain = v; recompute(); }),
    isModel() ? 'Run the grain along the longest thin parts (legs, necks, beaks) so they don’t snap.' : null);
}

function custom() { if (ctl.preset) ctl.preset.value = ''; }

function syncSurface() {
  if (isFace() || isModel()) return;
  ctl.surface.value = S.P.surface;
  ctl.mode.setValue(S.P.mode);
  ctl.bound.setValue(S.P.bound);
  ctl.thickRow.hidden = S.P.mode !== 'sheet';
  ctl.fillRow.hidden = S.P.mode === 'sheet';
  const L = Math.max(S.P.W, S.P.D, S.P.H);
  ctl.cell.setRange(L * 0.2, L * 2, 0.5); ctl.cell.setValue(S.P.cell);
  ctl.thickness.setRange(2, Math.max(6, S.P.cell * 0.3), 0.5); ctl.thickness.setValue(S.P.thickness);
  ctl.fill.setRange(-S.P.cell * 0.12, S.P.cell * 0.12, 0.5); ctl.fill.setValue(S.P.fill);
  ctl.phase.forEach((s, i) => s.setValue(S.P.phase[i]));
  ['W', 'D', 'H'].forEach((k, i) => ctl.dims[i].setValue(uv(S.P[k]), S.opt.units));
}

function buildFacePanel(p) {
  const F = S.FP, step = S.opt.units === 'in' ? 0.25 : 5;
  const fit = () => { const need = minStickLength(F); if (F.H < need) { F.H = need; toast(`Stick lengthened to ${U(need)} to fit the face and a handle.`); } };
  const changed = () => { F.style = 'custom'; Object.assign(F, normalizeFace(F)); fit(); buildPanel(); recompute(); };
  const optSel = (key, label, hint, filter) => {
    const items = FACE_OPTIONS[key].filter(o => !filter || filter(o[0])).map(([id, name]) => ({ id, name }));
    const ctrl = items.length <= 3 ? segmented(items, F[key], v => { F[key] = v; changed(); }) : select(items, F[key], v => { F[key] = v; changed(); });
    return row(sf2, label, ctrl, hint);
  };
  const sf = section(p, 'Face');
  row(sf, 'Style', select([...FACE_STYLES.map(s => ({ id: s.id, name: s.name })), { id: 'custom', name: 'Custom' }], F.style || 'custom', id => {
    const st = FACE_STYLES.find(x => x.id === id);
    if (!st) return;
    Object.assign(F, st.set); F.style = id; Object.assign(F, normalizeFace(F));
    F.H = Math.max(5 * IN, minStickLength(F)); // a fresh style gets the shortest stick that fits it
    buildPanel(); recompute(true);
  }), 'Each style sets the options below. Change any of them to make your own.');
  row(sf, 'Stick size (square)', numberField({ value: uv(F.a), step, min: 0.5, suffix: S.opt.units, onChange: v => { F.a = Math.max(0.75 * IN, Math.min(3 * IN, fromUnits(v, S.opt.units))); F.H = Math.max(F.H, F.a * 3.5); fit(); buildPanel(); recompute(); } }), 'A 1 1/2″ square basswood stick is the classic size. Bigger faces are easier.');
  row(sf, 'Stick length', numberField({ value: uv(F.H), step, min: 1, suffix: S.opt.units, onChange: v => { F.H = Math.max(minStickLength(F), Math.min(12 * IN, fromUnits(v, S.opt.units))); buildPanel(); recompute(); } }), 'Leave plenty of handle below the face to hold. Tall hats need a longer stick.');

  const sf2 = section(p, 'Features');
  row(sf2, 'Expression', slider({ min: -1, max: 1, step: 0.05, value: F.smile, fmt: v => v > 0.25 ? 'Smiling' : v < -0.25 ? 'Grumpy' : 'Calm', onChange: v => { F.smile = v; changed(); } }));
  row(sf2, 'Age', slider({ min: 0, max: 1, step: 0.05, value: F.age, fmt: v => v < 0.25 ? 'Young' : v < 0.6 ? 'Middle-aged' : 'Old', onChange: v => { F.age = v; changed(); } }), 'Older faces get forehead lines, crow’s feet and bags under the eyes.');
  row(sf2, 'Face length', slider({ min: 0.85, max: 1.2, step: 0.05, value: F.faceLen, fmt: v => v < 0.95 ? 'Round' : v > 1.07 ? 'Long' : 'Medium', onChange: v => { F.faceLen = v; changed(); } }));
  row(sf2, 'Nose size', slider({ min: 0.7, max: 1.4, step: 0.05, value: F.nose, fmt: v => v < 0.9 ? 'Small' : v > 1.15 ? 'Big' : 'Medium', onChange: v => { F.nose = v; changed(); } }));
  optSel('noseShape', 'Nose shape');
  if (F.hat === 'gnome') row(sf2, 'Eyes', el('div', { class: 'hint' }, 'Hidden under the gnome hat.'));
  else optSel('eyes', 'Eyes', null, id => id !== 'hidden');
  if (F.hat !== 'gnome') optSel('brows', 'Eyebrows');
  optSel('mouth', 'Mouth', F.mustache === 'walrus' ? 'A walrus mustache hides the mouth.' : null);
  const r = row(sf2, 'Ears', el('div', { class: 'checks' }, check('Carve ears', F.ears, v => { F.ears = v; changed(); })));
  r.classList.add('check-row');

  const sf3 = section(p, 'Hat, hair and beard');
  const optSel3 = (key, label, hint) => {
    const items = FACE_OPTIONS[key].map(([id, name]) => ({ id, name }));
    const ctrl = items.length <= 3 ? segmented(items, F[key], v => { F[key] = v; changed(); }) : select(items, F[key], v => { F[key] = v; changed(); });
    return row(sf3, label, ctrl, hint);
  };
  optSel3('hat', 'Hat');
  if (F.hat === 'none') optSel3('hair', 'Hair');
  else row(sf3, 'Hair', el('div', { class: 'hint' }, 'Under the hat.'));
  optSel3('beard', 'Beard');
  optSel3('mustache', 'Mustache');
}

// panels for the staged projects, built from each engine's PARAMS schema
function buildStagedPanel(p) {
  const spec = STAGED[S.project], P = S[spec.key], u = S.opt.units;
  const changed = rebuild => { if (rebuild) buildPanel(); recompute(); };
  if (S.project === 'relief') {
    const si = section(p, 'Picture');
    si.append(el('div', { class: 'btns' },
      el('button', { type: 'button', class: 'primary-light', onclick: () => $('img-in').click() }, 'Open a picture…'),
      S.imgSource !== 'sample' ? el('button', { type: 'button', onclick: useSampleImage }, 'Use the sample') : null));
    si.append(el('div', { class: 'modelinfo' }, el('b', {}, (S.img && S.img.name) || 'Sample picture'), S.img ? el('span', {}, `${S.img.w0 || S.img.w} × ${S.img.h0 || S.img.h} px`) : null));
    si.append(el('div', { class: 'hint' }, 'Strong shapes and clear contrast work best: a silhouette, a simple landscape, a logo or lettering. Busy photos turn into lots of tiny areas.'));
  }
  let sec = null;
  for (const f of spec.params) {
    if (f.section) { sec = section(p, f.section); continue; }
    if (f.show && !f.show(P)) continue;
    let ctrl;
    if (f.type === 'seg') ctrl = segmented(f.options.map(([id, name]) => ({ id, name })), String(P[f.key]), v => { P[f.key] = v; changed(true); });
    else if (f.type === 'select') ctrl = select(f.options.map(([id, name]) => ({ id, name })), String(P[f.key]), v => { P[f.key] = v; changed(true); });
    else if (f.type === 'check') { ctrl = el('div', { class: 'checks' }, check(f.label, P[f.key], v => { P[f.key] = v; changed(false); })); }
    else if (f.type === 'len') ctrl = numberField({ value: uv(P[f.key]), step: u === 'in' ? (f.max <= 1.01 * IN ? 0.0625 : 0.125) : (f.max <= 30 ? 0.5 : 1), min: 0, suffix: u, onChange: v => { P[f.key] = Math.max(f.min, Math.min(f.max, fromUnits(v, u))); changed(true); } });
    else if (f.type === 'int' || f.type === 'range') ctrl = slider({ min: f.min, max: f.max, step: f.step || 1, value: P[f.key], fmt: f.fmt || (v => String(v)), onChange: v => { P[f.key] = v; changed(true); } });
    const r = row(sec, f.type === 'check' ? '' : f.label, ctrl, f.hint);
    if (f.type === 'check') r.classList.add('check-row');
  }
  const sr = section(p, 'Start again', false);
  sr.append(el('div', { class: 'btns' }, el('button', { type: 'button', onclick: () => { S[spec.key] = { ...spec.def }; buildPanel(); recompute(true); } }, 'Reset these settings')));
}

// ---------------------------------------------------------------- relief pictures
async function decodeImage(blob, name) {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, 600 / Math.max(bmp.width, bmp.height));
  const w = Math.max(2, Math.round(bmp.width * s)), h = Math.max(2, Math.round(bmp.height * s));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(bmp, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, data = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) data[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
  return { w, h, data, name, w0: bmp.width, h0: bmp.height };
}
async function openImage(file) {
  if (!file) return;
  if (!/^image\//.test(file.type) && !/\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(file.name)) { toast('That isn’t a picture Kerf can read. Use a PNG, JPEG, GIF or WebP.'); return; }
  try {
    const buf = await file.arrayBuffer();
    S.img = await decodeImage(new Blob([buf], { type: file.type }), file.name);
    S.imgName = file.name; S.imgSource = 'file'; S.imgHash = hashStr(file.name + file.size + file.lastModified);
    storeFile(file.name, buf, 'image');
    S.project = 'relief';
    buildPanel(); recompute(true);
  } catch (e) { toast('Couldn’t read that picture: ' + (e.message || e)); }
}
function useSampleImage() {
  S.img = sampleImage(); S.imgName = 'sample'; S.imgSource = 'sample'; S.imgHash = 'sample';
  buildPanel(); recompute(true);
}

function buildModelPanel(p) {
  const M = S.MP, step = S.opt.units === 'in' ? 0.25 : 5;
  const sm = section(p, 'Model');
  const info = S.rawInfo;
  sm.append(el('div', { class: 'btns' },
    el('button', { type: 'button', class: 'primary-light', onclick: () => $('file-in').click() }, 'Open a 3D file…'),
    M.source !== 'sample' ? el('button', { type: 'button', onclick: useSample }, 'Use the sample knot') : null));
  sm.append(el('div', { class: 'hint' }, `OBJ, STL, PLY, OFF, GLB or glTF. You can also drop a file on the 3D view.`));
  sm.append(el('div', { class: 'modelinfo' },
    el('b', {}, M.name),
    info ? el('span', {}, `${info.triangles.toLocaleString()} triangles · ${info.watertight ? 'closed surface' : `${info.openEdges.toLocaleString()} open edges`}`) : null));

  const sp = section(p, 'Placement');
  const re = () => { buildPanel(); recompute(true); };
  row(sp, 'Up axis', segmented([{ id: 'y', name: 'Y up' }, { id: 'z', name: 'Z up' }, { id: 'x', name: 'X up' }], M.up, v => { M.up = v; re(); }), 'Most OBJ and glTF files are Y-up; most STL files are Z-up.');
  row(sp, 'Turn', segmented([0, 90, 180, 270].map(a => ({ id: String(a), name: `${a}°` })), String(M.turn), v => { M.turn = +v; re(); }), 'Turns the model about the vertical so its front faces face C.');
  const r = row(sp, 'Flip', el('div', { class: 'checks' }, check('Upside down', M.flip, v => { M.flip = v; re(); })));
  r.classList.add('check-row');
  row(sp, 'Longest side', numberField({ value: uv(M.size), step, min: 0.5, suffix: S.opt.units, onChange: v => { M.size = Math.max(0.75 * IN, Math.min(16 * IN, fromUnits(v, S.opt.units))); re(); } }), 'Bigger carvings have bigger details and are easier to reach into.');
  row(sp, 'Margin', numberField({ value: uv(M.margin), step: S.opt.units === 'in' ? 0.0625 : 1, min: 0, suffix: S.opt.units, onChange: v => { M.margin = Math.max(0, Math.min(IN, fromUnits(v, S.opt.units))); re(); } }), 'Extra wood round the model on every side.');
  if (S.model && S.model.P.kind === 'mesh') sp.append(el('div', { class: 'hint blockdims' }, `Block: ${U(S.model.P.W)} × ${U(S.model.P.D)} × ${U(S.model.P.H)}`));
  grainRow(sp);
}

function buildJackPanel(p) {
  const J = S.opt.jack;
  const sj = section(p, 'Your Jack', false);
  sj.append(el('div', { class: 'hint jack-title' }, 'Flexcut Carvin’ Jack 2.0'));
  row(sj, 'Model', segmented([{ id: 'right', name: 'Right-handed', title: 'JKN291' }, { id: 'left', name: 'Left-handed', title: 'JKNL291' }], J.hand, v => { J.hand = v; recompute(); }));
  for (const f of JACK_FIELDS) {
    const lab = el('label', {}, f.label, el('span', { class: 'src' }, f.source));
    const nf = numberField({ value: uv(J[f.key]), step: S.opt.units === 'in' ? 0.0625 : 0.5, min: 0.5, suffix: S.opt.units, onChange: v => { J[f.key] = Math.max(1, fromUnits(v, S.opt.units)); recompute(); } });
    sj.append(el('div', { class: 'row' }, lab, nf));
  }
  sj.append(el('div', { class: 'hint' }, 'Estimates are not published by Flexcut. Measure your blades with calipers: reach is from the tip to where the blade enters the handle; grip clearance is how wide an opening the handle and your fingers need.'));
  sj.append(el('div', { class: 'btns' }, el('button', { type: 'button', onclick: () => { S.opt.jack = { ...JACK_DEFAULT, hand: J.hand }; buildPanel(); recompute(); } }, 'Reset to defaults')));
}

function buildPlanPanel(p) {
  const sl = section(p, 'Plan', isModel());
  row(sl, 'Units', segmented([{ id: 'in', name: 'Inches' }, { id: 'mm', name: 'Millimetres' }], S.opt.units, v => { S.opt.units = v; buildPanel(); recompute(); }));
  if (isFace() || isStaged()) return;
  const r = row(sl, 'Helpers', el('div', { class: 'checks' },
    check('Saw the outline first', S.opt.saw, v => { S.opt.saw = v; buildPanel(); recompute(); }),
    check('Drill bulk waste', S.opt.drill, v => { S.opt.drill = v; buildPanel(); recompute(); })), 'Both off: everything is done with the Jack. A coping saw is the quickest way to rough out a figure.');
  r.classList.add('check-row');
  const nf = (key, label, hint) => row(sl, label, numberField({ value: uv(S.opt[key]), step: S.opt.units === 'in' ? 0.0625 : 0.5, min: 0, suffix: S.opt.units, onChange: v => { S.opt[key] = Math.max(0.5, fromUnits(v, S.opt.units)); recompute(); } }), hint);
  if (S.opt.drill) nf('drillMargin', 'Drill margin', 'Wood left above the finished surface at the bottom of each hole.');
  nf('roughMargin', 'Rough margin', 'Stock left on the surface while roughing, for shaping later.');
  nf('bandStep', 'Layer depth', 'How deep each roughing layer goes. Each layer is cut in 1/8″ stop-cut passes.');
  const tgt = isModel() ? S.MP : S.P;
  row(sl, 'Detail', segmented([{ id: '64', name: 'Draft' }, { id: '96', name: 'Normal' }, { id: '128', name: 'Fine' }, { id: '160', name: 'Finest' }], String(tgt.res), v => { tgt.res = +v; recompute(); }), 'Finer detail picks up smaller features but is slower to plan.');
}

// ---------------------------------------------------------------- model files
function sampleMesh() { return weld(trefoilKnot()); }

function setRaw(mesh, name, source, hashSeed) {
  S.raw = mesh;
  S.rawInfo = checkMesh(mesh);
  S.rawHash = hashStr(hashSeed + ':' + mesh.indices.length + ':' + Array.from(mesh.positions.subarray(0, 60)).join(','));
  S.MP.name = name; S.MP.source = source;
}

function useSample() {
  setRaw(sampleMesh(), SAMPLE_NAME, 'sample', 'sample');
  Object.assign(S.MP, { up: 'z', turn: 0, flip: false });
  S.project = 'model';
  buildPanel(); recompute(true);
}

function readMesh(name, buffer) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (!MESH_EXTS.includes(ext)) throw new Error(`Kerf can't read .${ext} files. Use OBJ, STL, PLY, OFF, GLB or glTF.`);
  const m = weld(parseMesh(name, buffer));
  if (m.indices.length / 3 > MAX_TRIANGLES) throw new Error(`This model has ${(m.indices.length / 3).toLocaleString()} triangles. Decimate it to under ${MAX_TRIANGLES.toLocaleString()} and try again.`);
  return { mesh: m, ext };
}

async function openFile(file) {
  if (!file) return;
  setBusy(true);
  try {
    const buffer = await file.arrayBuffer();
    const { mesh, ext } = readMesh(file.name, buffer);
    setRaw(mesh, file.name, 'file', file.name + file.size);
    Object.assign(S.MP, { up: ['obj', 'glb', 'gltf'].includes(ext) ? 'y' : 'z', turn: 0, flip: false });
    S.project = 'model';
    storeFile(file.name, buffer);
    buildPanel();
    recompute(true);
    toast(`Loaded ${file.name}: ${S.rawInfo.triangles.toLocaleString()} triangles.`);
  } catch (e) {
    setBusy(false);
    toast(e.message || String(e));
  }
}

// ---------------------------------------------------------------- compute
let previewTimer = 0, busyTimer = 0;
function preview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    try {
      const m = buildModel({ ...S.P, res: 40 });
      view.setMesh(surfaceNets(m, m.solid));
    } catch (e) { fatal(e); }
  }, 30);
}

function setBusy(on) {
  clearTimeout(busyTimer);
  if (on) busyTimer = setTimeout(() => { $('busy').hidden = false; }, 120);
  else $('busy').hidden = true;
}

function plannedProject(model) {
  const opt = S.opt;
  const plan = makePlan(model, opt);
  const steps = buildSteps(model, plan, opt);
  return {
    kind: model.P.kind === 'mesh' ? 'model' : 'surface', model, plan, steps, toolUniforms: plan.jack.map,
    finalMesh: surfaceNets(model, model.solid),
    meshAt: (state, tool) => {
      const { R, removedFrac } = remaining(model, plan, state);
      const m = surfaceNets(model, R);
      m.removedFrac = removedFrac;
      if (tool) applyToolData(m, model, plan.jack.J.grip);
      return m;
    },
    draw: (cv, fig, slice) => drawFigure(cv, model, plan, fig, opt, slice),
  };
}

function stagedProject() {
  const opt = S.opt, spec = STAGED[S.project];
  if (S.project === 'relief' && !S.img) S.img = sampleImage();
  const { model, steps } = spec.build(S[spec.key], opt);
  const last = model.stages.length - 1;
  const finalMesh = stagedMesh(model, last);
  for (let v = 0; v < finalMesh.nv; v++) finalMesh.aux[v * 3] = 0;
  return {
    kind: S.project, model, plan: null, steps, toolUniforms: null, finalMesh,
    view: { yaw: spec.home[0], pitch: spec.home[1] },
    meshAt: k => stagedMesh(model, k),
    draw: (cv, fig, slice, state) => spec.draw(cv, model, fig, opt, typeof state === 'number' ? state : last),
  };
}

function makeProject() {
  const opt = S.opt;
  if (isStaged()) return stagedProject();
  if (isFace()) {
    S.FP.H = Math.max(S.FP.H, minStickLength(S.FP));
    const model = buildFaceModel(S.FP);
    const steps = buildFaceSteps(model, opt);
    // colour: fresh wood from the current cut is lighter; everything else plain wood
    const faceMesh = k => {
      const m = surfaceNets(model, model.lattice(k));
      const prev = k > 0 ? model.lattice(k - 1) : null;
      const { org, hs, stride, n, hmin } = model;
      for (let v = 0; v < m.nv; v++) {
        let cls = 0;
        if (prev) {
          const i = Math.min(n[0], Math.max(0, Math.round((m.pos[v * 3] - org[0]) / hs[0])));
          const j = Math.min(n[1], Math.max(0, Math.round((m.pos[v * 3 + 1] - org[1]) / hs[1])));
          const kk = Math.min(n[2], Math.max(0, Math.round((m.pos[v * 3 + 2] - org[2]) / hs[2])));
          if (prev[i + j * stride[1] + kk * stride[2]] > 0.6 * hmin) cls = 1;
        }
        m.aux[v * 3] = cls;
      }
      return m;
    };
    return {
      kind: 'face', model, plan: null, steps, toolUniforms: null,
      finalMesh: (() => { const m = surfaceNets(model, model.solid); for (let v = 0; v < m.nv; v++) m.aux[v * 3] = 0; return m; })(),
      meshAt: k => faceMesh(k),
      draw: (cv, fig) => drawFaceFigure(cv, model, fig, opt),
    };
  }
  if (isModel()) {
    if (!S.raw) setRaw(sampleMesh(), SAMPLE_NAME, 'sample', 'sample');
    const M = S.MP;
    const placed = placeMesh(S.raw, M);
    const P = {
      kind: 'mesh', name: M.name, size: M.size, W: placed.block[0], D: placed.block[1], H: placed.block[2], res: M.res,
      watertight: S.rawInfo.watertight, openEdges: S.rawInfo.openEdges,
    };
    const L = latticeFor(P);
    const { sdf } = meshSDF(placed, L);
    return plannedProject(buildModel(P, meshField(sdf, L, L.dims)));
  }
  return plannedProject(buildModel(S.P));
}

let computeToken = 0;
function recompute(reframe = false) {
  save();
  const token = ++computeToken;
  S.computing = true;
  setBusy(true);
  setTimeout(() => {
    if (token !== computeToken) return;
    try {
      const t0 = performance.now();
      const pr = makeProject();
      S.proj = pr; S.model = pr.model; S.plan = pr.plan; S.steps = pr.steps;
      S.mesh = pr.finalMesh; S.meshTool = false;
      if (STAGED[pr.kind]) {
        view.setScene(pr.model.dims, 'z', { noLabels: true });
        if (reframe || S.framed !== pr.kind) { view.frame(Math.max(...pr.model.dims) * 2.5, false, STAGED[pr.kind].home); S.framed = pr.kind; }
      } else if (pr.kind === 'face') {
        const g = pr.model.g;
        view.setScene(pr.model.dims, 'z', { target: [0, 0, (g.zt + g.zHandle) / 2], noLabels: true });
        if (reframe || S.framed !== 'face') { view.frame((g.zt - g.zHandle) * 3.1, true); S.framed = 'face'; }
      } else {
        view.setScene(pr.model.dims, S.opt.grain);
        if (reframe || S.framed !== pr.kind) { view.frame(Math.max(...pr.model.dims) * 3.3, false); S.framed = pr.kind; }
      }
      if (!guide.open) showFinal();
      guide.load(pr, S.opt, designKey());
      if (guide.open) guide.go(Math.min(guide.i, pr.steps.length - 1));
      hud();
      if (isModel()) { const bd = document.querySelector('.blockdims'); if (bd) bd.textContent = `Block: ${U(pr.model.P.W)} × ${U(pr.model.P.D)} × ${U(pr.model.P.H)}`; else buildPanel(); }
      S.ms = performance.now() - t0;
    } catch (e) { fatal(e); }
    S.computing = false;
    setBusy(false);
  }, 20);
}

function showFinal() {
  const pr = S.proj;
  const tool = S.toolMap && !!pr.plan;
  if (tool && !S.meshTool) { applyToolData(S.mesh, S.model, S.plan.jack.J.grip); S.meshTool = true; }
  view.setMesh(S.mesh);
  view.setToolMap(tool, pr.toolUniforms);
  toolKey(tool);
  view.setHighlight(null);
}

function toolKey(on) {
  $('toolkey').hidden = !on;
  const out = $('toolkey').lastElementChild;
  if (out) out.hidden = !(S.plan && S.plan.jack && S.plan.jack.outFrac > 0.003);
}

function hud() {
  if (isStaged()) {
    const h = STAGED[S.project].hud(S.model, S.opt.units, S.opt);
    $('hud').innerHTML = h.rows.map(([k, v]) => `<div class="hud-row"><span>${k}</span>${String(v).startsWith('<b') ? v : `<b>${v}</b>`}</div>`).join('')
      + `<div class="hud-row"><span>Guide</span><b>${S.steps.length} steps</b></div><div class="hud-diff ${h.diff[0]}">${h.diff[1]}</div>`
      + (h.warn || []).map(w => `<div class="hud-warn">${w}</div>`).join('');
    return;
  }
  if (isFace()) {
    const m = S.model, g = m.g, P = m.P;
    const n = m.cuts.length, lvl = n <= 13 ? ['easy', 'Good first face'] : n <= 17 ? ['mid', 'Moderate'] : ['hard', 'Lots of detail'];
    const st = FACE_STYLES.find(x => x.id === P.style);
    $('hud').innerHTML = `
<div class="hud-row"><span>Style</span><b>${st ? st.name.replace(/ \(.*\)$/, '') : 'Custom'}</b></div>
<div class="hud-row"><span>Stick</span><b>${U(P.a)} × ${U(P.a)} × ${U(P.H)}</b></div>
<div class="hud-row"><span>Carved length</span><b>${U(g.zt - g.zHandle)}</b></div>
<div class="hud-row"><span>Nose stands out</span><b>${U(g.Dn)}</b></div>
<div class="hud-row"><span>Cuts</span><b>${n}</b></div>
<div class="hud-row"><span>Guide</span><b>${S.steps.length} steps</b></div>
<div class="hud-diff ${lvl[0]}">${lvl[1]}</div>
${g.zHandle + g.H / 2 < 1.2 * P.a ? '<div class="hud-warn">Short handle: use a longer stick</div>' : ''}`;
    return;
  }
  const st = S.model.stats, j = S.plan.jack, P = S.model.P;
  const d = difficulty(S.model, S.plan);
  const holes = S.plan.holes.flat().length;
  const reach = j.outFrac < 0.003 ? '<b class="good">All within reach</b>' : `<b class="bad">${Math.round(j.outFrac * 100)}% out of reach</b>`;
  $('hud').innerHTML = `
${P.kind === 'mesh' ? `<div class="hud-row"><span>Block</span><b>${U(P.W)} × ${U(P.D)} × ${U(P.H)}</b></div>` : ''}
<div class="hud-row"><span>Carvin’ Jack</span>${reach}</div>
<div class="hud-row"><span>Wood kept</span><b>${Math.round(st.keepFrac * 100)}%</b></div>
<div class="hud-row"><span>${P.kind === 'mesh' ? 'Behind overhangs' : 'Hidden waste'}</span><b>${Math.round(st.hiddenFrac * 100)}%</b></div>
<div class="hud-row"><span>Thinnest wall</span><b>≈ ${U(st.thinIn)}</b></div>
<div class="hud-row"><span>Tightest hollow</span><b>r ${U(j.r5)}</b></div>
${S.opt.saw && S.plan.sawFaces.length ? `<div class="hud-row"><span>Saw removes</span><b>${Math.round(S.plan.sawFrac * 100)}% of waste</b></div>` : ''}
${S.opt.drill ? `<div class="hud-row"><span>Drill holes</span><b>${holes}</b></div>` : ''}
<div class="hud-row"><span>Guide</span><b>${S.steps.length} steps</b></div>
<div class="hud-diff ${d.cls}">${d.level}</div>
${st.islandCount ? `<div class="hud-warn">${st.islandCount} loose piece${st.islandCount > 1 ? 's' : ''} removed</div>` : ''}
${P.kind === 'mesh' && P.watertight === false ? '<div class="hud-warn">Model has holes: check the 3D view</div>' : ''}
${st.thinIn < 4 ? '<div class="hud-warn">Walls under 4 mm: fragile in wood</div>' : ''}`;
}

// ---------------------------------------------------------------- guide
function openGuide() {
  if (!S.steps) return;
  document.body.classList.add('guiding');
  $('guide').hidden = false;
  $('b-guide').textContent = 'Back to design';
  guide.show();
}
function closeGuideUI() {
  document.body.classList.remove('guiding');
  $('guide').hidden = true;
  $('b-guide').textContent = 'Start carving guide';
  if (S.mesh) showFinal();
  if (shop && shop.on) shop.exit();
  if (isFace()) view.lookCorner();
  else view.resetView();
}

// ---------------------------------------------------------------- export
function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function fileStem() {
  if (isStaged()) return 'kerf-' + STAGED[S.project].slug(S[STAGED[S.project].key], S.opt.units);
  if (isFace()) return `kerf-face-${Math.round(toUnits(S.FP.a, S.opt.units) * 100) / 100}${S.opt.units}`;
  if (isModel()) return `kerf-${S.MP.name.replace(/\.[^.]*$/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'model'}-${Math.round(toUnits(S.MP.size, S.opt.units) * 100) / 100}${S.opt.units}`;
  const P = S.P;
  return `kerf-${P.surface}-${P.mode}-${Math.round(toUnits(P.W, S.opt.units) * 100) / 100}${S.opt.units}`;
}
function sheetsHTML() {
  if (isStaged()) return STAGED[S.project].sheets(S.model, S.opt, VERSION);
  if (!isFace()) return buildPrintHTML(S.model, S.plan, S.opt, VERSION);
  const m = S.model, R = reliefMap(m.stages[m.stages.length - 1], m.g, { W: 320 });
  const cv = document.createElement('canvas');
  cv.width = R.W; cv.height = R.H;
  cv.getContext('2d').putImageData(new ImageData(shadeRelief(R, null), R.W, R.H), 0, 0);
  return buildFacePrintHTML(m, S.opt, VERSION, { url: cv.toDataURL('image/png'), wmm: 2 * R.sMax, hmm: R.z1 - R.z0 });
}
function printSheets() {
  if (!S.model) return;
  const html = sheetsHTML();
  const fr = $('printframe');
  fr.onload = () => {
    try { fr.contentWindow.focus(); fr.contentWindow.print(); }
    catch (e) { toast('Printing is blocked here, so the sheets were saved instead. Open the file and print it.'); download(fileStem() + '-templates.html', html, 'text/html'); }
  };
  fr.srcdoc = html;
}
function saveSheets() {
  if (!S.model) return;
  download(fileStem() + '-templates.html', sheetsHTML(), 'text/html');
  toast('Saved. Open the file in a browser and print at 100%.');
}
function saveSTL() {
  if (!S.mesh) return;
  download(fileStem() + '.stl', meshToSTL(S.mesh, fileStem()));
}

function projectTitle() {
  if (isStaged()) return STAGED[S.project].title(S[STAGED[S.project].key]);
  if (isFace()) { const st = FACE_STYLES.find(x => x.id === S.FP.style); return st ? `Corner face: ${st.name.replace(/ \(.*\)$/, '')}` : 'Corner face'; }
  if (isModel()) return S.MP.name.replace(/\.[^.]*$/, '');
  const sf = SURFACES.find(x => x.id === S.P.surface), md = MODES.find(m => m.id === S.P.mode);
  return `${sf ? sf.name : 'Surface'} ${md && md.id === 'sheet' ? 'sheet' : 'block'}`;
}
let bookletBusy = false;
async function makeBooklet() {
  if (bookletBusy) return;
  bookletBusy = true;
  while (S.computing) await new Promise(r => setTimeout(r, 50));   // finish any pending recompute first
  if (!S.proj) { bookletBusy = false; return; }
  const busy = $('busy'), label = busy.querySelector('span'), old = label.textContent;
  busy.hidden = false;
  const stats = [...$('hud').querySelectorAll('.hud-row')].map(r => [r.children[0].textContent, r.children[1].textContent]);
  try {
    const bytes = await buildBooklet({
      project: S.proj, opt: S.opt, view, guide, version: VERSION, title: projectTitle(),
      subtitle: `${PROJECTS.find(p => p.id === S.project).name} · ${S.opt.jack.hand === 'left' ? 'left' : 'right'}-handed Carvin’ Jack · ${new Date().toLocaleDateString()}`,
      stats, sheetsHTML: sheetsHTML(), fmt: U,
      onProgress: (f, msg) => { label.textContent = `Making the PDF booklet… ${msg}`; },
      restore: () => { if (guide.open) guide.go(guide.i); else { showFinal(); if (isFace()) view.lookCorner(); else view.resetView(); } },
    });
    download(fileStem() + '-guide.pdf', new Blob([bytes], { type: 'application/pdf' }));
    toast(`Saved ${fileStem()}-guide.pdf (${Math.round(bytes.length / 1024)} KB).`);
  } catch (e) { console.error(e); toast('Couldn’t make the booklet: ' + (e.message || e)); }
  label.textContent = old; busy.hidden = true; bookletBusy = false;
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 5200);
}
function fatal(e) {
  console.error(e);
  const f = $('fatal');
  f.hidden = false;
  f.textContent = 'Something went wrong: ' + (e && e.message ? e.message : e);
}

// ---------------------------------------------------------------- boot
function bindDrop() {
  const stage = $('stage'), hint = $('drop-hint');
  let depth = 0;
  const hasFile = e => [...(e.dataTransfer?.types || [])].includes('Files');
  stage.addEventListener('dragenter', e => { if (!hasFile(e)) return; e.preventDefault(); depth++; hint.hidden = false; });
  stage.addEventListener('dragover', e => { if (hasFile(e)) e.preventDefault(); });
  stage.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) hint.hidden = true; });
  stage.addEventListener('drop', e => {
    e.preventDefault(); depth = 0; hint.hidden = true;
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && (/^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(f.name))) openImage(f);
    else if (f) openFile(f);
  });
  $('file-in').addEventListener('change', e => { openFile(e.target.files[0]); e.target.value = ''; });
  $('img-in').addEventListener('change', e => { openImage(e.target.files[0]); e.target.value = ''; });
}

async function boot() {
  $('ver').textContent = 'v' + VERSION;
  loadSaved();
  try {
    view = new View3D($('gl'), $('labels'));
  } catch (e) { fatal(e); return; }
  guide = new Guide({ view, onClose: closeGuideUI, onToolKey: toolKey });
  shop = new Shop({ guide, toast });
  $('g-shop').onclick = () => shop.toggle();
  if (S.imgSource === 'file') {
    const f = await loadStoredFile('image');
    try {
      if (f && f.name === S.imgName) { S.img = await decodeImage(new Blob([f.buffer]), f.name); S.imgHash = hashStr(f.name + f.buffer.byteLength); }
      else { S.imgSource = 'sample'; S.imgName = 'sample'; }
    } catch (e) { S.imgSource = 'sample'; S.imgName = 'sample'; }
  }
  if (S.MP.source === 'file') {
    const f = await loadStoredFile();
    try {
      if (f && f.name === S.MP.name) setRaw(readMesh(f.name, f.buffer).mesh, f.name, 'file', f.name + f.buffer.byteLength);
      else { S.MP = { ...MP_DEFAULT }; }
    } catch (e) { S.MP = { ...MP_DEFAULT }; }
  }
  buildPanel();
  bindDrop();
  $('b-guide').onclick = () => (document.body.classList.contains('guiding') ? guide.close() : openGuide());
  $('b-print').onclick = printSheets;
  $('v-reset').onclick = () => view.resetView();
  $('v-tool').onchange = e => { S.toolMap = e.target.checked; if (!guide.open && S.mesh) showFinal(); };
  $('panel-toggle').onclick = () => document.body.classList.toggle('panel-open');
  recompute(true);
  window.kerf = { S, view, guide, shop, VERSION, openGuide, recompute, buildPanel, openFile, openImage, useSample, makeBooklet, sheetsHTML, STAGED };
  registerSW();
}

// offline: cache the app with a service worker (needs https or localhost)
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const ok = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!ok || new URLSearchParams(location.search).has('nosw')) return;
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline support unavailable */ });
}
boot();
