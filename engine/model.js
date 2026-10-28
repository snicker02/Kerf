// Voxel model of the carving: the stock block sampled on a lattice, the final solid,
// distance fields, and what each face of the block can "see" in a straight line.
// Lattice points sit exactly on the stock faces. Units: millimetres. Origin at block centre.

import { makeField, principalCurvatures } from './tpms.js';

export const BIG = 1e9;

// Each face is described as seen from outside: R = screen right, Dn = screen down.
export const FACES = [
  { id: 'A', name: 'Top', axis: 2, sign: 1, R: [1, 0, 0], Dn: [0, -1, 0] },
  { id: 'B', name: 'Bottom', axis: 2, sign: -1, R: [1, 0, 0], Dn: [0, 1, 0] },
  { id: 'C', name: 'Front', axis: 1, sign: -1, R: [1, 0, 0], Dn: [0, 0, -1] },
  { id: 'D', name: 'Back', axis: 1, sign: 1, R: [-1, 0, 0], Dn: [0, 0, -1] },
  { id: 'E', name: 'Right', axis: 0, sign: 1, R: [0, 1, 0], Dn: [0, 0, -1] },
  { id: 'F', name: 'Left', axis: 0, sign: -1, R: [0, -1, 0], Dn: [0, 0, -1] },
];
export const oppositeFace = fi => fi ^ 1;
export function faceNormal(fd) { const n = [0, 0, 0]; n[fd.axis] = fd.sign; return n; }
export function faceAlong(vec) {
  return FACES.findIndex(fd => { const n = faceNormal(fd); return n[0] === vec[0] && n[1] === vec[1] && n[2] === vec[2]; });
}
// neighbouring faces across the top/right/bottom/left edges of a face as seen from outside
export function faceEdges(fi) {
  const fd = FACES[fi];
  const neg = v => v.map(x => -x || 0);
  return { top: faceAlong(neg(fd.Dn)), right: faceAlong(fd.R), bottom: faceAlong(fd.Dn), left: faceAlong(neg(fd.R)) };
}

function edt1d(f, n, w2, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let sct;
    for (;;) {
      const r = v[k];
      sct = ((f[q] + w2 * q * q) - (f[r] + w2 * r * r)) / (2 * w2 * (q - r));
      if (sct <= z[k]) k--; else break;
    }
    k++; v[k] = q; z[k] = sct; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = w2 * dq * dq + f[v[k]];
  }
}

// Exact Euclidean distance (mm) from every lattice point to the nearest source point.
export function edt3(src, s, stride, hs) {
  const N = s[0] * s[1] * s[2];
  const g = new Float64Array(N);
  for (let i = 0; i < N; i++) g[i] = src[i] ? 0 : 1e20;
  const mx = Math.max(s[0], s[1], s[2]);
  const f = new Float64Array(mx), d = new Float64Array(mx), v = new Int32Array(mx), z = new Float64Array(mx + 1);
  for (let a = 0; a < 3; a++) {
    const [b, c] = [0, 1, 2].filter(x => x !== a);
    const n = s[a], st = stride[a], w2 = hs[a] * hs[a];
    for (let ic = 0; ic < s[c]; ic++) {
      for (let ib = 0; ib < s[b]; ib++) {
        const base = ib * stride[b] + ic * stride[c];
        for (let q = 0; q < n; q++) f[q] = g[base + q * st];
        edt1d(f, n, w2, d, v, z);
        for (let q = 0; q < n; q++) g[base + q * st] = d[q];
      }
    }
  }
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) out[i] = Math.sqrt(g[i]);
  return out;
}

// the planner's lattice for a block of P.W × P.D × P.H at resolution P.res (points along the longest side)
export function latticeFor(P) {
  const dims = [P.W, P.D, P.H];
  const Lmax = Math.max(...dims);
  const h0 = Lmax / P.res;
  const n = dims.map(d => Math.max(6, Math.round(d / h0)));
  const hs = dims.map((d, i) => d / n[i]);
  const s = n.map(v => v + 1);
  return { dims, Lmax, n, hs, s, N: s[0] * s[1] * s[2], stride: [1, s[0], s[0] * s[1]], org: dims.map(d => -d / 2), hmin: Math.min(...hs) };
}

