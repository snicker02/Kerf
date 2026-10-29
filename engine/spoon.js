// Spoon designer. Axes: x along the spoon (bowl at +x), y across, z up through the blank.
// The blank is roughed out in two views — top outline, then side profile with the crank — as
// carvers do, then the bowl is hollowed (hook knife, gouge scorp), the back of the bowl and the
// handle are rounded (pelican knife), and the edges softened.

import { MM_PER_IN as IN, fmtLen } from './units.js';
import { stagedModel, stagesFrom, clamp, smin, roundAnd } from './staged.js';
import { model as jackModel } from './jack.js';

export const SPOON_DEFAULT = {
  length: 8 * IN, bowlLen: 2.6 * IN, bowlWidth: 1.75 * IN, bowlDepth: 0.5 * IN, bowlShape: 'egg',
  handleWidth: 0.8 * IN, neckWidth: 0.45 * IN, thick: 0.45 * IN, crank: 0.45 * IN, wall: 4, end: 'round',
};

export const SPOON_PARAMS = [
  { section: 'Spoon' },
  { key: 'length', label: 'Overall length', type: 'len', min: 4 * IN, max: 14 * IN },
  { section: 'Bowl' },
  { key: 'bowlShape', label: 'Shape', type: 'seg', options: [['egg', 'Egg'], ['round', 'Round'], ['pointed', 'Pointed']] },
  { key: 'bowlLen', label: 'Length', type: 'len', min: 1 * IN, max: 4.5 * IN },
  { key: 'bowlWidth', label: 'Width', type: 'len', min: 0.8 * IN, max: 3 * IN, hint: 'The Jack’s hook knife needs a bowl at least 1 1/2″ wide to reach the bottom cleanly.' },
  { key: 'bowlDepth', label: 'Depth', type: 'len', min: 4, max: 1 * IN },
  { key: 'wall', label: 'Wall thickness', type: 'len', min: 2.5, max: 8, hint: 'Thickness of the bowl at the bottom. 1/8″–3/16″ is typical.' },
  { section: 'Handle' },
  { key: 'handleWidth', label: 'Handle width', type: 'len', min: 0.4 * IN, max: 1.5 * IN },
  { key: 'neckWidth', label: 'Neck width', type: 'len', min: 0.25 * IN, max: 1 * IN },
  { key: 'thick', label: 'Handle thickness', type: 'len', min: 0.25 * IN, max: 0.9 * IN },
  { key: 'crank', label: 'Crank', type: 'len', min: 0, max: 1.2 * IN, hint: 'How far the bowl sits above the handle line. A crank makes a better eating and stirring spoon.' },
  { key: 'end', label: 'Handle end', type: 'seg', options: [['round', 'Round'], ['pointed', 'Pointed'], ['square', 'Square']] },
];

const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

