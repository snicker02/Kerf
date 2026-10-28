// node tests/meshio.test.mjs [outdir]  — mesh import, signed distance, and planning on imported models.
// Writes sample files of every format to outdir (for the browser test) when given.
import { writeFileSync, mkdirSync } from 'fs';
import { parseMesh, weld, checkMesh, placeMesh, trefoilKnot, bounds } from '../engine/meshio.js';
import { meshSDF, meshField } from '../engine/meshsdf.js';
import { buildModel, latticeFor } from '../engine/model.js';
import { makePlan, DEFAULT_OPT } from '../engine/plan.js';
import { buildSteps } from '../engine/steps.js';
import { remaining, emptyState } from '../engine/mesh.js';

let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL', msg); } };
const outDir = process.argv[2];
if (outDir) mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------- writers for round-trip tests
const knot = weld(trefoilKnot(120, 14));
const P = knot.positions, I = knot.indices, nv = P.length / 3, nt = I.length / 3;
const toBuf = s => new TextEncoder().encode(s).buffer;
const objTxt = () => {
  let s = '# trefoil\no knot\n';
  for (let v = 0; v < nv; v++) s += `v ${P[v * 3]} ${P[v * 3 + 1]} ${P[v * 3 + 2]}\n`;
  s += 'vn 0 0 1\n';
  for (let t = 0; t < nt; t++) s += `f ${I[t * 3] + 1}//1 ${I[t * 3 + 1] + 1}//1 ${I[t * 3 + 2] + 1}//1\n`;
  return s;
};
const objQuads = () => { // quads and negative indices
  let s = 'v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nv 0 0 1\nv 1 0 1\nv 1 1 1\nv 0 1 1\n';
  s += 'f -8 -5 -6 -7\nf 5 6 7 8\nf 1 2 6 5\nf 2 3 7 6\nf 3 4 8 7\nf 4 1 5 8\n';
  return s;
};
const stlAscii = () => {
  let s = 'solid knot\n';
  for (let t = 0; t < nt; t++) {
    s += ' facet normal 0 0 0\n  outer loop\n';
    for (let k = 0; k < 3; k++) { const v = I[t * 3 + k]; s += `   vertex ${P[v * 3]} ${P[v * 3 + 1]} ${P[v * 3 + 2]}\n`; }
    s += '  endloop\n endfacet\n';
  }
  return s + 'endsolid knot\n';
};
const stlBin = () => {
  const b = new ArrayBuffer(84 + nt * 50), dv = new DataView(b);
  dv.setUint32(80, nt, true);
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) {
    const v = I[t * 3 + k];
    for (let c = 0; c < 3; c++) dv.setFloat32(84 + t * 50 + 12 + k * 12 + c * 4, P[v * 3 + c], true);
  }
  return b;
};
const plyAscii = () => {
  let s = `ply\nformat ascii 1.0\nelement vertex ${nv}\nproperty float x\nproperty float y\nproperty float z\nelement face ${nt}\nproperty list uchar int vertex_indices\nend_header\n`;
  for (let v = 0; v < nv; v++) s += `${P[v * 3]} ${P[v * 3 + 1]} ${P[v * 3 + 2]}\n`;
  for (let t = 0; t < nt; t++) s += `3 ${I[t * 3]} ${I[t * 3 + 1]} ${I[t * 3 + 2]}\n`;
  return s;
};
const plyBin = () => {
  const head = `ply\nformat binary_little_endian 1.0\nelement vertex ${nv}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nelement face ${nt}\nproperty list uchar uint vertex_indices\nend_header\n`;
  const hb = new TextEncoder().encode(head);
  const b = new ArrayBuffer(hb.length + nv * 13 + nt * 13), dv = new DataView(b);
  new Uint8Array(b).set(hb);
  let o = hb.length;
  for (let v = 0; v < nv; v++) { for (let c = 0; c < 3; c++) { dv.setFloat32(o, P[v * 3 + c], true); o += 4; } dv.setUint8(o++, 200); }
  for (let t = 0; t < nt; t++) { dv.setUint8(o++, 3); for (let k = 0; k < 3; k++) { dv.setUint32(o, I[t * 3 + k], true); o += 4; } }
  return b;
};
const offTxt = () => {
  let s = `OFF\n${nv} ${nt} 0\n`;
  for (let v = 0; v < nv; v++) s += `${P[v * 3]} ${P[v * 3 + 1]} ${P[v * 3 + 2]}\n`;
  for (let t = 0; t < nt; t++) s += `3 ${I[t * 3]} ${I[t * 3 + 1]} ${I[t * 3 + 2]}\n`;
  return s;
};
const glb = (scale = 1) => { // positions + uint16 indices, a node with scale and translation
  const pb = new Float32Array(P), ib = new Uint16Array(I);
  const pad = n => (n + 3) & ~3;
  const binLen = pad(pb.byteLength) + pad(ib.byteLength);
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ children: [1], translation: [5, 0, 0] }, { mesh: 0, scale: [scale, scale, scale] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: binLen }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pb.byteLength }, { buffer: 0, byteOffset: pad(pb.byteLength), byteLength: ib.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: nv, type: 'VEC3' }, { bufferView: 1, componentType: 5123, count: I.length, type: 'SCALAR' }],
  };
  let js = JSON.stringify(json); while (js.length % 4) js += ' ';
  const jb = new TextEncoder().encode(js);
  const total = 12 + 8 + jb.length + 8 + binLen;
  const b = new ArrayBuffer(total), dv = new DataView(b), u = new Uint8Array(b);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jb.length, true); dv.setUint32(16, 0x4e4f534a, true); u.set(jb, 20);
  let o = 20 + jb.length;
  dv.setUint32(o, binLen, true); dv.setUint32(o + 4, 0x004e4942, true); o += 8;
  u.set(new Uint8Array(pb.buffer), o); u.set(new Uint8Array(ib.buffer), o + pad(pb.byteLength));
  return b;
};

