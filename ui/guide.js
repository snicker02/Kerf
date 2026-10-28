// Step-by-step carving guide: one step at a time, figure + instructions + checklist,
// with the 3D view showing the wood as it should look after that step.
// Works for any project that supplies { model, plan, steps, meshAt(state, toolMap), draw(canvas, fig, slice), toolUniforms }.

import { FACES } from '../engine/model.js';
import { fmtLen } from '../engine/units.js';

const $ = id => document.getElementById(id);

export class Guide {
  constructor({ view, onClose, onToolKey }) {
    this.view = view;
    this.onClose = onClose;
    this.onToolKey = onToolKey || (() => {});
    this.i = 0;
    this.cache = new Map();
    this.slice = { axis: 2, index: 0 };
    this.speakOn = false;
    $('g-prev').onclick = () => this.go(this.i - 1);
    $('g-next').onclick = () => this.go(this.i + 1);
    $('g-done').onclick = () => { this._markAll(true); this.go(this.i + 1); };
    $('g-close').onclick = () => this.close();
    $('g-jump').onchange = e => this.go(+e.target.value);
    $('g-speak').onclick = () => {
      this.speakOn = !this.speakOn;
      $('g-speak').classList.toggle('on', this.speakOn);
      $('g-speak').setAttribute('aria-pressed', this.speakOn);
      if (this.speakOn) this._speak(); else window.speechSynthesis?.cancel();
    };
    window.addEventListener('keydown', e => {
      if (!this.open || e.target.matches('input, select, textarea')) return;
      if (e.key === 'ArrowRight') { this.go(this.i + 1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { this.go(this.i - 1); e.preventDefault(); }
      else if (e.key === 'Escape') this.close();
    });
    new ResizeObserver(() => { if (this.open) this._figure(); }).observe($('g-figwrap'));
  }

  load(project, opt, key) {
    this.project = project;
    this.model = project.model; this.plan = project.plan; this.steps = project.steps;
    this.opt = opt; this.key = key;
    this.cache.clear();
    this.prog = { i: 0, checks: {} };
    try { const s = localStorage.getItem('kerf:prog:' + key); if (s) this.prog = JSON.parse(s); } catch (e) { /* storage unavailable */ }
    const sel = $('g-jump');
    sel.innerHTML = '';
    this.steps.forEach((s, i) => sel.append(new Option(`${i + 1}. ${s.title}`, i)));
  }

  _save() { try { localStorage.setItem('kerf:prog:' + this.key, JSON.stringify(this.prog)); } catch (e) { /* ignore */ } }

  show(i = this.prog.i || 0) {
    this.open = true;
    this.go(i);
  }
  close() {
    this.open = false;
    window.speechSynthesis?.cancel();
    this.onClose && this.onClose();
  }

  go(i) {
    if (!this.steps) return;
    i = Math.max(0, Math.min(this.steps.length - 1, i));
    this.i = i; this.prog.i = i; this._save();
    const st = this.steps[i];
    $('g-count').textContent = `Step ${i + 1} of ${this.steps.length}`;
    $('g-fill').style.width = `${((i + 1) / this.steps.length) * 100}%`;
    $('g-jump').value = i;
    $('g-phase').textContent = st.phase;
    $('g-phase').dataset.phase = st.phase.toLowerCase();
    $('g-title').textContent = st.title;
    $('g-blades').innerHTML = (st.blades || []).map(b => `<span class="bchip b-${b}">${BLADE_LABEL[b]}</span>`).join('');
    $('g-body').innerHTML = st.html;
    $('g-prev').disabled = i === 0;
    $('g-next').disabled = i === this.steps.length - 1;
    $('g-done').textContent = i === this.steps.length - 1 ? 'Mark done' : 'Done — next step';
    if (st.figure.type === 'slice') {
      if (st.figure.at) this.slice = { axis: 2, index: Math.round((st.figure.at[2] - this.model.org[2]) / this.model.hs[2]) };
      else if (st.figure.mode === 'hidden') this.slice = this._busiestSlice();
      else this.slice = { axis: this.slice.axis, index: Math.round(this.model.n[this.slice.axis] / 2) };
    }
    this._sliceControls(st);
    this._figure();
    this._table(st);
    this._checks(st);
    this._apply3D(st);
    $('g-scroll').scrollTop = 0;
    if (this.speakOn) this._speak();
    // warm the cache for the next step while the person reads this one
    clearTimeout(this._pre);
    const nx = this.steps[i + 1];
    if (nx) this._pre = setTimeout(() => { if (this.open && this.i === i) this.meshFor(nx.state, !!nx.toolMap); }, 400);
  }

  _speak() {
    const st = this.steps[this.i];
    if (!window.speechSynthesis || !st) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(`Step ${this.i + 1}. ${st.title}. ${st.speak || ''}`);
    u.rate = 0.98;
    window.speechSynthesis.speak(u);
  }

  // the slice that shows the most hidden waste
  _busiestSlice() {
    const { s, hidden } = this.model;
    const cnt = [new Int32Array(s[0]), new Int32Array(s[1]), new Int32Array(s[2])];
    let idx = 0;
    for (let k = 0; k < s[2]; k++) for (let j = 0; j < s[1]; j++) for (let i = 0; i < s[0]; i++, idx++) {
      if (hidden[idx]) { cnt[0][i]++; cnt[1][j]++; cnt[2][k]++; }
    }
    let best = { axis: 2, index: Math.round(this.model.n[2] / 2) }, bv = 0;
    for (let a = 0; a < 3; a++) for (let m = 0; m < s[a]; m++) if (cnt[a][m] > bv * 1.05) { bv = cnt[a][m]; best = { axis: a, index: m }; }
    return best;
  }

  _sliceControls(st) {
    const box = $('g-figctl');
    box.innerHTML = '';
    if (st.figure.type !== 'slice') { box.hidden = true; return; }
    box.hidden = false;
    const seg = document.createElement('div');
    seg.className = 'seg small';
    ['X', 'Y', 'Z'].forEach((name, a) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = name; b.title = `Slice across ${name}`;
      b.classList.toggle('on', a === this.slice.axis);
      b.onclick = () => { this.slice = { axis: a, index: Math.round(this.model.n[a] / 2) }; this._sliceControls(st); this._figure(); this._sliceHL(); };
      seg.append(b);
    });
    const r = document.createElement('input');
    r.type = 'range'; r.min = 0; r.max = this.model.n[this.slice.axis]; r.step = 1; r.value = this.slice.index;
    r.id = 'g-slice'; r.setAttribute('aria-label', 'Slice position');
    const out = document.createElement('output');
    const upd = () => {
      const a = this.slice.axis;
      out.textContent = `${fmtLen(this.slice.index * this.model.hs[a], this.opt.units)} from ${FACES[[5, 2, 1][a]].id}`;
    };
    r.oninput = () => { this.slice.index = +r.value; upd(); this._figure(); this._sliceHL(); };
    upd();
    box.append(seg, r, out);
  }

  _sliceHL() {
    const a = this.slice.axis;
    this.view.setHighlight({ type: 'slice', axis: a, pos: this.model.org[a] + this.slice.index * this.model.hs[a] }, this.model, this.plan);
  }

  _figure() {
    const st = this.steps[this.i];
    const cv = $('g-fig');
    if (!st || st.figure.type === 'none') { cv.hidden = true; $('g-legend').innerHTML = ''; return; }
    cv.hidden = false;
    $('g-legend').innerHTML = this.project.draw(cv, st.figure, this.slice) || '';
  }

  _table(st) {
    const box = $('g-table');
    box.innerHTML = '';
    if (st.table !== 'holes') return;
    const u = this.opt.units;
    const hs = this.plan.holes[st.face];
    const done = this.prog.checks[st.id + ':holes'] || [];
    const t = document.createElement('table');
    t.className = 'holes';
    t.innerHTML = `<thead><tr><th></th><th>#</th><th>Bit</th><th>From left</th><th>From top</th><th>Depth</th></tr></thead>`;
    const tb = document.createElement('tbody');
    hs.forEach((h, k) => {
      const tr = document.createElement('tr');
      tr.className = done[k] ? 'done' : '';
      tr.innerHTML = `<td><input type="checkbox" ${done[k] ? 'checked' : ''} aria-label="Hole ${h.n} drilled"></td><td><b>${h.n}${h.through ? 'T' : ''}</b></td><td>${h.bit.label}</td><td>${fmtLen(h.u, u)}</td><td>${fmtLen(h.v, u)}</td><td>${h.through ? '<b>through</b>' : fmtLen(h.depth, u)}</td>`;
      const cb = tr.querySelector('input');
      const toggle = v => { done[k] = v; cb.checked = v; tr.classList.toggle('done', v); this.prog.checks[st.id + ':holes'] = done; this._save(); };
      cb.onchange = () => toggle(cb.checked);
      tr.onclick = e => { if (e.target !== cb) toggle(!cb.checked); };
      tb.append(tr);
    });
    t.append(tb);
    box.append(t);
  }

  _checks(st) {
    const box = $('g-checks');
    box.innerHTML = '';
    if (!st.checks.length) return;
    const done = this.prog.checks[st.id] || [];
    st.checks.forEach((label, k) => {
      const id = `ck-${st.id}-${k}`;
      const l = document.createElement('label');
      l.className = 'check' + (done[k] ? ' done' : '');
      l.innerHTML = `<input type="checkbox" id="${id}" ${done[k] ? 'checked' : ''}><span>${label}</span>`;
      l.querySelector('input').onchange = e => { done[k] = e.target.checked; l.classList.toggle('done', e.target.checked); this.prog.checks[st.id] = done; this._save(); };
      box.append(l);
    });
  }

  _markAll(v) {
    const st = this.steps[this.i];
    if (st.checks.length) this.prog.checks[st.id] = st.checks.map(() => v);
    if (st.table === 'holes') this.prog.checks[st.id + ':holes'] = this.plan.holes[st.face].map(() => v);
    this._save();
  }

  meshFor(state, withTool) {
    const key = JSON.stringify(state) + (withTool ? 't' : '');
    if (this.cache.has(key)) return this.cache.get(key);
    const mesh = this.project.meshAt(state, withTool);
    if (this.cache.size > 6) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, mesh);
    return mesh;
  }

  _apply3D(st) {
    const mesh = this.meshFor(st.state, !!st.toolMap);
    this.view.setMesh(mesh);
    const tm = !!st.toolMap && !!this.project.toolUniforms;
    this.view.setToolMap(tm, this.project.toolUniforms);
    this.onToolKey(tm);
    const prog = $('g-removed');
    if (mesh.removedFrac != null && (['Drill', 'Rough'].includes(st.phase) || (st.phase === 'Shape' && !st.state.final))) {
      prog.hidden = false;
      prog.textContent = `Waste removed after this step: ${Math.round(mesh.removedFrac * 100)}%`;
    } else prog.hidden = true;
    if (st.hl && st.hl.type === 'slice') this._sliceHL();
    else this.view.setHighlight(st.hl, this.model, this.plan);
    if (st.corner) this.view.lookCorner();
    else if (st.focus != null) this.view.focusFace(st.focus);
  }
}

const BLADE_LABEL = { detail: 'Detail knife', pelican: 'Pelican knife', hook: 'Hook knife', gouge: 'Straight gouge', scorp: 'Gouge scorp', vscorp: 'V-scorp' };
