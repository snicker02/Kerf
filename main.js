// Kerf — step-by-step carving guides for the Flexcut Carvin' Jack:
// mathematical surfaces (gyroids and other TPMS) and classic corner faces.

import { SURFACES, MODES, BOUNDS } from './engine/tpms.js';
import { buildModel } from './engine/model.js';
import { makePlan, DEFAULT_OPT } from './engine/plan.js';
import { buildSteps, difficulty } from './engine/steps.js';
import { surfaceNets, remaining } from './engine/mesh.js';
import { applyToolData } from './engine/reach.js';
import { JACK_DEFAULT, JACK_FIELDS, model as jackModel } from './engine/jack.js';
import { buildFaceModel, FACE_DEFAULT, FACE_OPTIONS, FACE_STYLES, normalizeFace, minStickLength } from './engine/face.js';
import { buildFaceSteps } from './engine/facesteps.js';
import { reliefMap, shadeRelief } from './engine/facerelief.js';
import { fmtLen, toUnits, fromUnits, MM_PER_IN } from './engine/units.js';
import { View3D } from './render/view3d.js';
import { drawFigure } from './render/figures.js';
import { drawFaceFigure } from './render/facefig.js';
import { buildPrintHTML } from './export/templates.js';
import { buildFacePrintHTML } from './export/facetemplate.js';
import { meshToSTL } from './export/stl.js';
import { Guide } from './ui/guide.js';
import { el, section, row, select, segmented, slider, numberField } from './ui/controls.js';

export const VERSION = '1.2.0';
const $ = id => document.getElementById(id);
const IN = MM_PER_IN;

const PRESETS = [
  { id: 'gyroid-small', name: 'Gyroid block, 3″: best fit for the Jack', P: { surface: 'gyroid', mode: 'netA', cell: 4 * IN, fill: 0, thickness: 0.5 * IN, phase: [0, 0, 0], W: 3 * IN, D: 3 * IN, H: 3 * IN, bound: 'box' } },
  { id: 'gyroid-block', name: 'Gyroid block, 4″', P: { surface: 'gyroid', mode: 'netA', cell: 4 * IN, fill: 0, thickness: 0.5 * IN, phase: [0, 0, 0], W: 4 * IN, D: 4 * IN, H: 4 * IN, bound: 'box' } },
  { id: 'p-lattice', name: 'Schwarz P: plumber’s nightmare', P: { surface: 'schwarzP', mode: 'netA', cell: 4 * IN, fill: -0.1 * IN, thickness: 0.5 * IN, phase: [0.5, 0.5, 0.5], W: 4 * IN, D: 4 * IN, H: 4 * IN, bound: 'box' } },
  { id: 'neovius-tower', name: 'Neovius tower', P: { surface: 'neovius', mode: 'netB', cell: 3 * IN, fill: 0.1 * IN, thickness: 0.5 * IN, phase: [0.5, 0.5, 0], W: 3 * IN, D: 3 * IN, H: 6 * IN, bound: 'box' } },
  { id: 'iwp-cylinder', name: 'I-WP cylinder (advanced)', P: { surface: 'iwp', mode: 'netA', cell: 3 * IN, fill: 0, thickness: 0.5 * IN, phase: [0, 0, 0], W: 4 * IN, D: 4 * IN, H: 5 * IN, bound: 'cylinder' } },
  { id: 'gyroid-sphere', name: 'Gyroid sphere (advanced)', P: { surface: 'gyroid', mode: 'netA', cell: 3 * IN, fill: 0.2 * IN, thickness: 0.5 * IN, phase: [0.125, 0.125, 0.125], W: 4.5 * IN, D: 4.5 * IN, H: 4.5 * IN, bound: 'sphere' } },
  { id: 'diamond-sheet', name: 'Diamond sheet (advanced)', P: { surface: 'schwarzD', mode: 'sheet', cell: 4 * IN, fill: 0, thickness: 0.5 * IN, phase: [0, 0, 0], W: 4 * IN, D: 4 * IN, H: 4 * IN, bound: 'box' } },
];

const S = {
  project: 'surface',
  P: { ...PRESETS[0].P, res: 96 },
  FP: { ...FACE_DEFAULT },
  opt: { ...DEFAULT_OPT, jack: { ...JACK_DEFAULT }, grain: 'z' },
  model: null, plan: null, steps: null, mesh: null, toolMap: false, proj: null,
};

