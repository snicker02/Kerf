// Reading 3D model files into a plain triangle soup, plus welding, checks and placement.
// Formats: OBJ, STL (ASCII and binary), PLY (ASCII and binary), OFF, glTF binary (.glb) and
// glTF JSON with embedded buffers. Output: { positions: Float32Array (x,y,z per vertex),
// indices: Uint32Array (3 per triangle) }.

export const MESH_EXTS = ['obj', 'stl', 'ply', 'off', 'glb', 'gltf'];

export function parseMesh(name, buffer) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const bytes = new Uint8Array(buffer);
  let m;
  if (ext === 'obj') m = parseOBJ(text(bytes));
  else if (ext === 'stl') m = parseSTL(buffer);
  else if (ext === 'ply') m = parsePLY(buffer);
  else if (ext === 'off') m = parseOFF(text(bytes));
  else if (ext === 'glb') m = parseGLB(buffer);
  else if (ext === 'gltf') m = parseGLTF(JSON.parse(text(bytes)), null);
  else throw new Error(`Kerf can't read .${ext} files. Use OBJ, STL, PLY, OFF, GLB or glTF.`);
  if (!m.indices.length) throw new Error('No triangles found in this file.');
  return m;
}

const text = bytes => new TextDecoder().decode(bytes);

// ---------------------------------------------------------------- OBJ
function parseOBJ(src) {
  const pos = [], idx = [];
  const lines = src.split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    let line = lines[li];
    while (line.endsWith('\\') && li + 1 < lines.length) line = line.slice(0, -1) + ' ' + lines[++li];
    if (line.length < 2) continue;
    const c0 = line.charCodeAt(0), c1 = line.charCodeAt(1);
    if (c0 === 118 && (c1 === 32 || c1 === 9)) { // 'v '
      const t = line.trim().split(/\s+/);
      pos.push(+t[1], +t[2], +t[3]);
    } else if (c0 === 102 && (c1 === 32 || c1 === 9)) { // 'f '
      const t = line.trim().split(/\s+/);
      const nv = pos.length / 3;
      const vi = [];
      for (let k = 1; k < t.length; k++) {
        let v = parseInt(t[k], 10);
        if (!Number.isFinite(v)) continue;
        v = v < 0 ? nv + v : v - 1;
        vi.push(v);
      }
      for (let k = 1; k + 1 < vi.length; k++) idx.push(vi[0], vi[k], vi[k + 1]);
    }
  }
  return finish(pos, idx);
}

// ---------------------------------------------------------------- STL
function parseSTL(buffer) {
  const dv = new DataView(buffer);
  if (buffer.byteLength >= 84) {
    const n = dv.getUint32(80, true);
    if (84 + n * 50 === buffer.byteLength) {
      const pos = new Float32Array(n * 9);
      for (let t = 0; t < n; t++) {
        const o = 84 + t * 50 + 12;
        for (let k = 0; k < 9; k++) pos[t * 9 + k] = dv.getFloat32(o + k * 4, true);
      }
      const idx = new Uint32Array(n * 3);
      for (let i = 0; i < idx.length; i++) idx[i] = i;
      return { positions: pos, indices: idx };
    }
  }
  const src = text(new Uint8Array(buffer));
  const pos = [];
  const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  let m;
  while ((m = re.exec(src))) pos.push(+m[1], +m[2], +m[3]);
  const nt = Math.floor(pos.length / 9);
  const idx = [];
  for (let i = 0; i < nt * 3; i++) idx.push(i);
  return finish(pos.slice(0, nt * 9), idx);
}

