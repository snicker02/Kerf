// Printable PDF booklet: a cover, every step of the guide (3D view, figure, instructions and
// checklist) and the true-scale templates, in one file. Runs in the browser: the 3D view,
// figures and template sheets are rendered to images and placed with the PDF writer.

import { PDF, PW, PH, wrapRuns } from './pdf.js';

const M = 48, CW = PW - 2 * M, FOOT = 40;
const INK = '#2a241f', MUTED = '#6b6158', ACCENT = '#a2470f';
const PHASE_COL = { plan: '#6b6158', prepare: '#6b6158', drill: '#2c4c68', saw: '#a2470f', rough: '#b0601c', shape: '#2f6f5a', finish: '#5a4f8a', detail: '#7b5cb0', outline: '#354c66', lower: '#8a5a1c', carve: '#a2470f', refine: '#2f6f5a' };
const SW = { wood: '#d6b588', cut: '#d66828', prev: '#e4ded0', hook: '#2f8f8a', scorp: '#d18a1e', gouge: '#7b5cb0', out: '#db3829', line: '#2a241f', line2: '#2a241f', prof: '#d66828', nose: '#d66828', dot: '#d66828', saw: '#a2470f', deep: '#96bab4', hole: '#ffffff', exit: '#ffffff', paper: '#f6f1e7', hid: '#de7024', pt: '#13202b', thru: '#263e58', grain: '#5a3c1e' };
const BLADE = { detail: 'Detail knife', pelican: 'Pelican knife', hook: 'Hook knife', gouge: 'Straight gouge', scorp: 'Gouge scorp', vscorp: 'V-scorp' };

const tick = () => new Promise(r => setTimeout(r, 0));

