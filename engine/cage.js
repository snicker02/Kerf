// One-piece whittling puzzles: ball-in-cage and the wooden chain.
// Both stand on end: z runs along the grain (up), x and y across.

import { MM_PER_IN as IN, fmtLen } from './units.js';
import { stagedModel, stagesFrom, clamp, stadium } from './staged.js';
import { model as jackModel } from './jack.js';

const GAP = 1.6;   // clearance between parts that must move freely (mm)

// ================================================================ ball in cage
export const CAGE_DEFAULT = { width: 1.25 * IN, height: 4 * IN, post: 0.25 * IN, cap: 0.4 * IN, balls: 1, ball: 0.9 * IN };

export const CAGE_PARAMS = [
  { section: 'Block' },
  { key: 'width', label: 'Block width', type: 'len', min: 0.75 * IN, max: 2.5 * IN, hint: 'The block is square in section.' },
  { key: 'height', label: 'Block height', type: 'len', min: 2 * IN, max: 9 * IN },
  { section: 'Cage' },
  { key: 'post', label: 'Corner posts', type: 'len', min: 3, max: 0.5 * IN, hint: 'Thickness of the four corner posts.' },
  { key: 'cap', label: 'End caps', type: 'len', min: 4, max: 1 * IN },
  { key: 'balls', label: 'Balls', type: 'int', min: 1, max: 3 },
  { key: 'ball', label: 'Ball diameter', type: 'len', min: 6, max: 2.5 * IN, hint: 'Must be bigger than the gap between posts so it stays caged, and small enough to clear the posts so it moves. Kerf adjusts it if needed.' },
];

export function cageGeom(Pin) {
  const P = { ...CAGE_DEFAULT, ...Pin };
  const a = P.width, p = clamp(P.post, 2.5, a * 0.3), c = P.cap, n = Math.round(clamp(P.balls, 1, 3));
  const gap = a - 2 * p;                              // opening between posts
  const dMin = gap + GAP, dMax = Math.min(a - 1, Math.SQRT2 * gap - 2 * GAP);
  const notes = [];
  let d = P.ball, ok = dMin <= dMax;
  if (!ok) { d = (dMin + dMax) / 2; notes.push('The posts are too thick for this block: no ball can be both caged and free. Make the posts thinner or the block wider.'); }
  else if (d < dMin) { d = dMin; notes.push(`Ball enlarged to ${'%d'} so it can't slip out between the posts.`); }
  else if (d > dMax) { d = dMax; notes.push(`Ball reduced to ${'%d'} so it clears the posts.`); }
  const inner = n * d + (n + 1) * GAP;               // room the balls need between the caps
  let H = P.height;
  if (H - 2 * c < inner) { H = inner + 2 * c; notes.push(`Block lengthened to ${'%h'} to fit ${n} ball${n > 1 ? 's' : ''}.`); }
  const zc = H / 2 - c;                                // caps start at ±zc
  const seg = 2 * zc / n;
  const centres = Array.from({ length: n }, (_, i) => -zc + seg * (i + 0.5));
  return { P, a, p, c, n, d, H, zc, gap, dMin, dMax, ok, centres, notes, dims: [a, a, H] };
}

export function buildCage(Pin, opt) {
  const G = cageGeom(Pin);
  const { a, p, d, H, zc, centres } = G, h2 = a / 2, r = d / 2, pin = h2 - p;
  const box = (x, y, z) => Math.min(h2 - Math.abs(x), h2 - Math.abs(y), H / 2 - Math.abs(z));
  const inCaps = z => zc - Math.abs(z);                         // > 0 between the caps
  const post = (x, y) => Math.min(Math.abs(x) - pin, Math.abs(y) - pin); // > 0 inside a corner post
  const near = z => { let m = Infinity, zi = 0; for (const c of centres) if (Math.abs(z - c) < m) { m = Math.abs(z - c); zi = c; } return z - zi; };
  const cuts = [
    // 1. windows: the wood between the posts, outside the core
    { id: 'windows', fn: (x, y, z) => Math.min(inCaps(z), Math.max(Math.min(Math.abs(x) - r, pin - Math.abs(y)), Math.min(Math.abs(y) - r, pin - Math.abs(x)))) },
    // 2. round the core into a cylinder; this frees the posts
    { id: 'core', fn: (x, y, z) => Math.min(inCaps(z), -post(x, y), Math.hypot(x, y) - r) },
    // 3. free the balls from the caps and from each other: rough double cones
    { id: 'free', fn: (x, y, z) => { const dz = Math.abs(near(z)); return Math.min(inCaps(z), -post(x, y), Math.max(dz - r, (dz + Math.hypot(x, y) - r * Math.SQRT2) / Math.SQRT2, GAP / 2 - inCaps(z))); } },
    // 4. round the balls
    { id: 'round', fn: (x, y, z) => Math.min(inCaps(z), -post(x, y), Math.hypot(x, y, near(z)) - r) },
    // 5. chamfer the inside edges of the posts
    { id: 'posts', fn: (x, y, z) => Math.min(inCaps(z), post(x, y) + 1, p * 0.45 - ((Math.abs(x) - pin) + (Math.abs(y) - pin)) * Math.SQRT1_2, Math.hypot(x, y, near(z)) - r - GAP / 2) },
  ];
  const stages = stagesFrom(box, cuts);
  const model = stagedModel({ dims: G.dims, stages, h: clamp(Math.max(Math.max(...G.dims) / 260, Math.cbrt(G.dims[0] * G.dims[1] * G.dims[2] / 1.4e6)), 0.3, 0.8), kind: 'cage', extra: { P: G.P, G } });
  return { model, steps: cageSteps(model, opt) };
}