// ---------------------------------------------------------------- PLY
const PLY_T = {
  char: ['getInt8', 1], int8: ['getInt8', 1], uchar: ['getUint8', 1], uint8: ['getUint8', 1],
  short: ['getInt16', 2], int16: ['getInt16', 2], ushort: ['getUint16', 2], uint16: ['getUint16', 2],
  int: ['getInt32', 4], int32: ['getInt32', 4], uint: ['getUint32', 4], uint32: ['getUint32', 4],
  float: ['getFloat32', 4], float32: ['getFloat32', 4], double: ['getFloat64', 8], float64: ['getFloat64', 8],
};
function parsePLY(buffer) {
  const bytes = new Uint8Array(buffer);
  // header ends at "end_header\n"
  let hEnd = -1;
  const probe = text(bytes.subarray(0, Math.min(bytes.length, 65536)));
  const at = probe.indexOf('end_header');
  if (at < 0) throw new Error('This PLY file has no header.');
  hEnd = probe.indexOf('\n', at) + 1;
  const header = probe.slice(0, hEnd).split(/\r?\n/);
  const fmt = (header.find(l => l.startsWith('format')) || '').split(/\s+/)[1];
  const elements = [];
  for (const l of header) {
    const t = l.trim().split(/\s+/);
    if (t[0] === 'element') elements.push({ name: t[1], count: +t[2], props: [] });
    else if (t[0] === 'property' && elements.length) {
      const e = elements[elements.length - 1];
      if (t[1] === 'list') e.props.push({ list: true, ct: t[2], it: t[3], name: t[4] });
      else e.props.push({ t: t[1], name: t[2] });
    }
  }
  const pos = [], idx = [];
  if (fmt === 'ascii') {
    const toks = text(bytes.subarray(new TextEncoder().encode(probe.slice(0, hEnd)).length)).trim().split(/\s+/);
    let ti = 0;
    for (const e of elements) for (let r = 0; r < e.count; r++) {
      const vals = {};
      for (const p of e.props) {
        if (p.list) { const n = +toks[ti++]; const a = []; for (let k = 0; k < n; k++) a.push(+toks[ti++]); vals[p.name] = a; }
        else vals[p.name] = +toks[ti++];
      }
      take(e, vals, pos, idx);
    }
  } else {
    const le = fmt === 'binary_little_endian';
    const dv = new DataView(buffer);
    let o = new TextEncoder().encode(probe.slice(0, hEnd)).length;
    const rd = t => { const [fn, sz] = PLY_T[t]; const v = dv[fn](o, le); o += sz; return v; };
    for (const e of elements) for (let r = 0; r < e.count; r++) {
      const vals = {};
      for (const p of e.props) {
        if (p.list) { const n = rd(p.ct); const a = new Array(n); for (let k = 0; k < n; k++) a[k] = rd(p.it); vals[p.name] = a; }
        else vals[p.name] = rd(p.t);
      }
      take(e, vals, pos, idx);
    }
  }
  return finish(pos, idx);
}
function take(e, vals, pos, idx) {
  if (e.name === 'vertex') pos.push(vals.x, vals.y, vals.z);
  else if (e.name === 'face') {
    const vi = vals.vertex_indices || vals.vertex_index || [];
    for (let k = 1; k + 1 < vi.length; k++) idx.push(vi[0], vi[k], vi[k + 1]);
  }
}

