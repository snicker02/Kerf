// Progress model (what wood remains after a given set of operations) and a surface-nets mesher.

import { BIG } from './model.js';

export function emptyState() {
  return { drill: [], bands: [0, 0, 0, 0, 0, 0], hidden: false, shaped: [false, false, false, false, false, false], final: false };
}
export function cloneState(st) {
  return { drill: st.drill.slice(), bands: st.bands.slice(), hidden: st.hidden, shaped: st.shaped.slice(), final: st.final };
}

// R > 0 where wood is still present.
export function remaining(model, plan, st) {
  const { N, s, n, solid, ds, faces, hs, hmin } = model;
  if (st.final) return { R: solid, removedFrac: 1 };
  const m = plan ? plan.opt.roughMargin : 0;
  const cap = 2 * hmin;
  const R = new Float32Array(N);
  const drillF = (plan ? st.drill : []).map(fi => ({ f: faces[fi], c: plan.drillCols[fi] }));
  const bandF = [];
  for (let fi = 0; fi < 6; fi++) if (st.bands[fi] > 0) bandF.push({ los: faces[fi].los, d: st.bands[fi] });
  const shapeF = [];
  for (let fi = 0; fi < 6; fi++) if (st.shaped[fi]) shapeF.push(faces[fi].los);
  const co = [0, 0, 0];
  let removed = 0, waste = 0, idx = 0;
  const eps = 0.01 * hmin;
  for (let k = 0; k < s[2]; k++) {
    co[2] = k;
    const dz = Math.min(k, n[2] - k) * hs[2];
    for (let j = 0; j < s[1]; j++) {
      co[1] = j;
      const dy = Math.min(j, n[1] - j) * hs[1];
      for (let i = 0; i < s[0]; i++, idx++) {
        co[0] = i;
        const sv = solid[idx];
        if (sv > 0) { R[idx] = sv; continue; }
        waste++;
        const dx = Math.min(i, n[0] - i) * hs[0];
        const stock = Math.min(dx, dy, dz) + eps;
        let w = cap;
        for (let q = 0; q < drillF.length; q++) {
          const D = drillF[q], f = D.f;
          const col = co[f.b] + f.nb * co[f.c];
          const r = D.c.rad[col];
          if (r < cap) {
            const t = f.sign > 0 ? (n[f.a] - co[f.a]) * f.ha : co[f.a] * f.ha;
            const sd = Math.max(r, t - D.c.dep[col]);
            if (sd < w) w = sd;
          }
        }
        for (let q = 0; q < bandF.length; q++) {
          const L = bandF[q].los[idx];
          if (L < BIG) { const sd = Math.max(L - bandF[q].d, m - ds[idx]); if (sd < w) w = sd; }
        }
        if (st.hidden) { const sd = m - ds[idx]; if (sd < w) w = sd; }
        for (let q = 0; q < shapeF.length; q++) if (shapeF[q][idx] < BIG) { if (-0.5 * hmin < w) w = -0.5 * hmin; break; }
        const v = Math.max(sv, Math.min(w, stock));
        R[idx] = v;
        if (v <= 0) removed++;
      }
    }
  }
  return { R, removedFrac: waste ? removed / waste : 1 };
}