const kb = bounds(P);
const files = {
  'knot.obj': toBuf(objTxt()), 'knot-ascii.stl': toBuf(stlAscii()), 'knot.stl': stlBin(),
  'knot-ascii.ply': toBuf(plyAscii()), 'knot.ply': plyBin(), 'knot.off': toBuf(offTxt()), 'knot.glb': glb(2),
};
for (const [name, buf] of Object.entries(files)) {
  const m = weld(parseMesh(name, buf)), c = checkMesh(m), b = bounds(m.positions);
  const sc = name.endsWith('.glb') ? 2 : 1, off = name.endsWith('.glb') ? 5 : 0;
  const same = [0, 1, 2].every(i => Math.abs(b.size[i] - kb.size[i] * sc) < 1e-3 * sc && Math.abs(b.lo[i] - (kb.lo[i] * sc + (i === 0 ? off : 0))) < 1e-3 * sc);
  ok(c.triangles === nt && c.watertight && same, `${name}: ${c.triangles}/${nt} triangles, watertight ${c.watertight}, bounds match ${same}`);
  if (outDir) writeFileSync(`${outDir}/${name}`, Buffer.from(buf));
}
{
  const m = weld(parseMesh('box.obj', toBuf(objQuads()))), c = checkMesh(m);
  ok(c.triangles === 12 && c.watertight, `OBJ quads + negative indices: ${c.triangles} triangles, watertight ${c.watertight}`);
  let threw = false; try { parseMesh('x.fbx', new ArrayBuffer(8)); } catch (e) { threw = /can't read/.test(e.message); }
  ok(threw, 'unsupported format gives a clear error');
}

// ---------------------------------------------------------------- signed distance accuracy: a sphere
function icosphere(r, sub) {
  const t = (1 + Math.sqrt(5)) / 2;
  let V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  V = V.map(v => { const l = Math.hypot(...v); return v.map(x => x / l); });
  for (let s = 0; s < sub; s++) {
    const mid = new Map(), F2 = [];
    const m = (a, b) => { const k = a < b ? a + ',' + b : b + ',' + a; if (!mid.has(k)) { const p = V[a].map((x, i) => x + V[b][i]); const l = Math.hypot(...p); V.push(p.map(x => x / l)); mid.set(k, V.length - 1); } return mid.get(k); };
    for (const [a, b, c] of F) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); F2.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    F = F2;
  }
  return { positions: Float32Array.from(V.flat().map(x => x * r)), indices: Uint32Array.from(F.flat()) };
}
{
  const sph = icosphere(30, 4);
  const Pm = { W: 80, D: 80, H: 80, res: 80, kind: 'mesh' };
  const L = latticeFor(Pm);
  const { sdf, insideFrac } = meshSDF(sph, L);
  let worstNear = 0, worstFar = 0, wrongSign = 0;
  for (let k = 0; k < L.s[2]; k++) for (let j = 0; j < L.s[1]; j++) for (let i = 0; i < L.s[0]; i++) {
    const x = L.org[0] + i * L.hs[0], y = L.org[1] + j * L.hs[1], z = L.org[2] + k * L.hs[2];
    const ex = 30 - Math.hypot(x, y, z), got = sdf[i + j * L.stride[1] + k * L.stride[2]];
    if (Math.abs(ex) > 0.3 && Math.sign(ex) !== Math.sign(got)) wrongSign++;
    if (Math.abs(ex) < 1.5) worstNear = Math.max(worstNear, Math.abs(ex - got));
    else worstFar = Math.max(worstFar, Math.abs(ex - got));
  }
  ok(wrongSign === 0, `sphere: inside/outside correct everywhere (${wrongSign} wrong)`);
  ok(worstNear < 0.15, `sphere: distance near the surface within 0.15 mm (worst ${worstNear.toFixed(3)})`);
  ok(worstFar < 1.5, `sphere: distance away from the surface within 1.5 mm (worst ${worstFar.toFixed(2)})`);
  let exIn = 0;
  for (let k = 0; k < L.s[2]; k++) for (let j = 0; j < L.s[1]; j++) for (let i = 0; i < L.s[0]; i++) if (Math.hypot(L.org[0] + i * L.hs[0], L.org[1] + j * L.hs[1], L.org[2] + k * L.hs[2]) < 30) exIn++;
  near(insideFrac, exIn / L.N, 0.002, 'sphere: share of lattice points inside');
  // an open mesh: drop 1% of triangles; the vote must still get almost everything right
  const holes = { positions: sph.positions, indices: sph.indices.filter((_, i) => Math.floor(i / 3) % 97 !== 5) };
  ok(!checkMesh(holes).watertight, 'holey sphere detected as open');
  const r2 = meshSDF(holes, L);
  let bad = 0;
  for (let i = 0; i < L.N; i++) if ((sdf[i] > 0.3) !== (r2.sdf[i] > 0.3) && Math.abs(sdf[i]) > 0.3) bad++;
  ok(bad / L.N < 0.002, `open mesh: ${(bad / L.N * 100).toFixed(3)}% of points flip sign`);
}
function near(a, b, t, m) { ok(Math.abs(a - b) <= t, `${m}: ${a} vs ${b}`); }