// ---------------------------------------------------------------- persistence
function loadSaved() {
  try {
    const s = JSON.parse(localStorage.getItem('kerf:params') || 'null');
    if (!s) return;
    if (s.P) Object.assign(S.P, s.P);
    if (s.v === 2) {
      if (s.FP) S.FP = normalizeFace({ ...S.FP, ...s.FP });
      if (s.opt) { const j = { ...JACK_DEFAULT, ...(s.opt.jack || {}) }; Object.assign(S.opt, s.opt); S.opt.jack = j; }
      if (s.project === 'face' || s.project === 'surface') S.project = s.project;
    } else if (s.opt) { S.opt.units = s.opt.units || S.opt.units; S.opt.grain = s.opt.grain || S.opt.grain; }
  } catch (e) { /* storage unavailable */ }
}
function save() {
  try { localStorage.setItem('kerf:params', JSON.stringify({ v: 2, project: S.project, P: S.P, FP: S.FP, opt: S.opt })); } catch (e) { /* ignore */ }
}
function designKey() {
  const o = S.opt;
  const parts = S.project === 'face' ? ['face', S.FP] : ['surface', S.P, o.drill, o.bandStep, o.roughMargin, o.drillMargin];
  const s = JSON.stringify(parts);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// ---------------------------------------------------------------- UI
let view, guide;
const ctl = {};
const U = mm => fmtLen(mm, S.opt.units);
const uv = mm => +toUnits(mm, S.opt.units).toFixed(S.opt.units === 'in' ? 3 : 1);
const isFace = () => S.project === 'face';

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
  row(sp0, 'Carve', segmented([{ id: 'surface', name: 'Math surface' }, { id: 'face', name: 'Corner face' }], S.project, v => {
    S.project = v; buildPanel(); recompute(true);
  }));
  if (isFace()) buildFacePanel(p); else buildSurfacePanel(p);
  buildJackPanel(p);
  buildPlanPanel(p);
  const se = section(p, 'Export', false);
  se.append(el('div', { class: 'btns' },
    el('button', { type: 'button', onclick: printSheets }, isFace() ? 'Print layout sheet' : 'Print templates'),
    el('button', { type: 'button', onclick: saveSheets }, 'Save sheets (.html)'),
    el('button', { type: 'button', onclick: saveSTL }, 'Download STL'),
  ));
  se.append(el('div', { class: 'hint' }, 'The STL is the finished shape at true size. A 3D-printed copy makes a good reference to hold while you carve.'));
  $('b-print').textContent = isFace() ? 'Print layout' : 'Print templates';
  $('v-tool-wrap').hidden = isFace();
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
  row(sb, 'Grain runs', segmented([{ id: 'x', name: 'Left–right' }, { id: 'y', name: 'Front–back' }, { id: 'z', name: 'Up–down' }], S.opt.grain, v => { S.opt.grain = v; recompute(); }));
  syncSurface();
}

function custom() { if (ctl.preset) ctl.preset.value = ''; }