export function spoonGeom(Pin) {
  const P = { ...SPOON_DEFAULT, ...Pin };
  const L = P.length, a = P.bowlLen / 2, b = P.bowlWidth / 2;
  const x1 = L / 2, bx = x1 - a;                      // bowl centre
  const x0 = -L / 2;                                   // handle end
  const neckX = bx - a - 0.06 * L;                      // where the neck is narrowest
  const crankStart = neckX - 0.12 * L, crankEnd = bx - a * 0.6;
  const ht = P.thick, depth = Math.min(P.bowlDepth, b * 0.9), wall = P.wall;
  const spine = x => P.crank * (smooth((x - crankStart) / (crankEnd - crankStart)) - 0.5);
  const zr = P.crank / 2 + ht / 2;                     // rim plane of the bowl
  // top outline: half-width along x
  const bowlHalf = x => {
    const t = (x - bx) / a;
    if (t <= -1 || t >= 1) return -1;
    const egg = P.bowlShape === 'egg' ? 1 + 0.14 * t : 1;
    const pw = P.bowlShape === 'pointed' ? Math.pow(1 - t * t, 0.5) * (1 - 0.35 * Math.max(0, t) ** 2) : Math.sqrt(1 - t * t);
    return b * pw * egg * (P.bowlShape === 'round' ? 1 : 0.98);
  };
  const handleHalf = x => {
    if (x < x0 || x > bx) return -1;
    const t = clamp((x - x0) / (neckX - x0), 0, 1);
    let w = P.handleWidth / 2 + (P.neckWidth / 2 - P.handleWidth / 2) * smooth(t * 1.05);
    const e = x - x0, er = P.handleWidth / 2;
    if (P.end === 'round' && e < er) w = Math.min(w, Math.sqrt(Math.max(0, er * er - (er - e) ** 2)));
    if (P.end === 'pointed' && e < er * 2.2) w = Math.min(w, (e / (er * 2.2)) * w + 0.4);
    return w;
  };
  const halfW = x => {
    const h = handleHalf(x), bw = bowlHalf(x);
    return Math.max(h, bw, -1) > 0 ? -smin(-Math.max(h, 0), -Math.max(bw, 0), 3) : -1;
  };
  // side profile: top and bottom z along x
  const handleTop = x => spine(x) + ht / 2, handleBot = x => spine(x) - ht / 2;
  const bowlBot = x => { const t = (x - bx) / a; return Math.abs(t) < 1 ? zr - (depth + wall) * Math.sqrt(1 - t * t) : Infinity; };
  const top = x => (x > bx - a ? Math.max(zr, handleTop(x)) : handleTop(x));
  const bot = x => Math.min(handleBot(x), bowlBot(x));
  // z range and blank
  let zmin = Infinity, zmax = -Infinity, wmax = 0;
  for (let i = 0; i <= 400; i++) { const x = x0 + (x1 - x0) * i / 400; zmin = Math.min(zmin, bot(x)); zmax = Math.max(zmax, top(x)); wmax = Math.max(wmax, halfW(x)); }
  const m = 3;
  const blank = [L + 2 * m, 2 * wmax + 2 * m, zmax - zmin + 2 * m];
  const zc = (zmax + zmin) / 2;
  // inner hollow: ellipsoid under the rim plane
  const ai = a - wall * 1.4, bi = b - wall * 1.4;
  const hookR = { across: bi * bi / depth, along: ai * ai / depth, ends: depth * depth / ai, sides: depth * depth / bi };
  return { P, L, a, b, bx, x0, x1, neckX, crankStart, crankEnd, ht, depth, wall, zr, zc, blank, ai, bi, halfW, bowlHalf, handleHalf, top, bot, spine, hookR, wmax };
}

