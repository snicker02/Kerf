// node tests/engine.test.mjs
import { SURFACES, makeField, principalCurvatures } from '../engine/tpms.js';
import { buildModel, FACES, BIG, faceEdges, edt3 } from '../engine/model.js';
import { makePlan, DEFAULT_OPT } from '../engine/plan.js';
import { remaining, surfaceNets, emptyState } from '../engine/mesh.js';
import { needLength, applyToolData } from '../engine/reach.js';
import { model as jackModel, bladeFor } from '../engine/jack.js';
import { contour2D } from '../engine/contour.js';
import { fracInches, fmtLen, floorToDisplay } from '../engine/units.js';

let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL', msg); } };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

// --- analytic gradients vs finite differences
for (const S of SURFACES) {
  let worst = 0;
  const g = [0, 0, 0], h = 1e-5;
  for (let t = 0; t < 200; t++) {
    const x = Math.random() * 7, y = Math.random() * 7, z = Math.random() * 7;
    S.fn(x, y, z, g);
    const nx = (S.fn(x + h, y, z) - S.fn(x - h, y, z)) / (2 * h);
    const ny = (S.fn(x, y + h, z) - S.fn(x, y - h, z)) / (2 * h);
    const nz = (S.fn(x, y, z + h) - S.fn(x, y, z - h)) / (2 * h);
    worst = Math.max(worst, Math.abs(nx - g[0]), Math.abs(ny - g[1]), Math.abs(nz - g[2]));
  }
  ok(worst < 1e-6, `${S.id} gradient error ${worst}`);
}

// --- curvature: sphere (convex, r=10), cylindrical hole (concave, r=7)
{
  const sph = (x, y, z) => 10 - Math.hypot(x, y, z);
  const k = principalCurvatures(sph, 10, 0, 0, 0.05);
  near(k[0], 0.1, 2e-3, 'sphere k1'); near(k[1], 0.1, 2e-3, 'sphere k2');
  const hole = (x, y, z) => Math.hypot(x, y) - 7;
  const k2 = principalCurvatures(hole, 0, 7, 3, 0.05);
  near(k2[0], -1 / 7, 3e-3, 'hole kmin'); near(k2[1], 0, 3e-3, 'hole kmax');
}

// --- sheet thickness: walls should be close to the requested thickness
{
  const F = makeField({ surface: 'gyroid', cell: 50, phase: [0, 0, 0], mode: 'sheet', thickness: 8, W: 100, D: 100, H: 100, bound: 'box' });
  // walk along random lines and measure solid run lengths that are bounded by void on both sides
  const runs = [];
  for (let t = 0; t < 300; t++) {
    const y = Math.random() * 40 - 20, z = Math.random() * 40 - 20;
    let inside = false, start = 0;
    for (let x = -45; x <= 45; x += 0.05) {
      const v = F.tpms(x, y, z) > 0;
      if (v && !inside) { inside = true; start = x; }
      if (!v && inside) { inside = false; if (start > -44.9) runs.push(x - start); }
    }
  }
  runs.sort((a, b) => a - b);
  // a straight line crosses a wall at an angle, so runs are >= thickness; the shortest are perpendicular crossings
  near(runs[Math.floor(runs.length * 0.02)], 8, 1.2, 'sheet wall thickness (2nd percentile run)');
}

// --- edt
{
  const s = [11, 11, 11], stride = [1, 11, 121], hs = [1, 1, 1];
  const src = new Uint8Array(1331); src[5 + 11 * 5 + 121 * 5] = 1;
  const d = edt3(src, s, stride, hs);
  near(d[0], Math.sqrt(75), 1e-5, 'edt corner'); near(d[5 + 11 * 5 + 121 * 9], 4, 1e-6, 'edt axis');
}

