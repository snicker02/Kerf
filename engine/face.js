// Corner face: the classic whittled face on the corner of a square basswood stick, carved as an
// ordered list of Carvin' Jack cuts. Each cut is a removal region (signed distance, > 0 = removed);
// the wood after step k is the stock minus cuts 1..k, so every step can be shown exactly.
//
// Frame: the stick is a × a × H, z up, top at z = H/2. The face looks out of the vertical corner
// edge between face C (front, y = -a/2) and face E (right, x = +a/2).
//   s = lateral position across the face (viewer's right is +s, on face E)
//   q = depth back from the corner edge (q = 0 on the edge, growing into the stick)
// On the original faces q = |s|; a point at lateral s lies |s|·√2 from the corner, measured on the face.

import { MM_PER_IN as IN } from './units.js';

const R2 = Math.SQRT2;
export const toXYZ = (s, q, z, a) => [(R2 * (s - q) + a) / 2, (R2 * (s + q) - a) / 2, z];
export const toSQ = (x, y, a) => [(x + y) / R2, -(x - y - a) / R2];

// ---------------------------------------------------------------- options and styles
export const FACE_OPTIONS = {
  noseShape: [['straight', 'Straight'], ['hooked', 'Hooked'], ['bulbous', 'Round tip']],
  eyes: [['open', 'Open'], ['wide', 'Wide open'], ['squint', 'Squinting'], ['closed', 'Closed'], ['hidden', 'Under the hat']],
  brows: [['plain', 'Plain'], ['bushy', 'Bushy']],
  mouth: [['closed', 'Closed'], ['open', 'Open']],
  hat: [['none', 'No hat'], ['stocking', 'Stocking cap'], ['wizard', 'Wizard hat'], ['brimmed', 'Brimmed hat'], ['gnome', 'Gnome hat']],
  hair: [['none', 'Bald'], ['swept', 'Swept back'], ['curly', 'Curly']],
  beard: [['none', 'None'], ['short', 'Short'], ['long', 'Long'], ['pointed', 'Pointed']],
  mustache: [['none', 'None'], ['full', 'Full'], ['handlebar', 'Handlebar'], ['walrus', 'Walrus']],
};

export const FACE_DEFAULT = {
  a: 1.5 * IN, H: 5 * IN, style: 'first',
  faceLen: 1, smile: 0.5, age: 0, nose: 1, noseShape: 'straight',
  eyes: 'open', brows: 'plain', mouth: 'closed', hat: 'none', hair: 'swept',
  beard: 'none', mustache: 'none', ears: false,
};

export const FACE_STYLES = [
  { id: 'first', name: 'First face (simplest)', set: { faceLen: 1, smile: 0.5, age: 0, nose: 1, noseShape: 'straight', eyes: 'open', brows: 'plain', mouth: 'closed', hat: 'none', hair: 'swept', beard: 'none', mustache: 'none', ears: false } },
  { id: 'oldman', name: 'Friendly old man', set: { faceLen: 1, smile: 0.6, age: 0.65, nose: 1.1, noseShape: 'bulbous', eyes: 'squint', brows: 'bushy', mouth: 'closed', hat: 'none', hair: 'swept', beard: 'none', mustache: 'full', ears: true } },
  { id: 'santa', name: 'Santa', set: { faceLen: 1, smile: 0.7, age: 0.5, nose: 1.05, noseShape: 'bulbous', eyes: 'squint', brows: 'bushy', mouth: 'closed', hat: 'stocking', hair: 'none', beard: 'long', mustache: 'full', ears: false } },
  { id: 'wizard', name: 'Wizard', set: { faceLen: 1.1, smile: 0, age: 0.85, nose: 1.15, noseShape: 'hooked', eyes: 'open', brows: 'bushy', mouth: 'closed', hat: 'wizard', hair: 'none', beard: 'pointed', mustache: 'walrus', ears: false } },
  { id: 'gnome', name: 'Garden gnome', set: { faceLen: 0.95, smile: 0.5, age: 0.3, nose: 1.35, noseShape: 'bulbous', eyes: 'hidden', brows: 'plain', mouth: 'closed', hat: 'gnome', hair: 'none', beard: 'long', mustache: 'full', ears: false } },
  { id: 'cowboy', name: 'Cowboy', set: { faceLen: 1.05, smile: 0.2, age: 0.45, nose: 1, noseShape: 'straight', eyes: 'squint', brows: 'plain', mouth: 'closed', hat: 'brimmed', hair: 'none', beard: 'short', mustache: 'handlebar', ears: true } },
  { id: 'grump', name: 'Old grump', set: { faceLen: 1.05, smile: -0.8, age: 0.85, nose: 1.15, noseShape: 'hooked', eyes: 'open', brows: 'bushy', mouth: 'closed', hat: 'none', hair: 'none', beard: 'none', mustache: 'none', ears: true } },
  { id: 'laugh', name: 'Laughing', set: { faceLen: 0.95, smile: 1, age: 0.35, nose: 1, noseShape: 'bulbous', eyes: 'closed', brows: 'plain', mouth: 'open', hat: 'none', hair: 'curly', beard: 'none', mustache: 'none', ears: true } },
  { id: 'spirit', name: 'Wood spirit', set: { faceLen: 1.15, smile: -0.2, age: 0.9, nose: 1.25, noseShape: 'hooked', eyes: 'open', brows: 'bushy', mouth: 'open', hat: 'none', hair: 'swept', beard: 'pointed', mustache: 'walrus', ears: false } },
];