export function buildSpoon(Pin, opt) {
  const G = spoonGeom(Pin), P = G.P;
  const [BL, BW, BT] = G.blank;
  const zc = G.zc;
  const box = (x, y, z) => Math.min(BL / 2 - Math.abs(x), BW / 2 - Math.abs(y), BT / 2 - Math.abs(z));
  const Z = z => z + zc;                               // fields work in spoon coordinates; the blank is centred on z = zc
  const topView = (x, y) => G.halfW(x) - Math.abs(y);
  const sideView = (x, z) => Math.min(G.top(x) - z, z - G.bot(x));
  const inBowl = (x, y, z, sa, sb, sd) => (1 - Math.hypot((x - G.bx) / sa, y / sb, (z - G.zr) / sd)) * Math.min(sa, sb, sd);
  const hollow = shrink => (x, y, z) => { const zz = Z(z); return Math.min(inBowl(x, y, zz, G.ai - shrink, G.bi - shrink, G.depth - shrink), G.zr + 5 - zz); };
  // outside of the bowl: at each station an ellipse as wide as the outline and as deep as the side profile
  const shell = (x, y, zz) => {
    const t = (x - G.bx) / G.a, bw = G.bowlHalf(x);
    if (bw <= 0.3) return -Math.max(0.3, Math.hypot(Math.max(0, Math.abs(x - G.bx) - G.a), y, Math.max(0, G.zr - zz)));
    const dd = Math.max(0.3, (G.depth + G.wall) * Math.sqrt(1 - t * t));
    return (1 - Math.hypot(y / bw, Math.max(0, G.zr - zz) / dd)) * Math.min(bw, dd);
  };
  // the handle: an oval section around the spine, fading out under the bowl
  const tube = (x, y, zz) => {
    const w = Math.max(0.6, G.handleHalf(x) > 0 ? G.handleHalf(x) : G.P.neckWidth / 2), t = G.ht / 2;
    return (1 - Math.hypot(y / w, (zz - G.spine(x)) / (t * 1.1))) * Math.min(w, t) - Math.max(0, x - (G.bx - 0.45 * G.a));
  };
  const outer = (x, y, z) => { const zz = Z(z); return -smin(-shell(x, y, zz), -tube(x, y, zz), 4); };
  const ramp = x => (G.neckX - x) * 0.6;              // > 0 on the handle side: the back-of-bowl step leaves the handle alone
  const cuts = [
    { id: 'top', fn: (x, y) => -topView(x, y) },
    { id: 'side', fn: (x, y, z) => -sideView(x, Z(z)) },
    { id: 'rough', fn: hollow(2.5) },
    { id: 'back', fn: (x, y, z) => -Math.max(outer(x, y, z), ramp(x)) },
    { id: 'handle', fn: (x, y, z) => -outer(x, y, z) },
    { id: 'hollow', fn: hollow(0) },
  ];
  const fin = stagesFrom(box, cuts).at(-1);
  // soften the rim, inside and out (the plane is pushed away over the handle so the neck is untouched)
  const rim = (x, z) => G.zr - Z(z) + 0.4 + Math.max(0, (G.bx - 0.75 * G.a) - x) * 2;
  cuts.push({ id: 'refine', replace: (x, y, z) => roundAnd(fin(x, y, z), rim(x, z), 1.5) });
  const stages = stagesFrom(box, cuts);
  const model = stagedModel({ dims: G.blank, stages, h: clamp(Math.max(...G.blank) / 330, 0.45, 0.8), kind: 'spoon', extra: { P, G } });
  return { model, steps: spoonSteps(model, opt) };
}

