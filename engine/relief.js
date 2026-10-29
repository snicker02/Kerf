// Relief from a photo: an image becomes a shallow carved panel. The picture is blurred and split
// into depth levels (light = high by default). The carving is laid out the way relief carvers
// work: V-scorp outlines along the level boundaries, then the panel is lowered layer by layer,
// then the steps are softened (stepped style) or blended into a smooth surface.

import { MM_PER_IN as IN, fmtLen } from './units.js';
import { stagedModel, clamp } from './staged.js';
import { edt3 } from './model.js';
import { contour2D } from './contour.js';
import { model as jackModel } from './jack.js';

export const RELIEF_DEFAULT = { width: 7 * IN, thickness: 0.75 * IN, depth: 0.3 * IN, levels: 5, style: 'stepped', invert: false, blur: 3, frame: 0.375 * IN, detail: 0.5 };

export const RELIEF_PARAMS = [
  { section: 'Panel' },
  { key: 'width', label: 'Panel width', type: 'len', min: 3 * IN, max: 16 * IN, hint: 'The height follows the picture’s shape.' },
  { key: 'thickness', label: 'Thickness', type: 'len', min: 0.4 * IN, max: 2 * IN },
  { key: 'frame', label: 'Frame', type: 'len', min: 0, max: 1.25 * IN, hint: 'Uncarved border round the picture. 0 for none.' },
  { section: 'Relief' },
  { key: 'depth', label: 'Carving depth', type: 'len', min: 2, max: 0.75 * IN },
  { key: 'levels', label: 'Levels', type: 'int', min: 2, max: 7, hint: 'How many heights the picture is split into. Fewer levels are easier to carve.' },
  { key: 'style', label: 'Style', type: 'seg', options: [['stepped', 'Stepped'], ['smooth', 'Smooth']] },
  { key: 'invert', label: 'Dark is high', type: 'check' },
  { key: 'blur', label: 'Simplify', type: 'range', min: 0, max: 10, step: 1, fmt: v => (v ? `${v}` : 'off'), hint: 'Blurs the picture first so the shapes are big enough to carve.' },
];

// ---------------------------------------------------------------- image helpers (pure, testable)
// grid: { w, h, data: Float32Array luminance 0..1, name }
export function sampleImage(n = 240) {
  const w = n, h = Math.round(n * 0.7), data = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = i / w, y = j / h;                          // y down
    let v = 0.78;                                        // sky
    const sun = Math.hypot(x - 0.7, (y - 0.28) * h / w);
    if (sun < 0.085) v = 1;                               // sun
    
    const m1 = 0.5 + 0.18 * Math.abs(((x * 2.1 + 0.15) % 1) - 0.5) * 2 - 0.08 * Math.sin(x * 19);
    const m2 = 0.58 + 0.12 * Math.abs(((x * 1.3 + 0.55) % 1) - 0.5) * 2;
    if (y > m1) v = 0.55;                                // far hills
    if (y > m2) v = 0.35;                                // near hills
    const sea = 0.78 + 0.025 * Math.sin(x * 28);
    if (y > sea) v = 0.15;                               // sea
    data[i + w * j] = v;
  }
  return { w, h, data, name: 'Sun over the hills (sample)' };
}

function blurGrid(src, w, h, r) {
  if (r <= 0) return Float32Array.from(src);
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let pass = 0; pass < 3; pass++) {                 // three box passes ≈ Gaussian
    const a = pass ? out : src;
    for (let j = 0; j < h; j++) { let s = 0, c = 0; for (let i = -r; i < w + r; i++) { if (i + r < w) { s += a[Math.min(w - 1, Math.max(0, i + r)) + w * j]; c++; } if (i - r - 1 >= 0) { s -= a[i - r - 1 + w * j]; c--; } if (i >= 0 && i < w) tmp[i + w * j] = s / c; } }
    for (let i = 0; i < w; i++) { let s = 0, c = 0; for (let j = -r; j < h + r; j++) { if (j + r < h) { s += tmp[i + w * Math.min(h - 1, j + r)]; c++; } if (j - r - 1 >= 0) { s -= tmp[i + w * (j - r - 1)]; c--; } if (j >= 0 && j < h) out[i + w * j] = s / c; } }
  }
  return out;
}

