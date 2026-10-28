// True-scale layout sheet for the corner face (US Letter): the two faces of the stick unfolded
// around the face corner, with every layout line, plus a front view of the finished face
// (on the same page when it fits, otherwise on a second page).

import { faceMarks } from '../engine/facesteps.js';
import { fmtLen, MM_PER_IN } from '../engine/units.js';

const PAGE_W = 215.9, PAGE_H = 279.4;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const f2 = v => (Math.round(v * 100) / 100).toString();

// push label positions apart so none are closer than `gap`, keeping their order
export function spreadLabels(ys, gap) {
  const out = ys.slice();
  for (let i = 1; i < out.length; i++) if (out[i] < out[i - 1] + gap) out[i] = out[i - 1] + gap;
  return out;
}

function calBar(units) {
  const L = units === 'in' ? MM_PER_IN : 25;
  return `<g stroke="#000" stroke-width="0.3"><line x1="14" y1="${PAGE_H - 12}" x2="${14 + L}" y2="${PAGE_H - 12}"/><line x1="14" y1="${PAGE_H - 14}" x2="14" y2="${PAGE_H - 10}"/><line x1="${14 + L}" y1="${PAGE_H - 14}" x2="${14 + L}" y2="${PAGE_H - 10}"/></g><text x="${17 + L}" y="${PAGE_H - 10.8}" font-size="3">${units === 'in' ? '1 inch' : '25 mm'} — check with a ruler</text>`;
}
const sheet = inner => `<section class="sheet"><svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}mm" height="${PAGE_H}mm" viewBox="0 0 ${PAGE_W} ${PAGE_H}" font-family="system-ui, -apple-system, Segoe UI, sans-serif">${inner}</svg></section>`;

export function buildFacePrintHTML(model, opt, version, frontPNG) {
  const u = opt.units, P = model.P, g = model.g, M = faceMarks(model);
  const a = P.a, zone = g.zt - g.zHandle + 0.08 * g.F;
  const ox = 24 + a, oy = 42;            // corner line x, top of stick y
  const X = d => ox + d, Y = d => oy + d;
  let svg = '';
  svg += `<rect x="${f2(X(-a))}" y="${f2(Y(0))}" width="${f2(2 * a)}" height="${f2(zone)}" fill="#fff" stroke="#000" stroke-width="0.35"/>`;
  svg += `<line x1="${f2(X(0))}" y1="${f2(Y(0))}" x2="${f2(X(0))}" y2="${f2(Y(zone))}" stroke="#888" stroke-width="0.25" stroke-dasharray="1.5 1"/>`;
  svg += `<text x="${f2(X(-a / 2))}" y="${f2(Y(-2.5))}" font-size="3.2" text-anchor="middle" font-weight="700">C</text>`;
  svg += `<text x="${f2(X(0))}" y="${f2(Y(-2.5))}" font-size="2.6" text-anchor="middle">fold on the corner</text>`;
  svg += `<text x="${f2(X(a / 2))}" y="${f2(Y(-2.5))}" font-size="3.2" text-anchor="middle" font-weight="700">E</text>`;
  const labelY = spreadLabels(M.marks.map(m => Y(m.y) + 1), 3.6);
  M.marks.forEach((m, i) => {
    svg += `<line x1="${f2(X(-a))}" y1="${f2(Y(m.y))}" x2="${f2(X(a))}" y2="${f2(Y(m.y))}" stroke="#000" stroke-width="${m.minor ? 0.18 : 0.35}" ${m.minor ? 'stroke-dasharray="1 0.8"' : ''}/>`;
    if (labelY[i] - (Y(m.y) + 1) > 0.5) svg += `<line x1="${f2(X(a) + 0.5)}" y1="${f2(Y(m.y))}" x2="${f2(X(a) + 2.5)}" y2="${f2(labelY[i] - 1)}" stroke="#888" stroke-width="0.15"/>`;
    svg += `<text x="${f2(X(a) + 3)}" y="${f2(labelY[i])}" font-size="2.8">${esc(m.label)} · ${esc(fmtLen(m.y, u))} from top</text>`;
  });
  const yB = M.marks.find(m => m.id === 'brow').y, yN = M.marks.find(m => m.id === 'nose').y, em = M.marks.find(m => m.id === 'eye');
  for (const sg of [-1, 1]) {
    svg += `<line x1="${f2(X(sg * M.noseTop))}" y1="${f2(Y(yB))}" x2="${f2(X(sg * M.noseBase))}" y2="${f2(Y(yN))}" stroke="#c0501a" stroke-width="0.5"/>`;
    svg += `<polyline points="${M.mound.map(([y, d]) => `${f2(X(sg * d))},${f2(Y(y))}`).join(' ')}" fill="none" stroke="#c0501a" stroke-width="0.5"/>`;
    svg += `<circle cx="${f2(X(sg * M.browEnd))}" cy="${f2(Y(yB))}" r="0.8" fill="#c0501a"/>`;
    svg += `<circle cx="${f2(X(sg * M.noseEnd))}" cy="${f2(Y(yN))}" r="0.8" fill="#c0501a"/>`;
    if (em) svg += `<ellipse cx="${f2(X(sg * M.eye))}" cy="${f2(Y(em.y))}" rx="2.2" ry="1.2" fill="none" stroke="#000" stroke-width="0.25"/>`;
  }
  const head = `<text x="14" y="16" font-size="6" font-family="Georgia, serif" font-weight="700">Corner face · layout</text>
<text x="14" y="23" font-size="3.2">${esc(fmtLen(a, u))} × ${esc(fmtLen(a, u))} × ${esc(fmtLen(P.H, u))} stick · print at 100% (actual size) · Kerf ${esc(version)}</text>
<text x="14" y="28.5" font-size="2.8" fill="#555">Cut out the layout, fold it on the dashed line and wrap it round the face corner, top edge level with the top of the stick.</text>
<text x="14" y="32.5" font-size="2.8" fill="#555">Prick through the lines or use carbon paper. Orange: nose and mouth/beard lines (stop cuts). Dots: where each notch ends on the face.</text>`;

  // front view at true size: below the layout if there's room, otherwise on its own page
  const pages = [];
  let front = '';
  if (frontPNG) {
    const w = frontPNG.wmm, h = frontPNG.hmm;
    const img = (x, y) => `<image href="${frontPNG.url}" x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}"/>
<text x="${f2(x + w / 2)}" y="${f2(y + h + 5)}" font-size="2.8" text-anchor="middle">finished face, actual size, seen straight at the corner</text>`;
    const fy = Y(zone) + 14;
    if (fy + h + 8 < PAGE_H - 18) front = img(X(0) - w / 2, fy);
    else pages.push(sheet(`<text x="14" y="16" font-size="6" font-family="Georgia, serif" font-weight="700">Corner face · front view</text>
<text x="14" y="23" font-size="3.2">Actual size. Hold the stick against it to check your proportions as you carve.</text>${img((PAGE_W - w) / 2, 34)}${calBar(u)}`));
  }
  pages.unshift(sheet(head + svg + front + calBar(u)));
  return `<!doctype html><html><head><meta charset="utf-8"><title>Kerf — corner face layout</title>
<style>@page { size: letter; margin: 0; } html, body { margin: 0; background: #888; }
.sheet { width: ${PAGE_W}mm; height: ${PAGE_H}mm; background: #fff; margin: 8mm auto; overflow: hidden; page-break-after: always; break-after: page; }
.sheet svg { display: block; } @media print { html, body { background: #fff; } .sheet { margin: 0; } }</style></head><body>${pages.join('')}</body></html>`;
}