// ---------------------------------------------------------------- planning an imported model
for (const [label, mesh, opt] of [['knot', trefoilKnot(), { up: 'z' }], ['sphere', icosphere(1, 3), { up: 'y' }]]) {
  for (const up of ['z', 'y', 'x']) {
    const pl = placeMesh(weld(mesh), { ...opt, up, turn: 90, flip: up === 'x', size: 76.2, margin: 3.175 });
    const Pm = { kind: 'mesh', name: label, size: 76.2, W: pl.block[0], D: pl.block[1], H: pl.block[2], res: 72, watertight: true, openEdges: 0 };
    ok(Math.abs(Math.max(...pl.modelSize) - 76.2) < 1e-6, `${label}/${up}: scaled to the requested size`);
    const L = latticeFor(Pm);
    const { sdf } = meshSDF(pl, L);
    const model = buildModel(Pm, meshField(sdf, L, L.dims));
    const plan = makePlan(model, { ...DEFAULT_OPT, drill: true, saw: true });
    const tag = `${label}/${up}`;
    ok(model.stats.keepFrac > 0.03 && model.stats.keepFrac < 0.9, `${tag}: keeps ${(model.stats.keepFrac * 100).toFixed(1)}%`);
    // drilled holes and the saw never touch the model
    let worst = 0;
    model.faces.forEach((f, fi) => {
      for (const h of plan.holes[fi]) for (let t = 0; t < 40; t++) {
        const ang = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * h.r * 0.98;
        const w = f.toWorld(h.X + Math.cos(ang) * rr, h.Y + Math.sin(ang) * rr, Math.random() * h.depth);
        worst = Math.max(worst, model.F.solid(...w));
      }
    });
    ok(worst < model.hmin, `${tag}: holes stay in waste (worst ${worst.toFixed(2)} mm into wood)`);
    const st = emptyState(); st.saw = plan.sawFaces.slice(); st.drill = [0, 1, 2, 3, 4, 5];
    st.bands = plan.bandDepths.map(d => (d.length ? d[d.length - 1] : 0)); st.hidden = true;
    const { R } = remaining(model, plan, st);
    let cut = 0; for (let i = 0; i < model.N; i++) if (model.solid[i] > 0 && R[i] <= 0) cut++;
    ok(cut === 0, `${tag}: roughing (saw, drill, layers) never removes model wood (${cut})`);
    const steps = buildSteps(model, plan, { ...DEFAULT_OPT, drill: true, saw: true, units: 'in', grain: 'z' });
    ok(steps.length > 10 && steps.every(s => s.html && !/undefined|NaN/.test(s.html)), `${tag}: ${steps.length} steps with complete text`);
    ok(steps.some(s => s.phase === 'Saw') === plan.sawFaces.length > 0, `${tag}: saw steps match the saw plan (${plan.sawFaces.length} outlines, ${(plan.sawFrac * 100).toFixed(0)}% of waste)`);
  }
}