// resample to at most n px on the long side (box filter)
export function fitGrid(img, n = 260) {
  const s = Math.min(1, n / Math.max(img.w, img.h));
  const w = Math.max(2, Math.round(img.w * s)), h = Math.max(2, Math.round(img.h * s));
  if (w === img.w && h === img.h) return img;
  const data = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x0 = Math.floor(i / s), x1 = Math.max(x0 + 1, Math.floor((i + 1) / s)), y0 = Math.floor(j / s), y1 = Math.max(y0 + 1, Math.floor((j + 1) / s));
    let t = 0, c = 0;
    for (let y = y0; y < Math.min(y1, img.h); y++) for (let x = x0; x < Math.min(x1, img.w); x++) { t += img.data[x + img.w * y]; c++; }
    data[i + w * j] = c ? t / c : 0;
  }
  return { ...img, w, h, data };
}

// posterize into L evenly spaced levels between the 2nd and 98th percentiles
function levelMap(v, L) {
  const sorted = Float32Array.from(v).sort();
  const lo = sorted[Math.floor(sorted.length * 0.02)], hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))];
  const lev = new Uint8Array(v.length), span = Math.max(1e-6, hi - lo);
  for (let i = 0; i < v.length; i++) lev[i] = Math.round(clamp((v[i] - lo) / span, 0, 1) * (L - 1));
  return { lev, lo, hi };
}

// mode filter: thin slivers between levels (anti-aliased edges, noise) join their neighbours,
// so every area left is wide enough to carve
function cleanLevels(lev, w, h, r) {
  const tmp = new Uint8Array(lev.length), cnt = new Int32Array(8);
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      cnt.fill(0);
      for (let dj = -r; dj <= r; dj++) { const y = Math.min(h - 1, Math.max(0, j + dj)); for (let di = -r; di <= r; di++) { const x = Math.min(w - 1, Math.max(0, i + di)); cnt[lev[x + w * y]]++; } }
      let best = lev[i + w * j]; for (let k = 0; k < 8; k++) if (cnt[k] > cnt[best]) best = k;
      tmp[i + w * j] = best;
    }
    lev.set(tmp);
  }
}

