// Triply periodic minimal surfaces (nodal approximations) with analytic gradients,
// the solid built from them, and principal curvature of any implicit solid.
// Convention everywhere: solid field > 0 inside the wood.

const TAU = Math.PI * 2;

function gyroid(x, y, z, g) {
  const sx = Math.sin(x), cx = Math.cos(x), sy = Math.sin(y), cy = Math.cos(y), sz = Math.sin(z), cz = Math.cos(z);
  if (g) { g[0] = cx * cy - sz * sx; g[1] = cy * cz - sx * sy; g[2] = cz * cx - sy * sz; }
  return sx * cy + sy * cz + sz * cx;
}

function schwarzP(x, y, z, g) {
  if (g) { g[0] = -Math.sin(x); g[1] = -Math.sin(y); g[2] = -Math.sin(z); }
  return Math.cos(x) + Math.cos(y) + Math.cos(z);
}

function schwarzD(x, y, z, g) {
  const sx = Math.sin(x), cx = Math.cos(x), sy = Math.sin(y), cy = Math.cos(y), sz = Math.sin(z), cz = Math.cos(z);
  if (g) {
    g[0] = cx * sy * sz + cx * cy * cz - sx * sy * cz - sx * cy * sz;
    g[1] = sx * cy * sz - sx * sy * cz + cx * cy * cz - cx * sy * sz;
    g[2] = sx * sy * cz - sx * cy * sz - cx * sy * sz + cx * cy * cz;
  }
  return sx * sy * sz + sx * cy * cz + cx * sy * cz + cx * cy * sz;
}

function neovius(x, y, z, g) {
  const sx = Math.sin(x), cx = Math.cos(x), sy = Math.sin(y), cy = Math.cos(y), sz = Math.sin(z), cz = Math.cos(z);
  if (g) {
    g[0] = -3 * sx - 4 * sx * cy * cz;
    g[1] = -3 * sy - 4 * cx * sy * cz;
    g[2] = -3 * sz - 4 * cx * cy * sz;
  }
  return 3 * (cx + cy + cz) + 4 * cx * cy * cz;
}

function iwp(x, y, z, g) {
  const sx = Math.sin(x), cx = Math.cos(x), sy = Math.sin(y), cy = Math.cos(y), sz = Math.sin(z), cz = Math.cos(z);
  if (g) {
    g[0] = -2 * sx * (cy + cz) + 2 * Math.sin(2 * x);
    g[1] = -2 * sy * (cx + cz) + 2 * Math.sin(2 * y);
    g[2] = -2 * sz * (cx + cy) + 2 * Math.sin(2 * z);
  }
  return 2 * (cx * cy + cy * cz + cz * cx) - (Math.cos(2 * x) + Math.cos(2 * y) + Math.cos(2 * z));
}

export const SURFACES = [
  { id: 'gyroid', name: 'Gyroid', fn: gyroid, note: 'Alan Schoen, 1970. Two interlocking labyrinths with no straight lines and no mirror planes.' },
  { id: 'schwarzP', name: 'Schwarz P', fn: schwarzP, note: 'Hermann Schwarz, 1865. Straight tunnels along all three axes meeting in round chambers.' },
  { id: 'schwarzD', name: 'Schwarz D (diamond)', fn: schwarzD, note: 'Hermann Schwarz, 1865. Passages laid out like the bonds of a diamond crystal.' },
  { id: 'neovius', name: 'Neovius', fn: neovius, note: 'E. R. Neovius, 1883. Big chambers joined by narrow necks.' },
  { id: 'iwp', name: 'I-WP', fn: iwp, note: 'Alan Schoen. Chambers at the cube centre linked to chambers at the corners.' },
];
export const SURF_BY_ID = Object.fromEntries(SURFACES.map(s => [s.id, s]));

export const MODES = [
  { id: 'netA', name: 'Network', long: 'network solid (one of the two labyrinths filled with wood)' },
  { id: 'netB', name: 'Network (other side)', long: 'network solid (the other labyrinth filled with wood)' },
  { id: 'sheet', name: 'Sheet', long: 'sheet (a curved wall of even thickness)' },
];

export const BOUNDS = [
  { id: 'box', name: 'Block' },
  { id: 'sphere', name: 'Sphere' },
  { id: 'cylinder', name: 'Cylinder' },
];

const gTyp = {};
function typicalGrad(S) {
  if (gTyp[S.id]) return gTyp[S.id];
  let seed = 12345, acc = 0;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const g = [0, 0, 0];
  for (let i = 0; i < 4096; i++) {
    S.fn(rnd() * TAU, rnd() * TAU, rnd() * TAU, g);
    acc += g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
  }
  return (gTyp[S.id] = Math.sqrt(acc / 4096));
}

