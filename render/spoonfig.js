// Spoon figures (on screen) and true-scale top/side templates (print).

import { setup, figWidth, frame, polyline, scaleBar, legend, INK, CUT, CUT_DARK, sheet, sheetsDoc, svgPath, f2, esc, PAGE_W, PAGE_H } from './sheet2d.js';
import { fmtLen } from '../engine/units.js';
import { model as jackModel } from '../engine/jack.js';

const WOODF = '#e2c49b', DARKF = '#c99d68';

export function spoonOutlines(G, n = 240) {
  const xs = []; for (let i = 0; i <= n; i++) xs.push(G.x0 + (G.x1 - G.x0) * i / n);
  const ok = xs.filter(x => G.halfW(x) > 0);
  const top = [...ok.map(x => [x, G.halfW(x)]), ...ok.slice().reverse().map(x => [x, -G.halfW(x)])];
  const side = [...xs.map(x => [x, G.top(x)]), ...xs.slice().reverse().map(x => [x, G.bot(x)])];
  const inner = [], innerSide = [];
  for (let i = 0; i <= 96; i++) { const t = i / 96 * Math.PI * 2; inner.push([G.bx + G.ai * Math.cos(t), G.bi * Math.sin(t)]); }
  for (let i = 0; i <= 48; i++) { const t = Math.PI + i / 48 * Math.PI; innerSide.push([G.bx + G.ai * Math.cos(t), G.zr + G.depth * Math.sin(t)]); }
  return { top, side, inner, innerSide };
}

function viewPanel(ctx, F, pts, fill, hl) {
  ctx.fillStyle = fill; polyline(ctx, F, pts, true); ctx.fill();
  ctx.strokeStyle = hl ? CUT_DARK : INK; ctx.lineWidth = hl ? 2 : 1.3; ctx.stroke();
}

function drawViews(canvas, model, fig, opt) {
  const { G } = model, O = spoonOutlines(G);
  const W = figWidth(canvas), pad = 16, lab = 16;
  const zmin = Math.min(...O.side.map(p => p[1])), zmax = Math.max(...O.side.map(p => p[1]));
  const sW = W - 2 * pad, s = Math.min(sW / G.L, 2.4);
  const h1 = 2 * G.wmax * s, h2 = (zmax - zmin) * s;
  const show = fig.type === 'spoonTop' ? ['top'] : fig.type === 'spoonSide' ? ['side'] : ['top', 'side'];
  const H = pad + show.reduce((a, v) => a + lab + (v === 'top' ? h1 : h2) + 14, 0) + 26;
  const ctx = setup(canvas, W, H);
  let y = pad, F;
  ctx.font = '600 11px system-ui, sans-serif'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  for (const v of show) {
    ctx.fillStyle = INK; ctx.fillText(v === 'top' ? 'From above' : 'From the side', pad, y + 11); y += lab;
    if (v === 'top') {
      F = frame(G.x0, G.x1, -G.wmax, G.wmax, { x: pad, y, w: sW, h: h1 });
      ctx.strokeStyle = 'rgba(42,36,31,0.3)'; ctx.setLineDash([4, 3]); ctx.strokeRect(F.X(G.x0) - 4, F.Y(G.wmax) - 4, G.L * F.s + 8, 2 * G.wmax * F.s + 8); ctx.setLineDash([]);
      viewPanel(ctx, F, O.top, WOODF, fig.hl);
      ctx.strokeStyle = CUT; ctx.setLineDash([5, 3]); ctx.lineWidth = 1.2; polyline(ctx, F, O.inner, true); ctx.stroke(); ctx.setLineDash([]);
      y += h1 + 14;
    } else {
      F = frame(G.x0, G.x1, zmin, zmax, { x: pad, y, w: sW, h: h2 });
      ctx.strokeStyle = 'rgba(42,36,31,0.3)'; ctx.setLineDash([4, 3]); ctx.strokeRect(F.X(G.x0) - 4, F.Y(zmax) - 4, G.L * F.s + 8, (zmax - zmin) * F.s + 8); ctx.setLineDash([]);
      viewPanel(ctx, F, O.side, DARKF, fig.hl);
      ctx.strokeStyle = CUT; ctx.setLineDash([5, 3]); ctx.lineWidth = 1.2; polyline(ctx, F, O.innerSide, false); ctx.stroke(); ctx.setLineDash([]);
      y += h2 + 14;
    }
  }
  scaleBar(ctx, pad, y + 8, F.s, opt.units);
  return legend([['wood', 'spoon'], ['line', 'blank'], ['saw', 'inside of the bowl']]);
}

