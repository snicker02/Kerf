// Relief figures (on screen) and true-scale outline sheets (print, tiled over pages if needed).

import { setup, figWidth, frame, scaleBar, legend, shadeTop, INK, CUT_DARK, sheet, sheetsDoc, f2, PAGE_W, PAGE_H } from './sheet2d.js';
import { fmtLen } from '../engine/units.js';
import { levelContours } from '../engine/relief.js';

const LEVEL_COL = ['#f4e7d2', '#e6cfa9', '#d4b07f', '#bd8e5a', '#9c6c3e', '#7b5230', '#5c3c22'];

function panelFrame(canvas, G, extra = 40) {
  const W = figWidth(canvas), maxH = 420;
  const s = Math.min((W - 32) / G.W, maxH / G.Hp);
  const ctx = setup(canvas, W, G.Hp * s + 24 + extra);
  const F = frame(-G.W / 2, G.W / 2, -G.Hp / 2, G.Hp / 2, { x: (W - G.W * s) / 2, y: 12, w: G.W * s, h: G.Hp * s });
  return { ctx, F, W };
}

function drawSegs(ctx, F, segs) {
  ctx.beginPath();
  for (let i = 0; i < segs.length; i += 4) { ctx.moveTo(F.X(segs[i]), F.Y(segs[i + 1])); ctx.lineTo(F.X(segs[i + 2]), F.Y(segs[i + 3])); }
  ctx.stroke();
}

function levelImage(ctx, F, G, withPicture) {
  const dpr = ctx.dpr, x0 = Math.round(F.px.x * dpr), y0 = Math.round(F.px.y * dpr);
  const w = Math.max(1, Math.round(F.px.w * dpr)), h = Math.max(1, Math.round(F.px.h * dpr));
  const img = ctx.createImageData(w, h), k = 1 / (F.s * dpr);
  const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const cols = LEVEL_COL.map(hex);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = F.x0 + (i + 0.5) * k, y = F.y1 - (j + 0.5) * k, o = (j * w + i) * 4;
    let c;
    if (withPicture) { const v = G.bil(G.img.data, x, y); const g = isFinite(v) ? 40 + 200 * v : 250; c = [g, g, g]; }
    else { const l = G.near(G.lev, x, y); c = l < 0 ? [250, 246, 238] : cols[Math.round((G.L - 1 - l) * (cols.length - 1) / Math.max(1, G.L - 1))]; }
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, x0, y0);
}

function drawMap(canvas, model, fig, opt) {
  const { G } = model;
  const W = figWidth(canvas), half = (W - 48) / 2, s = Math.min(half / G.W, 300 / G.Hp);
  const ctx = setup(canvas, W, G.Hp * s + 60);
  const FA = frame(-G.W / 2, G.W / 2, -G.Hp / 2, G.Hp / 2, { x: 16, y: 22, w: G.W * s, h: G.Hp * s });
  const FB = frame(-G.W / 2, G.W / 2, -G.Hp / 2, G.Hp / 2, { x: 32 + half, y: 22, w: G.W * s, h: G.Hp * s });
  levelImage(ctx, FA, G, true);
  levelImage(ctx, FB, G, false);
  ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.strokeRect(FA.px.x, FA.px.y, FA.px.w, FA.px.h); ctx.strokeRect(FB.px.x, FB.px.y, FB.px.w, FB.px.h);
  ctx.fillStyle = INK; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Picture', FA.px.x + FA.px.w / 2, 15); ctx.fillText('Depth levels', FB.px.x + FB.px.w / 2, 15);
  scaleBar(ctx, 16, G.Hp * s + 44, s, opt.units);
  const u = opt.units;
  return `<div class="legend">${Array.from({ length: G.L }, (_, l) => { const lv = G.L - 1 - l; return `<span><i class="sw" style="background:${LEVEL_COL[Math.round(l * (LEVEL_COL.length - 1) / Math.max(1, G.L - 1))]}"></i>${l + 1}: ${l ? fmtLen(l * G.step, u) + ' deep' : 'top'} (${Math.round(G.levels[lv].area * 100)}%)</span>`; }).join('')}</div>`;
}

function drawOutline(canvas, model, fig, opt) {
  const { G } = model, { ctx, F } = panelFrame(canvas, G);
  levelImage(ctx, F, G, false);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.1;
  for (const c of levelContours(G)) drawSegs(ctx, F, c.segs);
  if (G.fr > 0) { ctx.setLineDash([4, 3]); ctx.strokeRect(F.X(-G.pw / 2), F.Y(G.ph / 2), G.pw * F.s, G.ph * F.s); ctx.setLineDash([]); }
  ctx.strokeRect(F.px.x, F.px.y, F.px.w, F.px.h);
  scaleBar(ctx, F.px.x, F.px.y + F.px.h + 18, F.s, opt.units);
  return legend([['line2', 'outlines to trace'], ...(G.fr > 0 ? [['line', 'inside of the frame']] : [])]);
}

