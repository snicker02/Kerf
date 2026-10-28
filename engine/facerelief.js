// Front-view relief of a corner face stage: a height map q(s, z) seen straight at the corner,
// shaded like a pencil drawing. Pure function so it can be tested and reused for print sheets.

import { toXYZ } from './face.js';

export function reliefMap(field, g, opt = {}) {
  const a = g.a;
  const sMax = a / Math.SQRT2;
  const z0 = opt.z0 ?? (g.zNeck - 0.12 * g.F), z1 = opt.z1 ?? g.zt;
  const W = opt.W || 160;
  const Hh = Math.round(W * (z1 - z0) / (2 * sMax));
  const qmax = a / Math.SQRT2 + 1;
  const hm = new Float32Array(W * Hh).fill(NaN);
  const step = 0.35;
  for (let r = 0; r < Hh; r++) {
    const z = z1 - (r + 0.5) / Hh * (z1 - z0);
    for (let c = 0; c < W; c++) {
      const s = -sMax + (c + 0.5) / W * 2 * sMax;
      // first q (from the viewer) inside the wood; the stick's faces start at q = |s|
      let q = Math.abs(s) - 0.5, prev = q, hit = false;
      for (; q < qmax; q += step) {
        const p = toXYZ(s, q, z, a);
        if (field(p[0], p[1], p[2]) > 0) { hit = true; break; }
        prev = q;
      }
      if (!hit) continue;
      let lo = prev, hi = q;
      for (let i = 0; i < 7; i++) { const m = (lo + hi) / 2, p = toXYZ(s, m, z, a); if (field(p[0], p[1], p[2]) > 0) hi = m; else lo = m; }
      hm[r * W + c] = (lo + hi) / 2;
    }
  }
  return { hm, W, H: Hh, sMax, z0, z1, px: 2 * sMax / W };
}

// shade a relief into RGBA; `before` (another relief of the same frame) tints what this step removed
export function shadeRelief(R, before, tint = [214, 104, 40]) {
  const { hm, W, H, px } = R;
  const rgba = new Uint8ClampedArray(W * H * 4);
  const L = [-0.55, 0.62, 0.56];
  const ll = Math.hypot(...L);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const i = r * W + c, o = i * 4;
    const v = hm[i];
    if (!isFinite(v)) { rgba[o] = 246; rgba[o + 1] = 241; rgba[o + 2] = 231; rgba[o + 3] = 255; continue; }
    const at = (rr, cc) => { rr = Math.max(0, Math.min(H - 1, rr)); cc = Math.max(0, Math.min(W - 1, cc)); const w = hm[rr * W + cc]; return isFinite(w) ? w : v + 3; };
    const dqds = (at(r, c + 1) - at(r, c - 1)) / (2 * px), dqdz = (at(r - 1, c) - at(r + 1, c)) / (2 * px);
    // surface normal toward the viewer: n ∝ (dq/ds, dq/dz, 1)
    const n = [dqds, dqdz, 1], nl = Math.hypot(...n);
    let lam = (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / (nl * ll);
    lam = 0.5 + 0.5 * Math.max(0, lam);
    let col = [222, 190, 146];
    if (before && isFinite(before.hm[i]) && v > before.hm[i] + 0.25) col = [col[0] * 0.45 + tint[0] * 0.55, col[1] * 0.45 + tint[1] * 0.55, col[2] * 0.45 + tint[2] * 0.55];
    if (before && !isFinite(before.hm[i])) { /* nothing */ }
    rgba[o] = col[0] * lam; rgba[o + 1] = col[1] * lam; rgba[o + 2] = col[2] * lam; rgba[o + 3] = 255;
  }
  return rgba;
}

// centre-line profile q(z) at a given s
export function profile(field, g, s, n = 200, z0 = g.zNeck - 0.12 * g.F, z1 = g.zt) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const z = z1 - i / n * (z1 - z0);
    let q = Math.abs(s) - 0.5, hit = NaN;
    for (; q < g.a; q += 0.25) { const p = toXYZ(s, q, z, g.a); if (field(p[0], p[1], p[2]) > 0) { hit = q; break; } }
    out.push([z, hit]);
  }
  return out;
}
