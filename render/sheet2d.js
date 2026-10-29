// Drawing helpers shared by the newer projects: on-screen figures (canvas) and true-scale print sheets (SVG).

import { fmtLen, niceStep, MM_PER_IN } from '../engine/units.js';

export const INK = '#2a241f', PAPER = '#f6f1e7', CUT = '#d66828', CUT_DARK = '#a2470f', WOOD = [214, 181, 136];

export function setup(canvas, cssW, cssH) {
  const dpr = canvas._dpr || Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, cssW, cssH);
  ctx.dpr = dpr;
  return ctx;
}
export const figWidth = canvas => Math.max(240, Math.floor((canvas.parentElement && canvas.parentElement.clientWidth) || canvas._cssW || 520));

// map a world rectangle [x0..x1] × [y0..y1] (mm, y up) into a box on the canvas
export function frame(x0, x1, y0, y1, box) {
  const s = Math.min(box.w / (x1 - x0), box.h / (y1 - y0));
  const ox = box.x + (box.w - (x1 - x0) * s) / 2, oy = box.y + (box.h - (y1 - y0) * s) / 2;
  return { s, X: x => ox + (x - x0) * s, Y: y => oy + (y1 - y) * s, x0, x1, y0, y1, px: { x: ox, y: oy, w: (x1 - x0) * s, h: (y1 - y0) * s } };
}

export function polyline(ctx, F, pts, close = false) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(F.X(x), F.Y(y)) : ctx.moveTo(F.X(x), F.Y(y))));
  if (close) ctx.closePath();
}

export function scaleBar(ctx, x, y, pxPerMm, units) {
  const len = niceStep(90 / pxPerMm, units), w = len * pxPerMm;
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.moveTo(x + w, y - 4); ctx.lineTo(x + w, y + 4); ctx.stroke();
  ctx.fillStyle = INK; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(fmtLen(len, units), x + w + 6, y);
}

export function legend(items) {
  return `<div class="legend">${items.map(([k, t]) => `<span><i class="sw sw-${k}"></i>${t}</span>`).join('')}</div>`;
}

// shaded top view of a height field: depthAt(x, y) = depth of the cut below the top (0 = untouched),
// NaN = outside the piece. `tint(x, y)` (optional) marks wood removed by the current step.
export function shadeTop(ctx, F, depthAt, tint, light = [-0.5, 0.6, 0.62]) {
  const dpr = ctx.dpr;
  const x0 = Math.round(F.px.x * dpr), y0 = Math.round(F.px.y * dpr);
  const w = Math.max(1, Math.round(F.px.w * dpr)), h = Math.max(1, Math.round(F.px.h * dpr));
  const step = Math.max(1, Math.round(Math.max(w, h) / 420));
  const gw = Math.ceil(w / step) + 1, gh = Math.ceil(h / step) + 1;
  const mmPerPx = 1 / (F.s * dpr);
  const D = new Float32Array(gw * gh), T = new Uint8Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const x = F.x0 + (i * step + 0.5) * mmPerPx, y = F.y1 - (j * step + 0.5) * mmPerPx;
    D[i + gw * j] = depthAt(x, y);
    if (tint && tint(x, y)) T[i + gw * j] = 1;
  }
  const img = ctx.createImageData(w, h);
  const ll = Math.hypot(...light), g = step * mmPerPx;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const i = Math.min(gw - 2, (px / step) | 0), j = Math.min(gh - 2, (py / step) | 0), o = (py * w + px) * 4;
    const d = D[i + gw * j];
    if (!isFinite(d)) { img.data[o] = 246; img.data[o + 1] = 241; img.data[o + 2] = 231; img.data[o + 3] = 255; continue; }
    const dx = ((isFinite(D[i + 1 + gw * j]) ? D[i + 1 + gw * j] : d) - d) / g, dy = ((isFinite(D[i + gw * (j + 1)]) ? D[i + gw * (j + 1)] : d) - d) / g;
    // surface z = -depth; normal ∝ (dD/dx, -dD/dy, 1) with image y running down
    const n = [dx, -dy, 1], nl = Math.hypot(...n);
    let lam = (n[0] * light[0] + n[1] * light[1] + n[2] * light[2]) / (nl * ll);
    lam = 0.42 + 0.58 * Math.max(0, lam);
    let c = ((px * 0.35 + py * 0.08) % 9 < 1.2) ? [196, 160, 112] : WOOD;
    if (d > 0.05) c = [c[0] * 0.92 + 18, c[1] * 0.92 + 14, c[2] * 0.92 + 10];
    if (T[i + gw * j]) c = [c[0] * 0.45 + 214 * 0.55, c[1] * 0.45 + 104 * 0.55, c[2] * 0.45 + 40 * 0.55];
    img.data[o] = c[0] * lam; img.data[o + 1] = c[1] * lam; img.data[o + 2] = c[2] * lam; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, x0, y0);
}

// ---------------------------------------------------------------- print sheets (SVG, millimetres)
export const PAGE_W = 215.9, PAGE_H = 279.4;
export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const f2 = v => (Math.round(v * 100) / 100).toString();
export const svgPath = (pts, close) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f2(x)} ${f2(y)}`).join('') + (close ? 'Z' : '');

export function calBar(units) {
  const L = units === 'in' ? MM_PER_IN : 25;
  return `<g stroke="#000" stroke-width="0.3"><line x1="14" y1="${PAGE_H - 12}" x2="${14 + L}" y2="${PAGE_H - 12}"/><line x1="14" y1="${PAGE_H - 14}" x2="14" y2="${PAGE_H - 10}"/><line x1="${14 + L}" y1="${PAGE_H - 14}" x2="${14 + L}" y2="${PAGE_H - 10}"/></g><text x="${17 + L}" y="${PAGE_H - 10.8}" font-size="3">${units === 'in' ? '1 inch' : '25 mm'} — check with a ruler</text>`;
}
export function sheet(title, sub, body, units) {
  return `<section class="sheet"><svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}mm" height="${PAGE_H}mm" viewBox="0 0 ${PAGE_W} ${PAGE_H}" font-family="system-ui, -apple-system, Segoe UI, sans-serif">
<text x="14" y="16" font-size="6" font-family="Georgia, serif" font-weight="700">${esc(title)}</text>
<text x="14" y="23" font-size="3.2">${esc(sub)}</text>${body}${calBar(units)}</svg></section>`;
}
export function sheetsDoc(title, pages) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>@page { size: letter; margin: 0; } html, body { margin: 0; background: #888; }
.sheet { width: ${PAGE_W}mm; height: ${PAGE_H}mm; background: #fff; margin: 8mm auto; overflow: hidden; page-break-after: always; break-after: page; }
.sheet svg { display: block; } @media print { html, body { background: #fff; } .sheet { margin: 0; } }</style></head><body>${pages.join('')}</body></html>`;
}
