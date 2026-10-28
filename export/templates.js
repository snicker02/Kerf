// True-scale printable sheets: one drilling template and one depth map per face, plus a cover
// page with the hole tables. Output is a standalone HTML document of SVG pages (US Letter).

import { FACES, faceEdges, sample2D, nearest2D } from '../engine/model.js';
import { contour2D } from '../engine/contour.js';
import { fmtLen, niceStep, MM_PER_IN } from '../engine/units.js';
import { SURF_BY_ID, MODES } from '../engine/tpms.js';

const PAGE_W = 215.9, PAGE_H = 279.4;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const f2 = v => (Math.round(v * 100) / 100).toString();

function polysPath(face, polys, ox, oy) {
  let d = '';
  for (const p of polys) {
    for (let q = 0; q < p.length; q += 2) {
      const [u, v] = face.toUV(p[q], p[q + 1]);
      d += (q ? 'L' : 'M') + f2(ox + u) + ' ' + f2(oy + v);
    }
    d += 'Z';
  }
  return d;
}
function segsPath(face, segs, ox, oy) {
  let d = '';
  for (let q = 0; q < segs.length; q += 4) {
    const a = face.toUV(segs[q], segs[q + 1]), b = face.toUV(segs[q + 2], segs[q + 3]);
    d += `M${f2(ox + a[0])} ${f2(oy + a[1])}L${f2(ox + b[0])} ${f2(oy + b[1])}`;
  }
  return d;
}

function calBar(x, y, units) {
  const L = units === 'in' ? MM_PER_IN : 25;
  const lab = units === 'in' ? '1 inch — check with a ruler' : '25 mm — check with a ruler';
  return `<g stroke="#000" stroke-width="0.3"><line x1="${x}" y1="${y}" x2="${x + L}" y2="${y}"/><line x1="${x}" y1="${y - 2}" x2="${x}" y2="${y + 2}"/><line x1="${x + L}" y1="${y - 2}" x2="${x + L}" y2="${y + 2}"/></g>
<text x="${x + L + 3}" y="${y + 1.2}" font-size="3">${lab}</text>`;
}

function edgeText(fi, ox, oy, w, h) {
  const e = faceEdges(fi);
  const t = (x, y, s) => `<text x="${f2(x)}" y="${f2(y)}" font-size="3.6" font-weight="700" text-anchor="middle" fill="#555">${s}</text>`;
  return t(ox + w / 2, oy - 1.8, `▲ ${FACES[e.top].id}`) + t(ox + w / 2, oy + h + 4.6, `▼ ${FACES[e.bottom].id}`)
    + `<text x="${f2(ox - 2)}" y="${f2(oy + h / 2)}" font-size="3.6" font-weight="700" text-anchor="end" fill="#555">${FACES[e.left].id}</text>`
    + `<text x="${f2(ox + w + 2)}" y="${f2(oy + h / 2)}" font-size="3.6" font-weight="700" fill="#555">${FACES[e.right].id}</text>`;
}

