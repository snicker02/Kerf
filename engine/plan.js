// Carving plan for the Carvin' Jack: optional depth-stop drilling, layered roughing bands,
// and which of the Jack's blades each part of the finished surface needs (and whether it can reach).

import { FACES, BIG, oppositeFace } from './model.js';
import { bitSizes, floorToDisplay } from './units.js';
import { JACK_DEFAULT, model as jackModel, bladeFor, reachOf } from './jack.js';
import { survey } from './reach.js';

export const FACE_ORDER = [0, 2, 4, 1, 3, 5]; // A C E, then B D F

export const DEFAULT_OPT = {
  units: 'in',
  drillMargin: 3.175,  // 1/8"
  roughMargin: 3.175,
  bandStep: 12.7,      // 1/2"
  drill: false,        // the Jack alone by default; a drill is an optional helper
  jack: { ...JACK_DEFAULT },
};

export function makePlan(model, opt) {
  const drill = opt.drill ? planDrilling(model, opt) : noDrilling(model);
  const bands = planBands(model, opt);
  const jack = planJack(model, opt);
  return { opt, ...drill, ...bands, jack };
}

// ---------------------------------------------------------------- drilling

function diskOffsets(face, r) {
  const out = [];
  const mb = Math.ceil(r / face.hb), mc = Math.ceil(r / face.hc);
  for (let dc = -mc; dc <= mc; dc++) for (let db = -mb; db <= mb; db++) {
    const x = db * face.hb, y = dc * face.hc;
    if (x * x + y * y <= r * r) out.push(db + face.nb * dc);
  }
  return out;
}

function greedyHoles(face, bit, margin, existing, units, cap = 20) {
  const r = bit.dia / 2;
  const offs = diskOffsets(face, r);
  const hmin = Math.min(face.hb, face.hc);
  const strideCol = Math.max(1, Math.floor((r / 3) / hmin));
  const edge = r + Math.max(2, 0.15 * r);
  const minDrill = Math.max(4, bit.dia * 0.5);
  const cand = [];
  const ib0 = Math.ceil(edge / face.hb), ic0 = Math.ceil(edge / face.hc);
  const ib1 = Math.floor((face.wb - edge) / face.hb), ic1 = Math.floor((face.wc - edge) / face.hc);
  for (let ic = ic0; ic <= ic1; ic += strideCol) {
    for (let ib = ib0; ib <= ib1; ib += strideCol) {
      const col = ib + face.nb * ic;
      let mn = Infinity, allThrough = true, tooShallow = false;
      for (const o of offs) {
        const q = col + o;
        const d = face.depth[q];
        if (d < mn) mn = d;
        if (!face.through[q]) allThrough = false;
        if (!allThrough && mn - margin < minDrill) { tooShallow = true; break; }
      }
      if (tooShallow) continue;
      let d;
      if (allThrough) d = face.full;
      else { d = floorToDisplay(mn - margin, units); if (d < minDrill) continue; }
      cand.push({ X: ib * face.hb, Y: ic * face.hc, d, through: allThrough });
    }
  }
  cand.sort((p, q) => (q.through - p.through) || (q.d - p.d));
  const taken = [];
  let vol = 0;
  for (const c of cand) {
    if (taken.length >= cap) break;
    let ok = true;
    for (const h of existing.concat(taken)) {
      const gap = Math.max(3, 0.4 * (r + h.r));
      const need = r + h.r + gap;
      const dx = c.X - h.X, dy = c.Y - h.Y;
      if (dx * dx + dy * dy < need * need) { ok = false; break; }
    }
    if (!ok) continue;
    taken.push({ X: c.X, Y: c.Y, r, depth: c.d, through: c.through, bit });
    vol += Math.PI * r * r * c.d;
  }
  return { holes: taken, vol, bit };
}

function noDrilling(model) {
  return {
    holes: model.faces.map(() => []), exits: model.faces.map(() => []), bitUse: [],
    drillCols: model.faces.map(f => ({ rad: new Float32Array(f.nb * f.nc).fill(BIG), dep: new Float32Array(f.nb * f.nc) })),
  };
}

