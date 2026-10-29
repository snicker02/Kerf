// Ball-in-cage and chain: section figures (on screen) and true-scale marking templates (print).

import { setup, figWidth, frame, scaleBar, legend, INK, sheet, sheetsDoc, svgPath, f2, PAGE_W } from './sheet2d.js';
import { fmtLen } from '../engine/units.js';
import { stadium } from '../engine/staged.js';

const WOOD = [226, 196, 155], CUTC = [214, 104, 40], BG = [246, 241, 231];

// raster a planar section: map(u, v) -> [x, y, z]; wood in the current stage is wood-coloured,
// wood removed by this step is orange
function section(ctx, F, map, fCur, fPrev) {
  const dpr = ctx.dpr, x0 = Math.round(F.px.x * dpr), y0 = Math.round(F.px.y * dpr);
  const w = Math.max(1, Math.round(F.px.w * dpr)), h = Math.max(1, Math.round(F.px.h * dpr));
  const img = ctx.createImageData(w, h), k = 1 / (F.s * dpr);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const p = map(F.x0 + (i + 0.5) * k, F.y1 - (j + 0.5) * k);
    const a = fCur(...p) > 0, b = fPrev && fPrev(...p) > 0;
    const c = a ? WOOD : b ? CUTC : BG, o = (j * w + i) * 4;
    const g = a && ((i + j * 0.15) % 7 < 1) ? 0.93 : 1;
    img.data[o] = c[0] * g; img.data[o + 1] = c[1] * g; img.data[o + 2] = c[2] * g; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, x0, y0);
  ctx.strokeStyle = 'rgba(42,36,31,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(F.px.x, F.px.y, F.px.w, F.px.h);
}

function caption(ctx, x, y, t) { ctx.fillStyle = INK; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(t, x, y); }

function stagesFor(model, fig, st) {
  const k = fig.stage != null ? fig.stage : st;
  return { cur: model.stages[k], prev: k > 0 && fig.stage != null ? model.stages[k - 1] : null, k };
}