function cageSteps(model, opt) {
  const { G } = model, u = opt.units, L = mm => fmtLen(mm, u), J = jackModel(opt.jack);
  const notes = G.notes.map(t => t.replace('%d', L(G.d)).replace('%h', L(G.H)));
  const last = model.stages.length - 1, steps = [];
  const iso = { yaw: -0.8, pitch: 0.35 };
  const add = s => steps.push({ id: `k${steps.length}`, checks: [], view: iso, ...s });
  add({
    phase: 'Plan', title: 'What you’re carving', figure: { type: 'cageSection' }, state: last, blades: ['detail', 'pelican'],
    speak: `A cage with ${G.n} loose ball${G.n > 1 ? 's' : ''}, carved from one block.`,
    html: `
<p>A cage with <b>${G.n} loose ball${G.n > 1 ? 's' : ''}</b>, carved from a single ${L(G.a)} × ${L(G.a)} × ${L(G.H)} block. Nothing is glued: the ball${G.n > 1 ? 's are' : ' is'} carved from the wood inside the cage.</p>
<div class="kv">
  <div><span>Gap between posts</span><b>${L(G.gap)}</b></div>
  <div><span>Ball diameter</span><b>${L(G.d)}</b></div>
  <div><span>Ball must be between</span><b>${L(G.dMin)} and ${L(G.dMax)}</b></div>
</div>
<p class="${G.ok ? 'ok' : 'warn'}">${G.ok ? `The ball is ${L(G.d - G.gap)} wider than the gap between the posts, so it stays in the cage, and clears the posts by ${L((Math.SQRT2 * G.gap - G.d) / 2)} so it rolls freely.` : 'This cage doesn’t work as set: see below.'}</p>
${notes.map(t => `<p class="warn">${t}</p>`).join('')}
<p>Almost all of this is done with the <b>detail knife</b>: stop cuts and short slicing cuts in a tight space.</p>`,
  });
  add({
    phase: 'Prepare', title: 'Mark out the block', figure: { type: 'cageSection', mark: true }, state: 0, blades: [],
    speak: 'Mark the posts, caps and windows on all four faces.',
    checks: ['Block square and to size', 'Posts and caps marked on all four faces', 'Ball centres marked'],
    html: `
<ol>
<li>Use straight-grained basswood with the grain running up the block. Square it to <b>${L(G.a)} × ${L(G.a)} × ${L(G.H)}</b>.</li>
<li>On every face, draw a line ${L(G.p)} in from each long edge (the posts) and ${L(G.c)} from each end (the caps). The rectangle left in the middle of each face is a <b>window</b>.</li>
<li>Mark the centre of each ball across the windows: ${G.centres.map(c => L(c + G.H / 2)).join(', ')} from the bottom.</li>
<li>Draw the ball's circle (${L(G.d)}) on the end of the block too, as a guide for the core.</li>
</ol>`,
  });
  add({
    state: 1, phase: 'Rough', title: 'Open the windows', figure: { type: 'cageSection', stage: 1 }, blades: ['detail'],
    speak: 'Open all four windows with stop cuts along the posts.',
    checks: ['All four windows opened', 'Posts kept full thickness'],
    html: `
<ol>
<li><b>Detail knife</b>: make stop cuts straight down along the post lines and the cap lines, about ${L(Math.max(1.5, (G.a - G.d) / 2))} deep.</li>
<li>Slice the wood out of the window toward the stop cuts, from the middle outward. Work each face in turn.</li>
<li>Keep the stop cuts square to the face: the inside faces of the posts must stay flat.</li>
</ol>
<p class="tip">Don't lever against the posts: they're thin and short-grained at the caps. Let the stop cuts do the work.</p>`,
  });
  add({
    state: 2, phase: 'Rough', title: 'Free the posts and round the core', figure: { type: 'cageSection', stage: 2 }, blades: ['detail'],
    speak: 'Cut behind the posts to free them, and round the core into a cylinder.',
    checks: ['Daylight behind every post', `Core round, ${L(G.d)} across`],
    html: `
<ol>
<li>The block's centre (the <b>core</b>) is still joined to each post along its inside corner. Cut in from the windows on both sides of a post, angling toward the corner, until the cuts meet and you see daylight behind it. Do this for all four posts.</li>
<li>Round the core into a cylinder ${L(G.d)} across, using the circle on the end as a guide. Carve with the grain, working from the middle toward each cap.</li>
</ol>`,
  });
  add({
    state: 3, phase: 'Shape', title: G.n > 1 ? 'Separate the balls' : 'Free the ball from the caps', figure: { type: 'cageSection', stage: 3 }, blades: ['detail'],
    speak: 'Cut V grooves to free the ball from the caps.',
    checks: ['Core cut free of both caps', ...(G.n > 1 ? ['Balls separated'] : [])],
    html: `
<ol>
<li>At each cap, cut a V groove round the cylinder, deepening it a little at a time from all four windows until the core comes free of the cap.</li>
${G.n > 1 ? '<li>Do the same between neighbouring balls, at the marks halfway between their centres.</li>' : ''}
<li>Chamfer each end of the ball: it now looks like two cones base to base and can move a little in the cage.</li>
</ol>
<p class="tip">Once a ball is loose, hold it still with a finger through a window so it can't rattle against the knife edge.</p>`,
  });
  add({
    state: 4, phase: 'Shape', title: 'Round the ball', figure: { type: 'cageSection', stage: 4 }, blades: ['detail'],
    speak: 'Round the ball, turning it through the windows.',
    checks: ['Ball round', 'Ball turns freely'],
    html: `
<p>Turn the ball as you work and take small slicing cuts to round it. Look at it from the end and from the side: it should stay ${L(G.d)} across every way. Carve downhill on the grain, from the ball's widest point toward its poles.</p>`,
  });
  add({
    state: 5, phase: 'Finish', title: 'Clean up the posts', figure: { type: 'cageSection', stage: 5 }, blades: ['detail'],
    speak: 'Chamfer the inside edges of the posts and clean up.',
    checks: ['Inside edges of the posts chamfered', 'Ball rolls end to end'],
    html: `
<ul>
<li>Chamfer the inside edge of each post. This lightens the look and gives the ball more room.</li>
<li>Clean the inside faces of the caps with light paring cuts.</li>
<li>Finish with a light coat of oil or leave it bare.</li>
</ul>`,
  });
  return steps;
}