// accept parameters saved by older versions and fill anything missing
export function normalizeFace(P) {
  const o = { ...FACE_DEFAULT, ...P };
  if (o.hair === true) o.hair = 'swept';
  if (o.hair === false) o.hair = 'none';
  if (o.beard === true) o.beard = 'long';
  if (o.beard === false) o.beard = 'none';
  for (const k in FACE_OPTIONS) if (!FACE_OPTIONS[k].some(([id]) => id === o[k])) o[k] = FACE_DEFAULT[k];
  if (o.hat === 'gnome') o.eyes = 'hidden';
  if (o.eyes === 'hidden' && o.hat !== 'gnome') o.eyes = 'open';
  o.ears = !!o.ears;
  return o;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// ---------------------------------------------------------------- geometry
export function faceGeom(Pin) {
  const P = normalizeFace(Pin);
  const a = P.a, H = P.H, F = 1.25 * a * clamp(P.faceLen, 0.8, 1.25), zt = H / 2;
  const nk = clamp(P.nose, 0.6, 1.5);
  const g = { a, H, F, zt, nk, sMax: a / R2 };
  g.zBrow = zt - { none: 0.42, stocking: 0.78, wizard: 0.9, brimmed: 0.62, gnome: 0.62 }[P.hat] * F;
  g.noseL = 0.36 * F * (P.noseShape === 'hooked' ? 1.12 : 1);
  g.zNose = g.zBrow - g.noseL;
  g.zMouth = g.zNose - 0.16 * F;
  g.zChin = g.zMouth - 0.30 * F;
  g.zBeard = { none: g.zChin, short: g.zChin - 0.14 * F, long: g.zChin - 0.40 * F, pointed: g.zChin - 0.46 * F }[P.beard];
  g.zNeck = g.zBeard - 0.32 * F;          // bottom of the under-chin notch
  g.zHandle = g.zNeck - 0.1 * F;          // below this the stick stays square: it's your handle
  g.Db = 0.22 * a;                         // brow notch depth
  g.Dn = 0.20 * a * nk;                    // how far the nose stands proud of the cheeks
  g.nwT = 0.055 * a;                       // nose half-width at the bridge
  g.nwB = 0.13 * a * nk * (P.noseShape === 'bulbous' ? 1.25 : 1);
  g.cw = 0.36 * a;                         // how far the cheek cut fades out sideways
  g.mw = 0.25 * a;                         // half-width of the mouth mound
  g.Dm = 0.12 * a;
  g.Dch = 0.24 * a;                        // under-chin notch depth
  g.se = g.nwT + 0.12 * a;                 // eye centre, lateral
  g.zEye = g.zBrow - 0.10 * F;
  g.ew = 0.085 * a;
  g.eh = { open: 0.04, wide: 0.055, squint: 0.018, closed: 0.04, hidden: 0.04 }[P.eyes] * a;
  g.round = 0.07 * a;                      // round-over radius
  // hats: bottom edge (zHB) and brim/cuff height (tb)
  const hat = {
    none: [null, 0], stocking: [g.zBrow + 0.06 * F, 0.18 * F], wizard: [g.zBrow + 0.05 * F, 0.06 * F],
    brimmed: [g.zBrow + 0.04 * F, 0.06 * F], gnome: [g.zBrow, 0],
  }[P.hat];
  g.zHB = hat[0]; g.tb = hat[1];
  // top of the bare forehead (for wrinkles): the hat edge, the hairline, or high on a bald head
  g.zForeTop = g.zHB != null ? g.zHB : P.hair !== 'none' ? g.zBrow + 0.19 * F : g.zBrow + 0.3 * F;
  // half-width of the mouth mound / beard at height z
  g.mwAt = z => {
    const mw = g.mw;
    if (P.beard === 'none') return mw * (1 - 0.22 * clamp((g.zNose - z) / (g.zNose - g.zChin), 0, 1));
    if (z > g.zMouth) return mw;
    const t = clamp((g.zMouth - z) / (g.zMouth - g.zBeard), 0, 1);
    if (P.beard === 'short') return mw + (0.33 * a - mw) * Math.sin(Math.min(1, t * 2) * Math.PI / 2) * Math.sqrt(Math.max(0, 1 - Math.max(0, t - 0.55) / 0.45 * 0.85));
    if (P.beard === 'pointed') return mw + (0.32 * a - mw) * Math.sin(Math.min(1, t * 2.2) * Math.PI / 2) - (t > 0.45 ? (t - 0.45) / 0.55 * 0.26 * a : 0);
    return mw + (0.36 * a - mw) * Math.sin(Math.min(1, t * 1.6) * Math.PI / 2) - (t > 0.6 ? (t - 0.6) / 0.4 * 0.2 * a : 0);
  };
  g.P = P;
  return g;
}
// shortest stick that fits this face plus a handle of 1.25 × the stick width, rounded up to 1/2"
export function minStickLength(P) {
  const g = faceGeom({ ...P, H: 1000 });
  const need = (g.zt - g.zHandle) + 1.25 * g.a;
  return Math.ceil(need / (IN / 2)) * (IN / 2);
}
export const noseHalf = (g, z) => g.nwT + (g.nwB - g.nwT) * clamp((g.zBrow - z) / g.noseL, 0, 1);

// ---------------------------------------------------------------- removal shapes (s, q, z)
function notch(zs, depth, len) {
  const n = Math.hypot(1, depth / len);
  return (s, q, z) => Math.min(zs - z, (depth * (z - (zs - len)) / len - q) / n);
}
function sideWedge(z0, z1, half, D, cw) {
  const n = Math.hypot(1, D / cw);
  return (s, q, z) => {
    const as = Math.abs(s), w = half(z);
    return Math.min(as - w, (D * (1 - (as - w) / cw) - (q - as)) / n * 0.75, z - z0, z1 - z);
  };
}

// polyline tube for detail lines; pts are xyz on the surface
function tube(pts, r) {
  if (pts.length < 2) return () => -1;
  const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let i = 0; i < 3; i++) { bb[i] = Math.min(bb[i], p[i] - r); bb[i + 3] = Math.max(bb[i + 3], p[i] + r); }
  return (x, y, z) => {
    if (x < bb[0] || y < bb[1] || z < bb[2] || x > bb[3] || y > bb[4] || z > bb[5]) return -1;
    let d2 = Infinity;
    for (let i = 0; i + 1 < pts.length; i++) {
      const A = pts[i], B = pts[i + 1];
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
      const wx = x - A[0], wy = y - A[1], wz = z - A[2];
      const L = ux * ux + uy * uy + uz * uz;
      const t = L > 0 ? clamp((wx * ux + wy * uy + wz * uz) / L, 0, 1) : 0;
      const dx = wx - ux * t, dy = wy - uy * t, dz = wz - uz * t;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < d2) d2 = d;
    }
    return r - Math.sqrt(d2);
  };
}
const unionOf = fns => (x, y, z) => { let v = -1e9; for (const f of fns) { const w = f(x, y, z); if (w > v) v = w; } return v; };

