// Drawing of the Carvin' Jack's six blades, all to the same scale, with this piece's share per blade.

import { fmtLen } from '../engine/units.js';

const INK = '#2a241f', STEEL = '#c9ccd0', STEEL2 = '#8f959c', HANDLE = '#b7bcc2', PAPER = '#f6f1e7';
const COLORS = { pelican: '#b48f5e', hook: '#2f8f8a', scorp: '#d18a1e', gouge: '#7b5cb0' };

function setup(canvas, cssW, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, cssW, cssH);
  return ctx;
}

function handle(ctx, x, y, s) {
  // the end of the aluminium handle the blade comes out of
  const w = 26, h = 9 * s / 2.6;
  ctx.fillStyle = HANDLE; ctx.strokeStyle = STEEL2; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x - w, y - h); ctx.lineTo(x, y - h * 0.8); ctx.lineTo(x, y + h * 0.8); ctx.lineTo(x - w, y + h); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let q = 0; q < 5; q++) { ctx.fillRect(x - w + 4 + q * 4, y - h + 3, 1.2, 2 * h - 6); }
}

function steel(ctx, path) {
  ctx.fillStyle = STEEL; ctx.strokeStyle = '#5c6268'; ctx.lineWidth = 1.1;
  ctx.beginPath(); path(ctx); ctx.closePath(); ctx.fill(); ctx.stroke();
}

const DRAW = {
  detail(ctx, x, y, s, J) {
    const L = J.knifeReach * s, h = 6 * s;
    steel(ctx, c => { c.moveTo(x, y - h / 2); c.lineTo(x + L * 0.62, y - h / 2); c.lineTo(x + L, y + h * 0.15); c.lineTo(x + L * 0.9, y + h / 2); c.lineTo(x, y + h / 2); });
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 2, y + h / 2 - 1); ctx.lineTo(x + L * 0.9, y + h / 2 - 1); ctx.stroke();
    return `${fmtLen(J.knifeReach, this.u)} edge`;
  },
  pelican(ctx, x, y, s, J) {
    const L = J.knifeReach * s, h = 7 * s;
    steel(ctx, c => { c.moveTo(x, y - h / 2); c.lineTo(x + L * 0.8, y - h / 2); c.quadraticCurveTo(x + L * 1.02, y - h / 2, x + L, y - h * 0.15); c.quadraticCurveTo(x + L * 0.75, y + h * 1.05, x, y + h / 2); });
    return 'curved belly';
  },
  hook(ctx, x, y, s, J) {
    const R = J.hookR * s, sh = Math.max(4, (J.hookReach - J.hookR) * s);
    ctx.strokeStyle = '#5c6268'; ctx.lineCap = 'round';
    ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + sh, y); ctx.arc(x + sh, y + R, R, -Math.PI / 2, Math.PI * 0.35); ctx.stroke();
    ctx.strokeStyle = STEEL; ctx.lineWidth = 3; ctx.stroke();
    ctx.setLineDash([2, 3]); ctx.strokeStyle = COLORS.hook; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + sh, y + R); ctx.lineTo(x + sh + R * Math.cos(-0.6), y + R + R * Math.sin(-0.6)); ctx.stroke(); ctx.setLineDash([]);
    return `${fmtLen(J.hookR, this.u)} radius`;
  },
  gouge(ctx, x, y, s, J) {
    const L = J.knifeReach * s, w = J.gougeW * s;
    steel(ctx, c => { c.rect(x, y - w / 2, L, w); });
    endU(ctx, x + L + 12, y, w, 1.0);
    return `${fmtLen(J.gougeW, this.u)} #11`;
  },
  scorp(ctx, x, y, s, J) {
    const sh = Math.max(4, (J.scorpReach - J.scorpW) * s), w = J.scorpW * s;
    ctx.strokeStyle = '#5c6268'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + sh, y); ctx.quadraticCurveTo(x + sh + w, y, x + sh + w, y + w); ctx.stroke();
    ctx.strokeStyle = STEEL; ctx.lineWidth = 2.4; ctx.stroke();
    endU(ctx, x + sh + w + 16, y, w, 0.75);
    return `${fmtLen(J.scorpW, this.u)} U`;
  },
  vscorp(ctx, x, y, s, J) {
    const sh = Math.max(4, (J.scorpReach - J.vscorpW) * s), w = J.vscorpW * s;
    ctx.strokeStyle = '#5c6268'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + sh, y); ctx.quadraticCurveTo(x + sh + w, y, x + sh + w, y + w); ctx.stroke();
    ctx.strokeStyle = STEEL; ctx.lineWidth = 2.4; ctx.stroke();
    const cx = x + sh + w + 16, d = (w / 2) / Math.tan(35 * Math.PI / 180);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - w / 2, y - d / 2); ctx.lineTo(cx, y + d / 2); ctx.lineTo(cx + w / 2, y - d / 2); ctx.stroke();
    return `${fmtLen(J.vscorpW, this.u)} 70° V`;
  },
};

