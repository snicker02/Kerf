// Chip carving figures and true-scale pattern sheet.

import { setup, figWidth, frame, polyline, scaleBar, legend, shadeTop, INK, CUT, CUT_DARK, sheet, sheetsDoc, svgPath, f2, PAGE_W } from './sheet2d.js';
import { fmtLen } from '../engine/units.js';

const GROUP_FILL = ['#e7c9a0', '#cfe0d6', '#f1d3b8', '#d8d4ea', '#efe0b0', '#cde0ea', '#e8cfd8'];

function boardOutline(ctx, F, P) {
  const h = P.size / 2;
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
  if (P.shape === 'round') { ctx.beginPath(); ctx.arc(F.X(0), F.Y(0), h * F.s, 0, Math.PI * 2); ctx.stroke(); }
  else ctx.strokeRect(F.X(-h), F.Y(h), P.size * F.s, P.size * F.s);
}

function drawPattern(canvas, model, fig, opt) {
  const { P, pat } = model;
  const W = figWidth(canvas), side = Math.min(W - 32, 470);
  const ctx = setup(canvas, W, side + 48);
  const h = P.size / 2;
  const F = frame(-h, h, -h, h, { x: (W - side) / 2, y: 12, w: side, h: side });
  ctx.fillStyle = '#fbf6ec';
  if (P.shape === 'round') { ctx.beginPath(); ctx.arc(F.X(0), F.Y(0), h * F.s, 0, Math.PI * 2); ctx.fill(); } else ctx.fillRect(F.X(-h), F.Y(h), P.size * F.s, P.size * F.s);
  if (fig.construction) {
    ctx.strokeStyle = 'rgba(42,36,31,0.25)'; ctx.lineWidth = 0.8; ctx.setLineDash([3, 3]);
    for (const r of pat.construction.circles) { ctx.beginPath(); ctx.arc(F.X(0), F.Y(0), r * F.s, 0, Math.PI * 2); ctx.stroke(); }
    const n = pat.construction.rays, R = Math.max(0, ...pat.construction.circles);
    for (let k = 0; k < n * 2; k++) { const t = k * Math.PI / n; ctx.beginPath(); ctx.moveTo(F.X(0), F.Y(0)); ctx.lineTo(F.X(R * Math.cos(t)), F.Y(R * Math.sin(t))); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  pat.groups.forEach((g, gi) => {
    ctx.fillStyle = GROUP_FILL[gi % GROUP_FILL.length];
    ctx.strokeStyle = INK; ctx.lineWidth = 0.9;
    for (const c of pat.chips) if (c.group === g.index) { polyline(ctx, F, c.pts, true); ctx.fill(); ctx.stroke(); }
  });
  ctx.strokeStyle = 'rgba(42,36,31,0.35)'; ctx.lineWidth = 0.6;
  for (const c of pat.chips) if (c.type === 'tri') for (const p of c.pts) { ctx.beginPath(); ctx.moveTo(F.X(c.centre[0]), F.Y(c.centre[1])); ctx.lineTo(F.X(p[0]), F.Y(p[1])); ctx.stroke(); }
  boardOutline(ctx, F, P);
  scaleBar(ctx, F.px.x, F.px.y + F.px.h + 22, F.s, opt.units);
  return `<div class="legend">${pat.groups.map((g, gi) => `<span><i class="sw" style="background:${GROUP_FILL[gi % GROUP_FILL.length]}"></i>${g.name} (${g.count})</span>`).join('')}</div>`;
}

function drawGroup(canvas, model, fig, opt) {
  const { P, pat } = model;
  const W = figWidth(canvas), side = Math.min(W - 32, 470);
  const ctx = setup(canvas, W, side + 48);
  const h = P.size / 2;
  const F = frame(-h, h, -h, h, { x: (W - side) / 2, y: 12, w: side, h: side });
  const gi = fig.group;
  const idx = pat.groups.findIndex(g => g.index === gi);
  const done = gi < 0 ? Infinity : gi;
  const inBoard = (x, y) => (P.shape === 'round' ? Math.hypot(x, y) <= h : Math.abs(x) <= h && Math.abs(y) <= h);
  shadeTop(ctx, F, (x, y) => (inBoard(x, y) ? pat.depthAt(x, y, done) : NaN), gi >= 0 ? (x, y) => pat.depthAt(x, y, gi, gi) > 0.05 : null, [-0.55, 0.55, 0.62]);
  // chips still to come: light outlines
  ctx.strokeStyle = 'rgba(42,36,31,0.35)'; ctx.lineWidth = 0.7;
  if (gi >= 0) for (const c of pat.chips) if (pat.groups.findIndex(g => g.index === c.group) > idx) { polyline(ctx, F, c.pts, true); ctx.stroke(); }
  boardOutline(ctx, F, P);
  scaleBar(ctx, F.px.x, F.px.y + F.px.h + 22, F.s, opt.units);
  return gi >= 0 ? legend([['cut', 'chips in this step'], ['wood', 'carved so far'], ['line2', 'still to carve']]) : '';
}

function drawHow(canvas, model, fig, opt) {
  const { P } = model;
  const W = figWidth(canvas), Hh = 250;
  const ctx = setup(canvas, W, Hh);
  // top view of one chip with the six cuts numbered
  const cx = Math.min(W * 0.3, 150), cy = 128, R = 88;
  const A = [cx, cy - R], B = [cx - R * 0.866, cy + R / 2], C = [cx + R * 0.866, cy + R / 2], G = [cx, cy];
  ctx.fillStyle = '#e7c9a0'; ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(...A); ctx.lineTo(...B); ctx.lineTo(...C); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.setLineDash([5, 3]); ctx.strokeStyle = CUT_DARK; ctx.lineWidth = 1.8;
  for (const p of [A, B, C]) { ctx.beginPath(); ctx.moveTo(...G); ctx.lineTo(...p); ctx.stroke(); }
  ctx.setLineDash([]);
  const label = (x, y, t, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y + 0.5); };
  [A, B, C].forEach((p, i) => label((G[0] + p[0]) / 2 + 10, (G[1] + p[1]) / 2, String(i + 1), CUT_DARK));
  [[A, B], [B, C], [C, A]].forEach(([p, q], i) => { const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, dx = mx - G[0], dy = my - G[1], l = Math.hypot(dx, dy); label(mx + dx / l * 16, my + dy / l * 16, String(i + 4), INK); });
  ctx.fillStyle = INK; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('1–3 stop cuts (deep at the centre)   4–6 slicing cuts', cx, Hh - 8);
  // cross-section through the chip
  const x0 = Math.max(cx + R + 40, W * 0.55), w = Math.min(W - x0 - 20, 220), y0 = 70, half = w / 2;
  const depth = half * Math.tan(P.angle * Math.PI / 180);
  ctx.fillStyle = '#d6b588';
  ctx.beginPath(); ctx.moveTo(x0 - 10, y0); ctx.lineTo(x0, y0); ctx.lineTo(x0 + half, y0 + Math.min(depth, 120)); ctx.lineTo(x0 + w, y0); ctx.lineTo(x0 + w + 10, y0); ctx.lineTo(x0 + w + 10, y0 + 140); ctx.lineTo(x0 - 10, y0 + 140); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.strokeStyle = CUT; ctx.beginPath(); ctx.arc(x0, y0, 26, 0, Math.atan2(Math.min(depth, 120), half)); ctx.stroke();
  ctx.fillStyle = INK; ctx.textAlign = 'left';
  ctx.fillText(`${P.angle}°`, x0 + 30, y0 + 16);
  ctx.textAlign = 'center';
  ctx.fillText('cross-section: walls at the wall angle', x0 + w / 2, y0 + 160);
  return '';
}

export function drawChipFigure(canvas, model, fig, opt) {
  if (fig.type === 'chipPattern') return drawPattern(canvas, model, fig, opt);
  if (fig.type === 'chipGroup') return drawGroup(canvas, model, fig, opt);
  if (fig.type === 'chipHow') return drawHow(canvas, model, fig, opt);
  return '';
}

export function chipSheets(model, opt, version) {
  const { P, pat } = model, u = opt.units, h = P.size / 2;
  const cx = PAGE_W / 2, cy = 34 + h + 4;
  const X = x => cx + x, Y = y => cy - y;
  let b = '';
  b += P.shape === 'round' ? `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(h)}" fill="none" stroke="#000" stroke-width="0.35"/>` : `<rect x="${f2(X(-h))}" y="${f2(Y(h))}" width="${f2(P.size)}" height="${f2(P.size)}" fill="none" stroke="#000" stroke-width="0.35"/>`;
  for (const r of pat.construction.circles) b += `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r)}" fill="none" stroke="#999" stroke-width="0.15" stroke-dasharray="1 1"/>`;
  b += `<path d="M${f2(cx - 2)} ${f2(cy)}H${f2(cx + 2)}M${f2(cx)} ${f2(cy - 2)}V${f2(cy + 2)}" stroke="#000" stroke-width="0.2"/>`;
  for (const c of pat.chips) {
    b += `<path d="${svgPath(c.pts.map(([x, y]) => [X(x), Y(y)]), true)}" fill="none" stroke="#000" stroke-width="0.25"/>`;
    if (c.type === 'tri') for (const p of c.pts) b += `<line x1="${f2(X(c.centre[0]))}" y1="${f2(Y(c.centre[1]))}" x2="${f2(X(p[0]))}" y2="${f2(Y(p[1]))}" stroke="#c0501a" stroke-width="0.15" stroke-dasharray="0.8 0.6"/>`;
  }
  const note = `<text x="14" y="${f2(cy + h + 10)}" font-size="2.8" fill="#555">Solid lines: chip outlines (slicing cuts). Dashed orange: stop cuts from each chip's deep centre to its corners.</text>`;
  const fits = P.size <= PAGE_W - 20 && cy + h + 20 < 260;
  const warn = fits ? '' : `<text x="14" y="30" font-size="3" fill="#b00">This board is larger than the page. Print the pattern in pieces or scale the board down.</text>`;
  const pg = sheet('Chip carving · pattern', `${fmtLen(P.size, u)} ${P.shape} board · ${pat.chips.length} chips · print at 100% (actual size) · Kerf ${version}`, b + note + warn, u);
  return sheetsDoc('Kerf — chip carving pattern', [pg]);
}