// depth q of the surface of `field` at (s, z), seen from the corner
export function qSurf(field, a, s, z, qmax = a) {
  let q = Math.max(-1, Math.abs(s) - 1), prev = q;
  for (; q < qmax; q += 0.3) {
    const p = toXYZ(s, q, z, a);
    if (field(p[0], p[1], p[2]) > 0) break;
    prev = q;
  }
  if (q >= qmax) return NaN;
  let lo = prev, hi = q;
  for (let i = 0; i < 12; i++) {
    const m = (lo + hi) / 2, p = toXYZ(s, m, z, a);
    if (field(p[0], p[1], p[2]) > 0) hi = m; else lo = m;
  }
  return (lo + hi) / 2;
}

// height map of `field` over a box in (s, z); bilinear lookup
function heightMap(field, a, s0, s1, z0, z1, h = 0.4) {
  const ns = Math.max(2, Math.ceil((s1 - s0) / h) + 1), nz = Math.max(2, Math.ceil((z1 - z0) / h) + 1);
  const hsx = (s1 - s0) / (ns - 1), hz = (z1 - z0) / (nz - 1);
  const m = new Float32Array(ns * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < ns; i++) {
    const v = qSurf(field, a, s0 + i * hsx, z0 + j * hz);
    m[i + ns * j] = isFinite(v) ? v : a;
  }
  return (s, z) => {
    let fx = (s - s0) / hsx, fz = (z - z0) / hz;
    fx = clamp(fx, 0, ns - 1.0001); fz = clamp(fz, 0, nz - 1.0001);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, o = i + ns * j;
    return (m[o] * (1 - tx) + m[o + 1] * tx) * (1 - tz) + (m[o + ns] * (1 - tx) + m[o + ns + 1] * tx) * tz;
  };
}

// set a region (2D mask in s,z: > 0 inside) back by `depth` below the current surface
// `depth` may be a number or a function of (s, z) so a cut can fade out instead of leaving a step
function setback(field, a, mask, depth, box) {
  const hm = heightMap(field, a, ...box);
  const dep = typeof depth === 'function' ? depth : () => depth;
  return (s, q, z) => {
    if (s < box[0] || s > box[1] || z < box[2] || z > box[3]) return -1;
    // the small allowance keeps interpolation error in the height map from shaving a visible step
    return Math.min(mask(s, z), hm(s, z) + dep(s, z) - 0.3 - q);
  };
}
const ellipse = (cs, cz, rs, rz) => (s, z) => (1 - Math.hypot((s - cs) / rs, (z - cz) / rz)) * Math.min(rs, rz);

