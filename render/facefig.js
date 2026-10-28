// Figures for the corner face: layout sheet (the two faces unfolded around the corner),
// front relief of each stage with this cut highlighted, and the centre profile before/after.

import { reliefMap, shadeRelief, profile } from '../engine/facerelief.js';
import { faceMarks } from '../engine/facesteps.js';
import { fmtLen } from '../engine/units.js';
import { drawJackFigure } from './jackfig.js';
import { spreadLabels } from '../export/facetemplate.js';
import { model as jackModel } from '../engine/jack.js';

const INK = '#2a241f', PAPER = '#f6f1e7', WOOD = '#e2c9a2', CUT = '#d66828';

function setup(canvas, cssW, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, cssW, cssH);
  return ctx;
}

function relief(model, k, W) {
  model._relief ||= new Map();
  const key = k + ':' + W;
  if (!model._relief.has(key)) model._relief.set(key, reliefMap(model.stages[k], model.g, { W }));
  return model._relief.get(key);
}

function putRelief(ctx, R, rgba, x, y, scale) {
  const off = document.createElement('canvas');
  off.width = R.W; off.height = R.H;
  off.getContext('2d').putImageData(new ImageData(rgba, R.W, R.H), 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(off, x, y, R.W * scale, R.H * scale);
}

// ---------------------------------------------------------------- front relief + profile
function drawCut(canvas, cssW, model, fig) {
  const k = fig.k, g = model.g;
  const W = 150;
  const R = relief(model, k, W), B = relief(model, k - 1, W);
  const profW = Math.min(150, cssW * 0.3);
  const scale = Math.min((cssW - profW - 48) / R.W, 440 / R.H);
  const cssH = R.H * scale + 46;
  const ctx = setup(canvas, cssW, cssH);
  const x0 = 16, y0 = 18;
  putRelief(ctx, R, shadeRelief(R, B), x0, y0, scale);
  // stop-cut lines of this cut
  const mmToPx = (s, z) => [x0 + (s + R.sMax) / (2 * R.sMax) * R.W * scale, y0 + (R.z1 - z) / (R.z1 - R.z0) * R.H * scale];
  const cut = model.cuts[k - 1];
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.setLineDash([5, 3]);
  for (const line of cut.lines || []) {
    ctx.beginPath();
    line.forEach(([s, z], i) => { const sc = Math.max(-R.sMax, Math.min(R.sMax, s)); const [px, py] = mmToPx(sc, z); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // corner line
  ctx.strokeStyle = 'rgba(42,36,31,0.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0 + R.W * scale / 2, y0); ctx.lineTo(x0 + R.W * scale / 2, y0 + R.H * scale); ctx.stroke();
  ctx.fillStyle = '#6b6158'; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('C', x0 + 10, y0 - 5); ctx.fillText('E', x0 + R.W * scale - 10, y0 - 5);
  ctx.fillText('front view, looking at the corner', x0 + R.W * scale / 2, y0 + R.H * scale + 16);
  // centre profile, before (dashed) and after
  const px0 = x0 + R.W * scale + 28, ph = R.H * scale;
  const pa = profile(model.stages[k], g, 0, 160, R.z0, R.z1), pb = profile(model.stages[k - 1], g, 0, 160, R.z0, R.z1);
  const qs = g.a / Math.SQRT2;
  const ps = Math.min((profW - 10) / qs, scale * R.W / (2 * R.sMax));
  const toP = (z, q) => [px0 + (q) * ps, y0 + (R.z1 - z) / (R.z1 - R.z0) * ph];
  ctx.fillStyle = WOOD; ctx.beginPath();
  let started = false;
  for (const [z, q] of pa) { if (!isFinite(q)) continue; const [x, y] = toP(z, q); started ? ctx.lineTo(x, y) : ctx.moveTo(x, y); started = true; }
  const lastZ = pa[pa.length - 1][0];
  ctx.lineTo(...toP(lastZ, qs)); ctx.lineTo(...toP(pa[0][0], qs)); ctx.closePath(); ctx.fill();
  const stroke = (pts, style, dash) => {
    ctx.strokeStyle = style; ctx.lineWidth = 1.4; ctx.setLineDash(dash || []); ctx.beginPath();
    let st = false; for (const [z, q] of pts) { if (!isFinite(q)) { st = false; continue; } const [x, y] = toP(z, q); st ? ctx.lineTo(x, y) : ctx.moveTo(x, y); st = true; }
    ctx.stroke(); ctx.setLineDash([]);
  };
  stroke(pb, 'rgba(42,36,31,0.45)', [3, 3]);
  stroke(pa, CUT);
  ctx.fillStyle = '#6b6158'; ctx.textAlign = 'center';
  ctx.fillText('side profile', px0 + qs * ps / 2, y0 + ph + 16);
  return `<div class="legend"><span><i class="sw sw-cut"></i>wood this cut removes</span><span><i class="sw sw-line"></i>stop-cut line</span><span><i class="sw sw-prof"></i>profile after (dashed: before)</span></div>`;
}

function drawFinal(canvas, cssW, model) {
  const k = model.stages.length - 1;
  const R = relief(model, k, 170);
  const scale = Math.min((cssW - 32) / R.W, 460 / R.H);
  const ctx = setup(canvas, cssW, R.H * scale + 24);
  putRelief(ctx, R, shadeRelief(R, null), (cssW - R.W * scale) / 2, 12, scale);
  return '';
}

// ---------------------------------------------------------------- layout sheet
export function layoutGeometry(model) {
  const M = faceMarks(model), g = model.g;
  const faceW = g.a; // each face is a wide
  const zoneTop = 0, zoneBot = g.zt - g.zHandle + 0.08 * g.F;
  return { M, faceW, zoneTop, zoneBot };
}

function drawLayout(canvas, cssW, model, fig, opt) {
  const { M, faceW, zoneBot } = layoutGeometry(model);
  const u = opt.units;
  const labelW = 178;
  const s = Math.min((cssW - labelW - 30) / (2 * faceW), 440 / zoneBot);
  const cssH = Math.max(zoneBot * s, 13 * layoutGeometry(model).M.marks.length) + 44;
  const ctx = setup(canvas, cssW, cssH);
  const cx = 16 + faceW * s, y0 = 22;
  const X = d => cx + d * s, Y = d => y0 + d * s;
  ctx.fillStyle = '#fff'; ctx.fillRect(X(-faceW), Y(0), 2 * faceW * s, zoneBot * s);
  // shaded cut zones: brow notch / nose sides / mouth (simplified hatching between lines)
  ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.strokeRect(X(-faceW), Y(0), 2 * faceW * s, zoneBot * s);
  ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(0), Y(zoneBot)); ctx.strokeStyle = '#8a7f6e'; ctx.stroke(); ctx.setLineDash([]);
  ctx.font = '10.5px system-ui, sans-serif'; ctx.textBaseline = 'middle';
  const ly = spreadLabels(M.marks.map(m => Y(m.y)), 13);
  M.marks.forEach((m, i) => {
    ctx.strokeStyle = m.minor ? 'rgba(42,36,31,0.45)' : INK; ctx.lineWidth = m.minor ? 0.8 : 1.4;
    ctx.beginPath(); ctx.moveTo(X(-faceW), Y(m.y)); ctx.lineTo(X(faceW), Y(m.y)); ctx.stroke();
    if (ly[i] - Y(m.y) > 1) { ctx.strokeStyle = 'rgba(42,36,31,0.35)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(X(faceW) + 1, Y(m.y)); ctx.lineTo(X(faceW) + 6, ly[i]); ctx.stroke(); }
    ctx.fillStyle = m.minor ? '#6b6158' : INK; ctx.textAlign = 'left';
    ctx.fillText(`${m.label} · ${fmtLen(m.y, u)}`, X(faceW) + 8, ly[i]);
  });
  const yB = M.marks.find(m => m.id === 'brow').y, yN = M.marks.find(m => m.id === 'nose').y, yC = M.marks.find(m => m.id === 'chin').y;
  ctx.strokeStyle = CUT; ctx.lineWidth = 1.8;
  for (const sg of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(X(sg * M.noseTop), Y(yB)); ctx.lineTo(X(sg * M.noseBase), Y(yN)); ctx.stroke();
    ctx.beginPath(); M.mound.forEach(([y, d], i) => (i ? ctx.lineTo(X(sg * d), Y(y)) : ctx.moveTo(X(sg * d), Y(y)))); ctx.stroke();
    // ends of the brow and nose notches
    ctx.fillStyle = CUT;
    ctx.beginPath(); ctx.arc(X(sg * M.browEnd), Y(yB), 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(X(sg * M.noseEnd), Y(yN), 3, 0, Math.PI * 2); ctx.fill();
    // eye centre
    const em = M.marks.find(m => m.id === 'eye');
    if (em) {
      ctx.strokeStyle = INK; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(X(sg * M.eye), Y(em.y), 5, 3, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = CUT; ctx.lineWidth = 1.8;
  }
  ctx.fillStyle = '#6b6158'; ctx.textAlign = 'center'; ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillText('C', X(-faceW / 2), Y(0) - 10); ctx.fillText('corner', X(0), Y(0) - 10); ctx.fillText('E', X(faceW / 2), Y(0) - 10);
  // scale bar
  const L = u === 'in' ? 25.4 : 20, yb = Y(zoneBot) + 18;
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(X(-faceW), yb); ctx.lineTo(X(-faceW) + L * s, yb); ctx.stroke();
  ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(u === 'in' ? '1″' : '20 mm', X(-faceW) + L * s + 6, yb);
  return `<div class="legend"><span><i class="sw sw-line2"></i>layout line (height from the top)</span><span><i class="sw sw-nose"></i>nose and mouth-mound lines</span><span><i class="sw sw-dot"></i>where a notch ends on the face</span></div>`;
}

export function drawFaceFigure(canvas, model, fig, opt) {
  const cssW = Math.max(240, Math.floor(canvas.parentElement.clientWidth));
  switch (fig.type) {
    case 'faceCut': return drawCut(canvas, cssW, model, fig);
    case 'faceFinal': return drawFinal(canvas, cssW, model);
    case 'faceLayout': return drawLayout(canvas, cssW, model, fig, opt);
    case 'jack': return drawJackFigure(canvas, cssW, jackModel(opt.jack), opt.units, null);
    default: return '';
  }
}