export function reliefGeom(Pin, imgIn) {
  const P = { ...RELIEF_DEFAULT, ...Pin };
  const img = fitGrid(imgIn || sampleImage());
  const W = P.width, Hp = W * img.h / img.w, T = P.thickness;
  const D = Math.min(P.depth, T * 0.7), L = Math.round(clamp(P.levels, 2, 7)), fr = Math.min(P.frame, Math.min(W, Hp) * 0.3);
  const gw = img.w, gh = img.h;
  let v = blurGrid(img.data, gw, gh, Math.round(P.blur * gw / 260));
  if (P.invert) v = v.map(t => 1 - t);
  const { lev } = levelMap(v, L);
  cleanLevels(lev, gw, gh, Math.max(1, Math.round(1.6 / (W / gw))));
  // depth below the top for each pixel (top level = 0)
  const step = D / (L - 1);
  const stepped = new Float32Array(gw * gh);
  for (let i = 0; i < stepped.length; i++) stepped[i] = (L - 1 - lev[i]) * step;
  // smooth surface: continuous picture values, rescaled; stepped surface: levels with softened edges
  let lo = Infinity, hi = -Infinity; for (const t of v) { lo = Math.min(lo, t); hi = Math.max(hi, t); }
  const smooth = new Float32Array(gw * gh);
  for (let i = 0; i < smooth.length; i++) smooth[i] = D * (1 - (v[i] - lo) / Math.max(1e-6, hi - lo));
  // softened steps: the blur rounds each level's top edge down into the level below; taking the
  // deeper of the blurred and the stepped surface keeps the floors where they are
  const soft = blurGrid(stepped, gw, gh, Math.max(1, Math.round(gw * step * 0.5 / W)));
  for (let i = 0; i < soft.length; i++) soft[i] = Math.max(soft[i], stepped[i]);
  const floorD = smooth.map(d => Math.floor(d / step + 1e-6) * step);
  const finalD = P.style === 'smooth' ? smooth : soft;
  // distance (mm) from each pixel to the nearest level boundary, and to the nearest other-level pixel
  const px = W / gw, py = Hp / gh;
  const bnd = new Uint8Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const a = lev[i + gw * j];
    if ((i + 1 < gw && lev[i + 1 + gw * j] !== a) || (j + 1 < gh && lev[i + gw * (j + 1)] !== a)) bnd[i + gw * j] = 1;
  }
  const dB = edt3(bnd, [gw, gh, 1], [1, gw, gw * gh], [px, py, 1]);
  // width of each region: 2 × distance to the boundary, at its widest (approximate local feature size)
  // panel coordinates: x right, y up, centred; the picture sits inside the frame
  const pw = W - 2 * fr, ph = Hp - 2 * fr;
  const toGrid = (x, y) => [(x + pw / 2) / pw * (gw - 1), (ph / 2 - y) / ph * (gh - 1)];
  const bil = (g, x, y) => {
    const [u, w0] = toGrid(x, y);
    if (u < 0 || w0 < 0 || u > gw - 1 || w0 > gh - 1) return NaN;
    const i = Math.min(gw - 2, Math.floor(u)), j = Math.min(gh - 2, Math.floor(w0)), a = u - i, b = w0 - j;
    return (g[i + gw * j] * (1 - a) + g[i + 1 + gw * j] * a) * (1 - b) + (g[i + gw * (j + 1)] * (1 - a) + g[i + 1 + gw * (j + 1)] * a) * b;
  };
  const near = (g, x, y) => { const [u, w0] = toGrid(x, y); if (u < 0 || w0 < 0 || u > gw - 1 || w0 > gh - 1) return -1; return g[Math.round(u) + gw * Math.round(w0)]; };
  // narrow regions: how much of the picture is narrower than the straight gouge
  const levels = Array.from({ length: L }, (_, k) => ({ k, depth: (L - 1 - k) * step, area: 0 }));
  for (let i = 0; i < lev.length; i++) levels[lev[i]].area++;
  levels.forEach(l => { l.area /= lev.length; });
  return { P, img, W, Hp, T, D, L, fr, gw, gh, v, lev, step, stepped, smooth, soft, floorD, finalD, dB, px, py, pw, ph, bil, near, levels, toGrid };
}

export function buildRelief(Pin, opt, img) {
  const G = reliefGeom(Pin, img), { W, Hp, T, D, L, step } = G;
  const zTop = T / 2;
  const box = (x, y, z) => Math.min(W / 2 - Math.abs(x), Hp / 2 - Math.abs(y), T / 2 - Math.abs(z));
  const vD = Math.min(2.5, step * 0.8, D), tanV = Math.tan(35 * Math.PI / 180);   // V-scorp: 70° included angle
  // depth below the top at (x, y) for each stage; NaN outside the picture → 0 (frame)
  const dz = g => (x, y) => { const d = G.bil(g, x, y); return isFinite(d) ? d : 0; };
  const groove = (x, y) => { const d = G.bil(G.dB, x, y); return isFinite(d) ? Math.max(0, vD - d / tanV) : 0; };
  // roughing layers: stepped style lowers to the levels; smooth style to the levels rounded up, so the
  // smooth surface is never shallower than the roughing
  const rough = G.P.style === 'smooth' ? G.floorD : G.stepped;
  const raw = [() => 0, groove];
  for (let j = 1; j < L; j++) { const lim = j * step; raw.push((x, y) => Math.min(dz(rough)(x, y), lim)); }
  raw.push(dz(G.finalD));
  // wood only ever comes off: each stage's depth is at least the one before
  const depthStages = [raw[0]];
  for (let k = 1; k < raw.length; k++) { const prev = depthStages[k - 1], cur = raw[k]; depthStages.push((x, y) => Math.max(prev(x, y), cur(x, y))); }
  const stages = depthStages.map(dep => (x, y, z) => Math.min(box(x, y, z), zTop - dep(x, y) - z));
  const h = clamp(Math.max(W, Hp) / 230, 0.35, 1.2);
  const model = stagedModel({ dims: [W, Hp, T], stages, h, hz: clamp(step / 4, 0.25, h), kind: 'relief', fixedBelowZ: zTop - D - 1.5, extra: { P: G.P, G, depthStages, vD } });
  return { model, steps: reliefSteps(model, opt) };
}