// ================================================================ chain
export const CHAIN_DEFAULT = { links: 4, linkLen: 1.5 * IN, linkWidth: 0.875 * IN, wood: 0.25 * IN };

export const CHAIN_PARAMS = [
  { section: 'Chain' },
  { key: 'links', label: 'Links', type: 'int', min: 2, max: 8 },
  { key: 'linkLen', label: 'Link length', type: 'len', min: 0.75 * IN, max: 3 * IN },
  { key: 'linkWidth', label: 'Link width', type: 'len', min: 0.5 * IN, max: 2 * IN, hint: 'Also the width of the square stick you start with.' },
  { key: 'wood', label: 'Link thickness', type: 'len', min: 3, max: 0.5 * IN, hint: 'Thickness of the wood in each link.' },
];

export function chainGeom(Pin) {
  const P = { ...CHAIN_DEFAULT, ...Pin };
  const n = Math.round(clamp(P.links, 2, 8));
  let t = P.wood, w = P.linkWidth, Ll = P.linkLen;
  const notes = [];
  if (w < 3 * t + GAP) { w = 3 * t + GAP; notes.push(`Links widened to ${'%w'} so a link's wood fits through the next link's hole.`); }
  // within the crossing (|u| ≤ t/2) a hole's round end sags by ri − s, so the pitch allows for it
  const ri = w / 2 - t, s = Math.sqrt(Math.max(0, ri * ri - t * t / 4));
  const LlMin = Math.max(w, 2 * w - 4 * s + 3 * GAP);   // room for both neighbours inside each hole
  if (Ll < LlMin) { Ll = LlMin; notes.push(`Links lengthened to ${'%l'} so both neighbouring links fit inside each hole.`); }
  const q = Ll - w + 2 * s - GAP;                       // pitch between link centres
  const end = 2;
  const len = (n - 1) * q + Ll + 2 * end;
  const centres = Array.from({ length: n }, (_, i) => -((n - 1) * q) / 2 + i * q);
  return { P, n, t, w, Ll, q, len, centres, notes, dims: [w, w, len], hl: (Ll - w) / 2, rc: (w - t) / 2 };
}