function b64bytes(dataURL) {
  const s = atob(dataURL.slice(dataURL.indexOf(',') + 1));
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
function jpegOf(canvas, q = 0.86) {
  // flatten onto white so transparent pixels don't turn black
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(canvas, 0, 0);
  return { bytes: b64bytes(c.toDataURL('image/jpeg', q)), w: c.width, h: c.height };
}

// ---------------------------------------------------------------- HTML → blocks of rich text
function runsOf(node, bold = false, out = []) {
  for (const n of node.childNodes) {
    if (n.nodeType === 3) out.push({ t: n.textContent.replace(/\s+/g, ' '), bold });
    else if (n.nodeType === 1) {
      if (n.tagName === 'BR') out.push({ t: ' ', bold });
      else runsOf(n, bold || n.tagName === 'B' || n.tagName === 'STRONG' || n.tagName === 'H3', out);
    }
  }
  return out;
}
const trimRuns = r => { const o = r.filter(x => x.t); if (o.length) { o[0] = { ...o[0], t: o[0].t.replace(/^\s+/, '') }; const l = o.length - 1; o[l] = { ...o[l], t: o[l].t.replace(/\s+$/, '') }; } return o.filter(x => x.t); };

export function htmlBlocks(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  const out = [];
  for (const n of d.children) {
    const cls = n.className || '';
    if (n.tagName === 'UL' || n.tagName === 'OL') {
      [...n.children].forEach((li, i) => out.push({ type: 'li', mark: n.tagName === 'OL' ? `${i + 1}.` : '•', runs: trimRuns(runsOf(li)) }));
    } else if (cls.includes('kv')) {
      out.push({ type: 'kv', rows: [...n.children].map(r => [r.children[0]?.textContent || '', r.children[1]?.textContent || '']) });
    } else {
      out.push({ type: 'p', cls: cls.includes('warn') ? 'warn' : cls.includes('tip') ? 'tip' : cls.includes('ok') ? 'ok' : '', runs: trimRuns(runsOf(n)), head: /^H\d$/.test(n.tagName) });
    }
  }
  return out;
}

function legendItems(html) {
  if (!html) return [];
  const d = document.createElement('div');
  d.innerHTML = html;
  return [...d.querySelectorAll('span')].map(s => {
    const i = s.querySelector('i');
    let col = null;
    if (i) {
      const st = i.getAttribute('style') || '';
      const m = st.match(/background:\s*(#[0-9a-f]{3,6})/i);
      if (m) col = m[1];
      else { const k = [...i.classList].find(c => c.startsWith('sw-')); col = k ? SW[k.slice(3)] || '#999' : '#999'; }
    }
    return { col, t: s.textContent.trim() };
  });
}

// ---------------------------------------------------------------- page flow
class Flow {
  constructor(pdf, meta) { this.pdf = pdf; this.meta = meta; this.page = 0; this.y = PH; }
  newPage() {
    this.pdf.addPage(); this.page++;
    this.y = M;
    const p = this.pdf;
    p.line(M, PH - FOOT + 8, PW - M, PH - FOOT + 8, { color: '#d8cfbf', lw: 0.5 });
    p.text(M, PH - FOOT + 22, `Kerf ${this.meta.version} · ${this.meta.title}`, 8, { color: MUTED });
    const pg = `page ${this.page}`;
    p.text(PW - M - p.width(pg, 8), PH - FOOT + 22, pg, 8, { color: MUTED });
  }
  room() { return PH - FOOT - this.y; }
  ensure(h) { if (this.y + h > PH - FOOT) this.newPage(); }
  // draw wrapped runs; returns height used
  para(runs, { size = 10.5, x = M, w = CW, color = INK, lead = 1.38, measureOnly = false } = {}) {
    const lines = wrapRuns(runs, size, w, this.pdf.measure);
    const lh = size * lead;
    if (measureOnly) return lines.length * lh;
    for (const l of lines) {
      this.ensure(lh);
      let cx = x;
      for (const r of l) { this.pdf.text(cx, this.y + size, r.t, size, { bold: r.bold, color }); cx += this.pdf.measure(r.t, size, r.bold); }
      this.y += lh;
    }
    return lines.length * lh;
  }
}

// ---------------------------------------------------------------- the booklet
// ctx: { project, opt, view, guide, version, title, subtitle, stats: [[k, v]], sheetsHTML, restore, onProgress }
export async function buildBooklet(ctx) {
  try { return await build(ctx); } finally { ctx.view.bg = null; ctx.view.dirty = true; }
}

async function build(ctx) {
  const mc = document.createElement('canvas').getContext('2d');
  const measure = (t, size, bold) => { mc.font = `${bold ? 'bold ' : ''}${size}px Helvetica, Arial, "Liberation Sans", sans-serif`; return mc.measureText(t).width; };
  const pdf = new PDF({ measure, title: `Kerf — ${ctx.title}` });
  const F = new Flow(pdf, { version: ctx.version, title: ctx.title });
  const { project, view, guide } = ctx;
  const steps = project.steps;
  const progress = (f, msg) => ctx.onProgress && ctx.onProgress(f, msg);

  const glc = view.canvas;
  view.bg = [0.965, 0.945, 0.906];   // paper-coloured background for print
  const shot = (state, angles, hl, aspect = 4 / 3) => {
    const mesh = guide.meshFor(state, false);
    view.setMesh(mesh);
    view.setToolMap(false, project.toolUniforms);
    try { view.setHighlight(hl || null, project.model, project.plan); } catch (e) { view.setHighlight(null); }
    view.lookFrom(angles[0], angles[1], true);
    view.render();
    const W = glc.width, H = glc.height;
    let cw = W, ch = Math.round(W / aspect);
    if (ch > H) { ch = H; cw = Math.round(H * aspect); }
    const c = document.createElement('canvas');
    const sc = Math.min(1, 900 / cw);
    c.width = Math.round(cw * sc); c.height = Math.round(ch * sc);
    c.getContext('2d').drawImage(glc, (W - cw) / 2, (H - ch) / 2, cw, ch, 0, 0, c.width, c.height);
    return jpegOf(c, 0.85);
  };
  const anglesFor = st => {
    if (st.corner) return [-Math.PI / 4, 0.16];
    if (st.view) return [st.view.yaw, st.view.pitch];
    if (st.focus != null && view.faceAngles) return view.faceAngles(st.focus);
    return view.home || [-0.95, 0.5];
  };
  const homeAngles = project.view ? [project.view.yaw, project.view.pitch] : (project.kind === 'face' ? [-Math.PI / 4, 0.16] : [-0.95, 0.5]);

  // ---- cover
  progress(0, 'Cover');
  F.newPage();
  pdf.text(M, M + 10, 'KERF · CARVING GUIDE FOR THE FLEXCUT CARVIN’ JACK', 8.5, { bold: true, color: ACCENT });
  F.y = M + 22;
  F.para([{ t: ctx.title, bold: true }], { size: 26, lead: 1.15 });
  if (ctx.subtitle) F.para([{ t: ctx.subtitle }], { size: 12, color: MUTED });
  F.y += 10;
  const last = steps[steps.length - 1];
  const cov = shot(last.state, homeAngles, null, 4 / 3);
  const cid = pdf.addImage(cov.bytes, cov.w, cov.h);
  const ch = CW * cov.h / cov.w;
  pdf.rect(M, F.y, CW, ch, { fill: '#f6f1e7' });
  pdf.image(cid, M, F.y, CW, ch);
  F.y += ch + 16;
  for (const [k, v] of ctx.stats || []) {
    pdf.text(M, F.y + 10, k, 10, { color: MUTED });
    pdf.text(M + 170, F.y + 10, v, 10, { bold: true });
    F.y += 15;
  }
  F.y += 8;
  const nSheets = (ctx.sheetsHTML.match(/<section class="sheet"><svg/g) || []).length;
  F.para([{ t: `${steps.length} steps, then ${nSheets} template page${nSheets === 1 ? '' : 's'} at the back. Print the templates at 100% (“actual size”) and check the 1-inch bar with a ruler.` }], { size: 10, color: MUTED });
  pdf.text(M, PH - FOOT - 6, 'Created with help from Claude AI', 9, { color: MUTED });
  await tick();

  // ---- steps
  const fig = document.createElement('canvas');
  fig._cssW = 640; fig._dpr = 2;
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    progress((i + 1) / (steps.length + nSheets + 1), `Step ${i + 1} of ${steps.length}`);
    if (F.page === 1 || F.room() < 330) F.newPage(); else { F.y += 6; pdf.line(M, F.y, PW - M, F.y, { color: '#d8cfbf', lw: 0.6 }); F.y += 14; }
    // header
    const ph = (st.phase || '').toUpperCase(), pc = PHASE_COL[(st.phase || '').toLowerCase()] || MUTED;
    const pw = pdf.width(ph, 8, true) + 12;
    pdf.rect(M, F.y, pw, 14, { fill: pc });
    pdf.text(M + 6, F.y + 10, ph, 8, { bold: true, color: '#ffffff' });
    pdf.text(M + pw + 8, F.y + 10, `Step ${i + 1} of ${steps.length}`, 9, { color: MUTED });
    F.y += 20;
    F.para([{ t: st.title, bold: true }], { size: 16, lead: 1.2 });
    if (st.blades && st.blades.length) F.para([{ t: 'Blades: ', bold: true }, { t: st.blades.map(b => BLADE[b] || b).join(', ') }], { size: 9.5, color: MUTED });
    F.y += 4;
    // images: 3D view + figure
    const s3 = shot(st.state, anglesFor(st), st.hl && st.hl.type !== 'slice' ? st.hl : null, 4 / 3);
    let figImg = null, legend = [];
    if (st.figure && st.figure.type !== 'none') {
      const slice = st.figure.type === 'slice' ? (st.figure.at ? { axis: 2, index: Math.round((st.figure.at[2] - project.model.org[2]) / project.model.hs[2]) } : { axis: 2, index: Math.round(project.model.n[2] / 2) }) : guide.slice;
      try {
        const lh = project.draw(fig, st.figure, slice, st.state);
        if (fig.width > 0 && fig.height > 0) { figImg = jpegOf(fig, 0.9); legend = legendItems(lh); }
      } catch (e) { console.warn('figure', e); }
    }
    let w3 = figImg ? 200 : 300, h3 = w3 * s3.h / s3.w;
    let fw = 0, fh = 0;
    if (figImg) {
      fw = CW - w3 - 14; fh = fw * figImg.h / figImg.w;
      if (fh > 300) { fh = 300; fw = fh * figImg.w / figImg.h; }
    }
    const legH = legend.length ? Math.ceil(legend.length / 2) * 12 + 4 : 0;
    const rowH = Math.max(h3, fh + legH);
    F.ensure(rowH + 8);
    const id3 = pdf.addImage(s3.bytes, s3.w, s3.h);
    pdf.image(id3, M, F.y, w3, h3);
    pdf.rect(M, F.y, w3, h3, { stroke: '#d8cfbf', lw: 0.5 });
    if (figImg) {
      const fx = M + w3 + 14;
      const idf = pdf.addImage(figImg.bytes, figImg.w, figImg.h);
      pdf.image(idf, fx, F.y, fw, fh);
      let ly = F.y + fh + 4;
      legend.forEach((it, k) => {
        const lx = fx + (k % 2) * (CW - w3 - 14) / 2;
        if (it.col) pdf.rect(lx, ly + 2, 8, 8, { fill: it.col, stroke: '#8a7f6e', lw: 0.4 });
        const t = it.t.length > 46 ? it.t.slice(0, 45) + '…' : it.t;
        pdf.text(lx + 12, ly + 9, t, 8, { color: MUTED });
        if (k % 2 === 1) ly += 12;
      });
    }
    F.y += rowH + 12;
    // instructions
    for (const b of htmlBlocks(st.html || '')) {
      if (b.type === 'li') {
        const h = F.para(b.runs, { x: M + 16, w: CW - 16, measureOnly: true });
        F.ensure(Math.min(h, 30));
        pdf.text(M + 2, F.y + 10.5, b.mark, 10.5, { bold: b.mark !== '•', color: ACCENT });
        F.para(b.runs, { x: M + 16, w: CW - 16 });
        F.y += 3;
      } else if (b.type === 'kv') {
        for (const [k, v] of b.rows) {
          F.ensure(15);
          pdf.text(M, F.y + 10, k, 9.5, { color: MUTED });
          F.para([{ t: v, bold: true }], { x: M + 200, w: CW - 200, size: 9.5 });
        }
        F.y += 6;
      } else if (b.runs.length) {
        if (b.cls) {
          const col = b.cls === 'warn' ? '#c9442c' : b.cls === 'ok' ? '#2f8f5a' : '#d99a2b';
          const h = F.para(b.runs, { x: M + 12, w: CW - 12, measureOnly: true, size: 10 });
          F.ensure(Math.min(h, 60) + 4);
          const y0 = F.y;
          F.para(b.runs, { x: M + 12, w: CW - 12, size: 10 });
          pdf.rect(M, y0, 3, Math.max(12, F.y > y0 ? F.y - y0 : h), { fill: col });
        } else F.para(b.runs, { size: b.head ? 11.5 : 10.5 });
        F.y += 6;
      }
    }
    // hole table (drilling steps)
    if (st.table === 'holes' && project.plan) {
      const hs = project.plan.holes[st.face] || [];
      const cols = [['#', 30], ['Bit', 120], ['From left', 90], ['From top', 90], ['Depth', 90]];
      const fmt = ctx.fmt;
      F.ensure(30);
      let x = M + 16; for (const [h, w] of cols) { pdf.text(x, F.y + 10, h, 9, { bold: true }); x += w; }
      F.y += 15;
      for (const h of hs) {
        F.ensure(13);
        pdf.rect(M, F.y + 1, 9, 9, { stroke: INK, lw: 0.6 });
        const vals = [`${h.n}${h.through ? 'T' : ''}`, h.bit.label, fmt(h.u), fmt(h.v), h.through ? 'through' : fmt(h.depth)];
        x = M + 16; vals.forEach((v, k) => { pdf.text(x, F.y + 9, v, 9); x += cols[k][1]; });
        F.y += 13;
      }
      F.y += 6;
    }
    // checklist
    if (st.checks && st.checks.length) {
      F.ensure(16);
      for (const c of st.checks) {
        F.ensure(15);
        pdf.rect(M, F.y + 1.5, 10, 10, { stroke: INK, lw: 0.7 });
        F.para([{ t: c.replace(/<[^>]+>/g, '') }], { x: M + 18, w: CW - 18, size: 10 });
        F.y += 2;
      }
    }
    if (i % 2 === 1) await tick();
  }

  // ---- templates: each SVG sheet rasterised at 200 dpi and placed full page (true scale)
  const doc = new DOMParser().parseFromString(ctx.sheetsHTML, 'text/html');
  const svgs = [...doc.querySelectorAll('section.sheet > svg')];
  for (let k = 0; k < svgs.length; k++) {
    progress((steps.length + 1 + k) / (steps.length + nSheets + 1), `Template ${k + 1} of ${svgs.length}`);
    const svg = svgs[k];
    if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const src = new XMLSerializer().serializeToString(svg);
    const url = URL.createObjectURL(new Blob([src], { type: 'image/svg+xml' }));
    try {
      const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('template image')); im.src = url; });
      const c = document.createElement('canvas');
      c.width = 1700; c.height = 2200;
      const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      x.drawImage(img, 0, 0, c.width, c.height);
      const j = jpegOf(c, 0.9);
      pdf.addPage();
      pdf.image(pdf.addImage(j.bytes, j.w, j.h), 0, 0, PW, PH);
    } catch (e) { console.warn(e); }
    URL.revokeObjectURL(url);
    await tick();
  }
  progress(1, 'Saving');
  view.bg = null;
  ctx.restore && ctx.restore();
  return pdf.finish();
}