function drawLayer(canvas, model, fig, opt) {
  const { G, depthStages } = model, { ctx, F } = panelFrame(canvas, G);
  const k = fig.k, cur = depthStages[k], prev = depthStages[k - 1];
  shadeTop(ctx, F, (x, y) => cur(x, y), k < depthStages.length - 1 ? (x, y) => cur(x, y) > prev(x, y) + 0.15 : null, [-0.6, 0.55, 0.5]);
  ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.strokeRect(F.px.x, F.px.y, F.px.w, F.px.h);
  if (k === 1) { ctx.strokeStyle = CUT_DARK; ctx.lineWidth = 0.8; for (const c of levelContours(G)) drawSegs(ctx, F, c.segs); }
  scaleBar(ctx, F.px.x, F.px.y + F.px.h + 18, F.s, opt.units);
  return k < depthStages.length - 1 ? legend([['cut', 'carved in this step'], ['wood', 'carved earlier / untouched']]) : '';
}

export function drawReliefFigure(canvas, model, fig, opt) {
  if (fig.type === 'reliefMap') return drawMap(canvas, model, fig, opt);
  if (fig.type === 'reliefOutline') return drawOutline(canvas, model, fig, opt);
  if (fig.type === 'reliefLayer') return drawLayer(canvas, model, fig, opt);
  return '';
}

// true-scale outlines; tiles of up to 186 × 230 mm with registration marks
export function reliefSheets(model, opt, version) {
  const { G } = model, u = opt.units;
  const TW = 186, TH = 228, cols = Math.ceil(G.W / TW), rows = Math.ceil(G.Hp / TH);
  const cont = levelContours(G);
  // label each region at its deepest-inside point: sample the EDT for local maxima per level
  const labels = [];
  const seen = new Uint8Array(G.gw * G.gh);
  for (let pass = 0; pass < 400; pass++) {
    let best = -1, bi = -1;
    for (let i = 0; i < G.dB.length; i++) if (!seen[i] && G.dB[i] > best) { best = G.dB[i]; bi = i; }
    if (best < 4) break;
    const gi = bi % G.gw, gj = (bi / G.gw) | 0;
    const x = gi / (G.gw - 1) * G.pw - G.pw / 2, y = G.ph / 2 - gj / (G.gh - 1) * G.ph;
    labels.push([x, y, G.L - G.lev[bi]]);
    const rpx = Math.ceil(best * 1.6 / G.px);
    for (let j = Math.max(0, gj - rpx); j <= Math.min(G.gh - 1, gj + rpx); j++) for (let i = Math.max(0, gi - rpx); i <= Math.min(G.gw - 1, gi + rpx); i++) seen[i + G.gw * j] = 1;
  }
  const pages = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const xa = -G.W / 2 + c * TW, ya = G.Hp / 2 - r * TH;           // tile's top-left in panel mm
    const tw = Math.min(TW, G.W / 2 - xa), th = Math.min(TH, ya + G.Hp / 2);
    const ox = (PAGE_W - tw) / 2, oy = 32;
    const X = x => ox + (x - xa), Y = y => oy + (ya - y);
    let b = `<defs><clipPath id="t${r}_${c}"><rect x="${f2(ox)}" y="${f2(oy)}" width="${f2(tw)}" height="${f2(th)}"/></clipPath></defs>`;
    b += `<rect x="${f2(ox)}" y="${f2(oy)}" width="${f2(tw)}" height="${f2(th)}" fill="none" stroke="#999" stroke-width="0.2"/>`;
    b += `<g clip-path="url(#t${r}_${c})">`;
    b += `<rect x="${f2(X(-G.W / 2))}" y="${f2(Y(G.Hp / 2))}" width="${f2(G.W)}" height="${f2(G.Hp)}" fill="none" stroke="#000" stroke-width="0.35"/>`;
    if (G.fr > 0) b += `<rect x="${f2(X(-G.pw / 2))}" y="${f2(Y(G.ph / 2))}" width="${f2(G.pw)}" height="${f2(G.ph)}" fill="none" stroke="#777" stroke-width="0.2" stroke-dasharray="2 1"/>`;
    let d = '';
    for (const ct of cont) for (let i = 0; i < ct.segs.length; i += 4) d += `M${f2(X(ct.segs[i]))} ${f2(Y(ct.segs[i + 1]))}L${f2(X(ct.segs[i + 2]))} ${f2(Y(ct.segs[i + 3]))}`;
    b += `<path d="${d}" fill="none" stroke="#000" stroke-width="0.3" stroke-linecap="round"/>`;
    for (const [x, y, l] of labels) b += `<text x="${f2(X(x))}" y="${f2(Y(y) + 1.2)}" font-size="3.4" text-anchor="middle" fill="#a2470f">${l}</text>`;
    b += '</g>';
    if (rows * cols > 1) b += `<text x="${f2(ox)}" y="${f2(oy + th + 5)}" font-size="2.8" fill="#b00">Tile row ${r + 1}, column ${c + 1}: trim to the grey box and butt against its neighbours.</text>`;
    b += `<text x="14" y="${f2(Math.min(PAGE_H - 18, oy + th + (rows * cols > 1 ? 10 : 6)))}" font-size="2.8" fill="#444">Numbers are levels: 1 is the top surface, ${G.L} is ${fmtLen(G.D, u)} deep. Each level is ${fmtLen(G.step, u)} below the one before.</text>`;
    pages.push(sheet(rows * cols > 1 ? `Relief outlines · tile ${r * cols + c + 1} of ${rows * cols}` : 'Relief outlines', `${fmtLen(G.W, u)} × ${fmtLen(G.Hp, u)} panel · print at 100% (actual size) · Kerf ${version}`, b, u));
  }
  return sheetsDoc('Kerf — relief outlines', pages);
}