function drawCage(canvas, model, fig, opt, k0) {
  const { G } = model, W = figWidth(canvas);
  const { cur, prev } = stagesFor(model, fig, k0);
  const h2 = G.a / 2, zb = G.centres[0];
  const colW = (W - 48) / 2;
  const sV = Math.min(colW / (G.a * Math.SQRT2), 300 / G.H), sH = Math.min(colW / G.a, 300 / G.a);
  const Hh = Math.max(G.H * sV, G.a * sH) + 70;
  const ctx = setup(canvas, W, Hh);
  const FA = frame(-h2, h2, -h2, h2, { x: 16, y: 22, w: colW, h: G.a * sH });
  const dg = h2 * Math.SQRT2;
  const FB = frame(-dg, dg, -G.H / 2, G.H / 2, { x: 32 + colW, y: 22, w: colW, h: G.H * sV });
  section(ctx, FA, (u, v) => [u, v, zb], cur, prev);
  section(ctx, FB, (u, v) => [u * Math.SQRT1_2, u * Math.SQRT1_2, v], cur, prev);
  if (fig.mark) {
    ctx.strokeStyle = INK; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
    const pin = h2 - G.p;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(FA.X(s * pin), FA.Y(-h2)); ctx.lineTo(FA.X(s * pin), FA.Y(h2)); ctx.moveTo(FA.X(-h2), FA.Y(s * pin)); ctx.lineTo(FA.X(h2), FA.Y(s * pin)); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(FA.X(0), FA.Y(0), G.d / 2 * FA.s, 0, Math.PI * 2); ctx.stroke();
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(FB.X(-dg), FB.Y(s * G.zc)); ctx.lineTo(FB.X(dg), FB.Y(s * G.zc)); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  caption(ctx, FA.px.x + FA.px.w / 2, 15, 'Across, through the ball');
  caption(ctx, FB.px.x + FB.px.w / 2, 15, 'Lengthwise, corner to corner');
  scaleBar(ctx, 16, Hh - 14, FA.s, opt.units);
  return legend(prev ? [['wood', 'wood left'], ['cut', 'removed in this step']] : [['wood', 'wood']]);
}

function drawChain(canvas, model, fig, opt, k0) {
  const { G } = model, W = figWidth(canvas);
  const { cur, prev } = stagesFor(model, fig, k0);
  const end = fig.type === 'chainEnd';
  if (end) {
    const s = Math.min((W - 48) / 2 / G.w, 9), Hh = G.w * s + 60, ctx = setup(canvas, W, Hh);
    const z = G.centres[0], z2 = (G.centres[0] + G.centres[1]) / 2;
    const FA = frame(-G.w / 2, G.w / 2, -G.w / 2, G.w / 2, { x: 16, y: 22, w: (W - 48) / 2, h: G.w * s });
    const FB = frame(-G.w / 2, G.w / 2, -G.w / 2, G.w / 2, { x: 32 + (W - 48) / 2, y: 22, w: (W - 48) / 2, h: G.w * s });
    const k = fig.stage != null ? fig.stage : k0;
    section(ctx, FA, (u, v) => [u, v, z], model.stages[k], k > 0 ? model.stages[k - 1] : null);
    section(ctx, FB, (u, v) => [u, v, z2], model.stages[k], k > 0 ? model.stages[k - 1] : null);
    caption(ctx, FA.px.x + FA.px.w / 2, 15, 'End of the stick');
    caption(ctx, FB.px.x + FB.px.w / 2, 15, 'Where two links cross');
    scaleBar(ctx, 16, Hh - 14, FA.s, opt.units);
    return legend([['wood', 'wood left'], ['cut', 'removed in this step']]);
  }
  // two lengthwise sections: through the even links' plane and the odd links' plane
  const colW = (W - 48) / 2, s = Math.min(colW / G.w, 420 / G.len), Hh = G.len * s + 60;
  const ctx = setup(canvas, W, Hh);
  const FA = frame(-G.w / 2, G.w / 2, -G.len / 2, G.len / 2, { x: 16, y: 22, w: colW, h: G.len * s });
  const FB = frame(-G.w / 2, G.w / 2, -G.len / 2, G.len / 2, { x: 32 + colW, y: 22, w: colW, h: G.len * s });
  section(ctx, FA, (u, v) => [u, 0, v], cur, prev);
  section(ctx, FB, (u, v) => [0, u, v], cur, prev);
  if (fig.mark) {
    ctx.strokeStyle = INK; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
    for (const [F, par] of [[FA, 0], [FB, 1]]) G.centres.forEach((c, i) => { if (i % 2 !== par) return; for (const r of [G.w / 2, G.w / 2 - G.t]) stadiumPath(ctx, F, c, G.hl, r); ctx.stroke(); });
    ctx.setLineDash([]);
  }
  caption(ctx, FA.px.x + FA.px.w / 2, 15, 'Links 1, 3, 5 … face on');
  caption(ctx, FB.px.x + FB.px.w / 2, 15, 'Links 2, 4, 6 … face on');
  scaleBar(ctx, 16, Hh - 14, FA.s, opt.units);
  return legend(prev ? [['wood', 'wood left'], ['cut', 'removed in this step']] : [['wood', 'wood']]);
}

function stadiumPath(ctx, F, zc, hl, r) {
  ctx.beginPath();
  ctx.arc(F.X(0), F.Y(zc + hl), r * F.s, Math.PI, 0);
  ctx.lineTo(F.X(r), F.Y(zc - hl));
  ctx.arc(F.X(0), F.Y(zc - hl), r * F.s, 0, Math.PI);
  ctx.closePath();
}

export function drawPuzzleFigure(canvas, model, fig, opt, stage) {
  if (fig.type === 'cageSection') return drawCage(canvas, model, fig, opt, stage);
  if (fig.type === 'chainSide' || fig.type === 'chainEnd') return drawChain(canvas, model, fig, opt, stage);
  return '';
}

// ---------------------------------------------------------------- print
const stad = (cx, cy, hl, r) => {
  const pts = [];
  for (let i = 0; i <= 24; i++) { const t = Math.PI + i / 24 * Math.PI; pts.push([cx + r * Math.cos(t), cy - hl + r * Math.sin(t)]); }
  for (let i = 0; i <= 24; i++) { const t = i / 24 * Math.PI; pts.push([cx + r * Math.cos(t), cy + hl + r * Math.sin(t)]); }
  return pts;
};
const L = (x1, y1, x2, y2, extra = '') => `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="#000" stroke-width="0.3" ${extra}/>`;
const T = (x, y, t, a = 'middle') => `<text x="${f2(x)}" y="${f2(y)}" font-size="3" text-anchor="${a}">${t}</text>`;

export function cageSheets(model, opt, version) {
  const { G } = model, u = opt.units, a = G.a, H = G.H;
  const fits = H + 50 < 270;
  const x0 = 24, y0 = 40, faceX = x0, endX = x0 + a + 30;
  let b = '';
  // one face: outline, posts, caps, ball centres
  b += `<rect x="${f2(faceX)}" y="${f2(y0)}" width="${f2(a)}" height="${f2(H)}" fill="none" stroke="#000" stroke-width="0.35"/>`;
  b += `<rect x="${f2(faceX + G.p)}" y="${f2(y0 + G.c)}" width="${f2(a - 2 * G.p)}" height="${f2(H - 2 * G.c)}" fill="#f3e3cc" stroke="#c0501a" stroke-width="0.3"/>`;
  for (const c of G.centres) { const y = y0 + H / 2 - c; b += `<circle cx="${f2(faceX + a / 2)}" cy="${f2(y)}" r="${f2(G.d / 2)}" fill="none" stroke="#000" stroke-width="0.2" stroke-dasharray="1 0.8"/>` + L(faceX - 3, y, faceX + a + 3, y, 'stroke-width="0.15"'); }
  b += T(faceX + a / 2, y0 - 3, 'Each face (×4)');
  // end view
  b += `<rect x="${f2(endX)}" y="${f2(y0)}" width="${f2(a)}" height="${f2(a)}" fill="none" stroke="#000" stroke-width="0.35"/>`;
  for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) b += `<rect x="${f2(endX + sx * (a - G.p))}" y="${f2(y0 + sy * (a - G.p))}" width="${f2(G.p)}" height="${f2(G.p)}" fill="#ddd" stroke="#000" stroke-width="0.2"/>`;
  b += `<circle cx="${f2(endX + a / 2)}" cy="${f2(y0 + a / 2)}" r="${f2(G.d / 2)}" fill="none" stroke="#c0501a" stroke-width="0.3"/>`;
  b += T(endX + a / 2, y0 - 3, 'End (posts and ball)');
  const nx = endX + a + 14;
  [`Block ${fmtLen(a, u)} × ${fmtLen(a, u)} × ${fmtLen(H, u)}, grain along the length.`, `Posts ${fmtLen(G.p, u)}, caps ${fmtLen(G.c, u)}.`, `Ball ${fmtLen(G.d, u)} (gap between posts ${fmtLen(G.gap, u)}).`, 'Orange: window to cut on each face.', 'Dashed: ball outline and centre line.']
    .forEach((t, i) => { b += T(nx, y0 + 4 + i * 5, t, 'start'); });
  if (!fits) b += `<text x="14" y="30" font-size="3" fill="#b00">The block is taller than the page; the face drawing is cut off at the bottom.</text>`;
  return sheetsDoc('Kerf — ball-in-cage template', [sheet('Ball in a cage · marking template', `print at 100% (actual size) · Kerf ${version}`, b, u)]);
}