// Fext: an external field (e.g. from an imported mesh) with the TPMS field interface
export function buildModel(P, Fext) {
  const { dims, Lmax, n, hs, s, N, stride, org, hmin } = latticeFor(P);
  const F = Fext || makeField({ ...P, boundEps: 0.01 * hmin });
  const cell = P.cell || Lmax;
  const curvEps = Fext ? 1.0 * hmin : Math.min(0.5 * hmin, cell * 0.01);

  // ---- final solid
  const solid = new Float32Array(N);
  let p = 0;
  for (let k = 0; k < s[2]; k++) {
    const z = org[2] + k * hs[2];
    for (let j = 0; j < s[1]; j++) {
      const y = org[1] + j * hs[1];
      for (let i = 0; i < s[0]; i++) solid[p++] = F.solid(org[0] + i * hs[0], y, z);
    }
  }

  // ---- keep only the largest connected piece (anything else would fall out while carving)
  const label = new Int32Array(N).fill(-1);
  const queue = new Int32Array(N);
  const sizes = [];
  for (let start = 0; start < N; start++) {
    if (solid[start] <= 0 || label[start] >= 0) continue;
    const id = sizes.length;
    let qh = 0, qt = 0, cnt = 0;
    queue[qt++] = start; label[start] = id;
    while (qh < qt) {
      const c = queue[qh++]; cnt++;
      const i = c % s[0], j = ((c / s[0]) | 0) % s[1], k = (c / stride[2]) | 0;
      let q;
      if (i > 0) { q = c - 1; if (label[q] < 0 && solid[q] > 0) { label[q] = id; queue[qt++] = q; } }
      if (i < n[0]) { q = c + 1; if (label[q] < 0 && solid[q] > 0) { label[q] = id; queue[qt++] = q; } }
      if (j > 0) { q = c - stride[1]; if (label[q] < 0 && solid[q] > 0) { label[q] = id; queue[qt++] = q; } }
      if (j < n[1]) { q = c + stride[1]; if (label[q] < 0 && solid[q] > 0) { label[q] = id; queue[qt++] = q; } }
      if (k > 0) { q = c - stride[2]; if (label[q] < 0 && solid[q] > 0) { label[q] = id; queue[qt++] = q; } }
      if (k < n[2]) { q = c + stride[2]; if (label[q] < 0 && solid[q] > 0) { label[q] = id; queue[qt++] = q; } }
    }
    sizes.push(cnt);
  }
  let keep = -1, keepSize = 0, totalSolid = 0;
  sizes.forEach((c, i) => { totalSolid += c; if (c > keepSize) { keepSize = c; keep = i; } });
  let islandCount = 0;
  if (sizes.length > 1) {
    islandCount = sizes.length - 1;
    for (let i = 0; i < N; i++) if (solid[i] > 0 && label[i] !== keep) solid[i] = -0.5 * hmin;
  }
  const islandFrac = totalSolid ? (totalSolid - keepSize) / totalSolid : 0;

  // ---- distance fields
  const isSolid = new Uint8Array(N), isWaste = new Uint8Array(N);
  for (let i = 0; i < N; i++) { if (solid[i] > 0) isSolid[i] = 1; else isWaste[i] = 1; }
  const ds = edt3(isSolid, s, stride, hs);   // waste -> nearest wood
  const din = edt3(isWaste, s, stride, hs);  // wood -> nearest waste
  p = 0;
  for (let k = 0; k < s[2]; k++) for (let j = 0; j < s[1]; j++) for (let i = 0; i < s[0]; i++, p++) {
    if (!isSolid[p]) continue;
    const df = Math.min(i * hs[0], (n[0] - i) * hs[0], j * hs[1], (n[1] - j) * hs[1], k * hs[2], (n[2] - k) * hs[2]);
    if (df + 0.5 * hmin < din[p]) din[p] = df + 0.5 * hmin;
  }

  // ---- per-face line of sight: how deep a straight cut from this face reaches each waste point
  const faces = FACES.map((fd, fi) => {
    const a = fd.axis;
    const [b, c] = [0, 1, 2].filter(x => x !== a);
    const nb = s[b], nc = s[c];
    const ru = fd.R.findIndex(x => x !== 0), rs = fd.R[ru];
    const dv = fd.Dn.findIndex(x => x !== 0), dsg = fd.Dn[dv];
    const wu = dims[ru], wv = dims[dv];
    const los = new Float32Array(N).fill(BIG);
    const depth = new Float32Array(nb * nc);
    const through = new Uint8Array(nb * nc);
    const section = new Float32Array(nb * nc);
    const colStart = new Int32Array(nb * nc);
    const step = fd.sign > 0 ? -stride[a] : stride[a];
    const ha = hs[a], len = s[a], full = dims[a];
    for (let ic = 0; ic < nc; ic++) {
      for (let ib = 0; ib < nb; ib++) {
        const col = ib + nb * ic;
        const base = ib * stride[b] + ic * stride[c];
        const start = fd.sign > 0 ? base + (len - 1) * stride[a] : base;
        colStart[col] = start;
        {
          // the cross-section on the face plane, without the face's own cut, so its outline is smooth
          const q = [0, 0, 0];
          q[a] = fd.sign * dims[a] / 2; q[b] = org[b] + ib * hs[b]; q[c] = org[c] + ic * hs[c];
          const tv = F.tpms(q[0], q[1], q[2]), bv = F.boundExcept(a, q[0], q[1], q[2]);
          section[col] = solid[start] > 0 ? Math.max(Math.min(tv, bv), 1e-4) : Math.min(Math.min(tv, bv), -1e-4);
        }
        let id = start, hit = -1;
        for (let m = 0; m < len; m++, id += step) {
          const v = solid[id];
          if (v > 0) {
            if (m === 0) depth[col] = 0;
            else {
              const v0 = solid[id - step];
              depth[col] = (m - 1) * ha + ha * (0 - v0) / (v - v0);
            }
            hit = m;
            break;
          }
          los[id] = m * ha;
        }
        if (hit < 0) { depth[col] = full; through[col] = 1; }
      }
    }
    const toUV = (X, Y) => {
      const q = [0, 0, 0];
      q[a] = fd.sign * dims[a] / 2; q[b] = org[b] + X; q[c] = org[c] + Y;
      return [rs * q[ru] + wu / 2, dsg * q[dv] + wv / 2];
    };
    const toXY = (u, v) => {
      const q = [0, 0, 0];
      q[ru] = (u - wu / 2) * rs; q[dv] = (v - wv / 2) * dsg;
      return [q[b] - org[b], q[c] - org[c]];
    };
    const toWorld = (X, Y, t = 0) => {
      const q = [0, 0, 0];
      q[a] = fd.sign * (dims[a] / 2 - t); q[b] = org[b] + X; q[c] = org[c] + Y;
      return q;
    };
    return {
      fi, fd, a, b, c, nb, nc, hb: hs[b], hc: hs[c], ha, len, full, step, sign: fd.sign,
      wb: dims[b], wc: dims[c], wu, wv, ru, rs, dv, dsg,
      los, depth, through, section, colStart, toUV, toXY, toWorld,
    };
  });

  // ---- statistics
  const hidden = new Uint8Array(N);
  let solidCnt = 0, wasteCnt = 0, hiddenCnt = 0;
  for (let i = 0; i < N; i++) {
    if (isSolid[i]) { solidCnt++; continue; }
    wasteCnt++;
    let vis = false;
    for (let f = 0; f < 6; f++) if (faces[f].los[i] < BIG) { vis = true; break; }
    if (!vis) { hidden[i] = 1; hiddenCnt++; }
  }

  // curvature and wall thickness of the finished surface (excluding flat cut faces).
  // Thickness: from a surface point, cast a ray along the inward normal through the wood and
  // measure the chord until it leaves the wood (the "shape diameter"). Perpendicular through a
  // sheet this is the wall thickness; across a neck it is the neck diameter.
  const radii = [], thick = [], edgeThick = [];
  let saddle = 0, curvN = 0;
  const e = curvEps;
  const stepIdx = Math.max(1, Math.floor(N / 160000)) * 2 + 1;
  const rayStep = 0.25 * hmin, rayMax = Math.max(cell, Lmax);
  let rayN = 0;
  for (let idx = 0; idx < N && curvN < 24000; idx += stepIdx) {
    const v = solid[idx];
    if (v <= -hmin || v >= hmin) continue;
    const i = idx % s[0], j = ((idx / s[0]) | 0) % s[1], k = (idx / stride[2]) | 0;
    const x = org[0] + i * hs[0], y = org[1] + j * hs[1], z = org[2] + k * hs[2];
    const tv = F.tpms(x, y, z);
    if (Math.abs(tv) > 0.75 * hmin || F.bound(x, y, z) < hmin) continue;
    const kk = principalCurvatures(F.tpms, x, y, z, e);
    if (!kk) continue;
    curvN++;
    if (kk[0] < 0 && kk[1] > 0) saddle++;
    if (kk[0] < -1e-6) { const r = -1 / kk[0]; if (r < 10 * cell) radii.push(r); }
    if ((curvN & 3) !== 0) continue;
    // inward normal
    const gx = F.tpms(x + e, y, z) - F.tpms(x - e, y, z), gy = F.tpms(x, y + e, z) - F.tpms(x, y - e, z), gz = F.tpms(x, y, z + e) - F.tpms(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz);
    if (gl < 1e-12) continue;
    const dx = gx / gl, dy = gy / gl, dz = gz / gl;
    // step back onto the surface, then march through the wood
    let t = -tv / (gl / (2 * e));
    let entered = -1, exitT = -1, viaBound = false;
    for (let q = 0; t < rayMax; q++, t += rayStep) {
      const px = x + dx * t, py = y + dy * t, pz = z + dz * t;
      const a = F.tpms(px, py, pz), b = F.bound(px, py, pz);
      const sv2 = a < b ? a : b;
      if (sv2 > 0 && entered < 0) entered = t;
      if (sv2 <= 0 && entered >= 0) { exitT = t; viaBound = b < a; break; }
      if (q > 4 && entered < 0) break;
    }
    if (entered < 0 || exitT < 0) continue;
    rayN++;
    const len = exitT - entered;
    const mid = [x + dx * (entered + len / 2), y + dy * (entered + len / 2), z + dz * (entered + len / 2)];
    (viaBound ? edgeThick : thick).push([len, mid]);
  }
  thick.sort((a, b) => a[0] - b[0]);
  edgeThick.sort((a, b) => a[0] - b[0]);
  const lowQ = A => A.length ? A[Math.min(A.length - 1, Math.floor(A.length * 0.005))] : null;
  // if hardly any chord stays inside the block (pieces cut by the faces), fall back to all chords
  let tIn = lowQ(thick);
  if (thick.length < 40) { const all = thick.concat(edgeThick).sort((a, b) => a[0] - b[0]); tIn = all.length ? all[Math.min(all.length - 1, Math.floor(all.length * 0.03))] : null; }
  const tEdge = lowQ(edgeThick);
  const thinIn = tIn ? tIn[0] : Infinity, thinInAt = tIn ? tIn[1] : null;
  const thinEdge = tEdge ? tEdge[0] : Infinity, thinEdgeAt = tEdge ? tEdge[1] : null;
  radii.sort((a, b) => a - b);
  const pct = q => radii.length ? radii[Math.min(radii.length - 1, Math.floor(q * radii.length))] : Infinity;

  return {
    P, F, dims, n, s, hs, N, stride, org, hmin, Lmax, curvEps,
    solid, ds, din, hidden, faces,
    stats: {
      solidCnt, wasteCnt, hiddenCnt,
      keepFrac: solidCnt / N,
      hiddenFrac: wasteCnt ? hiddenCnt / wasteCnt : 0,
      islandCount, islandFrac,
      empty: keep < 0,
      thinIn, thinInAt, thinEdge, thinEdgeAt,
      curv: { r5: pct(0.05), r15: pct(0.15), rmed: pct(0.5), saddleFrac: curvN ? saddle / curvN : 0, samples: curvN },
      cellsAcross: Lmax / cell,
    },
  };
}

// bilinear sample of a face 2D array at lattice-mm (X, Y)
export function sample2D(arr, face, X, Y) {
  let fx = X / face.hb, fy = Y / face.hc;
  if (fx < 0) fx = 0; if (fy < 0) fy = 0;
  if (fx > face.nb - 1.0001) fx = face.nb - 1.0001;
  if (fy > face.nc - 1.0001) fy = face.nc - 1.0001;
  const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j;
  const o = i + face.nb * j;
  return (arr[o] * (1 - tx) + arr[o + 1] * tx) * (1 - ty) + (arr[o + face.nb] * (1 - tx) + arr[o + face.nb + 1] * tx) * ty;
}
export function nearest2D(arr, face, X, Y) {
  const i = Math.max(0, Math.min(face.nb - 1, Math.round(X / face.hb)));
  const j = Math.max(0, Math.min(face.nc - 1, Math.round(Y / face.hc)));
  return arr[i + face.nb * j];
}