function drillSheet(model, plan, fi, opt, meta) {
  const face = model.faces[fi], u = opt.units, drill = !!opt.drill;
  const w = face.wu, h = face.wv;
  const ox = Math.max(14, (PAGE_W - w) / 2), oy = 34;
  const fits = w <= PAGE_W - 20 && h <= PAGE_H - 70;
  const sec = contour2D(face.section, face.nb, face.nc, face.hb, face.hc, 0, true);
  let body = `<rect x="${ox}" y="${oy}" width="${f2(w)}" height="${f2(h)}" fill="#fff"/>`;
  body += `<path d="${polysPath(face, sec.polys, ox, oy)}" fill="#e6d3b3" stroke="#e6d3b3" stroke-width="0.12"/>`;
  body += `<path d="${segsPath(face, sec.segs, ox, oy)}" fill="none" stroke="#7a5530" stroke-width="0.35"/>`;
  if (opt.saw && plan.sawFaces && plan.sawFaces.includes(fi)) {
    const d = plan.sawDist[fi], g = new Float32Array(d.length);
    for (let i = 0; i < d.length; i++) g[i] = d[i] - plan.sawMargin;
    body += `<path d="${segsPath(face, contour2D(g, face.nb, face.nc, face.hb, face.hc, 0).segs, ox, oy)}" fill="none" stroke="#c0501a" stroke-width="0.45" stroke-dasharray="2 1"/>`;
    body += `<text x="${f2(ox + w - 1)}" y="${f2(oy + h + 4.5)}" font-size="2.6" text-anchor="end" fill="#c0501a">dashed: saw line</text>`;
  }
  for (const e of plan.exits[fi]) {
    body += `<circle cx="${f2(ox + e.u)}" cy="${f2(oy + e.v)}" r="${f2(e.r)}" fill="none" stroke="#000" stroke-width="0.3" stroke-dasharray="1.2 0.8"/>`;
    body += `<text x="${f2(ox + e.u)}" y="${f2(oy + e.v + e.r + 3)}" font-size="2.4" text-anchor="middle">exit ${FACES[e.from].id}${e.n}</text>`;
  }
  for (const hh of plan.holes[fi]) {
    const x = ox + hh.u, y = oy + hh.v;
    body += `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(hh.r)}" fill="none" stroke="#000" stroke-width="${hh.through ? 0.6 : 0.35}"/>`;
    body += `<path d="M${f2(x - 1.6)} ${f2(y)}H${f2(x + 1.6)}M${f2(x)} ${f2(y - 1.6)}V${f2(y + 1.6)}" stroke="#000" stroke-width="0.25"/>`;
    const fs = Math.max(2.4, Math.min(3.6, hh.r * 0.6));
    body += `<text x="${f2(x + hh.r * 0.42)}" y="${f2(y - hh.r * 0.3)}" font-size="${fs}" font-weight="700">${hh.n}${hh.through ? 'T' : ''}</text>`;
  }
  body += `<rect x="${ox}" y="${oy}" width="${f2(w)}" height="${f2(h)}" fill="none" stroke="#000" stroke-width="0.4"/>`;
  body += edgeText(fi, ox, oy, w, h);
  // hole table
  const rows = plan.holes[fi];
  let ty = oy + h + 14;
  const colX = [14, 26, 50, 82, 114];
  let table = `<text x="14" y="${ty}" font-size="3.2" font-weight="700">#</text><text x="${colX[1]}" y="${ty}" font-size="3.2" font-weight="700">Bit</text><text x="${colX[2]}" y="${ty}" font-size="3.2" font-weight="700">From left</text><text x="${colX[3]}" y="${ty}" font-size="3.2" font-weight="700">From top</text><text x="${colX[4]}" y="${ty}" font-size="3.2" font-weight="700">Depth</text>`;
  const maxRows = Math.floor((PAGE_H - 22 - ty) / 4.2);
  rows.slice(0, Math.max(0, maxRows)).forEach((hh, i) => {
    const y = ty + 4.4 * (i + 1);
    table += `<text x="14" y="${y}" font-size="3">${hh.n}</text><text x="${colX[1]}" y="${y}" font-size="3">${esc(hh.bit.label)}</text><text x="${colX[2]}" y="${y}" font-size="3">${esc(fmtLen(hh.u, u))}</text><text x="${colX[3]}" y="${y}" font-size="3">${esc(fmtLen(hh.v, u))}</text><text x="${colX[4]}" y="${y}" font-size="3">${hh.through ? 'through' : esc(fmtLen(hh.depth, u))}</text>`;
  });
  if (rows.length > maxRows) table += `<text x="14" y="${PAGE_H - 18}" font-size="2.8">${rows.length - maxRows} more holes: see the hole table on the cover sheet.</text>`;
  if (!rows.length) table = drill ? `<text x="14" y="${ty}" font-size="3.2">No holes on this face.</text>` : '';
  const title = `<text x="14" y="14" font-size="6" font-family="Georgia, serif" font-weight="700">Face ${FACES[fi].id} · ${FACES[fi].name}</text>
<text x="14" y="20.5" font-size="3.2">${drill ? 'Drilling template' : 'Layout template'} · ${esc(meta)} · print at 100% (actual size)</text>
<text x="14" y="25.5" font-size="2.8" fill="#555">${drill ? `Shaded = finished wood at this face. ⊕ = hole centre (prick with an awl). Depths leave ${esc(fmtLen(opt.drillMargin, u))} above the finished surface.` : 'Shaded = finished wood at this face. Your first stop cuts with the detail knife follow the outline.'}</text>`;
  const warn = fits ? '' : `<text x="14" y="30" font-size="3" fill="#b00">This face is larger than the page — print the SVG on larger paper or tile it.</text>`;
  return sheet(title + warn + body + table + calBar(PAGE_W - 75, PAGE_H - 10, u));
}

