// Turn a triangle mesh (already placed in the block, millimetres, block-centred) into a signed
// distance field on the planner's lattice, positive inside the wood.
//   sign:      ray parity along x, y and z, majority vote (tolerates small holes and seams)
//   distance:  exact point-to-triangle distance in a narrow band around the surface,
//              Euclidean distance transform beyond it
// The result plugs into buildModel() as an external field with the same interface as a TPMS field.

import { edt3 } from './model.js';

export function meshSDF(mesh, L) {
  const { s, hs, org, N, stride } = L;
  const P = mesh.positions, I = mesh.indices, nt = I.length / 3;
  const votes = new Uint8Array(N);

  // ---- sign: parity of ray crossings, once per axis
  for (let a = 0; a < 3; a++) {
    const [b, c] = [0, 1, 2].filter(x => x !== a);
    const nb = s[b], nc = s[c];
    // bin triangles by the lattice columns their shadow covers
    const counts = new Uint32Array(nb * nc + 1);
    const bbs = new Float32Array(nt * 4);
    for (let t = 0; t < nt; t++) {
      let b0 = Infinity, b1 = -Infinity, c0 = Infinity, c1 = -Infinity;
      for (let k = 0; k < 3; k++) {
        const v = I[t * 3 + k] * 3;
        const pb = (P[v + b] - org[b]) / hs[b], pc = (P[v + c] - org[c]) / hs[c];
        if (pb < b0) b0 = pb; if (pb > b1) b1 = pb; if (pc < c0) c0 = pc; if (pc > c1) c1 = pc;
      }
      const ib0 = Math.max(0, Math.ceil(b0 - 1e-9)), ib1 = Math.min(nb - 1, Math.floor(b1 + 1e-9));
      const ic0 = Math.max(0, Math.ceil(c0 - 1e-9)), ic1 = Math.min(nc - 1, Math.floor(c1 + 1e-9));
      bbs[t * 4] = ib0; bbs[t * 4 + 1] = ib1; bbs[t * 4 + 2] = ic0; bbs[t * 4 + 3] = ic1;
      for (let jc = ic0; jc <= ic1; jc++) for (let jb = ib0; jb <= ib1; jb++) counts[jb + nb * jc + 1]++;
    }
    for (let i = 1; i < counts.length; i++) counts[i] += counts[i - 1];
    const list = new Uint32Array(counts[counts.length - 1]);
    const fill = counts.slice(0, nb * nc);
    for (let t = 0; t < nt; t++) {
      for (let jc = bbs[t * 4 + 2]; jc <= bbs[t * 4 + 3]; jc++) for (let jb = bbs[t * 4]; jb <= bbs[t * 4 + 1]; jb++) list[fill[jb + nb * jc]++] = t;
    }
    // jitter the rays off the lattice so they don't run exactly through edges and vertices
    const jb_ = 1.234567e-4 * hs[b], jc_ = 2.718281e-4 * hs[c];
    const hits = [];
    for (let jc = 0; jc < nc; jc++) for (let jb = 0; jb < nb; jb++) {
      const col = jb + nb * jc;
      const rb = org[b] + jb * hs[b] + jb_, rc = org[c] + jc * hs[c] + jc_;
      hits.length = 0;
      for (let q = counts[col]; q < counts[col + 1]; q++) {
        const t = list[q];
        const A = I[t * 3] * 3, B = I[t * 3 + 1] * 3, C = I[t * 3 + 2] * 3;
        const ab = P[A + b], ac = P[A + c], bb = P[B + b], bc = P[B + c], cb = P[C + b], cc = P[C + c];
        const d = (bb - ab) * (cc - ac) - (cb - ab) * (bc - ac);
        if (Math.abs(d) < 1e-14) continue;
        const u = ((bb - rb) * (cc - rc) - (cb - rb) * (bc - rc)) / d;
        const v = ((cb - rb) * (ac - rc) - (ab - rb) * (cc - rc)) / d;
        const w = 1 - u - v;
        if (u < 0 || v < 0 || w < 0) continue;
        hits.push(u * P[A + a] + v * P[B + a] + w * P[C + a]);
      }
      if (!hits.length) continue;
      hits.sort((x, y) => x - y);
      // walk along the column; inside when an odd number of crossings lie below
      let h = 0;
      const base = jb * stride[b] + jc * stride[c];
      for (let m = 0; m < s[a]; m++) {
        const x = org[a] + m * hs[a];
        while (h < hits.length && hits[h] < x) h++;
        if (h & 1) votes[base + m * stride[a]]++;
      }
    }
  }

  // ---- exact distance near the surface
  const hmax = Math.max(...hs), band = 1.6 * hmax;
  const dist = new Float32Array(N).fill(Infinity);
  const cp = new Float64Array(3);
  for (let t = 0; t < nt; t++) {
    const A = I[t * 3] * 3, B = I[t * 3 + 1] * 3, C = I[t * 3 + 2] * 3;
    const lo = [0, 0, 0], hi = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const mn = Math.min(P[A + k], P[B + k], P[C + k]) - band, mx = Math.max(P[A + k], P[B + k], P[C + k]) + band;
      lo[k] = Math.max(0, Math.ceil((mn - org[k]) / hs[k])); hi[k] = Math.min(s[k] - 1, Math.floor((mx - org[k]) / hs[k]));
    }
    for (let k = lo[2]; k <= hi[2]; k++) for (let j = lo[1]; j <= hi[1]; j++) for (let i = lo[0]; i <= hi[0]; i++) {
      const x = org[0] + i * hs[0], y = org[1] + j * hs[1], z = org[2] + k * hs[2];
      closestOnTri(x, y, z, P, A, B, C, cp);
      const d = Math.hypot(x - cp[0], y - cp[1], z - cp[2]);
      const id = i + j * stride[1] + k * stride[2];
      if (d < dist[id]) dist[id] = d;
    }
  }

  // ---- far field and sign
  const near = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (dist[i] <= band) near[i] = 1;
  const far = edt3(near, s, stride, hs);
  const sdf = new Float32Array(N);
  let inside = 0;
  for (let i = 0; i < N; i++) {
    const sg = votes[i] >= 2 ? 1 : -1;
    if (sg > 0) inside++;
    const d = near[i] ? dist[i] : band + far[i];
    sdf[i] = sg * Math.max(d, 1e-4);
  }
  return { sdf, insideFrac: inside / N };
}

