// Carvin' Jack technique text shared by the surface and face guides.

import { fmtLen } from './units.js';

export function jackToolsHTML(J, units, share) {
  const L = mm => fmtLen(mm, units);
  const pct = k => share ? ` <span class="share">${Math.round(share[k] * 100)}% of this piece</span>` : '';
  return `
<ul class="blades">
<li><b>Detail knife</b>: a short straight edge with a sharp point. Use it for stop cuts, crisp corners, eye and mouth lines, and anything small. Blade about ${L(J.knifeReach)}.</li>
<li><b>Pelican knife</b>: a long curved belly. It is your main roughing and smoothing knife for convex and gently curved surfaces.${pct('pelican')}</li>
<li><b>Hook knife</b>: ${L(J.hookR)} radius. It hollows concave curves at least that broad and reaches round corners into tunnels.${pct('hook')}</li>
<li><b>Gouge scorp</b>: a ${L(J.scorpW)} U-shaped ring, pulled toward you. It cuts tighter hollows than the hook, down to about ${L(J.scorpR)} radius.${pct('scorp')}</li>
<li><b>Straight gouge</b>: a ${L(J.gougeW)} #11 (U) gouge, pushed. It cuts the tightest channels, under ${L(J.scorpR)} radius, and starts a hollow.${pct('gouge')}</li>
<li><b>V-scorp</b>: a ${L(J.vscorpW)} 70° V, pulled. It cuts layout grooves, crisp lines and hair or texture.</li>
</ul>`;
}

export function jackGripsHTML(J) {
  const H = J.hand, O = J.other;
  return `
<h4>Opening and closing</h4>
<ul>
<li>Each blade locks open. To close a blade, press the release in the thumb recess and fold the blade with your fingers clear of the edge.</li>
<li>Open one blade at a time, and close it before you open the next. A second open blade is in the palm of your hand.</li>
</ul>
<h4>The cuts you'll use</h4>
<ul>
<li><b>Pull (paring) cut</b>: hold the Jack in your ${H} hand and brace your ${H} thumb on the work. Close your hand so the blade moves toward the thumb, like peeling an apple. Wear a thumb guard on that thumb.</li>
<li><b>Thumb-push cut</b>: hold the work in your ${O} hand and put your ${O} thumb on the back of the blade. Push with the thumb while the ${H} hand steers. This is the most controlled cut, good for stop-cut relief.</li>
<li><b>Push cut</b>: an arm cut away from your body, for long roughing strokes with the pelican knife. Keep your ${O} hand behind the edge.</li>
<li><b>Stop cut, then relief cut</b>: press the detail knife straight in along a line, about 1/8″ deep. Then cut toward it at an angle from the waste side, and the chip pops out at the stop cut. Repeat to go deeper. Never try to go deep in one cut.</li>
<li><b>Hook knife and scorps</b> are pull tools. The ${H}-handed Jack's hook and scorps cut when drawn toward you in your ${H} hand, with your thumb braced on the work.</li>
</ul>
<h4>Grain</h4>
<ul><li>Cut downhill, from high wood toward low wood along the grain. If the wood tears or lifts ahead of the edge, you are cutting uphill: turn round and cut from the other side.</li></ul>
<h4>Keep it sharp</h4>
<ul><li>The blades come honed. Strop every 20–30 minutes of carving: the knives flat on a leather strop with honing compound, and the hook, gouge and scorps on leather wrapped round a dowel or a profiled slip strop. A sharp blade needs less force, and force is what makes knives slip.</li></ul>`;
}
