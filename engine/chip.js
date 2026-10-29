// Chip carving: geometric rosettes, borders and all-over patterns cut into a flat board with the
// detail knife. A three-corner chip is a pyramid-shaped hollow: three stop cuts from the deep
// centre to the corners, then three slicing cuts along the edges at the wall angle. Its depth at a
// point is tan(wall angle) × distance to the nearest edge, so the walls are planes of equal slope
// meeting under the incentre. A two-corner chip (petal or scallop) is a lens cut from both sides.

import { MM_PER_IN as IN } from './units.js';
import { fmtLen } from './units.js';
import { stagedModel, stagesFrom, clamp } from './staged.js';
import { model as jackModel } from './jack.js';
import { jackGripsHTML } from './technique.js';

export const CHIP_DEFAULT = {
  shape: 'square', size: 5 * IN, thickness: 0.5 * IN, pattern: 'rosette+border',
  folds: 8, rings: 3, chip: 0.4 * IN, angle: 50, seed: 3,
};

export const CHIP_PARAMS = [
  { section: 'Board' },
  { key: 'shape', label: 'Board', type: 'seg', options: [['square', 'Square'], ['round', 'Round']] },
  { key: 'size', label: 'Size', type: 'len', min: 2 * IN, max: 10 * IN, hint: 'Width of a square board or diameter of a round one.' },
  { key: 'thickness', label: 'Thickness', type: 'len', min: 6, max: 1.5 * IN },
  { section: 'Pattern' },
  { key: 'pattern', label: 'Pattern', type: 'select', options: [['rosette+border', 'Rosette with border'], ['rosette', 'Rosette'], ['border', 'Border only'], ['allover', 'All-over triangles']] },
  { key: 'folds', label: 'Symmetry', type: 'int', min: 5, max: 24, fmt: v => `${v}-fold`, show: P => P.pattern !== 'border' && P.pattern !== 'allover', hint: 'How many times the rosette repeats around the centre.' },
  { key: 'rings', label: 'Rings', type: 'int', min: 1, max: 5, show: P => P.pattern !== 'border' && P.pattern !== 'allover' },
  { key: 'chip', label: 'Chip size', type: 'len', min: 4, max: 0.9 * IN, hint: 'Typical chip width. Beginners: 3/8″ or bigger.' },
  { key: 'angle', label: 'Wall angle', type: 'range', min: 35, max: 65, step: 1, fmt: v => `${v}° to the surface`, hint: 'Steeper walls make deeper, crisper chips.' },
  { key: 'seed', label: 'Variation', type: 'int', min: 1, max: 99, hint: 'Picks a different mix of ring styles.' },
];

// ---------------------------------------------------------------- chips
function triChip(a, b, c, group, tanA) {
  // keep counter-clockwise
  const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const P = cr > 0 ? [a, b, c] : [a, c, b];
  const edges = P.map((p, i) => {
    const q = P[(i + 1) % 3], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy);
    return { px: p[0], py: p[1], nx: -dy / L, ny: dx / L, L };
  });
  // incentre and inradius: where the three walls meet
  const la = edges[1].L, lb = edges[2].L, lc = edges[0].L, per = la + lb + lc;
  const ic = [(la * P[0][0] + lb * P[1][0] + lc * P[2][0]) / per, (la * P[0][1] + lb * P[1][1] + lc * P[2][1]) / per];
  const area = Math.abs(cr) / 2, rin = 2 * area / per;
  const depth = (x, y) => {
    let m = Infinity;
    for (const e of edges) { const d = (x - e.px) * e.nx + (y - e.py) * e.ny; if (d < m) m = d; }
    return m > 0 ? m * tanA : 0;
  };
  return { type: 'tri', pts: P, centre: ic, maxDepth: rin * tanA, size: Math.max(la, lb, lc), group, depth,
    bb: [Math.min(a[0], b[0], c[0]), Math.min(a[1], b[1], c[1]), Math.max(a[0], b[0], c[0]), Math.max(a[1], b[1], c[1])] };
}