// closest point on triangle (Ericson, Real-Time Collision Detection 5.1.5)
function closestOnTri(px, py, pz, P, A, B, C, out) {
  const ax = P[A], ay = P[A + 1], az = P[A + 2], bx = P[B], by = P[B + 1], bz = P[B + 2], cx = P[C], cy = P[C + 1], cz = P[C + 2];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { out[0] = ax; out[1] = ay; out[2] = az; return; }
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { out[0] = bx; out[1] = by; out[2] = bz; return; }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); out[0] = ax + v * abx; out[1] = ay + v * aby; out[2] = az + v * abz; return; }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { out[0] = cx; out[1] = cy; out[2] = cz; return; }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); out[0] = ax + w * acx; out[1] = ay + w * acy; out[2] = az + w * acz; return; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); out[0] = bx + w * (cx - bx); out[1] = by + w * (cy - by); out[2] = bz + w * (cz - bz); return; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  out[0] = ax + abx * v + acx * w; out[1] = ay + aby * v + acy * w; out[2] = az + abz * v + acz * w;
}

// Field with the same interface the planner uses for TPMS solids (tpms / bound / boundExcept / solid).
export function meshField(sdfGrid, L, dims) {
  const { s, hs, org, stride } = L;
  const W2 = dims[0] / 2, D2 = dims[1] / 2, H2 = dims[2] / 2;
  const half = [W2, D2, H2];
  const tri = (x, y, z) => {
    let fx = (x - org[0]) / hs[0], fy = (y - org[1]) / hs[1], fz = (z - org[2]) / hs[2];
    // outside the block: distance to the block plus the field at its edge (the model never touches it)
    let out = 0;
    if (fx < 0) { out += -fx * hs[0]; fx = 0; } else if (fx > s[0] - 1) { out += (fx - s[0] + 1) * hs[0]; fx = s[0] - 1; }
    if (fy < 0) { out += -fy * hs[1]; fy = 0; } else if (fy > s[1] - 1) { out += (fy - s[1] + 1) * hs[1]; fy = s[1] - 1; }
    if (fz < 0) { out += -fz * hs[2]; fz = 0; } else if (fz > s[2] - 1) { out += (fz - s[2] + 1) * hs[2]; fz = s[2] - 1; }
    const i = Math.min(s[0] - 2, fx | 0), j = Math.min(s[1] - 2, fy | 0), k = Math.min(s[2] - 2, fz | 0);
    const tx = fx - i, ty = fy - j, tz = fz - k, o = i + j * stride[1] + k * stride[2];
    const g = sdfGrid;
    const c00 = g[o] * (1 - tx) + g[o + 1] * tx, c10 = g[o + stride[1]] * (1 - tx) + g[o + stride[1] + 1] * tx;
    const c01 = g[o + stride[2]] * (1 - tx) + g[o + stride[2] + 1] * tx, c11 = g[o + stride[1] + stride[2]] * (1 - tx) + g[o + stride[1] + stride[2] + 1] * tx;
    return ((c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz) - out;
  };
  const eps = 0.01 * Math.min(...hs);
  const bound = (x, y, z) => Math.min(W2 - Math.abs(x), D2 - Math.abs(y), H2 - Math.abs(z)) + eps;
  const boundExcept = (a, x, y, z) => { const q = [x, y, z]; let m = Infinity; for (let i = 0; i < 3; i++) if (i !== a) m = Math.min(m, half[i] - Math.abs(q[i])); return m + eps; };
  return { tpms: tri, bound, boundExcept, solid: (x, y, z) => Math.min(tri(x, y, z), bound(x, y, z)), dist: tri };
}