// --- contour: circle area via fill polygons
{
  const nb = 81, nc = 81, h = 0.25, g = new Float32Array(nb * nc);
  for (let j = 0; j < nc; j++) for (let i = 0; i < nb; i++) g[i + nb * j] = 7 - Math.hypot(i * h - 10, j * h - 10);
  const { polys, segs } = contour2D(g, nb, nc, h, h, 0, true);
  let area = 0;
  for (const p of polys) { for (let q = 0; q < p.length; q += 2) { const r = (q + 2) % p.length; area += p[q] * p[r + 1] - p[r] * p[q + 1]; } }
  near(Math.abs(area / 2), Math.PI * 49, 0.6, 'contour fill area');
  let len = 0;
  for (let q = 0; q < segs.length; q += 4) len += Math.hypot(segs[q + 2] - segs[q], segs[q + 3] - segs[q + 1]);
  near(len, 2 * Math.PI * 7, 0.3, 'contour perimeter');
}

// --- units
ok(fracInches(1.1875) === '1 3/16″', 'frac 1 3/16 ' + fracInches(1.1875));
ok(fracInches(0.5) === '1/2″', 'frac 1/2');
ok(fmtLen(25.4 * 2, 'in') === '2″', 'fmt 2in');
ok(floorToDisplay(25.4 * 0.99, 'in') <= 25.4 * 0.99, 'floor display');

// --- face edges consistency (net layout)
{
  const e = faceEdges(2); // front
  ok(FACES[e.top].id === 'A' && FACES[e.bottom].id === 'B' && FACES[e.right].id === 'E' && FACES[e.left].id === 'F', 'front edges');
  const t = faceEdges(0);
  ok(FACES[t.bottom].id === 'C' && FACES[t.top].id === 'D', 'top edges');
}

// --- reach: a straight tunnel of radius R through a 100 mm block along z
{
  const n = 50, h = 2, s3 = [n + 1, n + 1, n + 1], stride = [1, n + 1, (n + 1) * (n + 1)], org = [-50, -50, -50];
  const mk = R => {
    const N = s3[0] * s3[1] * s3[2], solid = new Float32Array(N), ds = new Float32Array(N);
    let id = 0;
    for (let k = 0; k <= n; k++) for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++, id++) {
      const x = org[0] + i * h, y = org[1] + j * h, r = Math.hypot(x, y);
      solid[id] = Math.min(r - R, 50 - Math.abs(x), 50 - Math.abs(y), 50 - Math.abs(org[2] + k * h));
      ds[id] = Math.max(0, R - r);
    }
    return { s: s3, stride, hs: [h, h, h], org, solid, ds, dims: [100, 100, 100], hmin: h };
  };
  // wall point mid-tunnel, normal pointing into the tunnel
  const narrow = needLength(mk(10), [10, 0, 0], [-1, 0, 0], 32);   // grip 32 mm can't enter a 20 mm hole
  ok(narrow > 40 && narrow < 60, 'narrow tunnel needs ~half its length: ' + narrow.toFixed(1));
  const wide = needLength(mk(25), [25, 0, 0], [-1, 0, 0], 32);     // a 50 mm hole lets the handle in
  ok(wide < narrow * 0.6, 'wide tunnel needs less reach: ' + wide.toFixed(1));
  const J = jackModel({});
  ok(bladeFor(J, 3) === 'gouge' && bladeFor(J, 10) === 'scorp' && bladeFor(J, 30) === 'hook' && bladeFor(J, Infinity) === 'pelican', 'blade classes');
}