export function chainSheets(model, opt, version) {
  const { G } = model, u = opt.units, w = G.w;
  const avail = 215, parts = Math.ceil(G.len / avail);
  const pages = [];
  for (let k = 0; k < parts; k++) {
    const zTop = G.len / 2 - k * avail, zBot = Math.max(-G.len / 2, zTop - avail);
    const y0 = 36, Y = z => y0 + (zTop - z);
    let b = `<defs><clipPath id="cc${k}"><rect x="0" y="${f2(y0 - 1)}" width="${PAGE_W}" height="${f2(zTop - zBot + 2)}"/></clipPath></defs><g clip-path="url(#cc${k})">`;
    [[0, 24], [1, 24 + w + 22]].forEach(([par, x0]) => {
      const cx = x0 + w / 2;
      b += `<rect x="${f2(x0)}" y="${f2(Y(G.len / 2))}" width="${f2(w)}" height="${f2(G.len)}" fill="none" stroke="#999" stroke-width="0.2"/>`;
      b += L(cx - G.t / 2, Y(G.len / 2), cx - G.t / 2, Y(-G.len / 2), 'stroke="#999" stroke-width="0.15" stroke-dasharray="1 1"') + L(cx + G.t / 2, Y(G.len / 2), cx + G.t / 2, Y(-G.len / 2), 'stroke="#999" stroke-width="0.15" stroke-dasharray="1 1"');
      G.centres.forEach((c, i) => {
        if (i % 2 !== par) return;
        b += `<path d="${svgPath(stad(cx, Y(c), G.hl, w / 2), true)}" fill="none" stroke="#000" stroke-width="0.35"/>`;
        b += `<path d="${svgPath(stad(cx, Y(c), G.hl, w / 2 - G.t), true)}" fill="#f3e3cc" stroke="#c0501a" stroke-width="0.3"/>`;
        b += T(cx + w / 2 + 3, Y(c) + 1, String(i + 1), 'start');
      });
    });
    b += '</g>';
    if (k === 0) {
      b += T(24 + w / 2, y0 - 3, 'Faces A (×2)') + T(24 + w + 22 + w / 2, y0 - 3, 'Faces B (×2)');
      const ex = 24 + 2 * w + 50, ey = y0;
      b += `<rect x="${f2(ex)}" y="${f2(ey)}" width="${f2(w)}" height="${f2(w)}" fill="none" stroke="#000" stroke-width="0.3"/>`;
      b += `<path d="M${f2(ex + w / 2 - G.t / 2)} ${f2(ey)}h${f2(G.t)}v${f2(w / 2 - G.t / 2)}h${f2(w / 2 - G.t / 2)}v${f2(G.t)}h${f2(-(w / 2 - G.t / 2))}v${f2(w / 2 - G.t / 2)}h${f2(-G.t)}v${f2(-(w / 2 - G.t / 2))}h${f2(-(w / 2 - G.t / 2))}v${f2(-G.t)}h${f2(w / 2 - G.t / 2)}Z" fill="#f3e3cc" stroke="#c0501a" stroke-width="0.3"/>`;
      b += T(ex + w / 2, ey - 3, 'End: plus section');
      [`Stick ${fmtLen(w, u)} × ${fmtLen(w, u)} × ${fmtLen(G.len, u)}.`, `${G.n} links, wood ${fmtLen(G.t, u)} thick.`, 'Black: outside of each link. Orange: hole.', 'Dotted: edges of the crossing fin.']
        .forEach((t, i) => { b += T(ex, ey + w + 8 + i * 5, t, 'start'); });
    }
    pages.push(sheet(parts > 1 ? `Wooden chain · page ${k + 1} of ${parts}` : 'Wooden chain · marking template', `print at 100% (actual size) · Kerf ${version}`, b, u));
  }
  return sheetsDoc('Kerf — chain template', pages);
}
