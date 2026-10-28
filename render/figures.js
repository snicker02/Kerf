// 2D figures for guide steps, drawn like printed shop drawings.

import { FACES, BIG, faceEdges, sample2D, nearest2D } from '../engine/model.js';
import { contour2D } from '../engine/contour.js';
import { fmtLen, niceStep } from '../engine/units.js';
import { drawJackFigure } from './jackfig.js';

const PAPER = [246, 241, 231], INK = '#2a241f', WOOD = [214, 181, 136], WOOD2 = [196, 160, 112];
const NAVY = [38, 62, 88];
const DEPTH_STOPS = [[0, [240, 232, 214]], [0.45, [150, 186, 180]], [1, [44, 76, 104]]];
function depthRGB(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < DEPTH_STOPS.length; i++) {
    const [t1, c1] = DEPTH_STOPS[i];
    if (t <= t1) {
      const [t0, c0] = DEPTH_STOPS[i - 1];
      const f = (t - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return DEPTH_STOPS[DEPTH_STOPS.length - 1][1];
}

function setup(canvas, cssW, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = `rgb(${PAPER})`; ctx.fillRect(0, 0, cssW, cssH);
  ctx.dpr = dpr;
  return ctx;
}

function affineXY(face) {
  const o = face.toXY(0, 0), a = face.toXY(1, 0), b = face.toXY(0, 1);
  return { ax: a[0] - o[0], bx: b[0] - o[0], cx: o[0], ay: a[1] - o[1], by: b[1] - o[1], cy: o[1] };
}

// fill a face rectangle pixel by pixel; colorFn(X, Y, px, py) -> [r,g,b]
function raster(ctx, rect, face, colorFn) {
  const dpr = ctx.dpr;
  const x0 = Math.round(rect.x * dpr), y0 = Math.round(rect.y * dpr);
  const w = Math.max(1, Math.round(rect.w * dpr)), h = Math.max(1, Math.round(rect.h * dpr));
  const img = ctx.createImageData(w, h);
  const A = affineXY(face);
  for (let py = 0; py < h; py++) {
    const v = (py + 0.5) / h * face.wv;
    for (let px = 0; px < w; px++) {
      const u = (px + 0.5) / w * face.wu;
      const X = A.ax * u + A.bx * v + A.cx, Y = A.ay * u + A.by * v + A.cy;
      const c = colorFn(X, Y, px, py);
      const o = (py * w + px) * 4;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, x0, y0);
}

const woodAt = (px, py) => ((px * 0.35 + py * 0.08) % 9 < 1.2 ? WOOD2 : WOOD);

function uvToPx(rect, face, u, v) { return [rect.x + u / face.wu * rect.w, rect.y + v / face.wv * rect.h]; }

function strokeSegs(ctx, rect, face, segs, style, width) {
  ctx.beginPath();
  for (let q = 0; q < segs.length; q += 4) {
    const a = face.toUV(segs[q], segs[q + 1]), b = face.toUV(segs[q + 2], segs[q + 3]);
    const pa = uvToPx(rect, face, a[0], a[1]), pb = uvToPx(rect, face, b[0], b[1]);
    ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]);
  }
  ctx.strokeStyle = style; ctx.lineWidth = width; ctx.stroke();
}

function edgeLabels(ctx, rect, fi, pad = 12) {
  const e = faceEdges(fi);
  ctx.fillStyle = '#7b6f62'; ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(FACES[e.top].id, rect.x + rect.w / 2, rect.y - pad);
  ctx.fillText(FACES[e.bottom].id, rect.x + rect.w / 2, rect.y + rect.h + pad);
  ctx.fillText(FACES[e.left].id, rect.x - pad, rect.y + rect.h / 2);
  ctx.fillText(FACES[e.right].id, rect.x + rect.w + pad, rect.y + rect.h / 2);
}

function scaleBar(ctx, x, y, pxPerMm, units) {
  const len = niceStep(90 / pxPerMm, units);
  const w = len * pxPerMm;
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.moveTo(x + w, y - 4); ctx.lineTo(x + w, y + 4); ctx.stroke();
  ctx.fillStyle = INK; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(fmtLen(len, units), x + w + 6, y);
}

function faceLayout(cssW, face, maxH = 460, margin = 30) {
  const s = Math.min((cssW - 2 * margin) / face.wu, (maxH - 2 * margin) / face.wv);
  const w = face.wu * s, h = face.wv * s;
  return { cssH: h + 2 * margin + 18, rect: { x: (cssW - w) / 2, y: margin, w, h }, s };
}

// ------------------------------------------------------------------ figures

function drawDrill(canvas, cssW, model, plan, fig, opt) {
  const fi = fig.face, face = model.faces[fi];
  const { cssH, rect, s } = faceLayout(cssW, face);
  const ctx = setup(canvas, cssW, cssH);
  raster(ctx, rect, face, (X, Y, px, py) => {
    if (sample2D(face.section, face, X, Y) > 0) return woodAt(px, py);
    if (nearest2D(face.through, face, X, Y)) return ((px + py) % 10 < 3) ? [70, 98, 122] : NAVY;
    return depthRGB(sample2D(face.depth, face, X, Y) / face.full * 1.6);
  });
  strokeSegs(ctx, rect, face, contour2D(face.section, face.nb, face.nc, face.hb, face.hc, 0).segs, '#6d4c2c', 1.2);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  // exits from the opposite face
  ctx.setLineDash([4, 3]);
  for (const e of plan.exits[fi]) {
    const [x, y] = uvToPx(rect, face, e.u, e.v);
    ctx.beginPath(); ctx.arc(x, y, e.r * s, 0, Math.PI * 2); ctx.strokeStyle = '#1f2a33'; ctx.lineWidth = 1.2; ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const h of plan.holes[fi]) {
    const [x, y] = uvToPx(rect, face, h.u, h.v);
    const r = h.r * s;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.fill();
    ctx.strokeStyle = '#13202b'; ctx.lineWidth = h.through ? 2.4 : 1.4; ctx.stroke();
    if (h.through) { ctx.beginPath(); ctx.arc(x, y, Math.max(1, r - 3), 0, Math.PI * 2); ctx.lineWidth = 0.8; ctx.stroke(); }
    ctx.fillStyle = '#13202b';
    const fs = Math.max(8, Math.min(13, r * 0.95));
    ctx.font = `700 ${fs}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(h.n) + (h.through ? 'T' : ''), x, y + 0.5);
  }
  edgeLabels(ctx, rect, fi);
  scaleBar(ctx, rect.x, rect.y + rect.h + 30, s, opt.units);
  return legend([['wood', 'finished wood at the face'], ['deep', 'deeper waste (darker)'], ['hole', 'hole: number, T = through'], ['exit', 'exit of a through hole from the opposite face']]);
}

function drawBand(canvas, cssW, model, plan, fig, opt) {
  const fi = fig.face, face = model.faces[fi], k = fig.k;
  const { cssH, rect, s } = faceLayout(cssW, face);
  const ctx = setup(canvas, cssW, cssH);
  const masks = plan.bandMasks[fi];
  const cur = masks[k];
  raster(ctx, rect, face, (X, Y, px, py) => {
    if (sample2D(face.section, face, X, Y) > 0) return woodAt(px, py);
    if (cur && nearest2D(cur, face, X, Y)) return ((px + py) % 8 < 3) ? [214, 104, 40] : [246, 205, 160];
    for (let q = 0; q < k; q++) if (masks[q] && nearest2D(masks[q], face, X, Y)) return [228, 222, 208];
    return depthRGB(Math.min(sample2D(face.depth, face, X, Y), face.full) / face.full * 1.6);
  });
  strokeSegs(ctx, rect, face, contour2D(face.section, face.nb, face.nc, face.hb, face.hc, 0).segs, '#6d4c2c', 1.2);
  if (cur) {
    const g = new Float32Array(cur.length);
    for (let i = 0; i < cur.length; i++) g[i] = cur[i] ? 1 : -1;
    strokeSegs(ctx, rect, face, contour2D(g, face.nb, face.nc, face.hb, face.hc, 0).segs, '#a2470f', 1.6);
  }
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  edgeLabels(ctx, rect, fi);
  scaleBar(ctx, rect.x, rect.y + rect.h + 30, s, opt.units);
  return legend([['cut', `cut in this layer, down to ${fmtLen(plan.bandDepths[fi][k], opt.units)}`], ['prev', 'cut in earlier layers'], ['wood', 'finished wood at the face'], ['deep', 'waste for later (darker = deeper)']]);
}

function drawContour(canvas, cssW, model, plan, fig, opt) {
  const fi = fig.face, face = model.faces[fi];
  const { cssH, rect, s } = faceLayout(cssW, face);
  const ctx = setup(canvas, cssW, cssH);
  const maxD = face.full;
  raster(ctx, rect, face, (X, Y, px, py) => {
    if (sample2D(face.section, face, X, Y) > 0) return woodAt(px, py);
    if (nearest2D(face.through, face, X, Y)) return ((px + py) % 10 < 3) ? [70, 98, 122] : NAVY;
    return depthRGB(sample2D(face.depth, face, X, Y) / maxD * 1.6);
  });
  const ci = fig.interval;
  for (let lv = ci; lv < maxD; lv += ci) {
    const { segs } = contour2D(face.depth, face.nb, face.nc, face.hb, face.hc, lv);
    strokeSegs(ctx, rect, face, segs, Math.round(lv / ci) % 4 === 0 ? 'rgba(20,30,40,0.85)' : 'rgba(20,30,40,0.42)', Math.round(lv / ci) % 4 === 0 ? 1.3 : 0.8);
  }
  strokeSegs(ctx, rect, face, contour2D(face.section, face.nb, face.nc, face.hb, face.hc, 0).segs, '#6d4c2c', 1.2);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  // check points
  const sp = niceStep(Math.min(face.wu, face.wv) / 6, opt.units);
  ctx.font = '600 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  for (let v = sp; v < face.wv - sp * 0.4; v += sp) for (let uu = sp; uu < face.wu - sp * 0.4; uu += sp) {
    const [X, Y] = face.toXY(uu, v);
    if (sample2D(face.section, face, X, Y) > 0 || nearest2D(face.through, face, X, Y)) continue;
    const d = sample2D(face.depth, face, X, Y);
    if (d < 0.5 || d >= maxD - 0.5) continue;
    const [x, y] = uvToPx(rect, face, uu, v);
    ctx.fillStyle = '#13202b'; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    const t = fmtLen(d, opt.units, { mark: false });
    const tw = ctx.measureText(t).width;
    ctx.fillStyle = 'rgba(255,255,255,0.86)'; ctx.fillRect(x - tw / 2 - 2, y - 15, tw + 4, 12);
    ctx.fillStyle = '#13202b'; ctx.fillText(t, x, y - 3);
  }
  edgeLabels(ctx, rect, fi);
  scaleBar(ctx, rect.x, rect.y + rect.h + 30, s, opt.units);
  return legend([['wood', 'untouched face: straightedge rests here'], ['deep', `depth to finished surface; contour every ${fmtLen(ci, opt.units)}`], ['pt', `check point: depth in ${opt.units === 'in' ? 'inches' : 'mm'}`], ['thru', 'open right through']]);
}

const NET = [[0, 1, 0], [5, 0, 1], [2, 1, 1], [4, 2, 1], [3, 3, 1], [1, 1, 2]]; // [face, col, row]

function drawNet(canvas, cssW, model, plan, fig, opt) {
  const F = model.faces;
  const colW = [F[5].wu, F[2].wu, F[4].wu, F[3].wu], rowH = [F[0].wv, F[2].wv, F[1].wv];
  const totW = colW.reduce((a, b) => a + b), totH = rowH.reduce((a, b) => a + b);
  const margin = 20;
  const s = Math.min((cssW - 2 * margin) / totW, 400 / totH);
  const cssH = totH * s + 2 * margin;
  const ctx = setup(canvas, cssW, cssH);
  const ox = (cssW - totW * s) / 2, oy = margin;
  const colX = [0], rowY = [0];
  for (let i = 0; i < 4; i++) colX.push(colX[i] + colW[i]);
  for (let i = 0; i < 3; i++) rowY.push(rowY[i] + rowH[i]);
  const ga = { x: 0, y: 1, z: 2 }[opt.grain || 'z'];
  for (const [fi, c, r] of NET) {
    const face = F[fi];
    const rect = { x: ox + colX[c] * s, y: oy + rowY[r] * s, w: face.wu * s, h: face.wv * s };
    if (fig.labelsOnly) {
      ctx.fillStyle = `rgb(${WOOD.map(x => Math.min(255, x + 22))})`; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    } else {
      raster(ctx, rect, face, (X, Y, px, py) => sample2D(face.section, face, X, Y) > 0 ? woodAt(px, py) : PAPER);
      strokeSegs(ctx, rect, face, contour2D(face.section, face.nb, face.nc, face.hb, face.hc, 0).segs, '#6d4c2c', 1);
    }
    if (fig.holes && plan) {
      for (const h of plan.holes[fi]) {
        const [x, y] = uvToPx(rect, face, h.u, h.v);
        ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, h.r * s), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill(); ctx.strokeStyle = '#13202b'; ctx.lineWidth = 1; ctx.stroke();
      }
    }
    ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    // grain arrow
    if (face.a !== ga) {
      const horiz = face.ru === ga;
      const cx = rect.x + rect.w * 0.82, cy = rect.y + rect.h * 0.8, L = Math.min(rect.w, rect.h) * 0.12;
      ctx.strokeStyle = 'rgba(80,55,30,0.7)'; ctx.lineWidth = 1.2; ctx.beginPath();
      if (horiz) { ctx.moveTo(cx - L, cy); ctx.lineTo(cx + L, cy); ctx.moveTo(cx + L - 4, cy - 3); ctx.lineTo(cx + L, cy); ctx.lineTo(cx + L - 4, cy + 3); }
      else { ctx.moveTo(cx, cy + L); ctx.lineTo(cx, cy - L); ctx.moveTo(cx - 3, cy - L + 4); ctx.lineTo(cx, cy - L); ctx.lineTo(cx + 3, cy - L + 4); }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(42,36,31,0.9)'; ctx.font = `700 ${Math.max(12, Math.min(22, rect.w * 0.16))}px Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(FACES[fi].id, rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = 'rgba(42,36,31,0.7)';
    ctx.fillText(FACES[fi].name, rect.x + rect.w / 2, rect.y + rect.h / 2 + Math.max(12, rect.w * 0.13));
  }
  return legend(fig.labelsOnly ? [['grain', 'grain direction']] : [['wood', 'finished wood at the face'], ['paper', 'waste'], ...(fig.holes ? [['hole', 'drill hole']] : [])]);
}

// slice through the block perpendicular to an axis; frame taken from the matching face
const SLICE_FACE = [4, 2, 0]; // x → right face frame, y → front, z → top
function drawSlice(canvas, cssW, model, plan, fig, opt, ui) {
  const a = ui.axis;
  const face = model.faces[SLICE_FACE[a]];
  const { cssH, rect, s } = faceLayout(cssW, face, 420);
  const ctx = setup(canvas, cssW, cssH);
  const m = Math.max(0, Math.min(model.n[a], ui.index));
  const { solid, hidden, stride } = model;
  const off = m * stride[a];
  const sb = stride[face.b], sc = stride[face.c];
  raster(ctx, rect, face, (X, Y, px, py) => {
    let fx = X / face.hb, fy = Y / face.hc;
    fx = Math.max(0, Math.min(face.nb - 1.0001, fx)); fy = Math.max(0, Math.min(face.nc - 1.0001, fy));
    const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j;
    const o = off + i * sb + j * sc;
    const v = (solid[o] * (1 - tx) + solid[o + sb] * tx) * (1 - ty) + (solid[o + sc] * (1 - tx) + solid[o + sb + sc] * tx) * ty;
    if (v > 0) return woodAt(px, py);
    if (fig.mode === 'hidden') {
      const io = off + Math.round(fx) * sb + Math.round(fy) * sc;
      if (hidden[io]) return ((px - py) % 7 < 3) ? [222, 112, 36] : [248, 196, 140];
    }
    return [236, 230, 218];
  });
  strokeSegs(ctx, rect, face, sliceContour(model, face, a, m), '#6d4c2c', 1.2);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  edgeLabels(ctx, rect, SLICE_FACE[a]);
  scaleBar(ctx, rect.x, rect.y + rect.h + 30, s, opt.units);
  const items = [['wood', 'finished wood in this slice']];
  if (fig.mode === 'hidden') items.push(['hid', 'hidden waste to remove now'], ['prev', 'already cleared']);
  else items.push(['prev', 'open air']);
  return legend(items);
}
function sliceContour(model, face, a, m) {
  const g = new Float32Array(face.nb * face.nc);
  const { solid, stride } = model;
  for (let j = 0; j < face.nc; j++) for (let i = 0; i < face.nb; i++) g[i + face.nb * j] = solid[m * stride[a] + i * stride[face.b] + j * stride[face.c]];
  return contour2D(g, face.nb, face.nc, face.hb, face.hc, 0).segs;
}

function legend(items) {
  return `<div class="legend">${items.map(([k, t]) => `<span><i class="sw sw-${k}"></i>${t}</span>`).join('')}</div>`;
}

// ------------------------------------------------------------------ entry
export function drawFigure(canvas, model, plan, fig, opt, ui) {
  const cssW = Math.max(240, Math.floor(canvas.parentElement.clientWidth));
  switch (fig.type) {
    case 'drill': return drawDrill(canvas, cssW, model, plan, fig, opt);
    case 'band': return drawBand(canvas, cssW, model, plan, fig, opt);
    case 'contour': return drawContour(canvas, cssW, model, plan, fig, opt);
    case 'net': return drawNet(canvas, cssW, model, plan, fig, opt);
    case 'slice': return drawSlice(canvas, cssW, model, plan, fig, opt, ui);
    case 'jack': return drawJackFigure(canvas, cssW, plan.jack.J, opt.units, plan.jack.share);
    default: return '';
  }
}

export const sliceFaceFor = a => SLICE_FACE[a];
void BIG;