export function buildChain(Pin, opt) {
  const G = chainGeom(Pin);
  const { t, w, len, centres, hl, rc } = G, ht = t / 2;
  const box = (x, y, z) => Math.min(w / 2 - Math.abs(x), w / 2 - Math.abs(y), len / 2 - Math.abs(z));
  // link i lies in the xz plane (even i) or the yz plane (odd i); u across, nrm out of plane
  const lk = (i, x, y, z) => (i % 2 ? [y, x, z - centres[i]] : [x, y, z - centres[i]]);
  const outerOf = (i, x, y, z) => { const [u, , v] = lk(i, x, y, z); return stadium(v, u, hl, w / 2); };
  const holeOf = (i, x, y, z) => { const [u, , v] = lk(i, x, y, z); return stadium(v, u, hl, w / 2 - t); };
  const flatRing = (i, x, y, z) => { const [u, nn, v] = lk(i, x, y, z); return Math.min(outerOf(i, x, y, z), -holeOf(i, x, y, z), ht - Math.abs(nn)); };
  // round link: distance to the link's centre line (a stadium of radius rc) combined with the out-of-plane offset
  const torus = (i, x, y, z) => { const [u, nn, v] = lk(i, x, y, z); const dc = stadium(v, u, hl, rc); return ht - Math.hypot(dc, nn); };
  const near = (z, par) => centres.map((c, i) => i).filter(i => i % 2 === par && Math.abs(z - centres[i]) < G.Ll / 2 + 2);
  const anyMax = (list, f) => { let m = -Infinity; for (const i of list) { const v = f(i); if (v > m) m = v; } return m; };
  const rings = (x, y, z) => anyMax([...near(z, 0), ...near(z, 1)], i => flatRing(i, x, y, z));
  const centreCol = (x, y) => Math.min(ht - Math.abs(x), ht - Math.abs(y));
  const cuts = [
    // 1. plus-shaped section: cut away the four corners
    { id: 'plus', fn: (x, y) => Math.min(Math.abs(x) - ht, Math.abs(y) - ht) },
    // 2. outer outline of the links on each fin
    { id: 'outline', fn: (x, y, z) => -Math.max(Math.min(ht - Math.abs(y), anyMax(near(z, 0), i => outerOf(i, x, y, z))), Math.min(ht - Math.abs(x), anyMax(near(z, 1), i => outerOf(i, x, y, z)))) },
    // 3. open the holes, away from the centre where the links cross
    { id: 'holes', fn: (x, y, z) => Math.min(-centreCol(x, y), anyMax([...near(z, 0), ...near(z, 1)], i => holeOf(i, x, y, z)), -rings(x, y, z)) },
    // 4. free the links where they cross
    { id: 'free', fn: (x, y, z) => -rings(x, y, z) },
  ];
  // 5. round the links
  cuts.push({ id: 'round', replace: (x, y, z) => anyMax([...near(z, 0), ...near(z, 1)], i => torus(i, x, y, z)) });
  const stages = stagesFrom(box, cuts);
  const model = stagedModel({ dims: G.dims, stages, h: clamp(Math.max(t / 12, Math.cbrt(G.dims[0] * G.dims[1] * G.dims[2] / 1.2e6)), 0.25, 0.8), kind: 'chain', extra: { P: G.P, G } });
  return { model, steps: chainSteps(model, opt) };
}

