// Can the Carvin' Jack get a blade onto a point of the finished surface?
// The tool is a straight body: a thin blade of some length, then the handle and your grip,
// which need a round opening of diameter `grip`. For a surface point we try many straight
// approach directions; a direction is usable when the line never passes through finished wood
// and, past some distance t, always has at least grip/2 of clearance until it leaves the block.
// The smallest such t over all directions is the blade length that point needs.

import { principalCurvatures } from './tpms.js';

const DIRS = (() => {
  const n = 128, out = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * i + 1) / n, r = Math.sqrt(1 - z * z), a = i * ga;
    out.push([Math.cos(a) * r, Math.sin(a) * r, z]);
  }
  return out;
})();

// small cone of directions around +z, rotated onto a best direction to refine it
const CONE = (() => {
  const out = [];
  for (const a of [0.09, 0.18]) for (let q = 0; q < 8; q++) {
    const ph = q * Math.PI / 4 + (a > 0.1 ? Math.PI / 8 : 0);
    out.push([Math.sin(a) * Math.cos(ph), Math.sin(a) * Math.sin(ph), Math.cos(a)]);
  }
  return out;
})();
function rotateTo(v, d) {
  // rotate v (given around +z) so that +z maps onto unit d
  const z = d, t = Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let x = [t[1] * z[2] - t[2] * z[1], t[2] * z[0] - t[0] * z[2], t[0] * z[1] - t[1] * z[0]];
  const l = Math.hypot(x[0], x[1], x[2]); x = [x[0] / l, x[1] / l, x[2] / l];
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return [x[0] * v[0] + y[0] * v[1] + z[0] * v[2], x[1] * v[0] + y[1] * v[1] + z[1] * v[2], x[2] * v[0] + y[2] * v[1] + z[2] * v[2]];
}

export function needLength(model, p, nrm, grip) {
  const { stride, hs, org, solid, ds, dims, hmin } = model;
  const rh = grip / 2, step = hmin, t0 = 1.5 * hmin;
  const hx = dims[0] / 2, hy = dims[1] / 2, hz = dims[2] / 2;
  let best = Infinity, bestDir = null;
  const tryDir = d => {
    if (d[0] * nrm[0] + d[1] * nrm[1] + d[2] * nrm[2] < 0.2) return;
    let tight = 0;
    for (let t = t0; ; t += step) {
      if (tight >= best) return; // this direction already needs more blade than the best one
      const x = p[0] + d[0] * t, y = p[1] + d[1] * t, z = p[2] + d[2] * t;
      if (x < -hx || x > hx || y < -hy || y > hy || z < -hz || z > hz) break;
      const i = Math.round((x - org[0]) / hs[0]), j = Math.round((y - org[1]) / hs[1]), k = Math.round((z - org[2]) / hs[2]);
      const id = i + j * stride[1] + k * stride[2];
      if (solid[id] > 0.5 * hmin) return;          // the tool would pass through finished wood
      if (ds[id] < rh) tight = t;                  // handle and grip don't fit here yet
    }
    const need = Math.max(tight, t0);
    if (need < best) { best = need; bestDir = d; }
  };
  for (const d of DIRS) tryDir(d);
  if (bestDir) { const b = bestDir; for (const c of CONE) tryDir(rotateTo(c, b)); }
  return best;
}

// Outward normal (into the waste) of the finished solid at p.
function normalAt(F, p, e) {
  const gx = F.solid(p[0] + e, p[1], p[2]) - F.solid(p[0] - e, p[1], p[2]);
  const gy = F.solid(p[0], p[1] + e, p[2]) - F.solid(p[0], p[1] - e, p[2]);
  const gz = F.solid(p[0], p[1], p[2] + e) - F.solid(p[0], p[1], p[2] - e);
  const l = Math.hypot(gx, gy, gz) || 1;
  return [-gx / l, -gy / l, -gz / l];
}

// Concave radius at a finished-surface point (Infinity where convex or on a flat cut face).
export function concaveRadius(model, p) {
  const { F, hmin, P } = model;
  const e = Math.min(0.5 * hmin, P.cell * 0.01);
  if (Math.abs(F.tpms(p[0], p[1], p[2])) > hmin || F.bound(p[0], p[1], p[2]) < 0.5 * hmin) return Infinity;
  const k = principalCurvatures(F.tpms, p[0], p[1], p[2], e);
  return k && k[0] < -1e-6 ? -1 / k[0] : Infinity;
}

// A sample of finished-surface points with concave radius and needed blade length (cached per grip).
export function survey(model, grip) {
  const key = 'survey:' + grip.toFixed(2);
  if (model[key]) return model[key];
  const { N, s, stride, hs, org, solid, hmin, F } = model;
  const out = [];
  const target = 5000;
  // count surface lattice points to pick a stride
  let cnt = 0;
  for (let i = 0; i < N; i++) if (solid[i] > -hmin && solid[i] < hmin) cnt++;
  const every = Math.max(1, Math.floor(cnt / target));
  let c = 0;
  for (let idx = 0; idx < N; idx++) {
    const v = solid[idx];
    if (v <= -hmin || v >= hmin) continue;
    if (c++ % every) continue;
    const i = idx % s[0], j = ((idx / s[0]) | 0) % s[1], k = (idx / stride[2]) | 0;
    let p = [org[0] + i * hs[0], org[1] + j * hs[1], org[2] + k * hs[2]];
    const nrm = normalAt(F, p, 0.5 * hmin);
    // project onto the surface
    const sv = F.solid(p[0], p[1], p[2]);
    p = [p[0] + nrm[0] * sv, p[1] + nrm[1] * sv, p[2] + nrm[2] * sv];
    out.push({ p, r: concaveRadius(model, p), need: needLength(model, p, nrm, grip) });
  }
  model[key] = out;
  return out;
}

// Per-vertex concave radius and needed reach for the tool map (finished vertices only).
// Reach is computed once per 2h grid cell and shared by the vertices in it.
export function applyToolData(mesh, model, grip) {
  const { hmin, F } = model;
  const cell = 2 * hmin, memo = new Map();
  for (let v = 0; v < mesh.nv; v++) {
    if (mesh.aux[v * 3] !== 0) continue;
    const p = [mesh.pos[v * 3], mesh.pos[v * 3 + 1], mesh.pos[v * 3 + 2]];
    mesh.aux[v * 3 + 1] = concaveRadius(model, p);
    const key = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)},${Math.floor(p[2] / cell)}`;
    let need = memo.get(key);
    if (need === undefined) {
      const nrm = [mesh.nrm[v * 3], mesh.nrm[v * 3 + 1], mesh.nrm[v * 3 + 2]];
      need = needLength(model, p, nrm, grip);
      memo.set(key, need);
    }
    mesh.aux[v * 3 + 2] = need;
  }
  void F;
  for (let v = 0; v < mesh.nv; v++) { if (!isFinite(mesh.aux[v * 3 + 1])) mesh.aux[v * 3 + 1] = 1e4; if (!isFinite(mesh.aux[v * 3 + 2])) mesh.aux[v * 3 + 2] = 1e4; }
  mesh.toolGrip = grip;
  return mesh;
}