// --- full model + plan for each surface; holes must stay in waste
const base = { surface: 'gyroid', cell: 101.6, phase: [0, 0, 0], mode: 'netA', thickness: 12.7, fill: 0, W: 101.6, D: 101.6, H: 101.6, bound: 'box', res: 64 };
for (const S of SURFACES) for (const mode of ['netA', 'sheet']) for (const bound of ['box', 'sphere']) {
  const P = { ...base, surface: S.id, mode, bound };
  const t0 = Date.now();
  const model = buildModel(P);
  const tag = `${S.id}/${mode}/${bound}`;
  const plan = makePlan(model, { ...DEFAULT_OPT, drill: true });
  const planNo = makePlan(model, { ...DEFAULT_OPT, drill: false });
  ok(planNo.holes.flat().length === 0 && planNo.jack.share, tag + ' no-drill plan');
  ok(!model.stats.empty, tag + ' non-empty');
  // face uv round trip
  for (const f of model.faces) {
    const [u, v] = f.toUV(13, 27); const [X, Y] = f.toXY(u, v);
    near(X, 13, 1e-9, tag + ' uv roundtrip X'); near(Y, 27, 1e-9, tag + ' uv roundtrip Y');
  }
  // every drilled hole: sample the true solid field inside the drilled cylinder (shrunk by a hair)
  let violations = 0, holes = 0, worst = 0;
  model.faces.forEach((f, fi) => {
    for (const h of plan.holes[fi]) {
      holes++;
      for (let t = 0; t < 60; t++) {
        const ang = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * h.r * 0.98;
        const X = h.X + Math.cos(ang) * rr, Y = h.Y + Math.sin(ang) * rr;
        const dep = Math.random() * h.depth;
        const w = f.toWorld(X, Y, dep);
        const sv = model.F.solid(w[0], w[1], w[2]);
        if (sv > 0) { violations++; worst = Math.max(worst, sv); }
      }
      ok(h.u >= h.r && h.u <= f.wu - h.r && h.v >= h.r && h.v <= f.wv - h.r, tag + ' hole inside face');
    }
  });
  // discretisation allows a tiny intrusion (< lattice spacing); the margin is 1/8" so real intrusions would be huge
  ok(worst < model.hmin, `${tag} holes cut wood: ${violations} samples, worst ${worst.toFixed(2)} (h=${model.hmin.toFixed(2)})`);
  // progress model: monotonic removal
  let st = emptyState();
  const r0 = remaining(model, plan, st).removedFrac;
  st.drill = [0, 1, 2, 3, 4, 5];
  const r1 = remaining(model, plan, st).removedFrac;
  st.bands = plan.bandDepths.map(d => d.length ? d[d.length - 1] : 0);
  const r2 = remaining(model, plan, st).removedFrac;
  st.hidden = true;
  const r3 = remaining(model, plan, st).removedFrac;
  st.shaped = [true, true, true, true, true, true];
  const r4 = remaining(model, plan, st).removedFrac;
  ok(r0 === 0 && r1 >= r0 && r2 >= r1 && r3 >= r2 && r4 >= r3, `${tag} monotonic removal ${[r0, r1, r2, r3, r4].map(x => x.toFixed(3))}`);
  // roughing never removes wood: remaining field must equal solid where solid > 0
  const { R } = remaining(model, plan, st);
  let bad = 0; for (let i = 0; i < model.N; i++) if (model.solid[i] > 0 && R[i] !== model.solid[i]) bad++;
  ok(bad === 0, tag + ' wood untouched');
  // mesh: closed surface → every edge used by exactly two triangles
  const mesh = surfaceNets(model, model.solid);
  const edges = new Map();
  for (let q = 0; q < mesh.idx.length; q += 3) {
    for (let e = 0; e < 3; e++) {
      const a = mesh.idx[q + e], b = mesh.idx[q + (e + 1) % 3];
      const key = a < b ? a * 1e7 + b : b * 1e7 + a;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  let open = 0; for (const c of edges.values()) if (c % 2) open++;
  ok(open === 0, `${tag} mesh closed (open edges ${open})`);
  applyToolData(mesh, model, 31.75);
  let finite = 0; for (let v = 0; v < mesh.nv; v++) if (mesh.aux[v * 3] === 0 && mesh.aux[v * 3 + 2] < 1e4) finite++;
  ok(finite > 0, tag + ' tool data has reachable vertices');
  const holeCount = plan.holes.flat().length;
  console.log(`${tag.padEnd(26)} keep ${(model.stats.keepFrac * 100).toFixed(0)}%  hidden ${(model.stats.hiddenFrac * 100).toFixed(1)}%  holes ${holeCount} (${plan.bitUse.map(b => b.count + '×' + b.bit.label).join(', ')})  bands ${plan.bandDepths.map(d => d.length).join('/')}  thin ${model.stats.thinIn.toFixed(1)}/${model.stats.thinEdge.toFixed(1)}mm  r5 ${model.stats.curv.r5.toFixed(1)}  saddle ${(model.stats.curv.saddleFrac * 100).toFixed(0)}%  islands ${model.stats.islandCount}  tris ${mesh.nt}  ${Date.now() - t0}ms`);
}

// --- corner face
{
  const { buildFaceModel, FACE_DEFAULT, toXYZ } = await import('../engine/face.js');
  const { buildFaceSteps } = await import('../engine/facesteps.js');
  const { FACE_STYLES, minStickLength } = await import('../engine/face.js');
  const variants = FACE_STYLES.map(st => ({ ...FACE_DEFAULT, ...st.set, style: st.id }));
  variants.push({ ...FACE_DEFAULT, beard: true, hair: false, eyes: 'closed', smile: -0.6, nose: 1.3, a: 50 }); // v1.1 saved parameters
  variants.push({ ...FACE_DEFAULT, hat: 'brimmed', eyes: 'wide', mouth: 'open', mustache: 'handlebar', beard: 'short', hair: 'curly', ears: true, age: 1, noseShape: 'hooked', brows: 'bushy' });
  for (const FP0 of variants) {
    const FP = { ...FP0 }; FP.H = Math.max(FP.H, minStickLength(FP));
    const m = buildFaceModel(FP);
    const tag = 'face ' + (FP.style || 'custom') + '/' + m.P.hat + '/' + m.P.beard;
    ok(m.g.zHandle > -FP.H / 2 + FP.a, `${tag}: handle left below the face`);
    // every cut only removes wood (monotone), the handle is never cut, and the face is mirror-symmetric
    let grow = 0, handleCut = 0, asym = 0, prev = m.lattice(0);
    for (let k = 1; k < m.stages.length; k++) {
      const L = m.lattice(k);
      for (let i = 0; i < m.N; i++) { if (L[i] > 0 && !(prev[i] > 0)) grow++; }
      prev = L;
    }
    const fin = m.stages[m.stages.length - 1];
    for (let t = 0; t < 4000; t++) {
      const x = (Math.random() - 0.5) * FP.a, y = (Math.random() - 0.5) * FP.a, z = (Math.random() - 0.5) * FP.H;
      const v = fin(x, y, z), w = fin(-y, -x, z);
      // hair, beard and forehead lines are deliberately irregular, so check symmetry between brow and mouth
      if (z < m.g.zBrow && z > m.g.zMouth - 0.05 * m.g.F && (v > 0.05) !== (w > 0.05) && Math.abs(v) > 0.05 && Math.abs(w) > 0.05) asym++;
      if (z < m.g.zHandle - 3) { const st = Math.min(FP.a / 2 - Math.abs(x), FP.a / 2 - Math.abs(y), FP.H / 2 - Math.abs(z)); if ((st > 0.01) !== (v > 0.01)) handleCut++; }
    }
    ok(grow === 0, `${tag}: cuts only remove wood (${grow} points grew)`);
    ok(handleCut === 0, `${tag}: handle untouched (${handleCut})`);
    ok(asym === 0, `${tag}: left/right symmetric (${asym})`);
    // the nose tip still reaches close to the original corner, and the brow notch is cut
    const tipZ = m.g.zNose + 0.15 * m.g.noseL;
    const [tx, ty] = toXYZ(0, 0.12 * FP.a, tipZ, FP.a);
    ok(fin(tx, ty, tipZ) > 0, `${tag}: nose tip is wood`);
    const [bx, by] = toXYZ(0, 0.5 * m.g.Db, m.g.zBrow - 0.5, FP.a);
    ok(fin(bx, by, m.g.zBrow - 0.5) < 0, `${tag}: brow notch is open`);
    const steps = buildFaceSteps(m, { units: 'in', jack: {} });
    ok(steps.length === m.cuts.length + 5 && steps.every(s => s.html && s.title && !/undefined|NaN/.test(s.html)), `${tag}: ${steps.length} steps, text complete`);
  }
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