// Surface nets over the lattice padded by one layer of air.
// Vertex classes: 0 finished surface, 1 rough-cut waste, 2 untouched stock face.
export function surfaceNets(model, R) {
  const { s, hs, org, solid, hmin, n } = model;
  const P0 = s[0] + 2, P1 = s[1] + 2, P2 = s[2] + 2;
  const PN = P0 * P1 * P2;
  const Rp = new Float32Array(PN).fill(-hmin);
  const Sp = new Float32Array(PN).fill(-hmin);
  for (let k = 0; k < s[2]; k++) for (let j = 0; j < s[1]; j++) {
    const src = s[0] * (j + s[1] * k);
    const dst = 1 + P0 * ((j + 1) + P1 * (k + 1));
    for (let i = 0; i < s[0]; i++) { Rp[dst + i] = R[src + i]; Sp[dst + i] = solid[src + i]; }
  }
  const C0 = P0 - 1, C1 = P1 - 1, C2 = P2 - 1;
  const st1 = P0, st2 = P0 * P1;
  const off = [0, 1, st1, 1 + st1, st2, 1 + st2, st1 + st2, 1 + st1 + st2];
  const cubeV = new Int32Array(C0 * C1 * C2).fill(-1);
  let nv = 0;
  for (let k = 0; k < C2; k++) for (let j = 0; j < C1; j++) {
    let b = P0 * (j + P1 * k);
    let ci = C0 * (j + C1 * k);
    for (let i = 0; i < C0; i++, b++, ci++) {
      let msk = 0;
      for (let q = 0; q < 8; q++) if (Rp[b + off[q]] > 0) msk |= 1 << q;
      if (msk !== 0 && msk !== 255) cubeV[ci] = nv++;
    }
  }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), aux = new Float32Array(nv * 3);
  const EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
  const cv = new Float32Array(8), gx = new Float32Array(8), gy = new Float32Array(8), gz = new Float32Array(8);
  const W = s[0] - 1, Dd = s[1] - 1, H = s[2] - 1;
  const ix2 = 1 / (2 * hs[0]), iy2 = 1 / (2 * hs[1]), iz2 = 1 / (2 * hs[2]);
  let vi = 0;
  for (let k = 0; k < C2; k++) for (let j = 0; j < C1; j++) {
    let b = P0 * (j + P1 * k);
    let ci = C0 * (j + C1 * k);
    for (let i = 0; i < C0; i++, b++, ci++) {
      if (cubeV[ci] < 0) continue;
      for (let q = 0; q < 8; q++) cv[q] = Rp[b + off[q]];
      let sx = 0, sy = 0, sz = 0, cnt = 0;
      for (let e = 0; e < 24; e += 2) {
        const qa = EDGES[e], qb = EDGES[e + 1];
        const va = cv[qa], vb = cv[qb];
        if ((va > 0) === (vb > 0)) continue;
        const t = va / (va - vb);
        const ax = qa & 1, ay = (qa >> 1) & 1, az = (qa >> 2) & 1;
        const bx = qb & 1, by = (qb >> 1) & 1, bz = (qb >> 2) & 1;
        sx += ax + (bx - ax) * t; sy += ay + (by - ay) * t; sz += az + (bz - az) * t; cnt++;
      }
      const fx = sx / cnt, fy = sy / cnt, fz = sz / cnt;
      // corner gradients (central differences, clamped at the padded border)
      for (let q = 0; q < 8; q++) {
        const ii = i + (q & 1), jj = j + ((q >> 1) & 1), kk = k + ((q >> 2) & 1);
        const c = b + off[q];
        const xm = ii > 0 ? c - 1 : c, xp = ii < P0 - 1 ? c + 1 : c;
        const ym = jj > 0 ? c - st1 : c, yp = jj < P1 - 1 ? c + st1 : c;
        const zm = kk > 0 ? c - st2 : c, zp = kk < P2 - 1 ? c + st2 : c;
        gx[q] = (Rp[xp] - Rp[xm]) * ix2; gy[q] = (Rp[yp] - Rp[ym]) * iy2; gz[q] = (Rp[zp] - Rp[zm]) * iz2;
      }
      let nx = 0, ny = 0, nz = 0, sv = 0;
      for (let q = 0; q < 8; q++) {
        const w = ((q & 1) ? fx : 1 - fx) * (((q >> 1) & 1) ? fy : 1 - fy) * (((q >> 2) & 1) ? fz : 1 - fz);
        nx += gx[q] * w; ny += gy[q] * w; nz += gz[q] * w;
        sv += Sp[b + off[q]] * w;
      }
      const gl = Math.hypot(nx, ny, nz) || 1;
      const x = org[0] + (i - 1 + fx) * hs[0], y = org[1] + (j - 1 + fy) * hs[1], z = org[2] + (k - 1 + fz) * hs[2];
      pos[vi * 3] = x; pos[vi * 3 + 1] = y; pos[vi * 3 + 2] = z;
      nrm[vi * 3] = -nx / gl; nrm[vi * 3 + 1] = -ny / gl; nrm[vi * 3 + 2] = -nz / gl;
      let cls;
      if (sv > -0.3 * hmin) cls = 0;
      else {
        const st = Math.min(model.dims[0] / 2 - Math.abs(x), model.dims[1] / 2 - Math.abs(y), model.dims[2] / 2 - Math.abs(z));
        cls = st < 0.3 * hmin ? 2 : 1;
      }
      aux[vi * 3] = cls; aux[vi * 3 + 1] = 1e4; aux[vi * 3 + 2] = 0;
      vi++;
    }
  }
  // quads around each sign-changing lattice edge
  const idx = new Uint32Array(Math.max(6, nv * 18));
  let ni = 0;
  const cid = (i, j, k) => cubeV[i + C0 * (j + C1 * k)];
  const quad = (a, b2, c, d, flip) => {
    if (a < 0 || b2 < 0 || c < 0 || d < 0) return;
    if (!flip) { idx[ni++] = a; idx[ni++] = b2; idx[ni++] = c; idx[ni++] = a; idx[ni++] = c; idx[ni++] = d; }
    else { idx[ni++] = a; idx[ni++] = c; idx[ni++] = b2; idx[ni++] = a; idx[ni++] = d; idx[ni++] = c; }
  };
  for (let k = 0; k < P2 - 1; k++) for (let j = 0; j < P1 - 1; j++) for (let i = 0; i < P0 - 1; i++) {
    const p = i + P0 * (j + P1 * k);
    const a = Rp[p] > 0;
    if (j > 0 && k > 0 && a !== (Rp[p + 1] > 0)) quad(cid(i, j - 1, k - 1), cid(i, j, k - 1), cid(i, j, k), cid(i, j - 1, k), !a);
    if (i > 0 && k > 0 && a !== (Rp[p + st1] > 0)) quad(cid(i - 1, j, k - 1), cid(i - 1, j, k), cid(i, j, k), cid(i, j, k - 1), !a);
    if (i > 0 && j > 0 && a !== (Rp[p + st2] > 0)) quad(cid(i - 1, j - 1, k), cid(i, j - 1, k), cid(i, j, k), cid(i - 1, j, k), !a);
  }
  void W; void Dd; void H; void n;
  return { pos, nrm, aux, idx: idx.subarray(0, ni), nv, nt: ni / 3 };
}