// lens between a and b, half-width w at the middle
function lensChip(a, b, w, group, tanA) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const depth = (x, y) => {
    const t = ((x - mx) * ux + (y - my) * uy) / (L / 2), v = Math.abs(-(x - mx) * uy + (y - my) * ux);
    if (t <= -1 || t >= 1) return 0;
    const hw = w * (1 - t * t);
    return v < hw ? (hw - v) * tanA : 0;
  };
  const pts = [];
  for (let i = 0; i <= 16; i++) { const t = -1 + i / 8; if (t > 1) break; const hw = w * (1 - t * t); pts.push([mx + ux * t * L / 2 - uy * hw, my + uy * t * L / 2 + ux * hw]); }
  for (let i = 16; i >= 0; i--) { const t = -1 + i / 8; if (t > 1) continue; const hw = w * (1 - t * t); pts.push([mx + ux * t * L / 2 + uy * hw, my + uy * t * L / 2 - ux * hw]); }
  const r = w + 0.01;
  return { type: 'lens', a, b, w, pts, centre: [mx, my], maxDepth: w * tanA, size: L, group, depth,
    bb: [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r] };
}

const pol = (r, t) => [r * Math.cos(t), r * Math.sin(t)];
function rng(seed) { let s = seed * 2654435761 >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const RING_STYLES = ['teeth-out', 'diamonds', 'petals', 'teeth-in', 'scallops'];
export const RING_NAMES = {
  'star': 'centre star', 'teeth-out': 'outward triangles', 'teeth-in': 'inward triangles', 'diamonds': 'diamonds',
  'petals': 'petals (two-corner chips)', 'scallops': 'scallops (two-corner chips)', 'border': 'triangle border', 'corners': 'corner pyramids', 'allover': 'triangles',
};

// ---------------------------------------------------------------- pattern
export function buildPattern(P) {
  const tanA = Math.tan(clamp(P.angle, 30, 70) * Math.PI / 180);
  const half = P.size / 2, margin = Math.max(4, P.size * 0.04), chip = P.chip;
  const groups = [];
  const chips = [];
  const addGroup = (name, kind) => { groups.push({ name, kind, count: 0 }); return groups.length - 1; };
  const push = c => { chips.push(c); groups[c.group].count++; };
  const rand = rng(P.seed);
  const wantBorder = P.pattern === 'rosette+border' || P.pattern === 'border';
  const bw = chip * 1.1;                          // border band width
  const borderInner = half - margin - bw;
  const construction = { circles: [], rays: 0 };

  if (P.pattern === 'rosette' || P.pattern === 'rosette+border') {
    const n = Math.round(P.folds);
    const R = (wantBorder ? borderInner - chip * 0.5 : half - margin);
    const r1 = Math.max(chip * 1.4, R * (P.rings >= 4 ? 0.22 : 0.3));
    const nr = Math.round(P.rings);
    const gap = Math.max(0.8, chip * 0.12);
    construction.circles.push(r1);
    // centre star: 2n wedges, every other one is a chip
    const g0 = addGroup('Centre star', 'star');
    for (let k = 0; k < n; k++) {
      const t0 = (2 * k) * Math.PI / n, t1 = (2 * k + 1) * Math.PI / n;
      push(triChip([0, 0], pol(r1, t0), pol(r1, t1), g0, tanA));
    }
    let used = [];
    for (let i = 0; i < nr; i++) {
      const ra = r1 + gap + (R - r1) * i / nr, rb = r1 + (R - r1) * (i + 1) / nr - (i === nr - 1 ? 0 : gap * 0.5);
      construction.circles.push(ra, rb);
      const rm = (ra + rb) / 2;
      // sectors: a multiple of the symmetry that makes chips about the requested size
      let mult = Math.max(1, Math.round((2 * Math.PI * rm / n) / chip));
      const m = n * mult;
      let style;
      do { style = RING_STYLES[Math.floor(rand() * RING_STYLES.length)]; } while (used.length && style === used[used.length - 1]);
      if ((style === 'petals') && (rb - ra) < chip * 0.8) style = 'teeth-out';
      used.push(style);
      const g = addGroup(`Ring ${i + 1}`, style);
      const dt = 2 * Math.PI / m, off = (i % 2) * dt / 2;
      for (let k = 0; k < m; k++) {
        const t0 = off + k * dt, t1 = t0 + dt, tm = t0 + dt / 2;
        if (style === 'teeth-out') push(triChip(pol(ra, t0), pol(ra, t1), pol(rb, tm), g, tanA));
        else if (style === 'teeth-in') push(triChip(pol(rb, t0), pol(rb, t1), pol(ra, tm), g, tanA));
        else if (style === 'diamonds') {
          push(triChip(pol(rm, t0), pol(rm, t1), pol(ra, tm), g, tanA));
          push(triChip(pol(rm, t0), pol(rm, t1), pol(rb, tm), g, tanA));
        } else if (style === 'petals') push(lensChip(pol(ra, tm), pol(rb, tm), Math.min(rm * dt * 0.3, (rb - ra) * 0.3), g, tanA));
        else push(lensChip(pol(rm, t0 + dt * 0.08), pol(rm, t1 - dt * 0.08), Math.min((rb - ra) * 0.32, rm * dt * 0.3), g, tanA));
      }
    }
    construction.rays = n;
  }

  if (wantBorder) {
    const g = addGroup('Border', 'border');
    const outer = half - margin, inner = outer - bw;
    if (P.shape === 'round') {
      const rm = (inner + outer) / 2, m = Math.max(12, Math.round(2 * Math.PI * rm / chip));
      const dt = 2 * Math.PI / m;
      for (let k = 0; k < m; k++) push(triChip(pol(outer, k * dt), pol(outer, (k + 1) * dt), pol(inner, (k + 0.5) * dt), g, tanA));
      construction.circles.push(inner, outer);
    } else {
      const side = 2 * inner, cnt = Math.max(3, Math.round(side / chip)), step = side / cnt;
      for (let sgn = 0; sgn < 4; sgn++) {
        const rot = ([x, y]) => { const c = Math.cos(sgn * Math.PI / 2), s = Math.sin(sgn * Math.PI / 2); return [c * x - s * y, s * x + c * y]; };
        for (let k = 0; k < cnt; k++) {
          const x0 = -inner + k * step, x1 = x0 + step;
          push(triChip(rot([x0, -outer]), rot([x1, -outer]), rot([(x0 + x1) / 2, -inner]), g, tanA));
        }
      }
      const gc = addGroup('Corners', 'corners');
      for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
        const c = [sx * (inner + bw / 2), sy * (inner + bw / 2)], h = bw / 2;
        const q = [[c[0] - h, c[1] - h], [c[0] + h, c[1] - h], [c[0] + h, c[1] + h], [c[0] - h, c[1] + h]];
        for (let i = 0; i < 4; i++) push(triChip(c, q[i], q[(i + 1) % 4], gc, tanA));
      }
    }
  }

  if (P.pattern === 'allover') {
    const s = chip * 1.35, hgt = s * Math.sqrt(3) / 2, lim = half - margin;
    const inside = pts => pts.every(([x, y]) => (P.shape === 'round' ? Math.hypot(x, y) <= lim : Math.abs(x) <= lim && Math.abs(y) <= lim));
    const rule = Math.floor(rand() * 3);
    const gnames = ['Rows 1', 'Rows 2', 'Rows 3'];
    const gs = gnames.map(nm => addGroup(nm, 'allover'));
    const rows = Math.ceil(lim / hgt) + 1, cols = Math.ceil(lim / s) + 2;
    for (let j = -rows; j <= rows; j++) for (let i = -cols; i <= cols; i++) {
      const x0 = i * s + (j & 1 ? s / 2 : 0), y0 = j * hgt;
      const up = [[x0, y0], [x0 + s, y0], [x0 + s / 2, y0 + hgt]];
      const dn = [[x0 + s / 2, y0 + hgt], [x0 + s, y0], [x0 + 1.5 * s, y0 + hgt]];
      const keepUp = rule === 0 ? true : rule === 1 ? ((i + 2 * j) % 3 + 3) % 3 !== 0 : ((i + j) & 1) === 0;
      const keepDn = rule === 0 ? false : rule === 1 ? ((i + 2 * j + 1) % 3 + 3) % 3 === 0 : ((i + j) & 1) === 1;
      const gi = gs[Math.min(2, Math.floor(((y0 + lim) / (2 * lim)) * 3))];
      if (keepUp && inside(up)) push(triChip(up[0], up[1], up[2], gi, tanA));
      if (keepDn && inside(dn)) push(triChip(dn[0], dn[1], dn[2], gi, tanA));
    }
    // drop empty groups
  }

  // spatial buckets for fast depth lookup
  const cell = Math.max(chip, 4), nb = Math.ceil(P.size / cell) + 2;
  const buckets = Array.from({ length: nb * nb }, () => []);
  for (const c of chips) {
    const i0 = Math.max(0, Math.floor((c.bb[0] + half) / cell)), i1 = Math.min(nb - 1, Math.floor((c.bb[2] + half) / cell));
    const j0 = Math.max(0, Math.floor((c.bb[1] + half) / cell)), j1 = Math.min(nb - 1, Math.floor((c.bb[3] + half) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) buckets[i + nb * j].push(c);
  }
  const depthAt = (x, y, gMax = Infinity, gOnly = -1) => {
    const i = Math.floor((x + half) / cell), j = Math.floor((y + half) / cell);
    if (i < 0 || j < 0 || i >= nb || j >= nb) return 0;
    let d = 0;
    for (const c of buckets[i + nb * j]) {
      if (c.group > gMax || (gOnly >= 0 && c.group !== gOnly)) continue;
      if (x < c.bb[0] || x > c.bb[2] || y < c.bb[1] || y > c.bb[3]) continue;
      const v = c.depth(x, y); if (v > d) d = v;
    }
    return d;
  };
  const live = groups.map((g, i) => ({ ...g, index: i })).filter(g => g.count > 0);
  return { chips, groups: live, allGroups: groups, depthAt, tanA, construction, maxDepth: Math.max(0, ...chips.map(c => c.maxDepth)) };
}

// ---------------------------------------------------------------- model and steps
export function buildChip(Pin, opt) {
  const P = { ...CHIP_DEFAULT, ...Pin };
  const pat = buildPattern(P);
  const half = P.size / 2, T = P.thickness, top = T / 2;
  const board = P.shape === 'round'
    ? (x, y, z) => Math.min(half - Math.hypot(x, y), top - Math.abs(z))
    : (x, y, z) => Math.min(half - Math.abs(x), half - Math.abs(y), top - Math.abs(z));
  const deep = top - pat.maxDepth - 1;
  // one stage per group: everything carved up to and including that group
  const order = pat.groups.map(g => g.index);
  const cuts = order.map((gi, k) => ({ fn: (x, y, z) => (z < deep ? -1 : pat.depthAt(x, y, gi, gi) - (top - z)) }));
  const stages = stagesFrom(board, cuts);
  const h = clamp(Math.min(P.chip / 7, P.size / 200), 0.3, 0.7);
  const model = stagedModel({ dims: [P.size, P.size, T], stages, h, kind: 'chip', extra: { P, pat } });
  const steps = chipSteps(model, opt);
  return { model, steps };
}

function chipSteps(model, opt) {
  const { P, pat } = model;
  const u = opt.units, L = mm => fmtLen(mm, u), J = jackModel(opt.jack), H = J.hand, O = J.other;
  const steps = [];
  const last = model.stages.length - 1;
  const lean = 90 - P.angle;
  const add = s => steps.push({ id: `c${steps.length}`, checks: [], view: { yaw: -Math.PI / 2, pitch: 1.05 }, ...s });
  const counts = { tri: pat.chips.filter(c => c.type === 'tri').length, lens: pat.chips.filter(c => c.type === 'lens').length };
  const minChip = Math.min(...pat.chips.map(c => c.size));
  add({
    phase: 'Plan', title: 'What you’re carving', figure: { type: 'chipPattern' }, state: last, blades: ['detail'],
    speak: `A chip-carved ${P.shape} board with ${pat.chips.length} chips.`,
    html: `
<p>A chip-carved <b>${P.shape} board</b>, ${L(P.size)} ${P.shape === 'round' ? 'across' : 'square'} and ${L(P.thickness)} thick: ${P.pattern === 'allover' ? 'an all-over triangle pattern' : P.pattern === 'border' ? 'a triangle border' : `a ${Math.round(P.folds)}-fold rosette${P.pattern === 'rosette+border' ? ' with a border' : ''}`}.</p>
<div class="kv">
  <div><span>Three-corner chips</span><b>${counts.tri}</b></div>
  <div><span>Two-corner chips</span><b>${counts.lens}</b></div>
  <div><span>Deepest chip</span><b>${L(pat.maxDepth)}</b></div>
  <div><span>Smallest chip</span><b>${L(minChip)}</b></div>
</div>
<p>Chip carving is done entirely with the <b>detail knife</b>. Every chip is made of two kinds of cut: <b>stop cuts</b>, pressed straight in from the deep centre out to the corners, and <b>slicing cuts</b> along each edge with the blade leaning about ${lean}° from upright, so the chip lifts out clean.</p>
${minChip < 5 ? '<p class="warn">Some chips are smaller than 3/16″. Those are fiddly with the Jack\'s detail knife. A bigger chip size makes a first board much easier.</p>' : ''}
<p>Work one group at a time, from the centre out, and turn the board rather than your hand, so you always cut toward yourself in the same comfortable grip.</p>`,
  });
  add({
    phase: 'Plan', title: 'The detail knife for chip carving', figure: { type: 'chipHow' }, state: last, blades: ['detail'],
    speak: 'How to hold the detail knife for chip carving, and how to cut one chip.',
    checks: ['Detail knife stropped to a mirror edge', 'Practised on scrap'],
    html: `
<h4>The two grips</h4>
<ul>
<li><b>First position</b>: hold the Jack in your ${H} fist with the detail blade's edge facing you. Rest the side of your thumb's first knuckle on the wood next to the cut. Your thumb stays put and is the pivot, and the blade leans about ${lean}° from upright. Draw the knife toward you.</li>
<li><b>Second position</b>: turn your hand over so the edge faces away. Put your ${H} thumb on the back of the handle and push. Use it for edges that face the other way, or turn the board instead.</li>
</ul>
<h4>One three-corner chip</h4>
<ol>
<li><b>Stop cuts</b>: put the knife tip in the centre of the triangle, edge toward a corner, and press straight down, rocking the blade so the cut is deepest (about ${L(pat.maxDepth)} for the biggest chips) at the centre and shallow at the corner. Repeat for the other two corners.</li>
<li><b>Slicing cuts</b>: lay the blade along one edge, leaning ${lean}° from upright, and slice from corner to corner. The blade meets the stop cuts underneath. Repeat on the other two edges; the third cut frees the chip.</li>
</ol>
<p><b>Two-corner chips</b> (petals and scallops) have no stop cuts: two curved slicing cuts, one along each side, meet under the centre line.</p>
<p class="tip">The Jack's detail knife has a clip point, not a dedicated chip knife's straight edge. Use only the first half-inch behind the tip, and keep it very sharp: a chip that tears instead of popping out means it's time to strop.</p>
${jackGripsHTML(J).split('<h4>Grain</h4>')[1] ? `<h4>Grain</h4>${jackGripsHTML(J).split('<h4>Grain</h4>')[1]}` : ''}`,
  });
  add({
    phase: 'Prepare', title: 'Prepare the board', figure: { type: 'none' }, state: 0, blades: [],
    speak: 'Prepare a flat, smooth basswood board.',
    checks: ['Board cut to size', 'Face sanded to 220'],
    html: `
<ul>
<li>Use basswood, ${L(P.thickness)} thick, ${P.shape === 'round' ? `cut to a ${L(P.size)} circle` : `${L(P.size)} square`}. Chip carving needs close, even grain; butternut also works.</li>
<li>Sand the face flat and smooth to 220 grit <b>before</b> carving. Sanding afterwards rounds over the crisp chip edges, which are the whole look.</li>
<li>Don't put any finish on yet.</li>
</ul>`,
  });
  add({
    phase: 'Prepare', title: 'Transfer the pattern', figure: { type: 'chipPattern', construction: true }, state: 0, blades: [],
    speak: 'Print the pattern at actual size and transfer it to the board.',
    checks: ['Printed at 100%, calibration bar checked', 'Pattern transferred', 'Centre marked'],
    html: `
<ol>
<li>Press <b>Print templates</b> and print at 100%. Check the calibration bar.</li>
<li>Tape the sheet to the board and trace every line with graphite transfer paper underneath, or glue the paper on with a glue stick and carve through it.</li>
<li>Or lay it out yourself: draw the construction circles with a compass${pat.construction.rays ? ` and divide them into ${pat.construction.rays} equal parts (every ${(360 / pat.construction.rays).toFixed(1).replace(/\\.0$/, '')}°)` : ''}, then draw the chips.</li>
</ol>
<p class="tip">Draw lightly with a hard pencil (2H). Dark lines smear into the chips and are hard to erase from the bottoms.</p>`,
  });
  pat.groups.forEach((g, k) => {
    const n = g.count, lens = g.kind === 'petals' || g.kind === 'scallops';
    const kindTxt = RING_NAMES[g.kind] || g.kind;
    const deepest = Math.max(...pat.chips.filter(c => c.group === g.index).map(c => c.maxDepth));
    add({
      phase: 'Carve', title: `${g.name}: ${n} ${lens ? 'two-corner' : 'three-corner'} chips`, figure: { type: 'chipGroup', group: g.index }, state: k + 1, blades: ['detail'],
      speak: `${g.name}. ${n} ${kindTxt}.`,
      checks: [`All ${n} chips cut`, 'Bottoms clean, no fuzz'],
      html: `
<p><b>${n} ${kindTxt}</b>, highlighted on the drawing. The deepest are about <b>${L(deepest)}</b> at the centre.</p>
${lens ? `<ol><li>Slice along one curved side with the blade leaning ${lean}°, following the curve with your wrist, not by twisting the blade.</li><li>Turn the board and slice the other side. The two cuts meet under the centre line and the chip comes out.</li></ol>`
          : `<ol><li>Make all the stop cuts for the whole group first: three per chip, from the centre out to each corner.</li><li>Then go round the group making the slicing cuts, turning the board so each edge comes to you.</li></ol>`}
<p class="tip">${g.kind === 'star' ? 'The centre star\'s points meet at one spot. Make those stop cuts shallow near the centre so the points don\'t break off.' : g.kind === 'corners' ? 'Each corner is a four-sided pyramid: four stop cuts from the centre to the corners, then four slicing cuts.' : 'Keep the ridges between chips sharp and unbroken: they carry the pattern.'}</p>`,
    });
  });
  add({
    phase: 'Finish', title: 'Clean up and finish', figure: { type: 'chipGroup', group: -1 }, state: last, blades: ['detail'],
    speak: 'Clean up, erase the lines, and finish.',
    checks: ['Fuzz trimmed', 'Pencil lines erased', 'Finish applied'],
    html: `
<ol>
<li>Trim any fuzz left in the chip bottoms with the detail knife's tip.</li>
<li>Erase the pencil lines with a white plastic eraser. Only sand very lightly (320) if you must; it softens the ridges.</li>
<li>Leave it bare, or use a coat of paste wax or a thin oil. Oil darkens basswood and makes the chips stand out.</li>
</ol>`,
  });
  return steps;
}