function planDrilling(model, opt) {
  const { faces } = model;
  const bits = bitSizes(opt.units);
  const holes = faces.map(() => []);
  const exits = faces.map(() => []);
  const blocked = faces.map(() => []);
  for (const fi of FACE_ORDER) {
    const face = faces[fi];
    const maxDia = Math.min(face.wb, face.wc) / 3;
    const allowed = bits.filter(b => b.dia >= 6 && b.dia <= maxDia);
    if (!allowed.length) continue;
    let best = null;
    for (const b of allowed) {
      const g = greedyHoles(face, b, opt.drillMargin, blocked[fi], opt.units);
      if (!best || g.vol > best.vol * 1.0001) best = g;
    }
    if (!best || !best.holes.length) continue;
    let chosen = best.holes.slice();
    let fill = null;
    for (const b of allowed.filter(b => b.dia <= best.bit.dia * 0.6)) {
      const g = greedyHoles(face, b, opt.drillMargin, blocked[fi].concat(chosen), opt.units, 10);
      if (!fill || g.vol > fill.vol) fill = g;
    }
    if (fill && fill.vol > 0.08 * best.vol) chosen = chosen.concat(fill.holes);

    // face (u,v) coordinates, then a serpentine order: big bit first, rows top to bottom
    for (const h of chosen) { const uv = face.toUV(h.X, h.Y); h.u = uv[0]; h.v = uv[1]; h.face = fi; }
    const rowH = Math.max(...chosen.map(h => h.r)) * 2.2;
    const order = (A) => {
      A.sort((p, q) => Math.floor(p.v / rowH) - Math.floor(q.v / rowH) || p.u - q.u);
      const rows = [];
      for (const h of A) { const rr = Math.floor(h.v / rowH); (rows[rr] ||= []).push(h); }
      const out = [];
      rows.filter(Boolean).forEach((row, i) => out.push(...(i % 2 ? row.reverse() : row)));
      return out;
    };
    const bigOnes = order(chosen.filter(h => h.bit === best.bit));
    const small = order(chosen.filter(h => h.bit !== best.bit));
    const list = bigOnes.concat(small);
    list.forEach((h, i) => { h.n = i + 1; });
    holes[fi] = list;

    const op = oppositeFace(fi);
    for (const h of list) {
      if (!h.through) continue;
      blocked[op].push({ X: h.X, Y: h.Y, r: h.r });
      const uv = faces[op].toUV(h.X, h.Y);
      exits[op].push({ u: uv[0], v: uv[1], r: h.r, from: fi, n: h.n });
    }
  }

  // per-column nearest hole (radial signed distance + depth) for the progress model
  const drillCols = faces.map((face, fi) => {
    const rad = new Float32Array(face.nb * face.nc).fill(BIG);
    const dep = new Float32Array(face.nb * face.nc);
    for (const h of holes[fi]) {
      const reach = h.r + 2 * Math.max(face.hb, face.hc);
      const ib0 = Math.max(0, Math.floor((h.X - reach) / face.hb)), ib1 = Math.min(face.nb - 1, Math.ceil((h.X + reach) / face.hb));
      const ic0 = Math.max(0, Math.floor((h.Y - reach) / face.hc)), ic1 = Math.min(face.nc - 1, Math.ceil((h.Y + reach) / face.hc));
      for (let ic = ic0; ic <= ic1; ic++) for (let ib = ib0; ib <= ib1; ib++) {
        const d = Math.hypot(ib * face.hb - h.X, ic * face.hc - h.Y) - h.r;
        const col = ib + face.nb * ic;
        if (d < rad[col]) { rad[col] = d; dep[col] = h.depth; }
      }
    }
    return { rad, dep };
  });

  const bitUse = new Map();
  holes.flat().forEach(h => {
    const e = bitUse.get(h.bit.label) || { bit: h.bit, count: 0, through: 0 };
    e.count++; if (h.through) e.through++;
    bitUse.set(h.bit.label, e);
  });
  return { holes, exits, drillCols, bitUse: [...bitUse.values()].sort((a, b) => b.bit.dia - a.bit.dia) };
}

// ---------------------------------------------------------------- roughing bands