// ---------------------------------------------------------------- OFF
function parseOFF(src) {
  const toks = src.replace(/#.*$/gm, '').trim().split(/\s+/);
  let ti = 0;
  if (/^C?N?OFF$/.test(toks[0])) ti++;
  const nv = +toks[ti++], nf = +toks[ti++]; ti++;
  const pos = [], idx = [];
  for (let i = 0; i < nv; i++) pos.push(+toks[ti++], +toks[ti++], +toks[ti++]);
  for (let f = 0; f < nf; f++) {
    const n = +toks[ti++]; const vi = [];
    for (let k = 0; k < n; k++) vi.push(+toks[ti++]);
    for (let k = 1; k + 1 < vi.length; k++) idx.push(vi[0], vi[k], vi[k + 1]);
    // skip optional colour values up to the next face line is not possible in a token stream; OFF colours are rare
  }
  return finish(pos, idx);
}

// ---------------------------------------------------------------- glTF
function parseGLB(buffer) {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('This is not a binary glTF (.glb) file.');
  let o = 12, json = null, bin = null;
  while (o < buffer.byteLength) {
    const len = dv.getUint32(o, true), type = dv.getUint32(o + 4, true);
    const chunk = buffer.slice(o + 8, o + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(text(new Uint8Array(chunk)));
    else if (type === 0x004e4942) bin = chunk;
    o += 8 + len;
  }
  return parseGLTF(json, bin);
}
function parseGLTF(gl, bin) {
  const buffers = (gl.buffers || []).map((b, i) => {
    if (b.uri && b.uri.startsWith('data:')) {
      const s = atob(b.uri.split(',')[1]);
      const u = new Uint8Array(s.length);
      for (let k = 0; k < s.length; k++) u[k] = s.charCodeAt(k);
      return u.buffer;
    }
    if (!b.uri && i === 0 && bin) return bin;
    throw new Error('This glTF file uses separate .bin files. Export it as a single .glb instead.');
  });
  const CT = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
  const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const read = ai => {
    const acc = gl.accessors[ai], bv = gl.bufferViews[acc.bufferView];
    const [T, sz] = CT[acc.componentType], nc = NC[acc.type];
    const stride = bv.byteStride || sz * nc;
    const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const dv = new DataView(buffers[bv.buffer]);
    const out = new Float64Array(acc.count * nc);
    const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[acc.componentType];
    for (let i = 0; i < acc.count; i++) for (let c = 0; c < nc; c++) out[i * nc + c] = dv[get](base + i * stride + c * sz, true);
    void T;
    return out;
  };
  const pos = [], idx = [];
  const mul = (A, B) => { const C = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) C[j * 4 + i] += A[k * 4 + i] * B[j * 4 + k]; return C; };
  const trs = n => {
    if (n.matrix) return n.matrix.slice();
    const [tx, ty, tz] = n.translation || [0, 0, 0], [qx, qy, qz, qw] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1];
    return [
      (1 - 2 * (qy * qy + qz * qz)) * sx, 2 * (qx * qy + qz * qw) * sx, 2 * (qx * qz - qy * qw) * sx, 0,
      2 * (qx * qy - qz * qw) * sy, (1 - 2 * (qx * qx + qz * qz)) * sy, 2 * (qy * qz + qx * qw) * sy, 0,
      2 * (qx * qz + qy * qw) * sz, 2 * (qy * qz - qx * qw) * sz, (1 - 2 * (qx * qx + qy * qy)) * sz, 0,
      tx, ty, tz, 1];
  };
  const addMesh = (mi, M) => {
    for (const pr of gl.meshes[mi].primitives) {
      if (pr.mode !== undefined && pr.mode !== 4) continue;
      const P = read(pr.attributes.POSITION), base = pos.length / 3;
      for (let i = 0; i < P.length; i += 3) {
        const x = P[i], y = P[i + 1], z = P[i + 2];
        pos.push(M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]);
      }
      if (pr.indices !== undefined) { const I = read(pr.indices); for (let i = 0; i < I.length; i++) idx.push(base + I[i]); }
      else for (let i = 0; i < P.length / 3; i++) idx.push(base + i);
    }
  };
  const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const walk = (ni, parent) => {
    const n = gl.nodes[ni], M = mul(parent, trs(n));
    if (n.mesh !== undefined) addMesh(n.mesh, M);
    for (const c of n.children || []) walk(c, M);
  };
  const scene = gl.scenes ? gl.scenes[gl.scene || 0] : null;
  if (scene && gl.nodes) for (const r of scene.nodes) walk(r, I4);
  else (gl.meshes || []).forEach((_, i) => addMesh(i, I4));
  return finish(pos, idx);
}

function finish(pos, idx) {
  const positions = pos instanceof Float32Array ? pos : Float32Array.from(pos);
  const nv = positions.length / 3;
  const good = [];
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    if (a >= 0 && b >= 0 && c >= 0 && a < nv && b < nv && c < nv && a !== b && b !== c && a !== c) good.push(a, b, c);
  }
  return { positions, indices: Uint32Array.from(good) };
}

// ---------------------------------------------------------------- welding and checks
export function bounds(positions) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) {
    const v = positions[i + k];
    if (!Number.isFinite(v)) continue;
    if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v;
  }
  return { lo, hi, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] };
}

// merge vertices closer than a tiny tolerance (STL files repeat every vertex), drop degenerate triangles
export function weld(mesh) {
  const { positions: P, indices: I } = mesh;
  const b = bounds(P), diag = Math.hypot(...b.size) || 1, tol = diag * 1e-6;
  const map = new Map(), remap = new Uint32Array(P.length / 3), out = [];
  for (let v = 0; v < P.length / 3; v++) {
    const key = `${Math.round(P[v * 3] / tol)},${Math.round(P[v * 3 + 1] / tol)},${Math.round(P[v * 3 + 2] / tol)}`;
    let id = map.get(key);
    if (id === undefined) { id = out.length / 3; map.set(key, id); out.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); }
    remap[v] = id;
  }
  const idx = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = remap[I[t]], bb = remap[I[t + 1]], c = remap[I[t + 2]];
    if (a !== bb && bb !== c && a !== c) idx.push(a, bb, c);
  }
  return { positions: Float32Array.from(out), indices: Uint32Array.from(idx) };
}