// marching-squares boundaries of each level in panel mm
export function levelContours(G) {
  const out = [];
  const f = new Float32Array(G.gw * G.gh);
  const sx = G.pw / (G.gw - 1), sy = G.ph / (G.gh - 1);
  for (let k = 1; k < G.L; k++) {
    for (let i = 0; i < f.length; i++) f[i] = G.lev[i] >= k ? 1 : -1;
    const { segs } = contour2D(f, G.gw, G.gh, 1, 1, 0);
    const s = new Float32Array(segs.length);
    for (let i = 0; i < segs.length; i += 2) { s[i] = segs[i] * sx - G.pw / 2; s[i + 1] = G.ph / 2 - segs[i + 1] * sy; }
    out.push({ k, segs: s });
  }
  return out;
}

function reliefSteps(model, opt) {
  const { G, vD } = model, u = opt.units, Lf = mm => fmtLen(mm, u, { den: 32 }), J = jackModel(opt.jack);
  const last = model.stages.length - 1, steps = [];
  const view = { yaw: -Math.PI / 2, pitch: 0.95 };
  const add = s => steps.push({ id: `r${steps.length}`, checks: [], view, ...s });
  const gouge = 3 / 16 * IN;
  // narrow strips: pixels whose distance to a boundary is under half the gouge width, inside regions that are narrow overall
  let narrow = 0; for (let i = 0; i < G.dB.length; i++) if (G.dB[i] < gouge / 2) narrow++;
  const narrowPct = Math.round(100 * narrow / G.dB.length);
  add({
    phase: 'Plan', title: 'What you’re carving', figure: { type: 'reliefMap' }, state: last, blades: ['vscorp', 'gouge', 'scorp'],
    speak: `A ${G.L} level relief panel.`,
    html: `
<p>A relief panel <b>${Lf(G.W)} × ${Lf(G.Hp)}</b>, ${Lf(G.T)} thick, carved up to <b>${Lf(G.D)}</b> deep from <i>${(G.img.name || 'your picture').replace(/</g, '&lt;')}</i>.</p>
<div class="kv">
  <div><span>Levels</span><b>${G.L}, ${Lf(G.step)} apart</b></div>
  <div><span>Style</span><b>${G.P.style === 'smooth' ? 'smooth, sculpted surface' : 'stepped, edges softened'}</b></div>
  <div><span>Frame</span><b>${G.fr > 0 ? Lf(G.fr) : 'none'}</b></div>
</div>
<p>The picture is split into ${G.L} heights: ${G.P.invert ? 'dark' : 'light'} parts stay high, ${G.P.invert ? 'light' : 'dark'} parts are carved deepest.</p>
${narrowPct > 30 ? `<p class="warn">Much of the picture has shapes narrower than the 3/16″ gouge. Turn up “Simplify” or use fewer levels for an easier carve.</p>` : ''}`,
  });
  add({
    phase: 'Prepare', title: 'Prepare the panel and transfer the outlines', figure: { type: 'reliefOutline' }, state: 0, blades: [],
    speak: 'Prepare the board and trace the outlines onto it.',
    checks: ['Panel planed flat', 'Outlines transferred', 'Levels numbered'],
    html: `
<ol>
<li>Use a flat, straight-grained board at least <b>${Lf(G.W)} × ${Lf(G.Hp)} × ${Lf(G.T)}</b>. Basswood is ideal. Run the grain along the longer side.</li>
<li>Print the outline template at 100% and trace it onto the board with carbon paper.</li>
<li>Write the level number in each area (1 is the top, ${G.L} the deepest). It's easy to lose track once you start carving.</li>
${G.fr > 0 ? `<li>Mark the frame ${Lf(G.fr)} in from the edges; it isn't carved.</li>` : ''}
<li>Fix the panel down with a bench hook or clamps so both hands are free for the scorps.</li>
</ol>`,
  });
  add({
    state: 1, phase: 'Outline', title: 'Outline every boundary with the V-scorp', figure: { type: 'reliefLayer', k: 1 }, blades: ['vscorp'],
    speak: 'Cut a V groove along every boundary line.',
    checks: ['All boundary lines grooved'],
    html: `
<p><b>V-scorp</b>: cut a shallow V groove, about ${Lf(vD)} deep, along every line. This separates the areas so the wood breaks cleanly when you lower them, and stops the grain from tearing past the line.</p>
<ul>
<li>Pull the V-scorp toward you along the line; turn the panel rather than your wrist on curves.</li>
<li>Where a line runs with the grain, one side of the V cuts cleanly and the other may tear. Cut that stretch from the other direction.</li>
</ul>`,
  });
  for (let j = 1; j < G.L; j++) {
    const lowering = G.levels.filter(l => l.k < G.L - j).reduce((a, l) => a + l.area, 0);
    add({
      state: 1 + j, phase: 'Lower', title: j + 1 === G.L ? `Lower level ${G.L} to ${Lf(j * G.step)}` : `Lower levels ${j + 1}–${G.L} to ${Lf(j * G.step)}`, figure: { type: 'reliefLayer', k: 1 + j }, blades: ['gouge', 'scorp'],
      speak: `Lower every area from level ${j + 1} down to ${Lf(j * G.step).replace('″', ' inch')}.`,
      checks: [`Levels ${j + 1}–${G.L} at ${Lf(j * G.step)}`],
      html: `
<p>Lower every area marked ${j + 1} or deeper (about ${Math.round(lowering * 100)}% of the picture) by ${Lf(G.step)}, to <b>${Lf(j * G.step)}</b> below the top.</p>
<ol>
<li>Deepen the V groove on the boundary of the area being lowered, and make the wall straight down with the <b>straight gouge</b> or the detail knife.</li>
<li>Take the wood out with the <b>gouge scorp</b>, pulling toward the wall, then level the floor with the <b>straight gouge</b>.</li>
<li>Check the depth in a few places: a pencil mark on a small stick works as a depth gauge.</li>
</ol>`,
    });
  }
  add({
    state: last, phase: 'Shape', title: G.P.style === 'smooth' ? 'Blend into a smooth surface' : 'Soften the steps', figure: { type: 'reliefLayer', k: last }, blades: G.P.style === 'smooth' ? ['scorp', 'gouge', 'detail'] : ['gouge', 'detail'],
    speak: G.P.style === 'smooth' ? 'Blend the levels into a smooth surface.' : 'Round over the edges of each level.',
    checks: ['Edges softened', 'Floors cleaned up'],
    html: G.P.style === 'smooth' ? `
<p>Carve away the steps so the surface flows from high to low as in the picture. Work across the grain with the <b>gouge scorp</b>, following the shading in the figure, then clean up with light cuts of the <b>straight gouge</b>.</p>` : `
<p>Round the top edge of each level down into the one below, so the shapes read as soft forms rather than terraces. Use the <b>straight gouge</b> bevel-down, or the <b>detail knife</b> on tight curves.</p>`,
  });
  add({
    state: last, phase: 'Finish', title: 'Finish', figure: { type: 'reliefMap' }, blades: ['detail'],
    speak: 'Clean up and finish the panel.',
    checks: ['Clean-up done', 'Finish applied'],
    html: `
<ul>
<li>Clean out the corners where the walls meet the floors with the detail knife.</li>
<li>Look at the panel under a low, raking light: that's how carved relief is seen, and it shows any rough patches.</li>
<li>Seal with a thin oil or wax. A darker wax rubbed into the deep areas brings the picture out.</li>
</ul>`,
  });
  return steps;
}