function spoonSteps(model, opt) {
  const { P, G } = model;
  const u = opt.units, L = mm => fmtLen(mm, u), J = jackModel(opt.jack), H = J.hand, O = J.other;
  const last = model.stages.length - 1;
  const steps = [];
  const side = { yaw: -Math.PI / 2 + 0.0001, pitch: 0.05 }, iso = { yaw: -0.95, pitch: 0.55 }, topV = { yaw: -Math.PI / 2, pitch: 1.35 }, under = { yaw: -0.95, pitch: -0.6 };
  const add = s => steps.push({ id: `p${steps.length}`, checks: [], ...s });
  const hookFits = J.hookR <= G.hookR.across && J.hookR <= G.hookR.along;
  const tight = Math.min(G.hookR.ends, G.hookR.sides);
  add({
    phase: 'Plan', title: 'What you’re carving', figure: { type: 'spoonViews' }, state: last, view: iso, blades: ['pelican', 'hook', 'scorp'],
    speak: `A ${L(P.length).replace('″', ' inch')} spoon with a ${P.bowlShape} bowl.`,
    html: `
<p>A <b>${L(P.length)} spoon</b> with a ${P.bowlShape} bowl ${L(P.bowlLen)} long, ${L(P.bowlWidth)} wide and ${L(G.depth)} deep, ${P.crank > 1 ? `and a ${L(P.crank)} crank` : 'and a straight handle'}.</p>
<div class="kv">
  <div><span>Blank</span><b>${L(G.blank[0])} × ${L(G.blank[1])} × ${L(G.blank[2])}</b></div>
  <div><span>Bowl bottom radius (across)</span><b>${L(G.hookR.across)}</b></div>
  <div><span>Hook knife radius</span><b>${L(J.hookR)}</b></div>
  <div><span>Tightest curve in the bowl</span><b>${L(tight)}</b></div>
</div>
${hookFits ? `<p class="ok">The Jack's ${L(J.hookR)} hook knife fits the bottom of this bowl. The ends and sides curve more tightly (down to ${L(tight)} radius) near the rim; use the gouge scorp there.</p>`
      : `<p class="warn">The bottom of this bowl curves more tightly (${L(Math.min(G.hookR.across, G.hookR.along))} radius) than the Jack's ${L(J.hookR)} hook knife. Make the bowl wider or shallower, or plan on doing the bottom with the gouge scorp.</p>`}
<p>The plan follows the classic spoon-carving order: cut the shape seen from above, then the shape seen from the side, hollow the bowl, round the back and the handle, then refine.</p>`,
  });
  add({
    phase: 'Prepare', title: 'Choose the wood and mark the blank', figure: { type: 'spoonViews' }, state: 0, view: topV, blades: [],
    speak: 'Choose a straight-grained blank and mark the top view on it.',
    checks: ['Blank cut to size', 'Grain runs along the length', 'Top view drawn'],
    html: `
<ul>
<li>Use a blank at least <b>${L(G.blank[0])} × ${L(G.blank[1])} × ${L(G.blank[2])}</b>. The grain must run <b>along the length</b>; the neck is the weak point and needs long grain through it.</li>
<li>Good spoon woods for knife work: basswood (soft, easy, but a little fuzzy when wet), cherry or birch (harder, and better for spoons you'll actually eat with). Green, freshly cut wood carves far more easily than dry.</li>
<li>Print the templates at 100%, cut out the top view, and draw round it on the top face. Draw the side view on the side face.</li>
</ul>`,
  });
  const S = (k, s) => add({ state: k, ...s });
  S(1, {
    phase: 'Rough', title: 'Cut the top outline', figure: { type: 'spoonTop', hl: true }, view: topV, blades: ['pelican'],
    speak: 'Cut the outline seen from above.',
    checks: ['Outline cut square to the face'],
    html: `
<p>Remove everything outside the outline, keeping the sides square to the face.${opt.saw ? ' A coping saw is fastest: saw just outside the line.' : ''}</p>
<ul>
<li><b>Pelican knife</b>: long push cuts down the sides of the handle, always from the wide part toward the narrow part so you cut downhill on the grain.</li>
<li>Round the bowl end with short slicing cuts, turning the blank as you go.</li>
<li>Leave the neck a little wide for now (about ${L(P.neckWidth + 3)}). It's easier to thin it once the crank is cut.</li>
</ul>`,
  });
  S(2, {
    phase: 'Rough', title: 'Cut the side profile and crank', figure: { type: 'spoonSide', hl: true }, view: side, blades: ['pelican'],
    speak: 'Cut the side profile, including the crank.',
    checks: ['Side profile cut', 'Handle an even thickness'],
    html: `
<p>Turn the blank on its side and remove everything outside the side view: the underside of the bowl, the crank where the handle rises to the bowl, and the handle down to ${L(P.thick)} thick.</p>
<ul>
<li>Carve the crank with cuts from the handle toward the bowl on top, and from the bowl toward the handle underneath. This keeps you cutting downhill on the grain each way.</li>
<li>Check that the rim is flat across: lay a straightedge across the bowl.</li>
</ul>
<p class="tip">Brace the blank against a bench hook or your chest rather than holding it in the air. Keep your ${O} hand behind the edge on every push cut.</p>`,
  });
  S(3, {
    phase: 'Rough', title: 'Rough out the bowl', figure: { type: 'spoonSection', station: 'bowl' }, view: iso, blades: ['scorp', 'hook'],
    speak: 'Rough out the bowl hollow with the gouge scorp and hook knife.',
    checks: ['Bowl roughed to within 1/8″ of final depth'],
    html: `
<ol>
<li>Draw the inside of the bowl on the rim, a wall's width (${L(G.wall * 1.4)}) in from the edge.</li>
<li><b>Gouge scorp</b>: start in the middle and pull scoops toward yourself, working outward in rings.</li>
<li><b>Hook knife</b>: once the hollow is wider than the hook, take long sweeping cuts across the bowl from rim to rim, rolling your ${H} wrist. Cut across the grain, or from the sides down into the middle, never from the end of the bowl straight down: that tears the grain.</li>
<li>Stop about ${L(2.5)} short of the final depth (${L(G.depth)}).</li>
</ol>`,
  });
  S(4, {
    phase: 'Shape', title: 'Shape the back of the bowl', figure: { type: 'spoonSide' }, view: under, blades: ['pelican'],
    speak: 'Round the back of the bowl.',
    checks: ['Back of the bowl evenly rounded'],
    html: `
<p><b>Pelican knife</b>: round the underside of the bowl into a smooth dome that follows the inside curve, cutting from the deepest point outward toward the rim. Use thumb-push cuts with your ${O} thumb on the back of the blade for control.</p>
<p class="tip">Hold the spoon up to a light and look into the bowl: thin spots glow. Aim for an even wall of about ${L(G.wall)}.</p>`,
  });
  S(5, {
    phase: 'Shape', title: 'Round the handle', figure: { type: 'spoonSection', station: 'handle' }, view: iso, blades: ['pelican'],
    speak: 'Round the handle and thin the neck.',
    checks: ['Handle rounded', `Neck at ${L(P.neckWidth)}`],
    html: `
<ol>
<li>Chamfer the four long corners of the handle, then chamfer the new corners, until the section is a soft oval.</li>
<li>Bring the neck down to <b>${L(P.neckWidth)}</b> wide. Take light cuts: this is the shortest grain on the spoon.</li>
<li>Shape the handle end (${P.end}).</li>
</ol>`,
  });
  S(6, {
    phase: 'Shape', title: 'Finish the bowl', figure: { type: 'spoonSection', station: 'bowl', hook: true }, view: iso, blades: ['hook', 'scorp'],
    speak: 'Finish the inside of the bowl with clean hook knife cuts.',
    checks: [`Bowl ${L(G.depth)} deep`, 'Even wall thickness', 'Clean, faceted finish inside'],
    html: `
<p><b>Hook knife</b>: take the bowl to its final depth with long, thin cuts across the bowl. Freshly stropped, the hook leaves a smooth, faceted surface that needs no sanding.</p>
<p>${hookFits ? `The bottom curves at about ${L(G.hookR.across)} radius, so the ${L(J.hookR)} hook fits it.` : `The bottom curves at ${L(Math.min(G.hookR.across, G.hookR.along))} radius, tighter than the hook: finish it with the gouge scorp.`} Near the ends of the bowl the curve tightens to ${L(tight)}; finish those with the <b>gouge scorp</b>.</p>`,
  });
  S(7, {
    phase: 'Refine', title: 'Refine and soften the edges', figure: { type: 'spoonViews' }, view: iso, blades: ['detail', 'pelican'],
    speak: 'Soften every edge and check the wall.',
    checks: ['Rim edge softened', 'No sharp edges on the handle'],
    html: `
<ul>
<li><b>Detail knife</b>: put a small bevel on the rim, inside and out, so it's comfortable on the lips and won't chip.</li>
<li>Go over the whole spoon with light finishing cuts. Look along it from the end to check the handle is straight and the bowl level.</li>
</ul>`,
  });
  add({
    phase: 'Finish', title: 'Dry and oil', figure: { type: 'spoonViews' }, state: last, view: iso, blades: [],
    speak: 'Let it dry, then oil with a food-safe oil.',
    checks: ['Dried slowly', 'Oiled'],
    html: `
<ol>
<li>If the wood was green, let the spoon dry slowly for a few days in a paper bag, away from heat, so it doesn't crack.</li>
<li>Oil it with a food-safe drying oil: raw linseed (flax) oil or walnut oil. Wipe off the excess and let it cure for a week before use.</li>
<li>Wash by hand only; never put it in the dishwasher.</li>
</ol>`,
  });
  return steps;
}