// P: { surface, cell, phase:[3], mode, thickness, fill, bound, W, D, H, boundEps }
export function makeField(P) {
  const S = SURF_BY_ID[P.surface] || SURFACES[0];
  const k = TAU / P.cell;
  const ox = (P.phase?.[0] || 0) * TAU, oy = (P.phase?.[1] || 0) * TAU, oz = (P.phase?.[2] || 0) * TAU;
  const gmin = 0.15 * typicalGrad(S);
  const g = [0, 0, 0];
  // Approximate signed distance (mm) to the surface f = 0.
  const dist = (x, y, z) => {
    const f = S.fn(x * k + ox, y * k + oy, z * k + oz, g);
    let m = Math.sqrt(g[0] * g[0] + g[1] * g[1] + g[2] * g[2]);
    if (m < gmin) m = gmin;
    return f / (m * k);
  };
  const half = (P.thickness || 6) / 2, fill = P.fill || 0;
  let tpms;
  if (P.mode === 'sheet') tpms = (x, y, z) => half - Math.abs(dist(x, y, z));
  else if (P.mode === 'netB') tpms = (x, y, z) => fill - dist(x, y, z);
  else tpms = (x, y, z) => dist(x, y, z) + fill;

  const W2 = P.W / 2, D2 = P.D / 2, H2 = P.H / 2, eps = P.boundEps || 0;
  let bound, boundExcept;
  if (P.bound === 'sphere') {
    const R = Math.min(P.W, P.D, P.H) / 2;
    bound = (x, y, z) => R - Math.sqrt(x * x + y * y + z * z);
    boundExcept = (a, x, y, z) => bound(x, y, z);
  } else if (P.bound === 'cylinder') {
    const R = Math.min(P.W, P.D) / 2;
    bound = (x, y, z) => Math.min(R - Math.sqrt(x * x + y * y), H2 - Math.abs(z) + eps);
    boundExcept = (a, x, y, z) => a === 2 ? R - Math.sqrt(x * x + y * y) : bound(x, y, z);
  } else {
    const half = [W2, D2, H2];
    bound = (x, y, z) => Math.min(W2 - Math.abs(x), D2 - Math.abs(y), H2 - Math.abs(z)) + eps;
    boundExcept = (a, x, y, z) => {
      const q = [x, y, z];
      let m = Infinity;
      for (let i = 0; i < 3; i++) if (i !== a) m = Math.min(m, half[i] - Math.abs(q[i]));
      return m + eps;
    };
  }
  return {
    S, dist, tpms, bound, boundExcept,
    solid: (x, y, z) => { const a = tpms(x, y, z), b = bound(x, y, z); return a < b ? a : b; },
  };
}

// Principal curvatures [kmin, kmax] of the level set s = 0 through (x,y,z), with the
// normal pointing OUT of the solid (s > 0 inside). Negative curvature = concave = a hollow.
export function principalCurvatures(s, x, y, z, e) {
  const f0 = s(x, y, z);
  const fxp = s(x + e, y, z), fxm = s(x - e, y, z);
  const fyp = s(x, y + e, z), fym = s(x, y - e, z);
  const fzp = s(x, y, z + e), fzm = s(x, y, z - e);
  const gx = (fxp - fxm) / (2 * e), gy = (fyp - fym) / (2 * e), gz = (fzp - fzm) / (2 * e);
  const gm = Math.sqrt(gx * gx + gy * gy + gz * gz);
  if (gm < 1e-9) return null;
  const e2 = e * e, e4 = 4 * e2;
  const hxx = (fxp - 2 * f0 + fxm) / e2, hyy = (fyp - 2 * f0 + fym) / e2, hzz = (fzp - 2 * f0 + fzm) / e2;
  const hxy = (s(x + e, y + e, z) - s(x + e, y - e, z) - s(x - e, y + e, z) + s(x - e, y - e, z)) / e4;
  const hxz = (s(x + e, y, z + e) - s(x + e, y, z - e) - s(x - e, y, z + e) + s(x - e, y, z - e)) / e4;
  const hyz = (s(x, y + e, z + e) - s(x, y + e, z - e) - s(x, y - e, z + e) + s(x, y - e, z - e)) / e4;
  const nx = -gx / gm, ny = -gy / gm, nz = -gz / gm;
  const P = [
    [1 - nx * nx, -nx * ny, -nx * nz],
    [-ny * nx, 1 - ny * ny, -ny * nz],
    [-nz * nx, -nz * ny, 1 - nz * nz],
  ];
  const H = [[hxx, hxy, hxz], [hxy, hyy, hyz], [hxz, hyz, hzz]];
  const PH = mul3(P, H), M = mul3(PH, P);
  const sc = -1 / gm;
  const m00 = M[0][0] * sc, m11 = M[1][1] * sc, m22 = M[2][2] * sc;
  const m01 = M[0][1] * sc, m02 = M[0][2] * sc, m12 = M[1][2] * sc;
  const m10 = M[1][0] * sc, m20 = M[2][0] * sc, m21 = M[2][1] * sc;
  const tr = m00 + m11 + m22;
  const I2 = m00 * m11 - m01 * m10 + m00 * m22 - m02 * m20 + m11 * m22 - m12 * m21;
  const sq = Math.sqrt(Math.max(0, tr * tr - 4 * I2));
  return [(tr - sq) / 2, (tr + sq) / 2];
}

function mul3(A, B) {
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
  return C;
}