// edges used by exactly one triangle mean holes; more than two mean the surface is not a clean solid
export function checkMesh(mesh) {
  const I = mesh.indices, edges = new Map();
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = I[t + e], b = I[t + (e + 1) % 3];
    const k = a < b ? a * 4294967296 + b : b * 4294967296 + a;
    edges.set(k, (edges.get(k) || 0) + 1);
  }
  let open = 0, nonManifold = 0;
  for (const c of edges.values()) { if (c === 1) open++; else if (c > 2) nonManifold++; }
  return { triangles: I.length / 3, vertices: mesh.positions.length / 3, openEdges: open, nonManifold, watertight: open === 0 && nonManifold === 0 };
}

// ---------------------------------------------------------------- placement in the block
// opt: { up: 'y'|'z'|'x', turn: 0|90|180|270, flip: bool, size: mm (longest side), margin: mm }
// Returns the transformed triangle soup (block-centred, millimetres) and the block size.
export function placeMesh(mesh, opt) {
  const P = mesh.positions, out = new Float32Array(P.length);
  const up = opt.up || 'y';
  for (let i = 0; i < P.length; i += 3) {
    let x = P[i], y = P[i + 1], z = P[i + 2];
    // bring the chosen up axis to +z
    if (up === 'y') { const t = y; y = -z; z = t; }
    else if (up === 'x') { const t = x; x = -z; z = t; }
    if (opt.flip) { z = -z; x = -x; }
    const a = (opt.turn || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    out[i] = c * x - s * y; out[i + 1] = s * x + c * y; out[i + 2] = z;
  }
  const b = bounds(out);
  const L = Math.max(...b.size) || 1, k = opt.size / L, m = opt.margin;
  const ctr = [0, 1, 2].map(i => (b.lo[i] + b.hi[i]) / 2);
  for (let i = 0; i < out.length; i += 3) for (let j = 0; j < 3; j++) out[i + j] = (out[i + j] - ctr[j]) * k;
  // block: model size plus margin on every side, rounded up to 1/16"
  const q = 25.4 / 16;
  const block = b.size.map(d => Math.max(q * 4, Math.ceil((d * k + 2 * m) / q) * q));
  return { positions: out, indices: mesh.indices, block, modelSize: b.size.map(d => d * k), scale: k };
}

// ---------------------------------------------------------------- built-in sample
// A trefoil knot: a classic carving project, and a good test of tunnels the Jack must reach into.
export function trefoilKnot(seg = 240, ring = 20, R = 1, r = 0.42) {
  const pos = [], idx = [];
  const C = t => [Math.sin(t) + 2 * Math.sin(2 * t), Math.cos(t) - 2 * Math.cos(2 * t), -Math.sin(3 * t)];
  for (let i = 0; i < seg; i++) {
    const t = i / seg * 2 * Math.PI, e = 1e-3;
    const p = C(t), p1 = C(t + e), p0 = C(t - e);
    let T = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const tl = Math.hypot(...T); T = T.map(v => v / tl);
    let N = [p1[0] - 2 * p[0] + p0[0], p1[1] - 2 * p[1] + p0[1], p1[2] - 2 * p[2] + p0[2]];
    const d = N[0] * T[0] + N[1] * T[1] + N[2] * T[2];
    N = [N[0] - d * T[0], N[1] - d * T[1], N[2] - d * T[2]];
    const nl = Math.hypot(...N); N = N.map(v => v / nl);
    const B = [T[1] * N[2] - T[2] * N[1], T[2] * N[0] - T[0] * N[2], T[0] * N[1] - T[1] * N[0]];
    for (let j = 0; j < ring; j++) {
      const a = j / ring * 2 * Math.PI, ca = Math.cos(a) * r * R, sa = Math.sin(a) * r * R;
      pos.push(p[0] * R + N[0] * ca + B[0] * sa, p[1] * R + N[1] * ca + B[1] * sa, p[2] * R + N[2] * ca + B[2] * sa);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < ring; j++) {
    const a = i * ring + j, b = ((i + 1) % seg) * ring + j, c = ((i + 1) % seg) * ring + (j + 1) % ring, d = i * ring + (j + 1) % ring;
    idx.push(a, b, c, a, c, d);
  }
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx) };
}