function planBands(model, opt) {
  const { faces, ds, N } = model;
  const m = opt.roughMargin, step = opt.bandStep;
  // each roughable waste point belongs to the face that reaches it by the shortest straight cut
  const owner = new Int8Array(N).fill(-1);
  const ownDepth = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (ds[i] <= m) continue;
    let best = BIG, bf = -1;
    for (let f = 0; f < 6; f++) { const L = faces[f].los[i]; if (L < best) { best = L; bf = f; } }
    if (bf >= 0) { owner[i] = bf; ownDepth[i] = best; }
  }
  let roughable = 0;
  for (let i = 0; i < N; i++) if (owner[i] >= 0) roughable++;
  const minCount = Math.max(1, 0.01 * roughable), tinyCount = Math.max(1, 0.0015 * roughable);
  const bandDepths = [], bandMasks = [], bandCounts = [];
  faces.forEach((face, fi) => {
    const masks = [], counts = [];
    let dmax = 0;
    for (let col = 0; col < face.nb * face.nc; col++) {
      let id = face.colStart[col];
      for (let q = 0; q < face.len; q++, id += face.step) {
        if (face.los[id] >= BIG) break;
        if (owner[id] !== fi) continue;
        const L = ownDepth[id];
        const k = Math.max(1, Math.ceil(L / step - 1e-9));
        if (!masks[k - 1]) { masks[k - 1] = new Uint8Array(face.nb * face.nc); counts[k - 1] = 0; }
        masks[k - 1][col] = 1; counts[k - 1]++;
        if (L > dmax) dmax = L;
      }
    }
    // merge layers that would remove almost nothing into the next one on the same face
    const K = Math.ceil(dmax / step - 1e-9);
    const depths = [], mm = [], cc = [];
    let accMask = null, acc = 0;
    for (let k = 1; k <= K; k++) {
      if (masks[k - 1]) {
        if (!accMask) accMask = new Uint8Array(face.nb * face.nc);
        for (let q = 0; q < accMask.length; q++) accMask[q] |= masks[k - 1][q];
        acc += counts[k - 1];
      }
      const last = k === K;
      if (acc >= minCount || (last && acc >= tinyCount)) { depths.push(k * step); mm.push(accMask); cc.push(acc); accMask = null; acc = 0; }
      else if (last && acc > 0 && depths.length) { depths[depths.length - 1] = k * step; const pm = mm[mm.length - 1]; for (let q = 0; q < pm.length; q++) pm[q] |= accMask[q]; cc[cc.length - 1] += acc; }
    }
    bandDepths.push(depths); bandMasks.push(mm); bandCounts.push(cc);
  });
  // hidden waste that survives all band roughing (still further than the margin from the wood)
  let hiddenRough = 0;
  for (let i = 0; i < N; i++) if (model.hidden[i] && ds[i] > m) hiddenRough++;
  return { bandDepths, bandMasks, bandCounts, hiddenRough };
}

// ---------------------------------------------------------------- the Jack's blades

function planJack(model, opt) {
  const J = jackModel(opt.jack);
  const samples = survey(model, J.grip);
  const share = { gouge: 0, scorp: 0, hook: 0, pelican: 0 };
  let out = 0, outShort = 0;
  const outPts = [];
  const radii = [];
  for (const q of samples) {
    const b = bladeFor(J, q.r);
    share[b]++;
    if (isFinite(q.r)) radii.push(q.r);
    if (q.need > J.maxReach) { out++; outPts.push(q.p); }
    else if (q.need > reachOf(J, b)) outShort++;
  }
  const n = Math.max(1, samples.length);
  for (const k in share) share[k] /= n;
  radii.sort((a, b) => a - b);
  const pct = f => radii.length ? radii[Math.min(radii.length - 1, Math.floor(f * radii.length))] : Infinity;
  // where the out-of-reach spots are: their centroid, snapped to the nearest one
  let outAt = null;
  if (outPts.length) {
    const c = [0, 0, 0];
    outPts.forEach(p => { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; });
    c[0] /= outPts.length; c[1] /= outPts.length; c[2] /= outPts.length;
    let bd = Infinity;
    for (const p of outPts) { const d = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]); if (d < bd) { bd = d; outAt = p; } }
  }
  const needs = samples.map(q => q.need).filter(isFinite).sort((a, b) => a - b);
  return {
    J, share,
    outFrac: out / n, outAt, shortFrac: outShort / n,
    need95: needs.length ? needs[Math.floor(needs.length * 0.95)] : Infinity,
    r5: pct(0.05), rmed: pct(0.5),
    tightFrac: radii.filter(r => r < J.gougeR).length / n,
    saddleFrac: model.stats.curv.saddleFrac,
    map: [J.scorpR, J.hookR, J.flatR, J.maxReach],
  };
}
