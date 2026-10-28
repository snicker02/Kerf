// Turns a surface model + plan into the step-by-step carving guide for the Carvin' Jack.
// Each step: { id, phase, title, html, figure, state, hl, focus, checks, speak, toolMap }

import { FACES } from './model.js';
import { FACE_ORDER } from './plan.js';
import { emptyState, cloneState } from './mesh.js';
import { fmtLen, niceStep, MM_PER_IN } from './units.js';
import { SURF_BY_ID, MODES } from './tpms.js';
import { jackToolsHTML, jackGripsHTML } from './technique.js';

const ftag = fi => `<b class="ftag">${FACES[fi].id}</b>`;
const fname = fi => `${ftag(fi)} ${FACES[fi].name.toLowerCase()}`;
const pct = x => `${Math.round(x * 100)}%`;
const GRAIN_FACES = [[4, 5], [2, 3], [0, 1]]; // grain along x → E–F, y → C–D, z → A–B

export function where(p, dims) {
  if (!p) return 'the middle';
  const parts = [];
  const t = [p[0] / dims[0], p[1] / dims[1], p[2] / dims[2]];
  if (t[2] > 0.18) parts.push('upper'); else if (t[2] < -0.18) parts.push('lower');
  if (t[1] < -0.18) parts.push('front'); else if (t[1] > 0.18) parts.push('back');
  if (t[0] > 0.18) parts.push('right'); else if (t[0] < -0.18) parts.push('left');
  return parts.length ? `the ${parts.join(' ')} part of the block` : 'the centre of the block';
}

export function difficulty(model, plan) {
  const st = model.stats, j = plan.jack, why = [];
  let score = 0;
  if (j.outFrac > 0.02) { score += 2; why.push(`${pct(j.outFrac)} of the surface is out of the Jack’s reach`); }
  else if (j.outFrac > 0.003) { score++; why.push('a few spots are out of the Jack’s reach'); }
  if (st.cellsAcross > 1.6) { score++; why.push('several cells across the block'); }
  if (st.hiddenFrac > 0.15) { score++; why.push('a lot of hidden tunnel waste'); }
  if (st.thinIn < 8) { score++; why.push('thin walls'); }
  if (j.share.gouge + j.share.scorp > 0.35) { score++; why.push('many tight hollows for the small scorp and gouge'); }
  if (model.P.mode === 'sheet') { score++; why.push('a sheet has two faces to shape'); }
  if (model.P.bound !== 'box') { score++; why.push('a curved outer form'); }
  const level = score <= 1 ? 'Good first project' : score <= 3 ? 'Moderate' : 'Ambitious';
  return { level, score, why, cls: score <= 1 ? 'easy' : score <= 3 ? 'mid' : 'hard' };
}