function syncSurface() {
  if (isFace()) return;
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

function buildJackPanel(p) {
  const J = S.opt.jack;
  const sj = section(p, 'Your Jack', false);
  sj.append(el('div', { class: 'hint jack-title' }, 'Flexcut Carvin’ Jack 2.0'));
  row(sj, 'Model', segmented([{ id: 'right', name: 'Right-handed', title: 'JKN291' }, { id: 'left', name: 'Left-handed', title: 'JKNL291' }], J.hand, v => { J.hand = v; recompute(); }));
  for (const f of JACK_FIELDS) {
    const lab = el('label', {}, f.label, el('span', { class: 'src' }, f.source));
    const nf = numberField({ value: uv(J[f.key]), step: S.opt.units === 'in' ? 0.0625 : 0.5, min: 0.5, suffix: S.opt.units, onChange: v => { J[f.key] = Math.max(1, fromUnits(v, S.opt.units)); recompute(); } });
    const r = el('div', { class: 'row' }, lab, nf);
    sj.append(r);
  }
  sj.append(el('div', { class: 'hint' }, 'Estimates are not published by Flexcut. Measure your blades with calipers: reach is from the tip to where the blade enters the handle; grip clearance is how wide an opening the handle and your fingers need.'));
  sj.append(el('div', { class: 'btns' }, el('button', { type: 'button', onclick: () => { S.opt.jack = { ...JACK_DEFAULT, hand: J.hand }; buildPanel(); recompute(); } }, 'Reset to defaults')));
}

function buildPlanPanel(p) {
  const sl = section(p, 'Plan', false);
  row(sl, 'Units', segmented([{ id: 'in', name: 'Inches' }, { id: 'mm', name: 'Millimetres' }], S.opt.units, v => { S.opt.units = v; buildPanel(); recompute(); }));
  if (isFace()) return;
  const r = row(sl, 'Drill', el('div', { class: 'checks' }, check('Also use a drill for bulk waste', S.opt.drill, v => { S.opt.drill = v; buildPanel(); recompute(); })), 'Off: everything is done with the Jack.');
  r.classList.add('check-row');
  const nf = (key, label, hint) => row(sl, label, numberField({ value: uv(S.opt[key]), step: S.opt.units === 'in' ? 0.0625 : 0.5, min: 0, suffix: S.opt.units, onChange: v => { S.opt[key] = Math.max(0.5, fromUnits(v, S.opt.units)); recompute(); } }), hint);
  if (S.opt.drill) nf('drillMargin', 'Drill margin', 'Wood left above the finished surface at the bottom of each hole.');
  nf('roughMargin', 'Rough margin', 'Stock left on the surface while roughing, for shaping later.');
  nf('bandStep', 'Layer depth', 'How deep each roughing layer goes. Each layer is cut in 1/8″ stop-cut passes.');
  row(sl, 'Detail', segmented([{ id: '64', name: 'Draft' }, { id: '96', name: 'Normal' }, { id: '128', name: 'Fine' }], String(S.P.res), v => { S.P.res = +v; recompute(); }), 'Finer detail is slower to plan.');
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

function makeProject() {
  const opt = S.opt;
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
  const model = buildModel(S.P);
  const plan = makePlan(model, opt);
  const steps = buildSteps(model, plan, opt);
  return {
    kind: 'surface', model, plan, steps, toolUniforms: plan.jack.map,
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

let computeToken = 0;
function recompute(reframe = false) {
  save();
  const token = ++computeToken;
  setBusy(true);
  setTimeout(() => {
    if (token !== computeToken) return;
    try {
      const t0 = performance.now();
      const pr = makeProject();
      S.proj = pr; S.model = pr.model; S.plan = pr.plan; S.steps = pr.steps;
      S.mesh = pr.finalMesh; S.meshTool = false;
      if (pr.kind === 'face') {
        const g = pr.model.g;
        view.setScene(pr.model.dims, 'z', { target: [0, 0, (g.zt + g.zHandle) / 2], noLabels: true });
        if (reframe || S.framed !== 'face') { view.frame((g.zt - g.zHandle) * 3.1, true); S.framed = 'face'; }
      } else {
        view.setScene(pr.model.dims, S.opt.grain);
        if (reframe || S.framed !== 'surface') { view.frame(Math.max(...pr.model.dims) * 3.3, false); S.framed = 'surface'; }
      }
      if (!guide.open) showFinal();
      guide.load(pr, S.opt, designKey());
      if (guide.open) guide.go(Math.min(guide.i, pr.steps.length - 1));
      hud();
      S.ms = performance.now() - t0;
    } catch (e) { fatal(e); }
    setBusy(false);
  }, 20);
}

function showFinal() {
  const pr = S.proj;
  const tool = S.toolMap && pr.kind === 'surface';
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
  const st = S.model.stats, j = S.plan.jack;
  const d = difficulty(S.model, S.plan);
  const holes = S.plan.holes.flat().length;
  const reach = j.outFrac < 0.003 ? '<b class="good">All within reach</b>' : `<b class="bad">${Math.round(j.outFrac * 100)}% out of reach</b>`;
  $('hud').innerHTML = `
<div class="hud-row"><span>Carvin’ Jack</span>${reach}</div>
<div class="hud-row"><span>Wood kept</span><b>${Math.round(st.keepFrac * 100)}%</b></div>
<div class="hud-row"><span>Hidden waste</span><b>${Math.round(st.hiddenFrac * 100)}%</b></div>
<div class="hud-row"><span>Thinnest wall</span><b>≈ ${U(st.thinIn)}</b></div>
<div class="hud-row"><span>Tightest hollow</span><b>r ${U(j.r5)}</b></div>
${S.opt.drill ? `<div class="hud-row"><span>Drill holes</span><b>${holes}</b></div>` : ''}
<div class="hud-row"><span>Guide</span><b>${S.steps.length} steps</b></div>
<div class="hud-diff ${d.cls}">${d.level}</div>
${st.islandCount ? `<div class="hud-warn">${st.islandCount} loose piece${st.islandCount > 1 ? 's' : ''} removed</div>` : ''}
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
  if (isFace()) view.lookCorner();
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
  if (isFace()) return `kerf-face-${Math.round(toUnits(S.FP.a, S.opt.units) * 100) / 100}${S.opt.units}`;
  const P = S.P;
  return `kerf-${P.surface}-${P.mode}-${Math.round(toUnits(P.W, S.opt.units) * 100) / 100}${S.opt.units}`;
}
function sheetsHTML() {
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

function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 4200);
}
function fatal(e) {
  console.error(e);
  const f = $('fatal');
  f.hidden = false;
  f.textContent = 'Something went wrong: ' + (e && e.message ? e.message : e);
}

// ---------------------------------------------------------------- boot
function boot() {
  $('ver').textContent = 'v' + VERSION;
  loadSaved();
  try {
    view = new View3D($('gl'), $('labels'));
  } catch (e) { fatal(e); return; }
  guide = new Guide({ view, onClose: closeGuideUI, onToolKey: toolKey });
  buildPanel();
  $('b-guide').onclick = () => (document.body.classList.contains('guiding') ? guide.close() : openGuide());
  $('b-print').onclick = printSheets;
  $('v-reset').onclick = () => view.resetView();
  $('v-tool').onchange = e => { S.toolMap = e.target.checked; if (!guide.open && S.mesh) showFinal(); };
  $('panel-toggle').onclick = () => document.body.classList.toggle('panel-open');
  recompute(true);
  window.kerf = { S, view, guide, VERSION, openGuide, recompute, buildPanel };
}
boot();