function drawSection(canvas, model, fig, opt) {
  const { G } = model, J = jackModel(opt.jack);
  const W = figWidth(canvas), H = 230;
  const ctx = setup(canvas, W, H);
  const bowl = fig.station === 'bowl';
  // cross-section across the spoon at the middle of the bowl, or at the middle of the handle
  const x = bowl ? G.bx : (G.x0 + G.neckX) / 2;
  const hw = bowl ? G.bowlHalf(x) : G.handleHalf(x);
  const zTop = bowl ? G.zr : G.spine(x) + G.ht / 2, zBot = bowl ? G.zr - G.depth - G.wall : G.spine(x) - G.ht / 2;
  const span = Math.max(2 * hw, (zTop - zBot)) * 1.3;
  const zc = (zTop + zBot) / 2;
  const F = frame(-span / 2, span / 2, zc - span * 0.38, zc + span * 0.38, { x: 20, y: 14, w: W - 40, h: H - 56 });
  const out = [], inn = [];
  for (let i = 0; i <= 80; i++) {
    const t = Math.PI + i / 80 * Math.PI;
    if (bowl) out.push([hw * Math.cos(t), zTop + (G.depth + G.wall) * Math.sin(t)]);
    else out.push([hw * Math.cos(t), zc + (zTop - zc) * 1.0 * Math.sin(t)]);
  }
  if (!bowl) for (let i = 0; i <= 80; i++) { const t = i / 80 * Math.PI; out.push([hw * Math.cos(t), zc + (zTop - zc) * Math.sin(t)]); }
  // squared blank section
  ctx.strokeStyle = 'rgba(42,36,31,0.4)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
  ctx.strokeRect(F.X(-hw), F.Y(zTop), 2 * hw * F.s, (zTop - zBot) * F.s); ctx.setLineDash([]);
  ctx.fillStyle = WOODF; polyline(ctx, F, out, true); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.stroke();
  if (bowl) {
    for (let i = 0; i <= 80; i++) { const t = Math.PI + i / 80 * Math.PI; inn.push([G.bi * Math.cos(t), zTop + G.depth * Math.sin(t)]); }
    ctx.fillStyle = '#f6f1e7'; polyline(ctx, F, inn, true); ctx.fill(); ctx.strokeStyle = CUT_DARK; ctx.lineWidth = 1.6; polyline(ctx, F, inn, false); ctx.stroke();
    if (fig.hook) {
      // hook knife circle sitting in the bottom
      const r = J.hookR, cz = zTop - G.depth + r;
      ctx.strokeStyle = '#3a6ea5'; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(F.X(0), F.Y(cz), r * F.s, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  ctx.fillStyle = INK; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(bowl ? `across the bowl: ${fmtLen(2 * hw, opt.units)} wide, ${fmtLen(G.depth, opt.units)} deep` : `across the handle: ${fmtLen(2 * hw, opt.units)} × ${fmtLen(G.ht, opt.units)}`, W / 2, H - 26);
  scaleBar(ctx, 20, H - 10, F.s, opt.units);
  const items = [['wood', 'finished section'], ['line', 'square blank']];
  if (fig.hook) items.push(['hook', `hook knife curve (${fmtLen(J.hookR, opt.units)} radius)`]);
  return legend(items);
}

export function drawSpoonFigure(canvas, model, fig, opt) {
  if (fig.type === 'spoonSection') return drawSection(canvas, model, fig, opt);
  if (fig.type === 'spoonViews' || fig.type === 'spoonTop' || fig.type === 'spoonSide') return drawViews(canvas, model, fig, opt);
  return '';
}

// true-scale templates: the spoon runs down the page; long spoons are split over pages
export function spoonSheets(model, opt, version) {
  const { G, P } = model, O = spoonOutlines(G, 400), u = opt.units;
  const zmin = Math.min(...O.side.map(p => p[1])), zmax = Math.max(...O.side.map(p => p[1]));
  const avail = PAGE_H - 34 - 26;
  const parts = Math.ceil((G.L + 4) / avail);
  const seg = G.L / parts;
  const pages = [];
  for (let k = 0; k < parts; k++) {
    const xa = G.x1 - k * seg, xb = xa - seg;                 // bowl at the top of page 1
    const Y = x => 34 + (xa - x) + (parts > 1 ? 0 : 2);
    const clip = `clip${k}`;
    const cxT = 14 + G.wmax + 6, cxS = cxT + G.wmax + 26 + (zmax - zmin) / 2;
    const zm = (zmax + zmin) / 2;
    const pt = (pts, cx, f) => svgPath(pts.map(([x, v]) => [cx + f(v), Y(x)]), true);
    let b = `<defs><clipPath id="${clip}"><rect x="0" y="${f2(Y(xa) - (k ? 0 : 3))}" width="${PAGE_W}" height="${f2(seg + (k ? 0 : 3) + (k === parts - 1 ? 3 : 0))}"/></clipPath></defs><g clip-path="url(#${clip})">`;
    b += `<path d="${pt(O.top, cxT, v => v)}" fill="none" stroke="#000" stroke-width="0.35"/>`;
    b += `<path d="${svgPath(O.inner.map(([x, y]) => [cxT + y, Y(x)]), true)}" fill="none" stroke="#c0501a" stroke-width="0.25" stroke-dasharray="1.2 0.8"/>`;
    b += `<path d="${pt(O.side, cxS, v => zm - v)}" fill="none" stroke="#000" stroke-width="0.35"/>`;
    b += `<path d="${svgPath(O.innerSide.map(([x, z]) => [cxS + zm - z, Y(x)]), false)}" fill="none" stroke="#c0501a" stroke-width="0.25" stroke-dasharray="1.2 0.8"/>`;
    b += `<line x1="${f2(cxT)}" y1="${f2(Y(xa))}" x2="${f2(cxT)}" y2="${f2(Y(xb))}" stroke="#999" stroke-width="0.15" stroke-dasharray="2 1"/>`;
    b += `</g>`;
    if (k === 0) {
      b += `<text x="${f2(cxT)}" y="31" font-size="3" text-anchor="middle">From above</text><text x="${f2(cxS)}" y="31" font-size="3" text-anchor="middle">From the side (rim on the left)</text>`;
    }
    if (parts > 1) {
      if (k < parts - 1) b += `<line x1="8" y1="${f2(Y(xb))}" x2="${PAGE_W - 8}" y2="${f2(Y(xb))}" stroke="#b00" stroke-width="0.2" stroke-dasharray="3 1.5"/><text x="${PAGE_W - 10}" y="${f2(Y(xb) - 1.5)}" font-size="2.8" fill="#b00" text-anchor="end">join to page ${k + 2}</text>`;
      if (k > 0) b += `<line x1="8" y1="${f2(Y(xa))}" x2="${PAGE_W - 8}" y2="${f2(Y(xa))}" stroke="#b00" stroke-width="0.2" stroke-dasharray="3 1.5"/><text x="${PAGE_W - 10}" y="${f2(Y(xa) + 4)}" font-size="2.8" fill="#b00" text-anchor="end">join to page ${k}</text>`;
    }
    const notes = [`Blank ${fmtLen(G.blank[0], u)} × ${fmtLen(G.blank[1], u)} × ${fmtLen(G.blank[2], u)}, grain along the length.`, 'Solid: outline to cut. Dashed orange: inside of the bowl.'];
    const nx = cxS + (zmax - zmin) / 2 + 14;
    if (k === 0 && nx < PAGE_W - 50) notes.forEach((t, i) => { b += `<text x="${f2(nx)}" y="${f2(40 + i * 5)}" font-size="2.8" fill="#444">${esc(t)}</text>`; });
    pages.push(sheet(parts > 1 ? `Spoon templates · page ${k + 1} of ${parts}` : 'Spoon templates', `${fmtLen(P.length, u)} spoon · print at 100% (actual size) · Kerf ${version}`, b, u));
  }
  return sheetsDoc('Kerf — spoon templates', pages);
}