export function buildSteps(model, plan, opt) {
  const u = opt.units;
  const L = mm => fmtLen(mm, u);
  const P = model.P, st = model.stats, j = plan.jack, J = j.J;
  const S = SURF_BY_ID[P.surface];
  const mode = MODES.find(m => m.id === P.mode);
  const dimsTxt = `${L(P.W)} × ${L(P.D)} × ${L(P.H)}`;
  const boundTxt = P.bound === 'sphere' ? ', finished as a sphere' : P.bound === 'cylinder' ? ', finished as an upright cylinder' : '';
  const box = P.bound === 'box';
  const holesAll = plan.holes.flat();
  const diff = difficulty(model, plan);
  const steps = [];
  let cur = emptyState();
  const final = { ...emptyState(), final: true };
  const add = s => steps.push({ id: `s${steps.length}`, checks: [], hl: null, focus: null, ...s });
  const H = J.hand, O = J.other;

  // ---------------------------------------------------------------- overview
  const cells = st.cellsAcross;
  const cellsTxt = cells < 1.15 ? 'One repeat of the pattern fills the block.'
    : `About ${cells.toFixed(1).replace(/\.0$/, '')} repeats of the pattern span the block.`;
  const reachTxt = j.outFrac < 0.003
    ? `<p class="ok">Every part of the finished surface is within reach of the Jack’s blades with your hand on the handle.</p>`
    : `<p class="warn">About <b>${pct(j.outFrac)}</b> of the finished surface sits deeper in a tunnel than any of the Jack’s blades can reach while the handle and your grip still fit, mostly in ${where(j.outAt, model.dims)}. A larger cell size, a negative fill, or a smaller block fixes this. Step “Spots the Jack can’t reach” covers the alternatives.</p>`;
  add({
    phase: 'Plan', title: 'What you’re carving', figure: { type: 'net' }, state: final,
    speak: `A ${S.name} ${mode.name.toLowerCase()} from a ${dimsTxt.replace(/″/g, ' inch')} block, carved with the Carvin' Jack.`,
    html: `
<p>A <b>${S.name}</b> ${mode.long}, cut from a <b>${dimsTxt}</b> block${boundTxt}, carved with your <b>${J.title}</b>. ${cellsTxt}</p>
<p class="muted">${S.note}</p>
<div class="kv">
  <div><span>Wood you keep</span><b>${pct(st.keepFrac)}</b></div>
  <div><span>Waste hidden in curving tunnels</span><b>${pct(st.hiddenFrac)}</b></div>
  <div><span>Thinnest wall or neck</span><b>≈ ${L(st.thinIn)}</b></div>
  <div><span>Tightest hollow (radius)</span><b>${L(j.r5)}</b></div>
  <div><span>Deepest reach needed (95%)</span><b>${isFinite(j.need95) ? L(j.need95) : '—'}</b></div>
  <div><span>Blade that does most work</span><b>${bladeName(topBlade(j.share))}</b></div>
</div>
${reachTxt}
<p class="rating ${diff.cls}"><b>${diff.level}.</b> ${diff.why.length ? 'Harder because of ' + diff.why.join(', ') + '.' : 'Big passages, sturdy walls, and flat faces to measure from.'}</p>
${st.islandCount ? `<p class="warn">${st.islandCount} small loose piece${st.islandCount > 1 ? 's' : ''} of the pattern (${pct(st.islandFrac)} of the wood) would fall out of this block, so they are treated as waste. Shifting the pattern (Phase) or changing the cell size can avoid that.</p>` : ''}
<p>The plan: ${opt.drill ? 'drill holes to measured depths to clear bulk waste, then ' : ''}cut the block down in even layers from every face with stop cuts and relief cuts. Then open the hidden passages with the hook knife and scorp, and shape each region with the blade whose curve fits it.</p>`,
  });

  // ---------------------------------------------------------------- the Jack
  add({
    phase: 'Plan', title: 'Your Carvin’ Jack', figure: { type: 'jack' }, state: final, toolMap: true,
    speak: `The six blades of the Carvin' Jack and the cuts you'll use. Hold it in your ${H} hand.`,
    checks: ['All six blades open, lock and close', 'Blades stropped'],
    html: `
<p>Everything in this guide is done with the Jack's six blades. The 3D view shows the <b>tool map</b>: each part of the finished surface is coloured by the blade whose curve fits it (key at the bottom of the view).</p>
${jackToolsHTML(J, u, j.share)}
${jackGripsHTML(J)}`,
  });

  // ---------------------------------------------------------------- supplies
  add({
    phase: 'Plan', title: 'Wood and supplies', figure: { type: 'none' }, state: final,
    speak: 'Wood and the few supplies besides the Jack.',
    html: `
<h4>Wood</h4>
<ul><li>Basswood (sold as linden or lime) is the standard knife-carving wood: soft, even and close-grained, and it holds detail. Butternut is a good second choice. Avoid hardwoods: the small blades will struggle with them.</li>
<li>One block at least ${L(Math.max(P.W, P.D, P.H) + 6.35)} on its longest side, so you can square it down to ${dimsTxt}.</li></ul>
<h4>Besides the Jack</h4>
<ul>
<li>A cut-resistant glove for the hand that holds the work (your ${O} hand) and a thumb guard for your ${H} thumb.</li>
<li>A leather strop with honing compound, and a dowel wrapped in leather for the inside of the hook and scorps.</li>
<li>A pencil, a small square or rule with a depth end, and calipers for checking walls.</li>
<li>A bench hook or a clamp, so you can brace the block for long push cuts instead of holding it in your lap.</li>
${opt.drill ? `<li>A drill with ${plan.bitUse.map(b => b.bit.label).join(' and ')} bits and a depth stop (tape flag on the bit is fine).</li>` : ''}
<li>Sandpaper 120 to 320 and Danish oil or paste wax to finish.</li>
</ul>`,
  });

  // ---------------------------------------------------------------- prepare stock
  const ga = { x: 0, y: 1, z: 2 }[opt.grain || 'z'];
  const gf = GRAIN_FACES[ga];
  add({
    phase: 'Prepare', title: 'Square the block and label the faces', figure: { type: 'net', labelsOnly: true }, state: cloneState(cur),
    speak: `Square the block to ${dimsTxt.replace(/″/g, ' inch')} and label the faces A to F.`,
    checks: ['Block squared to size', 'Faces labelled A–F', 'Grain direction marked'],
    html: `
<ol>
<li>Saw or sand the block to <b>${dimsTxt}</b> (width × depth × height). The faces must be flat and square: every depth in this guide is measured from them. Buying a pre-cut basswood block of the right size saves this step.</li>
<li>Orient it so the grain runs between ${fname(gf[0])} and ${fname(gf[1])}. Draw an arrow for the grain direction.</li>
<li>Write the face letters in pencil as on the map: ${[0, 1, 2, 3, 4, 5].map(fname).join(', ')}.</li>
</ol>
<p class="tip">End grain (the two faces the grain arrow points through) is the hardest to cut with a knife. Take thinner slices there and strop more often.</p>`,
  });

  // ---------------------------------------------------------------- templates
  const cal = u === 'in' ? '1″' : '25 mm';
  add({
    phase: 'Prepare', title: 'Print and apply the templates', figure: { type: 'net', holes: opt.drill }, state: cloneState(cur),
    speak: 'Print the face templates at actual size and glue each one to its face.',
    checks: ['Printed at 100% — calibration bar checked', ...[0, 1, 2, 3, 4, 5].map(fi => `Template ${FACES[fi].id} glued`), ...(opt.drill ? ['Hole centres pricked with an awl'] : [])],
    html: `
<ol>
<li>Press <b>Print templates</b>. Print at <b>100% / Actual size</b>, never “Fit to page”, and check that the calibration bar on each sheet measures exactly <b>${cal}</b>.</li>
<li>Cut each face template on its outline and glue it to its face with a glue stick. The letters along its edges name the neighbouring faces; line them up with your pencil letters.</li>
<li>${box ? 'The <b>shaded</b> areas are wood that stays: the flat face is part of the finished surface there. White is waste. Your first stop cuts follow the outline between them.' : 'Your finished form is curved, so none of the flat faces survive. The outlines show where the pattern meets each face.'}</li>
${opt.drill ? '<li>Prick every hole centre with an awl.</li>' : ''}
</ol>
<p class="tip">The paper peels off as you cut. Before it goes, trace the outline into the wood with a light V-scorp groove so you keep the line.</p>`,
  });

  // ---------------------------------------------------------------- optional drilling
  for (const fi of FACE_ORDER) {
    const hs = plan.holes[fi];
    if (!hs.length) continue;
    cur.drill.push(fi);
    const through = hs.filter(h => h.through);
    add({
      phase: 'Drill', title: `Drill face ${FACES[fi].id} (${FACES[fi].name.toLowerCase()})`, face: fi,
      figure: { type: 'drill', face: fi }, state: cloneState(cur), hl: { type: 'holes', face: fi }, focus: fi,
      speak: `Face ${FACES[fi].id} up. ${hs.length} holes.`,
      table: 'holes',
      html: `
<p>Optional: drilling saves knife work, but the Jack can do it all. Clamp the block with ${fname(fi)} up. Hold the drill square to the face and stop at each depth; they leave <b>${L(opt.drillMargin)}</b> above the finished surface.</p>
${through.length ? `<p><b>T</b> holes go right through. Put scrap under the block, or drill halfway from each side.</p>` : ''}
<p class="tip">Afterwards, the walls between holes break out easily with the pelican knife: lever-cut toward a hole, not away from it.</p>`,
    });
  }

  // ---------------------------------------------------------------- roughing bands (round robin)
  const K = Math.max(0, ...plan.bandDepths.map(d => d.length));
  let firstBand = true;
  for (let k = 0; k < K; k++) {
    for (const fi of [0, 1, 2, 3, 4, 5]) {
      const depths = plan.bandDepths[fi];
      if (k >= depths.length || !plan.bandCounts[fi][k]) continue;
      const d = depths[k], prev = k ? depths[k - 1] : 0;
      cur.bands[fi] = d;
      add({
        phase: 'Rough', title: `Layer ${k + 1}: face ${FACES[fi].id} to ${L(d)}`, face: fi,
        figure: { type: 'band', face: fi, k }, state: cloneState(cur), hl: { type: 'plane', face: fi, depth: d }, focus: fi,
        speak: `Face ${FACES[fi].id} toward you. Remove the hatched waste down to ${L(d).replace('″', ' inch')}, in thin stop-cut and relief passes.`,
        checks: [`Hatched area at ${L(d)}`],
        html: `
<p><b>Layer ${k + 1} of ${depths.length}</b> on this face. Work with ${fname(fi)} toward you and take the <b>hatched</b> area from ${prev ? L(prev) : 'the face'} down to <b>${L(d)}</b>.</p>
<ol>
<li><b>Detail knife</b>: stop cut straight down along the hatched outline, about 1/8″ deep.</li>
<li><b>Pelican knife</b>: relief cut toward the stop cut from inside the hatched area with a thumb-push cut. Lift the chip out. Repeat stop cut and relief until you reach ${L(d)}${d - prev > 9 ? `, usually ${Math.ceil((d - prev) / 3.175)} passes` : ''}.</li>
<li>Where the hatched area is a pocket rather than an edge, scoop it with the <b>gouge scorp</b>, pulled toward you in your ${H} hand.</li>
</ol>
<p>Stay <b>${L(opt.roughMargin)}</b> clear of the finished surface; that wood is for shaping later. Check depth with the end of the rule resting on the ${k === 0 ? 'face' : 'high parts of the face'}.</p>
${firstBand ? '<p class="tip">The layers go round all six faces before going deeper. The block stays strong and keeps flat faces to hold and measure from. Brace it against a bench hook for push cuts.</p>' : ''}`,
      });
      firstBand = false;
    }
  }

  // ---------------------------------------------------------------- hidden tunnels
  if (plan.hiddenRough > 0 || st.hiddenFrac > 0.005) {
    cur.hidden = true;
    add({
      phase: 'Rough', title: 'Open the hidden tunnels', figure: { type: 'slice', mode: 'hidden' }, state: cloneState(cur),
      hl: { type: 'slice' },
      speak: 'Open the hidden tunnels with the hook knife and gouge scorp, working in from the openings.',
      checks: ['Tunnels opened end to end'],
      html: `
<p>About <b>${pct(st.hiddenFrac)}</b> of the waste sits in passages that turn corners, so no straight cut from a face reaches it. The layers have opened their mouths; now work inward.</p>
<ul>
<li>The <b>hook knife</b> is the Jack's tool for this. It curls round a corner and cuts as you draw it back toward you in your ${H} hand. It reaches about ${L(J.hookReach)} in.</li>
<li>In passages narrower than the hook's ${L(J.hookR)} curve, use the <b>gouge scorp</b>.</li>
<li>Use the slice viewer to see it: <b>orange</b> is hidden waste in that slice and <b>shaded</b> is finished wood. Drag the slider to walk through the block.</li>
<li>Work from both ends of each passage so they meet in the middle, and keep ${L(opt.roughMargin)} from the finished surface.</li>
</ul>`,
    });
  }

  // ---------------------------------------------------------------- shape from each face
  const ci = niceStep(Math.min(P.W, P.D, P.H) / 10, u);
  for (const fi of [0, 1, 2, 3, 4, 5]) {
    let any = false;
    const f = model.faces[fi];
    for (let c = 0; c < f.nb * f.nc; c++) if (f.depth[c] > 0.5 && !f.through[c]) { any = true; break; }
    if (!any) continue;
    cur.shaped[fi] = true;
    add({
      phase: 'Shape', title: `Shape from face ${FACES[fi].id}`, face: fi,
      figure: { type: 'contour', face: fi, interval: ci }, state: cloneState(cur), focus: fi,
      speak: `Face ${FACES[fi].id} toward you. Bring the surfaces you can see down to their final depth.`,
      checks: ['Surfaces seen from this face at final depth', 'Check points measured'],
      html: `
<p>Work with ${fname(fi)} toward you and bring every surface you can see from here down to its final depth.</p>
<p>The map shows how deep the finished surface lies below the face, with a contour line every <b>${L(ci)}</b>. The numbers are check points. ${box
          ? 'Lay the rule across the face (it rests on the untouched shaded areas) and measure down at each point.'
          : 'The face has been carved away, so measure from a rule laid across the remaining high points, or with calipers against the opposite side.'}</p>
<ul>
<li>Convex and gently curved areas: long slicing cuts with the <b>pelican knife</b>'s belly.</li>
<li>Hollows broader than ${L(J.hookR)} radius: the <b>hook knife</b>. Hollows tighter than that: the <b>gouge scorp</b>.</li>
<li>Leave about ${L(u === 'in' ? MM_PER_IN / 32 : 0.5)} for sanding. Slice rather than chop: draw the blade along its length as you cut.</li>
</ul>`,
    });
  }

  // ---------------------------------------------------------------- final tunnel shaping
  const sh = j.share;
  add({
    phase: 'Shape', title: 'Shape the tunnels', figure: { type: 'slice', mode: 'final' }, state: final,
    hl: { type: 'slice' }, toolMap: true,
    speak: 'Blend the tunnels into one continuous surface, following the tool map.',
    checks: ['Tunnels blended into one surface'],
    html: `
<p>Last carving pass: blend the passages into one continuous surface. The 3D view shows the <b>tool map</b>:</p>
<ul class="keylist">
<li><i class="sw sw-hook"></i><b>Hook knife</b>: hollows from ${L(J.hookR)} to ${L(J.flatR)} radius (${pct(sh.hook)}).</li>
<li><i class="sw sw-scorp"></i><b>Gouge scorp</b>: hollows from ${L(J.scorpR)} to ${L(J.hookR)} (${pct(sh.scorp)}).</li>
<li><i class="sw sw-gouge"></i><b>Straight gouge</b>: hollows under ${L(J.scorpR)} (${pct(sh.gouge)}).</li>
<li><i class="sw sw-wood"></i><b>Pelican knife</b>: convex or nearly flat (${pct(sh.pelican)}).</li>
${j.outFrac > 0.003 ? `<li><i class="sw sw-out"></i><b>Out of reach</b>: deeper than the longest blade can get with the handle in (${pct(j.outFrac)}).</li>` : ''}
</ul>
<p>About <b>${pct(j.saddleFrac)}</b> of this surface is saddle-shaped: it curves up one way and down the other. In each spot, cut along the hollow direction with the hook or scorp. Then fair across the other direction with the pelican knife's belly, so the two cuts meet smoothly.</p>
${j.shortFrac > 0.01 ? `<p class="tip">On about ${pct(j.shortFrac)} of the surface, the blade that fits the curve is too short to get there, but a longer one can. Reach in with the pelican knife's tip and finish with sandpaper.</p>` : ''}`,
  });

  // ---------------------------------------------------------------- out of reach
  if (j.outFrac > 0.003) {
    add({
      phase: 'Shape', title: 'Spots the Jack can’t reach', figure: { type: 'none' }, state: final,
      hl: { type: 'point', p: j.outAt }, toolMap: true,
      speak: 'Some spots are out of reach of the Jack. Choose how to handle them.',
      checks: ['Out-of-reach spots handled'],
      html: `
<p>The <b class="c-red">red striped</b> areas (about ${pct(j.outFrac)}, mostly in ${where(j.outAt, model.dims)}) are deeper inside a tunnel than ${L(J.maxReach)} of blade can reach while the handle and your fingers still fit through the opening. The opening needs about ${L(J.grip)} for that.</p>
<ul>
<li>Easiest: go back and make the cell size a little larger, or set Fill negative. Both widen the tunnels. The tool map updates as you change them.</li>
<li>Or accept a rougher surface there: reach in with the hook knife at an angle and finish with sandpaper wrapped round a pencil.</li>
<li>If your Jack's blades are longer than the estimates, measure them and enter the real lengths under <b>Your Jack</b> in the design panel.</li>
</ul>`,
    });
  }

  // ---------------------------------------------------------------- check walls
  add({
    phase: 'Refine', title: 'Check the walls', figure: { type: 'slice', mode: 'final', at: st.thinInAt }, state: final,
    hl: { type: 'point', p: st.thinInAt },
    speak: `The thinnest wall is about ${L(st.thinIn).replace('″', ' inch')}. Check it with calipers.`,
    checks: ['Thin spots checked with calipers', 'Symmetry checked against a light'],
    html: `
<p>The thinnest wall or neck in the design is about <b>${L(st.thinIn)}</b>, in ${where(st.thinInAt, model.dims)} (marked on the model).${st.thinIn < 6.35 ? ' That is thin for knife work: support the wall with your fingers behind it and use slicing cuts, never levering ones.' : ''}</p>
<ul>
<li>Check thickness with calipers as you work. When you cut from both sides of a wall, it is easy to go too thin.</li>
<li>Hold the piece up to a light and look through the tunnels. Uneven brightness shows where walls differ.</li>
<li>Where a wall meets ${box ? 'a flat face' : 'the outer form'} at a shallow angle, it thins to a feather edge. Break it with a tiny chamfer from the detail knife so it doesn't chip.</li>
</ul>`,
  });

  // ---------------------------------------------------------------- finish
  add({
    phase: 'Finish', title: 'Sand and finish', figure: { type: 'none' }, state: final,
    speak: 'Sand from 120 to 320 grit, raise the grain, and oil.',
    checks: ['Tool marks faired', 'Sanded to 320', 'Grain raised and resanded', 'Finish applied'],
    html: `
<ol>
<li>Decide first whether you want a sanded or a tooled finish. Crisp, even pelican-knife facets look good on a gyroid and show it was carved by hand. If you keep them, take one last light pass with a freshly stropped blade and skip to step 4.</li>
<li>Otherwise, sand through <b>120 → 180 → 240 → 320</b>. For the tunnels, wrap the paper round a dowel no wider than ${L(2 * j.r5)} so it follows the tightest hollows.</li>
<li>Raise the grain: wipe with a damp cloth, let it dry, and sand lightly at 320.</li>
<li>Finish with Danish or tung oil, wiping off the excess, two or three coats a day apart. Paste wax gives a drier, paler look.</li>
</ol>
<p class="tip">Strop and fold every blade before you put the Jack away. A drop of oil on the pivots keeps the locks smooth.</p>`,
  });

  // blade chips for each step
  for (const st of steps) {
    if (st.blades) continue;
    if (st.title.startsWith('Layer')) st.blades = ['detail', 'pelican', 'scorp'];
    else if (st.title === 'Open the hidden tunnels') st.blades = ['hook', 'scorp'];
    else if (st.title.startsWith('Shape from')) st.blades = ['pelican', 'hook', 'scorp'];
    else if (st.title === 'Shape the tunnels') st.blades = ['hook', 'scorp', 'gouge', 'pelican'];
    else if (st.title === 'Check the walls') st.blades = ['detail'];
    else if (st.title === 'Square the block and label the faces' || st.title === 'Print and apply the templates') st.blades = st.title.startsWith('Print') ? ['vscorp'] : [];
  }
  return steps;
}

function topBlade(share) { return Object.entries(share).sort((a, b) => b[1] - a[1])[0][0]; }
function bladeName(b) { return { gouge: 'Straight gouge', scorp: 'Gouge scorp', hook: 'Hook knife', pelican: 'Pelican knife' }[b]; }
