// Shared engine for projects described as an ordered list of cuts on a block of wood
// (corner face, chip carving, spoons, ball-in-cage, chains, reliefs).
// stages[k] is a signed distance function (> 0 inside the wood) after cut k; stage 0 is the blank.
// The model samples any stage onto a lattice on demand so the 3D view can show each step exactly.

import { surfaceNets } from './mesh.js';

export function stagedModel({ dims, stages, h, hz, fixedBelowZ = -Infinity, kind = 'staged', extra = {} }) {
  const hTarget = h || Math.max(0.5, Math.max(...dims) / 220);
  const n = dims.map((d, i) => Math.max(8, Math.round(d / (i === 2 && hz ? hz : hTarget))));
  const hs = dims.map((d, i) => d / n[i]);
  const s = n.map(v => v + 1);
  const N = s[0] * s[1] * s[2];
  const stride = [1, s[0], s[0] * s[1]];
  const org = dims.map(d => -d / 2);
  const hmin = Math.min(...hs);
  const cache = new Map();
  const last = stages.length - 1;
  const model = {
    kind, dims, n, hs, s, N, stride, org, hmin, Lmax: Math.max(...dims), stages, ...extra,
    lattice(k) {
      if (cache.has(k)) return cache.get(k);
      const f = stages[k], out = new Float32Array(N);
      let p = 0;
      for (let kk = 0; kk < s[2]; kk++) {
        const z = org[2] + kk * hs[2];
        const fixed = z < fixedBelowZ;
        for (let j = 0; j < s[1]; j++) {
          const y = org[1] + j * hs[1];
          for (let i = 0; i < s[0]; i++) {
            const x = org[0] + i * hs[0];
            out[p++] = fixed ? Math.min(dims[0] / 2 - Math.abs(x), dims[1] / 2 - Math.abs(y), dims[2] / 2 - Math.abs(z)) : f(x, y, z);
          }
        }
      }
      if (cache.size > 3) { for (const key of cache.keys()) { if (key !== last) { cache.delete(key); break; } } }
      cache.set(k, out);
      return out;
    },
  };
  model.solid = model.lattice(last);
  return model;
}

// mesh of stage k; wood freshly exposed by cut k is drawn lighter
export function stagedMesh(model, k) {
  const m = surfaceNets(model, model.lattice(k));
  const prev = k > 0 ? model.lattice(k - 1) : null;
  const { org, hs, stride, n, hmin } = model;
  for (let v = 0; v < m.nv; v++) {
    let cls = 0;
    if (prev) {
      const i = Math.min(n[0], Math.max(0, Math.round((m.pos[v * 3] - org[0]) / hs[0])));
      const j = Math.min(n[1], Math.max(0, Math.round((m.pos[v * 3 + 1] - org[1]) / hs[1])));
      const kk = Math.min(n[2], Math.max(0, Math.round((m.pos[v * 3 + 2] - org[2]) / hs[2])));
      if (prev[i + j * stride[1] + kk * stride[2]] > 0.6 * hmin) cls = 1;
    }
    m.aux[v * 3] = cls;
  }
  return m;
}

// stage list from a blank and an ordered list of removal functions (> 0 where the cut removes wood).
// A cut may instead give `replace`: a whole new field (used for round-overs).
export function stagesFrom(blank, cuts) {
  const stages = [blank];
  let base = blank, extra = [];
  for (const c of cuts) {
    if (c.replace) { base = c.replace; extra = []; } else extra = extra.concat([c.fn]);
    const b = base, ex = extra.slice();
    stages.push((x, y, z) => { let v = b(x, y, z); for (const f of ex) { const w = -f(x, y, z); if (w < v) v = w; } return v; });
  }
  return stages;
}

// ---------------------------------------------------------------- SDF helpers (> 0 inside)
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const boxSDF = (x, y, z, hx, hy, hz) => Math.min(hx - Math.abs(x), hy - Math.abs(y), hz - Math.abs(z));
export function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
// intersection of two "inside-positive" fields with its edge rounded to radius r
export function roundAnd(a, b, r) {
  if (r <= 0) return Math.min(a, b);
  const ux = Math.max(r - a, 0), uy = Math.max(r - b, 0);
  return -(Math.min(-r, Math.max(-a, -b)) + Math.hypot(ux, uy));
}
// 2D stadium (rounded slot) of half-length hl (straight part), radius r, along u; > 0 inside
export const stadium = (u, v, hl, r) => r - Math.hypot(Math.max(Math.abs(u) - hl, 0), v);