function depthSheet(model, plan, fi, opt, meta) {
  const face = model.faces[fi], u = opt.units;
  const w = face.wu, h = face.wv;
  const ox = Math.max(14, (PAGE_W - w) / 2), oy = 34;
  const ci = niceStep(Math.min(model.P.W, model.P.D, model.P.H) / 10, u);
  const sec = contour2D(face.section, face.nb, face.nc, face.hb, face.hc, 0, true);
  let body = `<rect x="${ox}" y="${oy}" width="${f2(w)}" height="${f2(h)}" fill="#fff"/>`;
  body += `<path d="${polysPath(face, sec.polys, ox, oy)}" fill="#e6d3b3" stroke="#e6d3b3" stroke-width="0.12"/>`;
  for (let lv = ci, k = 1; lv < face.full; lv += ci, k++) {
    const { segs } = contour2D(face.depth, face.nb, face.nc, face.hb, face.hc, lv);
    body += `<path d="${segsPath(face, segs, ox, oy)}" fill="none" stroke="#000" stroke-width="${k % 4 === 0 ? 0.35 : 0.18}" opacity="${k % 4 === 0 ? 0.9 : 0.6}"/>`;
  }
  body += `<path d="${segsPath(face, sec.segs, ox, oy)}" fill="none" stroke="#7a5530" stroke-width="0.35"/>`;
  const sp = niceStep(Math.min(w, h) / 6, u);
  for (let v = sp; v < h - sp * 0.4; v += sp) for (let uu = sp; uu < w - sp * 0.4; uu += sp) {
    const [X, Y] = face.toXY(uu, v);
    if (sample2D(face.section, face, X, Y) > 0 || nearest2D(face.through, face, X, Y)) continue;
    const d = sample2D(face.depth, face, X, Y);
    if (d < 0.5 || d >= face.full - 0.5) continue;
    body += `<circle cx="${f2(ox + uu)}" cy="${f2(oy + v)}" r="0.5"/><text x="${f2(ox + uu)}" y="${f2(oy + v - 1.2)}" font-size="2.6" text-anchor="middle" font-weight="700" paint-order="stroke" stroke="#fff" stroke-width="0.8">${esc(fmtLen(d, u, { mark: false }))}</text>`;
  }
  body += `<rect x="${ox}" y="${oy}" width="${f2(w)}" height="${f2(h)}" fill="none" stroke="#000" stroke-width="0.4"/>`;
  body += edgeText(fi, ox, oy, w, h);
  const title = `<text x="14" y="14" font-size="6" font-family="Georgia, serif" font-weight="700">Face ${FACES[fi].id} · ${FACES[fi].name} — depth map</text>
<text x="14" y="20.5" font-size="3.2">${esc(meta)} · contour every ${esc(fmtLen(ci, u))} · numbers = depth to the finished surface (${u === 'in' ? 'inches' : 'mm'})</text>
<text x="14" y="25.5" font-size="2.8" fill="#555">Lay a straightedge across the face and measure down at each point. Keep this sheet beside you; it is not glued on.</text>`;
  return sheet(title + body + calBar(PAGE_W - 75, PAGE_H - 10, u));
}

function sheet(inner) {
  return `<section class="sheet"><svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}mm" height="${PAGE_H}mm" viewBox="0 0 ${PAGE_W} ${PAGE_H}" font-family="system-ui, -apple-system, Segoe UI, sans-serif">${inner}</svg></section>`;
}