// ---------------------------------------------------------------- print sheets build for every project type
{
  const { buildPrintHTML } = await import('../export/templates.js');
  const { buildFacePrintHTML } = await import('../export/facetemplate.js');
  const { buildFaceModel, FACE_DEFAULT } = await import('../engine/face.js');
  const sm = buildModel({ surface: 'gyroid', mode: 'netA', cell: 101.6, fill: 0, thickness: 12.7, phase: [0, 0, 0], W: 76.2, D: 76.2, H: 76.2, bound: 'box', res: 48 });
  for (const drill of [false, true]) for (const saw of [false, true]) {
    const o = { ...DEFAULT_OPT, drill, saw, units: 'in' };
    let html = '', err = '';
    try { html = buildPrintHTML(sm, makePlan(sm, o), o, 'test'); } catch (e) { err = e.message; }
    ok(html.length > 10000 && !/undefined|NaN/.test(html), `surface sheets (drill ${drill}, saw ${saw}) ${err}`);
  }
  const pl = placeMesh(weld(trefoilKnot()), { up: 'z', turn: 0, size: 76.2, margin: 3.175 });
  const Pm = { kind: 'mesh', name: 'knot.obj', size: 76.2, W: pl.block[0], D: pl.block[1], H: pl.block[2], res: 48 };
  const L = latticeFor(Pm), mm = buildModel(Pm, meshField(meshSDF(pl, L).sdf, L, L.dims));
  for (const saw of [false, true]) {
    const o = { ...DEFAULT_OPT, saw, units: 'mm' };
    let html = '', err = '';
    try { html = buildPrintHTML(mm, makePlan(mm, o), o, 'test'); } catch (e) { err = e.message; }
    ok(html.length > 10000 && !/undefined|NaN/.test(html) && (!saw || html.includes('saw line')), `model sheets (saw ${saw}) ${err}`);
  }
  const fm = buildFaceModel({ ...FACE_DEFAULT });
  let fh = '', ferr = '';
  try { fh = buildFacePrintHTML(fm, { units: 'in' }, 'test', { url: 'data:image/png;base64,AA==', wmm: 50, hmm: 90 }); } catch (e) { ferr = e.message; }
  ok(fh.length > 2000 && !/undefined|NaN/.test(fh), `face sheet ${ferr}`);
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