// ---------------------------------------------------------------- the cut list
export function buildCuts(Pin) {
  const P = normalizeFace(Pin);
  const g = faceGeom(P), a = g.a, F = g.F, sMax = g.sMax;
  const half = z => noseHalf(g, z);
  const stock = (x, y, z) => Math.min(a / 2 - Math.abs(x), a / 2 - Math.abs(y), g.H / 2 - Math.abs(z));
  const viaSQ = f => (x, y, z) => { const [s, q] = toSQ(x, y, a); return f(s, q, z); };
  const cuts = [];

  // running field: `base` plus removals since the last round-over
  let base = stock, extra = [];
  const cur = () => { const b = base, ex = extra.slice(); return (x, y, z) => { let v = b(x, y, z); for (const f of ex) { const w = -f(x, y, z); if (w < v) v = w; } return v; }; };
  const add = c => { cuts.push(c); if (c.replace) { base = c.replace; extra = []; } else extra.push(c.fn); };
  const onSurf = curve => { const f = cur(); return curve.map(([s, z]) => { const q = qSurf(f, a, s, z); return isFinite(q) ? toXYZ(s, q, z, a) : null; }).filter(Boolean); };
  const sample = (f, t0, t1, n = 18) => { const o = []; for (let i = 0; i <= n; i++) o.push(f(t0 + (t1 - t0) * i / n)); return o; };
  const grooves = (curves, r) => unionOf(curves.map(c => tube(onSurf(c), r)));
  const both = f => [f(-1), f(1)];

  // ---- roughing: notches and planes
  const gnome = P.hat === 'gnome';
  add({ id: 'brow', title: gnome ? 'Under the hat brim' : 'Brow notch', blades: ['detail', 'pelican'],
    fn: viaSQ(notch(g.zBrow, g.Db, g.noseL * (P.noseShape === 'hooked' ? 0.55 : 0.92))),
    lines: [[[-a, g.zBrow], [a, g.zBrow]]] });
  add({ id: 'underNose', title: 'Under the nose', blades: ['detail', 'pelican'], fn: viaSQ(notch(g.zNose, g.Dn, 0.42 * F)),
    lines: [[[-a, g.zNose], [a, g.zNose]]] });
  {
    const zs = sample(t => g.zNose + (g.zBrow - g.zNose) * t, 0, 1, 8);
    add({ id: 'nose', title: 'Nose and cheeks', blades: ['detail', 'pelican'], fn: viaSQ(sideWedge(g.zNose, g.zBrow, half, g.Dn, g.cw)),
      lines: [zs.map(z => [-half(z), z]), zs.map(z => [half(z), z])] });
  }
  {
    const zs = sample(t => g.zNose - (g.zNose - g.zBeard) * t, 0, 1, 16);
    add({ id: 'mouth', title: P.beard !== 'none' ? 'Mouth and beard' : 'Mouth mound', blades: ['detail', 'pelican'], fn: viaSQ(sideWedge(g.zBeard, g.zNose, g.mwAt, g.Dm, 0.3 * a)),
      lines: [zs.map(z => [-g.mwAt(z), z]), zs.map(z => [g.mwAt(z), z])] });
  }
  add({ id: 'chin', title: P.beard !== 'none' ? 'Under the beard' : 'Under the chin', blades: ['detail', 'pelican'], fn: viaSQ(notch(g.zBeard, g.Dch, g.zBeard - g.zNeck)),
    lines: [[[-a, g.zBeard], [a, g.zBeard]]] });

  // ---- hat or head
  if (g.zHB != null && g.zHB > g.zBrow + 1) {
    const box = [-sMax, sMax, g.zBrow, g.zHB];
    const mask = (s, z) => Math.min(z - g.zBrow, g.zHB - z, sMax * 0.98 - Math.abs(s));
    add({ id: 'hatBand', title: P.hat === 'stocking' ? 'Under the cap' : 'Under the brim', blades: ['detail', 'pelican'],
      fn: viaSQ(setback(cur(), a, mask, 0.06 * a, box)), lines: [[[-a, g.zHB], [a, g.zHB]]] });
  }
  if (P.hat === 'none') {
    const zc = g.zBrow - 0.05 * F, rxy = a / R2, rz = (g.zt - zc) * 1.02, m = Math.min(rxy, rz);
    add({ id: 'head', title: 'Round the top of the head', blades: ['pelican'], fn: (x, y, z) => Math.min((Math.hypot(x / rxy, y / rxy, (z - zc) / rz) - 1) * m, z - zc), lines: [] });
  } else {
    const R0 = sMax, zHB = g.zHB, tb = g.tb, zt = g.zt;
    const back = [-1 / R2, 1 / R2];         // away from the face corner
    const axis = (z, lean) => [back[0] * lean, back[1] * lean];
    let hatF;
    if (P.hat === 'stocking') {
      const z1 = zHB + tb, rp = 0.17 * a;
      const leanAt = z => 0.3 * a * Math.pow(clamp((z - z1) / (zt - z1), 0, 1), 2);
      const pc = axis(zt - rp, leanAt(zt - rp));
      hatF = (x, y, z) => {
        const cuff = Math.min(R0 * 0.97 - Math.hypot(x, y), z - zHB, z1 + 0.5 - z);
        const t = clamp((z - z1) / (zt - z1), 0, 1), c = axis(z, leanAt(z));
        const body = Math.min((R0 * (0.86 - 0.62 * t) - Math.hypot(x - c[0], y - c[1])) * 0.9, z - z1 + 0.5, zt - z);
        const pom = rp - Math.hypot(x - pc[0], y - pc[1], z - (zt - rp));
        return Math.max(cuff, body, pom);
      };
    } else if (P.hat === 'wizard') {
      const z1 = zHB + tb;
      hatF = (x, y, z) => {
        const brim = Math.min(R0 * 0.97 - Math.hypot(x, y), z - zHB, z1 + 0.5 - z);
        const t = clamp((z - z1) / (zt - z1), 0, 1);
        const cone = Math.min((R0 * 0.72 * (1 - t) + 0.02 * a - Math.hypot(x, y)) * 0.85, z - z1 + 0.5, zt - z);
        return Math.max(brim, cone);
      };
    } else if (P.hat === 'brimmed') {
      const z1 = zHB + tb, k = 0.12 * a;
      hatF = (x, y, z) => {
        const brim = Math.min(R0 * 0.98 - Math.hypot(x, y), z - zHB, z1 + 0.5 - z);
        const crown = Math.min(smin(R0 * 0.7 - Math.hypot(x, y), zt - 0.5 - z, k), z - z1 + 0.5);
        return Math.max(brim, crown);
      };
    } else { // gnome
      const leanAt = z => 0.25 * a * Math.pow(clamp((z - zHB) / (zt - zHB), 0, 1), 2);
      hatF = (x, y, z) => {
        const t = clamp((z - zHB) / (zt - zHB), 0, 1), c = axis(z, leanAt(z));
        return Math.min((R0 * (0.97 - 0.9 * t) + 0.04 * a - Math.hypot(x - c[0], y - c[1])) * 0.85, zt - z);
      };
    }
    const name = { stocking: 'Shape the stocking cap', wizard: 'Shape the wizard hat', brimmed: 'Shape the brimmed hat', gnome: 'Shape the gnome hat' }[P.hat];
    const zLo = zHB + (P.hat === 'gnome' ? 0 : 0);
    add({ id: 'head', title: name, blades: ['detail', 'pelican'], fn: (x, y, z) => Math.min(-hatF(x, y, z), z - zLo),
      lines: tb ? [[[-a, zHB + tb], [a, zHB + tb]]] : [] });
  }

  // ---- round over
  {
    const planar = cuts.map(c => c.fn);
    const kAt = z => g.round * clamp((z - g.zHandle) / (0.15 * F), 0, 1);
    const rounded = (x, y, z) => {
      const k = kAt(z);
      let v = smin(a / 2 - Math.abs(x), a / 2 - Math.abs(y), k);
      v = smin(v, g.H / 2 - z, k);
      for (const f of planar) v = smin(v, -f(x, y, z), k);
      return Math.min(v, g.H / 2 + z);
    };
    add({ id: 'round', title: 'Round over the face', blades: ['pelican', 'detail'], replace: rounded, lines: [] });
  }

  // ---- shaping features
  if (P.ears) {
    const zc = (g.zEye + g.zNose) / 2 + 0.03 * F, rz = 0.42 * g.noseL, rs = 0.065 * a, cs = 0.82 * sMax, rw = 0.05 * a;
    const fns = both(sg => {
      const ear = ellipse(sg * cs, zc, rs, rz), ring = ellipse(sg * cs, zc, rs + rw, rz + rw);
      const inner = ellipse(sg * (cs - 0.012 * a), zc + 0.01 * F, rs * 0.55, rz * 0.6);
      const box = [sg > 0 ? cs - rs - rw - 1 : -sMax, sg > 0 ? sMax : -(cs - rs - rw - 1), zc - rz - rw - 1, zc + rz + rw + 1];
      const f = cur();
      const around = setback(f, a, (s, z) => Math.min(ring(s, z), -ear(s, z)), (s, z) => 0.05 * a * clamp(1 + ear(s, z) / rw, 0, 1), box);
      const hollow = setback(f, a, inner, 0.035 * a, box);
      return (s, q, z) => Math.max(around(s, q, z), hollow(s, q, z));
    });
    add({ id: 'ears', title: 'Ears', blades: ['detail', 'scorp'], fn: viaSQ((s, q, z) => Math.max(fns[0](s, q, z), fns[1](s, q, z))),
      lines: both(sg => sample(t => [sg * (0.82 * sMax + Math.cos(t) * 0.065 * a), (g.zEye + g.zNose) / 2 + 0.03 * F + Math.sin(t) * 0.42 * g.noseL], 0, 2 * Math.PI, 24)) });
  }
  if (P.noseShape === 'hooked') {
    const L = 0.35 * g.noseL, D = 0.55 * g.Dn;
    add({ id: 'noseShape', title: 'Hook the nose', blades: ['pelican', 'detail'],
      fn: viaSQ((s, q, z) => Math.min(z - g.zNose, g.zNose + L - z, D * (1 - (z - g.zNose) / L) - q, g.nwB + 1.5 - Math.abs(s))), lines: [] });
  } else if (P.noseShape === 'bulbous') {
    const rb = g.nwB, zc = g.zNose + rb * 0.95, qc = rb * 1.05;
    add({ id: 'noseShape', title: 'Round the nose tip', blades: ['pelican', 'detail'],
      fn: viaSQ((s, q, z) => Math.min(Math.hypot(s, (q - qc) * 0.9, z - zc) - rb, g.zNose + 2.1 * rb - z, z - (g.zNose - 0.1 * rb), rb + 2 - Math.abs(s), qc - q + 0.5)), lines: [] });
  }

  // mustache outline (2D, > 0 inside) and the cut that sets the lip around it back
  let mustacheMask = null, mustacheBottom = null;
  if (P.mustache !== 'none') {
    const wm = g.mwAt(g.zMouth) * { full: 1.1, handlebar: 1.3, walrus: 1.2 }[P.mustache];
    if (P.mustache === 'full') {
      mustacheBottom = s => g.zMouth + 0.02 * F - 0.07 * F * Math.pow(Math.abs(s) / wm, 2);
      mustacheMask = (s, z) => Math.min(g.zNose - 0.005 * F - z, z - mustacheBottom(s), wm - Math.abs(s));
    } else if (P.mustache === 'walrus') {
      mustacheBottom = s => g.zMouth - 0.05 * F - 0.04 * F * Math.pow(Math.abs(s) / wm, 2);
      mustacheMask = (s, z) => Math.min(g.zNose - z, z - mustacheBottom(s), wm - Math.abs(s));
    } else {
      const c = s => { const u = Math.abs(s) / wm; return g.zNose - 0.06 * F - 0.04 * F * u * u + 0.3 * F * Math.pow(Math.max(0, u - 0.62), 2); };
      const th = s => 0.08 * F * (1 - 0.65 * Math.pow(Math.abs(s) / wm, 2));
      mustacheBottom = s => c(s) - th(s) / 2;
      const patch = (s, z) => Math.min(g.nwB * 1.3 - Math.abs(s), g.zNose - z, z - c(s));
      mustacheMask = (s, z) => Math.max(Math.min(th(s) / 2 - Math.abs(z - c(s)), wm - Math.abs(s)), patch(s, z));
    }
    const zLow = Math.min(mustacheBottom(0), mustacheBottom(wm)) - 0.1 * F;
    const box = [-(wm + 0.1 * a), wm + 0.1 * a, zLow, g.zNose];
    const region = (s, z) => Math.min(wm + 0.08 * a - Math.abs(s), z - zLow, g.zNose - 0.002 * F - z);
    const fade = 0.07 * a;
    add({ id: 'mustache', title: 'Mustache', blades: ['detail', 'pelican'],
      fn: viaSQ(setback(cur(), a, (s, z) => Math.min(region(s, z), -mustacheMask(s, z)), (s, z) => 0.045 * a * clamp(1 + mustacheMask(s, z) / fade, 0, 1), box)),
      lines: both(sg => sample(t => [sg * t * wm, mustacheBottom(t * wm)], 0, 1, 14)) });
  }

  if (P.eyes !== 'hidden') {
    const f = cur(), big = P.eyes === 'wide' ? 1.2 : 1;
    const sockets = both(sg => {
      const se = sg * g.se, qs = qSurf(f, a, se, g.zEye);
      const rs = 0.10 * a * big, rzz = 0.07 * a * big, rq = 0.055 * a, q0 = qs + 0.35 * rq, m = Math.min(rs, rzz, rq);
      return (s, q, z) => (1 - Math.hypot((s - se) / rs, (q - q0) / rq, (z - g.zEye) / rzz)) * m;
    });
    add({ id: 'sockets', title: 'Eye sockets', blades: ['scorp'], fn: viaSQ((s, q, z) => Math.max(sockets[0](s, q, z), sockets[1](s, q, z))), lines: [] });
  }

  // ---- details
  if (P.eyes !== 'hidden') {
    const curves = [];
    for (const sg of [-1, 1]) {
      const se = sg * g.se, ew = g.ew * (P.eyes === 'wide' ? 1.1 : 1);
      if (P.eyes === 'closed') {
        curves.push(sample(t => [se + t * ew, g.zEye - g.eh * 0.4 * (1 - t * t)], -1, 1));
      } else {
        curves.push(sample(t => [se + t * ew, g.zEye + g.eh * (1 - t * t)], -1, 1));
        curves.push(sample(t => [se + t * ew, g.zEye - g.eh * 0.7 * (1 - t * t)], -1, 1));
      }
    }
    const lids = grooves(curves, 0.55);
    const pupils = P.eyes === 'closed' || P.eyes === 'squint' ? [] : both(sg => { const pt = onSurf([[sg * g.se, g.zEye]])[0]; return pt ? tube([pt, pt], P.eyes === 'wide' ? 1.2 : 1.0) : () => -1; });
    add({ id: 'eyes', title: 'Eyes', blades: pupils.length ? ['detail', 'gouge'] : ['detail'], fn: unionOf([lids, ...pupils]), lines: curves });
  }
  if (P.brows === 'bushy' && P.eyes !== 'hidden') {
    const curves = [];
    const k = 0.02 * F * -P.smile;
    for (const sg of [-1, 1]) for (let i = 0; i <= 6; i++) {
      const t = -1 + i / 3, s0 = sg * (g.se + t * g.ew * 1.15), z0 = g.zBrow - 0.012 * F + 0.012 * F * (1 - t * t) + k * t;
      curves.push([[s0, z0], [s0 + sg * 0.02 * a, z0 + 0.035 * F]]);
    }
    add({ id: 'brows', title: 'Eyebrows', blades: ['vscorp', 'detail'], fn: grooves(curves.map(c => sample(t => [c[0][0] + (c[1][0] - c[0][0]) * t, c[0][1] + (c[1][1] - c[0][1]) * t], 0, 1, 4)), 0.45), lines: curves });
  }
  {
    // nostril wings, plus the ball outline for a round tip
    const r = 0.16 * g.noseL, cz = g.zNose + 0.18 * g.noseL;
    const curves = both(sg => sample(t => [sg * (g.nwB * 0.85 + Math.cos(t) * r * 0.8), cz + Math.sin(t) * r], -Math.PI / 2, Math.PI * 0.75, 14));
    if (P.noseShape === 'bulbous') curves.push(sample(t => [Math.sin(t) * g.nwB * 0.9, g.zNose + g.nwB * 0.95 + Math.cos(t) * g.nwB * 0.95], -Math.PI * 0.75, Math.PI * 0.75, 20));
    add({ id: 'nostrils', title: P.noseShape === 'bulbous' ? 'Nose tip and nostrils' : 'Nostrils', blades: ['detail', 'vscorp'], fn: grooves(curves, 0.55), lines: curves });
  }
  if (P.mustache !== 'walrus') {
    const zM = P.mustache === 'none' ? g.zMouth : mustacheBottom(0) - 0.015 * F;
    const w = (P.mustache === 'none' ? 0.78 : 0.5) * g.mwAt(g.zMouth), lift = P.smile * 0.07 * a;
    const curve = sample(t => [t * w, zM + lift * t * t - lift * 0.15], -1, 1, 20);
    if (P.mouth === 'open') {
      const h = 0.03 * a * (1 + Math.max(0, P.smile)), zc = zM - h * 0.6;
      const mask = (s, z) => { const u = s / w; return Math.min(1 - Math.abs(u), z - (zc - h * (1 - u * u) * (1.2 + Math.max(0, P.smile))), (zM + lift * u * u - lift * 0.15) - z) * w * 0.2; };
      const box = [-w - 1, w + 1, zc - 2.5 * h - 2, zM + Math.abs(lift) + 2];
      add({ id: 'openMouth', title: 'Open mouth', blades: ['detail', 'gouge'], fn: viaSQ(setback(cur(), a, mask, 0.1 * a, box)), lines: [curve] });
    } else {
      add({ id: 'mouthLine', title: 'Mouth', blades: ['vscorp', 'detail'], fn: grooves([curve], 0.75), lines: [curve] });
    }
  }
  {
    const r = 0.6 + 0.35 * P.age;
    const curves = both(sg => sample(t => [sg * (g.nwB + 0.03 * a + t * (g.mwAt(g.zMouth) * 0.95 - g.nwB)), g.zNose + 0.02 * F - t * (0.2 * F)], 0, 1, 14));
    add({ id: 'smileLines', title: 'Smile lines', blades: ['vscorp'], fn: grooves(curves, r), lines: curves });
  }
  if (P.age > 0.25) {
    const curves = [];
    const room = g.zForeTop - g.zBrow;
    const nF = P.age > 0.7 ? 3 : P.age > 0.45 ? 2 : 1;
    for (let i = 0; i < nF; i++) {
      const z0 = g.zBrow + 0.06 * F + i * 0.045 * F;
      if (z0 > g.zBrow + room - 0.025 * F) break;
      curves.push(sample(t => [t * 0.5 * sMax, z0 + 0.008 * F * Math.sin(t * 5 + i) - 0.012 * F * t * t], -1, 1, 16));
    }
    if (P.eyes !== 'hidden' && P.age > 0.45) for (const sg of [-1, 1]) for (let i = -1; i <= 1; i++) {
      const s0 = sg * (g.se + g.ew * 1.15);
      curves.push(sample(t => [s0 + sg * t * 0.06 * a, g.zEye + i * 0.03 * F * t + i * 0.006 * F], 0, 1, 4));
    }
    if (P.eyes !== 'hidden' && (P.age > 0.6 || P.eyes === 'squint')) for (const sg of [-1, 1]) {
      curves.push(sample(t => [sg * g.se + t * g.ew * 0.9, g.zEye - g.eh * 0.7 - 0.035 * F * (1 - t * t)], -1, 1, 12));
    }
    if (curves.length) add({ id: 'wrinkles', title: 'Age lines', blades: ['vscorp', 'detail'], fn: grooves(curves, 0.5), lines: curves });
  }
  if (P.hat === 'none' && P.hair !== 'none') {
    const curves = [];
    if (P.hair === 'swept') {
      for (let i = -4; i <= 4; i++) {
        const s0 = i * 0.08 * a;
        curves.push(sample(t => [s0 * (1 + 0.5 * t) + 0.025 * a * Math.sin(t * 4 + i), g.zBrow + 0.2 * F + t * (g.zt - g.zBrow - 0.26 * F)], 0, 1, 16));
      }
    } else {
      const r = 0.035 * a;
      let row = 0;
      for (let z = g.zBrow + 0.24 * F; z < g.zt - 0.08 * F; z += 0.075 * F, row++) {
        for (let s0 = -0.85 * sMax + (row % 2) * 0.06 * a; s0 <= 0.85 * sMax; s0 += 0.12 * a) {
          const ph = (s0 * 7 + row * 1.3) % (2 * Math.PI);
          curves.push(sample(t => [s0 + r * Math.cos(t), z + r * Math.sin(t)], ph, ph + 1.5 * Math.PI, 8));
        }
      }
    }
    add({ id: 'hair', title: P.hair === 'curly' ? 'Curly hair' : 'Hair', blades: ['vscorp'], fn: grooves(curves, 0.65), lines: curves });
  }
  if (P.beard !== 'none') {
    const curves = [];
    const n = P.beard === 'short' ? 5 : 7, top = (P.mustache !== 'none' ? Math.min(mustacheBottom(0), g.zMouth) : g.zMouth) - 0.06 * F;
    for (let i = 0; i < n; i++) {
      const u = -1 + 2 * i / (n - 1);
      curves.push(sample(t => {
        const z = top - t * (top - g.zBeard - 0.05 * F);
        return [u * 0.8 * g.mwAt(z) + 0.02 * a * Math.sin(t * 5 + i * 1.7), z];
      }, 0, 1, 16));
    }
    add({ id: 'beard', title: 'Beard', blades: ['vscorp'], fn: grooves(curves, 0.7), lines: curves });
  }
  if (P.mustache !== 'none') {
    const curves = [];
    for (const sg of [-1, 1]) for (const f of [0.3, 0.6]) {
      curves.push(sample(t => {
        const s = sg * (g.nwB * 0.6 + t * (g.mwAt(g.zMouth) * 1.0 - g.nwB * 0.6));
        const zt = g.zNose - 0.01 * F, zb = mustacheBottom(s);
        return [s, zt - (zt - zb) * f - 0.01 * F * t];
      }, 0, 1, 10));
    }
    add({ id: 'mustacheTex', title: 'Mustache texture', blades: ['vscorp'], fn: grooves(curves, 0.5), lines: curves });
  }
  if (P.hat === 'stocking') {
    const curves = [];
    for (let s0 = -0.85 * sMax; s0 <= 0.85 * sMax; s0 += 0.07 * a) for (const zz of [0.3, 0.7]) {
      const z0 = g.zHB + g.tb * zz;
      curves.push([[s0 - 0.01 * a, z0 - 0.04 * F], [s0 + 0.01 * a, z0 + 0.04 * F]]);
    }
    add({ id: 'hatDetail', title: 'Fur on the cuff', blades: ['vscorp'], fn: grooves(curves.map(c => sample(t => [c[0][0] + (c[1][0] - c[0][0]) * t, c[0][1] + (c[1][1] - c[0][1]) * t], 0, 1, 3)), 0.5), lines: curves });
  } else if (P.hat === 'brimmed' || P.hat === 'wizard') {
    const z0 = g.zHB + g.tb + 0.05 * F;
    const curve = sample(t => [t * 0.62 * sMax, z0], -1, 1, 16);
    add({ id: 'hatDetail', title: 'Hat band', blades: ['vscorp'], fn: grooves([curve], 0.7), lines: [curve] });
  }

  // stage fields: stage 0 = stock, stage k = after cut k
  const stages = [stock];
  let b = stock, ex = [];
  for (const c of cuts) {
    if (c.replace) { b = c.replace; ex = []; } else ex = ex.concat([c.fn]);
    const bb = b, ee = ex.slice();
    stages.push((x, y, z) => { let v = bb(x, y, z); for (const f of ee) { const w = -f(x, y, z); if (w < v) v = w; } return v; });
  }
  return { g, P, cuts, stages, stock };
}