export function buildPrintHTML(model, plan, opt, version) {
  const P = model.P, u = opt.units;
  const dims = `${fmtLen(P.W, u)} × ${fmtLen(P.D, u)} × ${fmtLen(P.H, u)}`;
  const meta = P.kind === 'mesh' ? `${P.name} · ${dims}` : `${SURF_BY_ID[P.surface].name} ${MODES.find(m => m.id === P.mode).name.toLowerCase()} · ${dims}`;
  let tables = '';
  for (let fi = 0; fi < 6; fi++) {
    const hs = plan.holes[fi];
    if (!hs.length) continue;
    tables += `<h3>Face ${FACES[fi].id} · ${FACES[fi].name}</h3><table><tr><th>✓</th><th>#</th><th>Bit</th><th>From left</th><th>From top</th><th>Depth</th></tr>${hs.map(h => `<tr><td>☐</td><td>${h.n}</td><td>${esc(h.bit.label)}</td><td>${esc(fmtLen(h.u, u))}</td><td>${esc(fmtLen(h.v, u))}</td><td>${h.through ? 'through' : esc(fmtLen(h.depth, u))}</td></tr>`).join('')}</table>`;
  }
  const cover = `<section class="sheet cover"><div class="pad">
<h1>Kerf carving templates</h1>
<p class="sub">${esc(meta)} · made with Kerf ${esc(version)}</p>
<ol>
<li>Print every page at <b>100% / Actual size</b>. Check the calibration bar on each sheet with a ruler.</li>
<li>Cut out the six <b>${opt.drill ? 'drilling' : 'layout'} templates</b> on their outlines and glue each one to its face. The letters on the edges name the neighbouring faces.</li>
<li>Keep the <b>depth maps</b> beside you for the shaping steps.</li>
</ol>
${opt.drill ? '<h2>Hole tables</h2>' : ''}
${opt.drill ? `<p class="sub">Positions are measured from the left and top edges of each face as seen on its template. Depths are from the face surface.</p>
<div class="tables">${tables || '<p>No holes in this plan.</p>'}</div>` : '<p class="sub">Carved with the Flexcut Carvin’ Jack, no drilling.</p>'}
</div></section>`;
  let sheets = '';
  for (let fi = 0; fi < 6; fi++) sheets += drillSheet(model, plan, fi, opt, meta);
  for (let fi = 0; fi < 6; fi++) sheets += depthSheet(model, plan, fi, opt, meta);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Kerf templates — ${esc(meta)}</title>
<style>
@page { size: letter; margin: 0; }
html, body { margin: 0; background: #888; }
.sheet { width: ${PAGE_W}mm; height: ${PAGE_H}mm; background: #fff; margin: 8mm auto; overflow: hidden; page-break-after: always; break-after: page; position: relative; }
.sheet svg { display: block; }
.cover .pad { padding: 14mm; font-family: system-ui, -apple-system, Segoe UI, sans-serif; font-size: 10pt; color: #111; }
.cover h1 { font-family: Georgia, serif; margin: 0 0 2mm; font-size: 20pt; }
.cover h2 { font-family: Georgia, serif; font-size: 13pt; margin: 6mm 0 1mm; }
.cover h3 { font-size: 10pt; margin: 3mm 0 1mm; }
.cover .sub { color: #555; margin: 0 0 3mm; }
.cover .tables { columns: 2; column-gap: 8mm; }
.cover table { border-collapse: collapse; font-size: 8.5pt; margin-bottom: 3mm; break-inside: avoid; }
.cover td, .cover th { border-bottom: 0.2mm solid #ccc; padding: 0.6mm 2mm 0.6mm 0; text-align: left; }
@media print { html, body { background: #fff; } .sheet { margin: 0; } }
</style></head><body>${cover}${sheets}</body></html>`;
}

export function buildFaceSVG(model, plan, fi, opt, kind = 'drill') {
  const P = model.P;
  const meta = `${P.kind === 'mesh' ? P.name : SURF_BY_ID[P.surface].name} · ${fmtLen(P.W, opt.units)} × ${fmtLen(P.D, opt.units)} × ${fmtLen(P.H, opt.units)}`;
  const html = kind === 'drill' ? drillSheet(model, plan, fi, opt, meta) : depthSheet(model, plan, fi, opt, meta);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + html.replace(/^<section class="sheet">/, '').replace(/<\/section>$/, '');
}