function endU(ctx, cx, cy, w, depthF) {
  const r = w / 2;
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - r, cy - r * depthF); ctx.lineTo(cx - r, cy); ctx.arc(cx, cy, r, Math.PI, 0, true); ctx.lineTo(cx + r, cy - r * depthF); ctx.stroke();
}

const ORDER = [
  ['detail', 'Detail knife'], ['pelican', 'Pelican knife'], ['hook', 'Hook knife'],
  ['gouge', 'Straight gouge'], ['scorp', 'Gouge scorp'], ['vscorp', 'V-scorp'],
];

export function drawJackFigure(canvas, cssW, J, units, share) {
  const cols = cssW < 420 ? 2 : 3, rows = Math.ceil(6 / cols);
  const cellW = (cssW - 24) / cols, cellH = 142;
  const barH = share ? 64 : 0;
  const cssH = rows * cellH + 30 + barH;
  const ctx = setup(canvas, cssW, cssH);
  const s = Math.min(3.0, (cellW - 70) / Math.max(J.knifeReach, J.hookReach + J.hookR * 0.2, J.scorpReach + 10));
  ORDER.forEach(([id, name], i) => {
    const c = i % cols, r = (i / cols) | 0;
    const x0 = 12 + c * cellW, y0 = 8 + r * cellH;
    const hx = x0 + 34, hy = y0 + 22;
    handle(ctx, hx, hy, s);
    const dim = DRAW[id].call({ u: units }, ctx, hx, hy, s, J);
    ctx.fillStyle = INK; ctx.font = '600 12.5px Georgia, serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(name, x0 + 6, y0 + 120);
    ctx.fillStyle = '#6b6158'; ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(dim, x0 + 6, y0 + 134);
  });
  // scale bar
  const ys = rows * cellH + 16;
  const len = units === 'in' ? 25.4 : 20;
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(12, ys); ctx.lineTo(12 + len * s, ys); ctx.moveTo(12, ys - 4); ctx.lineTo(12, ys + 4); ctx.moveTo(12 + len * s, ys - 4); ctx.lineTo(12 + len * s, ys + 4); ctx.stroke();
  ctx.fillStyle = INK; ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'middle';
  ctx.fillText(`${units === 'in' ? '1″' : '20 mm'}  (all blades to the same scale; end views beside the gouge and scorps)`, 18 + len * s, ys);
  if (share) {
    const y = ys + 22, w = cssW - 24;
    ctx.fillStyle = INK; ctx.font = '600 11.5px system-ui, sans-serif'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('This piece’s finished surface, by blade', 12, y);
    let x = 12;
    const parts = [['pelican', 'Pelican'], ['hook', 'Hook'], ['scorp', 'Scorp'], ['gouge', 'Gouge']];
    for (const [k, lab] of parts) {
      const f = share[k] || 0, bw = f * w;
      if (bw < 0.5) continue;
      ctx.fillStyle = COLORS[k]; ctx.fillRect(x, y + 6, bw - 1, 16);
      if (bw > 54) { ctx.fillStyle = '#fff'; ctx.font = '600 10.5px system-ui, sans-serif'; ctx.fillText(`${lab} ${Math.round(f * 100)}%`, x + 5, y + 18); }
      x += bw;
    }
  }
  return `<p class="figcap">The hook radius and the blade widths are published figures. Blade lengths are estimates: measure yours and correct them under <b>Your Jack</b>.</p>`;
}