// ---------------------------------------------------------------- lattice model (for meshing)
export function buildFaceModel(Pin) {
  const { g, P, cuts, stages } = buildCuts(Pin);
  const dims = [P.a, P.a, P.H];
  const hTarget = Math.max(0.5, P.H / 300);
  const n = dims.map(d => Math.max(8, Math.round(d / hTarget)));
  const hs = dims.map((d, i) => d / n[i]);
  const s = n.map(v => v + 1);
  const N = s[0] * s[1] * s[2];
  const stride = [1, s[0], s[0] * s[1]];
  const org = dims.map(d => -d / 2);
  const hmin = Math.min(...hs);
  const cache = new Map();
  const model = {
    kind: 'face', P, g, cuts, stages, dims, n, hs, s, N, stride, org, hmin, Lmax: Math.max(...dims),
    lattice(k) {
      if (cache.has(k)) return cache.get(k);
      const f = stages[k], out = new Float32Array(N);
      let p = 0;
      for (let kk = 0; kk < s[2]; kk++) {
        const z = org[2] + kk * hs[2];
        // below the handle line nothing is ever cut: copy the stock
        for (let j = 0; j < s[1]; j++) {
          const y = org[1] + j * hs[1];
          for (let i = 0; i < s[0]; i++) out[p++] = z < g.zHandle - 2 ? Math.min(dims[0] / 2 - Math.abs(org[0] + i * hs[0]), dims[1] / 2 - Math.abs(y), dims[2] / 2 - Math.abs(z)) : f(org[0] + i * hs[0], y, z);
        }
      }
      if (cache.size > 3) { const first = cache.keys().next().value; if (first !== stages.length - 1) cache.delete(first); }
      cache.set(k, out);
      return out;
    },
  };
  model.solid = model.lattice(stages.length - 1);
  return model;
}