function chainSteps(model, opt) {
  const { G } = model, u = opt.units, L = mm => fmtLen(mm, u);
  const notes = G.notes.map(t => t.replace('%w', L(G.w)).replace('%l', L(G.Ll)));
  const last = model.stages.length - 1, steps = [];
  const iso = { yaw: -0.8, pitch: 0.3 };
  const add = s => steps.push({ id: `n${steps.length}`, checks: [], view: iso, ...s });
  add({
    phase: 'Plan', title: 'What you’re carving', figure: { type: 'chainSide' }, state: last, blades: ['detail'],
    speak: `A chain of ${G.n} links from one stick.`,
    html: `
<p>A chain of <b>${G.n} links</b>, each ${L(G.Ll)} long and ${L(G.w)} wide, carved from one stick ${L(G.w)} × ${L(G.w)} × ${L(G.len)}. The links alternate between two planes at right angles.</p>
<div class="kv">
  <div><span>Link wood</span><b>${L(G.t)}</b></div>
  <div><span>Hole in each link</span><b>${L(G.Ll - 2 * G.t)} × ${L(G.w - 2 * G.t)}</b></div>
  <div><span>Link spacing</span><b>${L(G.q)}</b></div>
</div>
${notes.map(t => `<p class="warn">${t}</p>`).join('')}
<p>Each link's hole is wide enough for the next link's wood to pass through with ${L(G.w - 3 * G.t)} to spare, and long enough to hold the ends of both neighbours. That's what lets the links move once they're freed.</p>`,
  });
  add({
    state: 0, phase: 'Prepare', title: 'Mark out the stick', figure: { type: 'chainSide', mark: true }, blades: [],
    speak: 'Mark the plus shape on the ends and the links on the faces.',
    checks: ['Stick square and to size', 'Plus shape marked on the ends', 'Links marked on all four faces'],
    html: `
<ol>
<li>Use straight-grained basswood with the grain along the stick. Square it to <b>${L(G.w)} × ${L(G.w)}</b> and at least ${L(G.len)} long.</li>
<li>On each end, draw a centred plus sign with arms ${L(G.t)} thick: this is the section you'll cut first.</li>
<li>Print the template and mark the links along the stick: the even-numbered links on two opposite faces, the odd-numbered ones on the other two.</li>
</ol>`,
  });
  add({
    state: 1, phase: 'Rough', title: 'Cut the plus-shaped section', figure: { type: 'chainEnd' }, blades: ['detail', 'pelican'],
    speak: 'Cut away the four long corners to leave a plus-shaped section.',
    checks: ['All four corners removed', `Fins ${L(G.t)} thick`],
    html: `
<p>Remove the four long corners of the stick, leaving two fins ${L(G.t)} thick that cross at right angles.</p>
<ul>
<li>Make a stop cut along each line of the plus, then slice the corner out toward it with the <b>pelican knife</b>.</li>
<li>Clean the inside corners with the tip of the <b>detail knife</b>. Keep the fins an even thickness: they become the links.</li>
</ul>`,
  });
  add({
    state: 2, phase: 'Rough', title: 'Cut the outlines of the links', figure: { type: 'chainSide', stage: 2 }, blades: ['detail'],
    speak: 'Shape the outside of each link on its fin.',
    checks: ['Outer outline cut on every link', 'Gaps between links on each fin'],
    html: `
<p>On each fin, cut the outside shape of its links: rounded ends, and a gap between one link and the next on the same fin. Work with the grain from the middle of each link toward its ends.</p>
<p class="tip">Leave the centre, where the two fins cross, alone for now: that's where the links pass through each other.</p>`,
  });
  add({
    state: 3, phase: 'Shape', title: 'Open the holes', figure: { type: 'chainSide', stage: 3 }, blades: ['detail'],
    speak: 'Cut through the holes in each link, either side of the centre.',
    checks: ['Every hole cut through on both sides of the centre'],
    html: `
<p>Drill or cut out the hole in each link with the tip of the <b>detail knife</b>, working from both faces of the fin to meet in the middle. Stop at the centre crossing: the wood there belongs to the neighbouring links.</p>`,
  });
  add({
    state: 4, phase: 'Shape', title: 'Free the links', figure: { type: 'chainSide', stage: 4 }, blades: ['detail'],
    speak: 'Cut away the small bridges where the links cross, to free them.',
    checks: ['All links free'],
    html: `
<p>Where the links cross, small bridges of wood still join each link's end to the next link. Work into these from the holes with the knife tip, taking tiny cuts, until each link moves.</p>
<p class="tip">This is the fiddly part. Support the links you're not cutting, and don't twist the knife: short grain here snaps easily.</p>`,
  });
  add({
    state: 5, phase: 'Finish', title: 'Round the links', figure: { type: 'chainSide', stage: 5 }, blades: ['detail'],
    speak: 'Round each link and smooth it.',
    checks: ['Links rounded', 'Chain hangs freely'],
    html: `
<p>Round the square section of each link into a smooth oval with small slicing cuts, working from the sides of each link toward the ends. </p>`,
  });
  return steps;
}
