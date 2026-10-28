// Step-by-step guide for the corner face, carved with the Carvin' Jack.

import { fmtLen } from './units.js';
import { model as jackModel } from './jack.js';
import { jackToolsHTML, jackGripsHTML } from './technique.js';
import { FACE_STYLES, FACE_OPTIONS } from './face.js';

const R2 = Math.SQRT2;
const PHASE = {
  brow: 'Rough', underNose: 'Rough', nose: 'Rough', mouth: 'Rough', chin: 'Rough', hatBand: 'Rough', head: 'Rough',
  round: 'Shape', ears: 'Shape', noseShape: 'Shape', mustache: 'Shape', sockets: 'Shape',
};

export function faceMarks(model) {
  const g = model.g, P = model.P;
  const fromTop = z => g.zt - z;
  const marks = [];
  if (g.zHB != null && P.hat !== 'gnome') {
    if (g.tb) marks.push({ id: 'hatTop', label: P.hat === 'stocking' ? 'Top of the cuff' : 'Top of the brim', y: fromTop(g.zHB + g.tb), minor: true });
    marks.push({ id: 'hat', label: P.hat === 'stocking' ? 'Bottom of the cap' : 'Bottom of the brim', y: fromTop(g.zHB) });
  }
  marks.push({ id: 'brow', label: P.hat === 'gnome' ? 'Hat brim' : 'Brow line', y: fromTop(g.zBrow) });
  if (P.eyes !== 'hidden') marks.push({ id: 'eye', label: 'Eye line', y: fromTop(g.zEye), minor: true });
  marks.push({ id: 'nose', label: 'Bottom of nose', y: fromTop(g.zNose) });
  marks.push({ id: 'mouth', label: 'Mouth', y: fromTop(g.zMouth), minor: true });
  marks.push({ id: 'chin', label: P.beard !== 'none' ? 'Bottom of beard' : 'Bottom of chin', y: fromTop(g.zBeard) });
  marks.push({ id: 'neck', label: 'End of the chin notch', y: fromTop(g.zNeck), minor: true });
  marks.push({ id: 'handle', label: 'Handle line (no cuts below)', y: fromTop(g.zHandle), minor: true });
  return {
    marks,
    // distances measured on each face from the corner edge (a point at lateral s sits |s|·√2 from it)
    browEnd: g.Db * R2,
    noseTop: g.nwT * R2, noseBase: g.nwB * R2,
    mouthW: g.mwAt(g.zMouth) * R2,
    // mouth-mound / beard outline: [distance from top, distance from the corner on the face]
    mound: Array.from({ length: 25 }, (_, i) => { const z = g.zNose - (g.zNose - g.zBeard) * i / 24; return [fromTop(z), g.mwAt(z) * R2]; }),
    eye: g.se * R2,
    noseEnd: g.Dn * R2,
    chinEnd: g.Dch * R2,
  };
}

function describe(P) {
  const style = FACE_STYLES.find(s => s.id === P.style);
  const name = (k, v) => (FACE_OPTIONS[k].find(o => o[0] === v) || [, v])[1].toLowerCase();
  const bits = [];
  if (P.hat !== 'none') bits.push(`a ${name('hat', P.hat)}`);
  if (P.beard !== 'none') bits.push(`a ${name('beard', P.beard)} beard`);
  if (P.mustache !== 'none') bits.push(`a ${name('mustache', P.mustache)} mustache`);
  if (P.noseShape !== 'straight') bits.push(P.noseShape === 'hooked' ? 'a hooked nose' : 'a round-tipped nose');
  if (P.brows === 'bushy') bits.push('bushy brows');
  if (P.ears) bits.push('ears');
  if (P.mouth === 'open') bits.push('an open mouth');
  if (P.age > 0.25) bits.push('age lines');
  const mood = P.smile > 0.25 ? 'smiling' : P.smile < -0.25 ? 'grumpy' : 'calm';
  return { title: style && style.id !== 'custom' ? style.name.replace(/ \(.*\)$/, '') : 'Your face', text: `a ${mood} face${bits.length ? ' with ' + bits.slice(0, -1).join(', ') + (bits.length > 1 ? ' and ' : '') + bits[bits.length - 1] : ''}` };
}

export function buildFaceSteps(model, opt) {
  const u = opt.units, L = mm => fmtLen(mm, u);
  const P = model.P, g = model.g, J = jackModel(opt.jack), H = J.hand, O = J.other;
  const M = faceMarks(model);
  const steps = [];
  const last = model.stages.length - 1;
  const add = s => steps.push({ id: `f${steps.length}`, checks: [], hl: null, focus: null, corner: true, ...s });
  const top = id => { const m = M.marks.find(m => m.id === id); return m ? L(m.y) : ''; };
  const D = describe(P);
  const blades = new Set(model.cuts.flatMap(c => c.blades));
  const bladeList = ['detail', 'pelican', 'hook', 'gouge', 'scorp', 'vscorp'].filter(b => blades.has(b));
  const bladeName = { detail: 'detail knife', pelican: 'pelican knife', hook: 'hook knife', gouge: 'straight gouge', scorp: 'gouge scorp', vscorp: 'V-scorp' };

  add({
    phase: 'Plan', title: 'What you’re carving', figure: { type: 'faceFinal' }, state: last,
    speak: `${D.title}: ${D.text}, on a ${L(P.a).replace('″', ' inch')} stick, carved with the Carvin' Jack.`,
    html: `
<p><b>${D.title}</b>: ${D.text}, whittled on the corner of a <b>${L(P.a)} × ${L(P.a)} × ${L(P.H)}</b> basswood stick with your <b>${J.title}</b>.</p>
<p>The nose sits on one corner edge, so the two faces of the stick on either side of that edge become the two sides of the face. Every feature comes from a <b>stop cut</b> along a line and a <b>relief cut</b> toward it. You make the big planes first, then round them over, then add the eyes and details.</p>
<div class="kv">
  <div><span>${P.hat !== 'none' ? 'Hat and face' : 'Head'}, top to ${P.beard !== 'none' ? 'beard' : 'chin'}</span><b>${L(g.zt - g.zBeard)}</b></div>
  <div><span>Nose stands out</span><b>${L(g.Dn)}</b></div>
  <div><span>Handle left below</span><b>${L(g.zHandle + g.H / 2)}</b></div>
  <div><span>Cuts</span><b>${model.cuts.length}</b></div>
</div>
<p>The stick below the face stays square: it's your handle, so your fingers stay well away from the blade. Saw it off at the end, or carve it into a neck and collar.</p>`,
  });

  add({
    phase: 'Plan', title: 'Your Carvin’ Jack', figure: { type: 'jack' }, state: last,
    speak: `The Carvin' Jack's blades and the cuts you'll use. Hold it in your ${H} hand.`,
    checks: ['Blades stropped', 'Thumb guard and glove on'],
    html: `
<p>This face uses the ${bladeList.map(b => bladeName[b]).join(', ').replace(/, ([^,]*)$/, ' and $1')}. The chips under each step's title show which blades that step needs.</p>
${jackToolsHTML(J, u, null)}
${jackGripsHTML(J)}`,
  });

  add({
    phase: 'Prepare', title: 'Choose the stick and the corner', figure: { type: 'faceLayout' }, state: 0,
    speak: 'Pick the corner the face goes on, with the grain running up and down.',
    checks: ['Stick cut to size, grain running lengthwise', 'Face corner chosen and marked'],
    html: `
<ul>
<li>Use a straight-grained basswood stick <b>${L(P.a)} square</b> and at least <b>${L(P.H)}</b> long. The grain must run <b>along the length</b>: the nose${P.hat !== 'none' ? ', hat brim' : ''} and brow are short-grain features that snap off if the grain runs across them.</li>
<li>Look at the four long corners and pick the cleanest, with no knots and the straightest grain. That corner becomes the nose. Mark it with an arrow at the top.</li>
<li>In this guide, the face on your left as you look at the corner is <b>C</b> and the one on your right is <b>E</b>, as on the layout sheet.</li>
</ul>`,
  });

  add({
    phase: 'Prepare', title: 'Lay out the face', figure: { type: 'faceLayout' }, state: 0,
    speak: 'Draw the layout lines across the corner, measured from the top of the stick.',
    checks: M.marks.filter(m => !m.minor).map(m => `${m.label} at ${L(m.y)} from the top`).concat(['Nose lines drawn on both faces']),
    html: `
<p>Either print the layout sheet (<b>Print layout</b>, at 100%) and wrap it round the corner, or measure and draw with a pencil and square. All heights are measured <b>down from the top</b> of the stick. Draw each line across both faces so they meet at the corner.</p>
<ul>
${M.marks.map(m => `<li><b>${m.label}</b>: ${L(m.y)}</li>`).join('')}
</ul>
<p>Then draw the <b>nose lines</b> on each face, from ${L(M.noseTop)} from the corner at the ${P.hat === 'gnome' ? 'brim' : 'brow'} line out to ${L(M.noseBase)} at the bottom of the nose. Add the <b>mouth ${P.beard !== 'none' ? 'and beard' : 'mound'}</b> outline about ${L(M.mouthW)} from the corner at the mouth line${P.beard !== 'none' ? ', flaring out below it as on the sheet' : ''}.</p>
<p class="tip">Shade the areas you'll cut away. It's easy to lose track once the first chips come off.</p>`,
  });

  const hatName = { stocking: 'stocking cap', wizard: 'wizard hat', brimmed: 'brimmed hat', gnome: 'gnome hat' }[P.hat];
  const T = {
    brow: () => P.hat === 'gnome' ? {
      speak: 'Cut under the hat brim: a stop cut along the brim line, then relief cuts up from below.',
      html: `
<p>On a gnome, the hat comes right down over the eyes, so this notch is the underside of the brim. Its sloping lower face becomes the top of the nose.</p>
<ol>
<li><b>Detail knife</b>: stop cut straight into the corner along the brim line (${top('brow')} from the top). When finished, it ends on each face <b>${L(M.browEnd)}</b> from the corner.</li>
<li><b>Pelican knife</b>: cut up along the corner toward the stop cut with a thumb-push cut. Repeat until the notch is ${L(g.Db)} deep.</li>
</ol>`,
      checks: [`Notch ${L(M.browEnd)} from the corner on both faces`],
    } : {
      speak: 'Cut the brow notch: a stop cut along the brow line, then relief cuts up from below.',
      html: `
<p>This notch makes the eye channel, and its sloping lower face becomes the top of the nose${P.noseShape === 'hooked' ? '. For a hooked nose the slope is short and steep, so the bridge comes out to the corner quickly and stays there' : ''}.</p>
<ol>
<li><b>Detail knife</b>: stop cut straight into the corner along the brow line (${top('brow')} from the top). Go about 1/8″ deep at first. When finished, the cut ends on each face <b>${L(M.browEnd)}</b> from the corner.</li>
<li><b>Pelican knife</b>: cut up along the corner toward the stop cut with a thumb-push cut, starting ${P.noseShape === 'hooked' ? 'about halfway' : 'about two-thirds of the way'} down to the nose line. The chip pops out at the stop cut.</li>
<li>Repeat stop cut and relief until the notch is ${L(g.Db)} deep into the corner.</li>
</ol>
<p class="tip">Cutting up toward the brow goes against the grain at the very end. Keep the relief cuts shallow there and let the stop cut do the work.</p>`,
      checks: [`Notch ${L(M.browEnd)} from the corner on both faces`],
    },
    underNose: () => ({
      speak: 'Cut under the nose: stop cut along the nose line, relief cuts up from the mouth.',
      html: `
<ol>
<li><b>Detail knife</b>: stop cut straight into the corner along the bottom-of-nose line (${top('nose')} from the top).</li>
<li><b>Pelican knife</b>: relieve upward from near the mouth line toward the stop cut. Go deeper in passes until the notch ends on each face <b>${L(M.noseEnd)}</b> from the corner.</li>
</ol>
<p>Seen from the side, the corner between the two notches is now the nose.</p>`,
      checks: ['Nose tip stands free of the upper lip'],
    }),
    nose: () => ({
      speak: 'Free the nose: stop cuts down both nose lines, then pare the cheeks back toward them.',
      html: `
<ol>
<li><b>Detail knife</b>: stop cut down each nose line from the ${P.hat === 'gnome' ? 'brim' : 'brow'} notch to the under-nose notch. Angle the blade slightly away from the nose so you don't undercut it.</li>
<li><b>Pelican knife</b>: on each cheek, pare toward the stop cut. Go deepest right beside the nose (${L(g.Dn)}) and fade to nothing about ${L(g.cw * R2)} out on the face.</li>
<li>Deepen and pare again until the cheek planes are flat and the nose is a clean ${P.noseShape === 'bulbous' ? 'wedge, wide at the bottom' : 'triangle'} on the corner.</li>
</ol>
<p class="tip">Brace your ${O} thumb on the back of the blade and push. Short, controlled cuts here, because a slip goes straight into the nose.</p>`,
      checks: ['Both cheeks pared back', 'Nose untouched and centred on the corner'],
    }),
    mouth: () => ({
      speak: P.beard !== 'none' ? 'Outline the mouth and beard.' : 'Shape the mouth mound.',
      html: `
<p>The mouth sits on a mound that stands a little proud of the cheeks${P.beard !== 'none' ? `, and below it the ${P.beard} beard ${P.beard === 'short' ? 'rounds off under the chin' : P.beard === 'pointed' ? 'narrows to a point' : 'flares out and comes to a point'}` : ''}.</p>
<ol>
<li><b>Detail knife</b>: stop cut down the outline on each face, from the bottom of the nose to the ${P.beard !== 'none' ? 'bottom of the beard' : 'chin'}, following the curve on the layout.</li>
<li><b>Pelican knife</b>: pare the cheek beside it back toward the stop cut, about ${L(g.Dm)} deep at the line and fading outward.</li>
</ol>`,
      checks: [P.beard !== 'none' ? 'Beard outline stands proud on both sides' : 'Mound stands proud on both sides'],
    }),
    chin: () => ({
      speak: P.beard !== 'none' ? 'Notch under the beard.' : 'Notch under the chin.',
      html: `
<ol>
<li><b>Detail knife</b>: stop cut into the corner along the ${P.beard !== 'none' ? 'bottom-of-beard' : 'bottom-of-chin'} line (${top('chin')} from the top).</li>
<li><b>Pelican knife</b>: relieve up toward it from the handle line until the notch ends ${L(M.chinEnd)} from the corner on each face.</li>
</ol>`,
      checks: ['Chin notch cut'],
    }),
    hatBand: () => ({
      speak: `Set the forehead back under the ${P.hat === 'stocking' ? 'cap' : 'brim'}.`,
      html: `
<p>The ${P.hat === 'stocking' ? 'cuff of the cap' : 'brim'} needs to stand out over the forehead.</p>
<ol>
<li><b>Detail knife</b>: stop cut straight in along the ${P.hat === 'stocking' ? 'bottom-of-cap' : 'bottom-of-brim'} line (${top('hat')} from the top), all the way across both faces.</li>
<li><b>Pelican knife</b>: pare the strip of forehead between the brow line and that stop cut back about ${L(0.06 * P.a)}, working up toward the stop cut.</li>
</ol>`,
      checks: ['Forehead set back under the hat'],
    }),
    head: () => P.hat === 'none' ? {
      speak: 'Round the top of the head into a dome.',
      html: `
<p><b>Pelican knife</b>: round the top of the stick into a dome. Take off the four top corners first, then the edges between them, always cutting downhill from the crown toward the sides. Stop above the brow line: the dome meets the face just at the brow.</p>
<p class="tip">The crown is end grain and cuts hard. Slice with the full length of the belly instead of pushing straight in, and strop first.</p>`,
      checks: ['Top rounded into a dome'],
    } : {
      speak: `Shape the ${hatName}.`,
      html: P.hat === 'stocking' ? `
<ol>
<li><b>Detail knife</b>: stop cut all the way round the stick at the top of the cuff (${top('hatTop')} from the top), about 1/8″ deep.</li>
<li><b>Pelican knife</b>: above the cuff, taper the cap from all four sides toward a point at the top that leans back, away from the face. Leave a ball for the pompom right at the top.</li>
<li>Round the cuff itself into a soft roll.</li>
</ol>` : P.hat === 'wizard' ? `
<ol>
<li><b>Detail knife</b>: stop cut all the way round at the top of the brim (${top('hatTop')} from the top).</li>
<li><b>Pelican knife</b>: above the brim, whittle a tall cone to a point in the centre of the top. Take long slicing cuts from the brim up toward the tip, turning the stick a little after each one. Keep the tip a little blunt so it doesn't snap.</li>
<li>Round the brim's corners so it reads as a circle from above.</li>
</ol>` : P.hat === 'brimmed' ? `
<ol>
<li><b>Detail knife</b>: stop cut all the way round at the top of the brim (${top('hatTop')} from the top).</li>
<li><b>Pelican knife</b>: above the brim, cut the crown down to a round column narrower than the brim, and round its top edge.</li>
<li>Round the brim's corners so it reads as a circle from above.</li>
</ol>` : `
<ol>
<li><b>Pelican knife</b>: from just above the brim line, taper the stick from all four sides into a tall cone with its point leaning back, away from the face.</li>
<li>Keep the brim edge crisp: it's what hides the eyes. Touch up the stop cut under it with the <b>detail knife</b>.</li>
</ol>`,
      checks: [`${hatName[0].toUpperCase() + hatName.slice(1)} shaped`],
    },
    round: () => ({
      speak: 'Round over every hard edge of the face.',
      html: `
<p>Now turn the planes into a face. With the <b>pelican knife</b>'s belly, take light slicing cuts to round:</p>
<ul>
<li>the cheeks into the sides of the head, and the stick's back corners above the handle line;</li>
<li>the ridge of the nose (just a little: keep the tip strong), and the edges of the ${P.hat === 'gnome' ? 'brim' : 'brow'};</li>
<li>the mouth mound${P.beard !== 'none' ? ' and the beard' : ' and chin'} into soft curves${P.hat !== 'none' ? `, and the ${hatName}` : ''}.</li>
</ul>
<p>Keep the creases crisp: under the brow, under the nose, and where the mound meets the cheek. Touch up those stop cuts with the <b>detail knife</b> if they've gone soft.</p>`,
      checks: ['No flat planes left on the face', 'Creases still crisp'],
    }),
    ears: () => ({
      speak: 'Carve the ears on the sides of the head.',
      html: `
<p>The ears sit far out on each face, level with the space between the eye line and the bottom of the nose, ${L(0.82 * g.sMax * R2)} from the corner.</p>
<ol>
<li><b>Detail knife</b>: draw a C-shaped outline for each ear, then stop cut round it.</li>
<li><b>Pelican knife</b>: pare the wood just around the ear back toward the stop cut so the ear stands out, about ${L(0.05 * P.a)} at the edge, fading to nothing.</li>
<li><b>Gouge scorp</b>: scoop a small hollow inside each ear, toward the front.</li>
</ol>`,
      checks: ['Both ears outlined', 'Inner ears hollowed'],
    }),
    noseShape: () => P.noseShape === 'hooked' ? {
      speak: 'Hook the nose: pare the bottom of the tip back so it points down.',
      html: `<p><b>Pelican knife</b>: from the bottom of the nose, pare the lower front of the tip back and up, about ${L(0.55 * g.Dn)} at the bottom and fading out a third of the way up. The tip now points down, and the high bridge from the brow notch gives the hump. Finish with the <b>detail knife</b> under the tip.</p>`,
      checks: ['Tip turned down'],
    } : {
      speak: 'Round the nose tip into a ball.',
      html: `<p><b>Pelican knife</b>: round the bottom third of the nose into a ball about ${L(2 * g.nwB)} across. Take small slicing cuts all the way round the tip. Keep the wood above it narrower, so the ball reads clearly. The <b>detail knife</b> tidies the underside.</p>`,
      checks: ['Tip rounded'],
    },
    mustache: () => ({
      speak: 'Free the mustache: stop cut round its outline and lower the lip and cheeks beside it.',
      html: `
<ol>
<li>Draw the ${P.mustache} mustache under the nose: ${P.mustache === 'handlebar' ? 'a narrow band out to each side, curling up at the ends' : P.mustache === 'walrus' ? 'a heavy shape that hangs down over the mouth' : 'a full shape whose ends droop slightly past the mouth corners'}.</li>
<li><b>Detail knife</b>: stop cut round the outline.</li>
<li><b>Pelican knife</b>: pare the lip and cheek just outside the outline down toward the stop cut, about ${L(0.045 * P.a)} at the edge and fading away from it, so the mustache stands out.</li>
</ol>`,
      checks: ['Mustache stands proud'],
    }),
    sockets: () => ({
      speak: 'Scoop the eye sockets with the gouge scorp.',
      html: `
<p><b>Gouge scorp</b>: scoop a shallow hollow on each side of the bridge of the nose, just under the brow (centred ${L(M.eye)} from the corner on each face, ${top('eye')} from the top). Pull the scorp toward you in your ${H} hand, from the outer corner toward the nose. Keep both sockets the same depth: look down from the top to compare.${P.eyes === 'wide' ? ' Make them a little bigger for wide-open eyes.' : ''}</p>`,
      checks: ['Both sockets scooped, same depth'],
    }),
    eyes: () => ({
      speak: { closed: 'Cut the closed eyes with the detail knife.', squint: 'Cut the squinting eyes with the detail knife.' }[P.eyes] || 'Cut the eyelids with the detail knife and the pupils with the gouge.',
      html: P.eyes === 'closed' ? `
<p><b>Detail knife</b>: in each socket, cut a gentle downward arc for the closed lid. Two angled cuts that meet underneath lift out a thin sliver. A small extra triangle chip at each outer corner gives a sleepy smile.</p>` : P.eyes === 'squint' ? `
<p><b>Detail knife</b>: in each socket, cut two flat arcs close together: the upper lid nearly straight, the lower lid a slight curve, with only a sliver of eye between them. Pop a tiny triangle chip at each corner. Squinting eyes read best with the cheeks pushed up under them, which the age lines step adds.</p>` : `
<ol>
<li><b>Detail knife</b>: in each socket, cut the upper lid as an arc and the lower lid as a flatter arc${P.eyes === 'wide' ? ', with a bigger gap between them' : ''}. Make each a shallow stop cut, then a slanted cut from the eyeball side, so the eyeball sits just below the lids.</li>
<li>Pop a tiny triangle chip at the inner and outer corners where the lids meet. Those two chips are what make it read as an eye.</li>
<li><b>Straight gouge</b>: press the tip in and twist for each pupil. Look at the face from the front and make sure both pupils point the same way.</li>
</ol>`,
      checks: ['Both eyes cut', 'Eyes match when seen from the front'],
    }),
    brows: () => ({
      speak: 'Texture the bushy eyebrows.',
      html: `<p><b>V-scorp</b> (or the <b>detail knife</b> tip): on the brow ridge above each eye, cut short strokes that angle up and out, like hair growing outward from the nose. ${P.smile < -0.25 ? 'For a grumpy look, keep the inner ends low and close to the nose.' : 'Let the outer ends lift slightly.'}</p>`,
      checks: ['Both brows textured'],
    }),
    nostrils: () => ({
      speak: 'Cut the nostril wings.',
      html: `<p><b>Detail knife</b> or <b>V-scorp</b>: on each side of the nose near the bottom, cut a curved line round the wing of the nostril, from under the tip, up and round toward the cheek.${P.noseShape === 'bulbous' ? ' Then run a light line round the ball of the tip so it stands out from the wings.' : ''} Under the nose, press in two small nostril holes with the knife point.</p>`,
      checks: ['Both nostrils cut'],
    }),
    mouthLine: () => ({
      speak: 'Cut the mouth line with the V-scorp.',
      html: `<p><b>V-scorp</b>: pull a ${P.smile > 0.2 ? 'smiling' : P.smile < -0.2 ? 'downturned' : 'straight'} mouth line ${P.mustache !== 'none' ? 'just under the mustache' : 'across the mound'}. Cut from the centre out to each corner, so you cut with the grain each time. The <b>detail knife</b> can deepen the corners with a tiny triangle chip.</p>`,
      checks: ['Mouth cut'],
    }),
    openMouth: () => ({
      speak: 'Open the mouth.',
      html: `
<ol>
<li><b>Detail knife</b>: stop cut round the mouth opening: the top lip ${P.smile > 0.2 ? 'curving up at the corners' : 'nearly straight'} and the lower lip a deeper curve below it.</li>
<li>Remove the wood inside in small chips, working from the centre toward the stop cuts, until the mouth is about ${L(0.1 * P.a)} deep.</li>
<li><b>Straight gouge</b>: clean out the corners and leave the back of the mouth slightly hollow, so it reads as a dark opening.</li>
</ol>`,
      checks: ['Mouth opened and cleaned up'],
    }),
    smileLines: () => ({
      speak: 'Cut the smile lines from the nose to the mouth corners.',
      html: `<p><b>V-scorp</b>: from the side of each nose wing, curve a line down and out past the corner of the ${P.mustache !== 'none' ? 'mustache' : 'mouth'}. These lines give the face its age and expression${P.age > 0.5 ? '. On this face, cut them deep and wide' : ''}.</p>`,
      checks: ['Both smile lines cut'],
    }),
    wrinkles: () => ({
      speak: 'Cut the age lines.',
      html: `
<ul>
${g.zForeTop - g.zBrow > 0.09 * g.F ? '<li><b>V-scorp</b>: one to three wavy lines across the forehead, sagging slightly at the ends. Don\'t make them parallel: real wrinkles wander.</li>' : ''}
${P.eyes !== 'hidden' && P.age > 0.45 ? '<li><b>Detail knife</b>: three short crow\'s-feet lines fanning out from each outer eye corner.</li>' : ''}
${P.eyes !== 'hidden' && (P.age > 0.6 || P.eyes === 'squint') ? '<li><b>V-scorp</b>: a curved line under each lower lid for the bags under the eyes.</li>' : ''}
</ul>`,
      checks: ['Age lines cut'],
    }),
    hair: () => P.hair === 'curly' ? {
      speak: 'Carve the curls.',
      html: `<p><b>V-scorp</b> (or the <b>straight gouge</b>): cover the head above the hairline with small C-shaped curls, staggered row by row like bricks. Turn each C a different way. Pull each one with the grain where you can and keep them shallow: deep curls on end grain crumble.</p>`,
      checks: ['Curls cut'],
    } : {
      speak: 'Texture the hair with the V-scorp.',
      html: `<p><b>V-scorp</b>: cut flowing lines from the hairline back over the crown. Group them in locks, vary the spacing, and let a few lines cross. Pull with the grain, from the forehead up, so the edges stay clean.</p>`,
      checks: ['Hair textured'],
    },
    beard: () => ({
      speak: 'Texture the beard with the V-scorp.',
      html: `<p><b>V-scorp</b>: cut ${P.beard === 'short' ? 'short wavy lines down the beard' : 'long wavy lines down the beard to the point'}, from under the mouth down. Cut each from top to bottom, with the grain. Clumps of 2–3 lines with gaps between look more natural than even spacing.</p>`,
      checks: ['Beard textured'],
    }),
    mustacheTex: () => ({
      speak: 'Texture the mustache.',
      html: `<p><b>V-scorp</b>: two or three lines along each side of the mustache, starting under the nose and sweeping out to the tips. Light, shallow cuts: the mustache is short grain at its ends.</p>`,
      checks: ['Mustache textured'],
    }),
    hatDetail: () => P.hat === 'stocking' ? {
      speak: 'Texture the fur on the cuff.',
      html: `<p><b>V-scorp</b>: short, slightly slanted strokes all over the cuff, in two loose rows, for fur. Add a few on the pompom.</p>`,
      checks: ['Cuff textured'],
    } : {
      speak: 'Cut the hat band.',
      html: `<p><b>V-scorp</b>: cut a line round the ${P.hat === 'wizard' ? 'cone' : 'crown'} just above the brim for the hat band. Keep it level: mark it first by holding the pencil still and turning the stick against it.</p>`,
      checks: ['Hat band cut'],
    },
  };
  model.cuts.forEach((c, i) => {
    const t = T[c.id]();
    add({ phase: PHASE[c.id] || 'Detail', title: c.title, figure: { type: 'faceCut', k: i + 1 }, state: i + 1, blades: c.blades, ...t });
  });

  add({
    phase: 'Finish', title: 'Clean up and finish', figure: { type: 'faceFinal' }, state: last,
    speak: 'Clean up fuzzy cuts, decide what to do with the handle, and finish.',
    checks: ['Fuzz cleaned up', 'Handle cut off or carved', 'Finish applied'],
    html: `
<ol>
<li>Strop, then go over the face with the <b>detail knife</b> and take off any fuzzy fibres in the creases. Carved faces usually look best left with knife facets rather than sanded.</li>
<li>The handle: saw it off just below the ${P.beard !== 'none' ? 'beard' : 'chin notch'} and round the base, or carve it into a neck and collar.</li>
<li>Finish: a coat of Danish oil, or thin acrylic washes (paint mixed with lots of water)${P.hat === 'stocking' ? ', red for the cap and white for the cuff and beard' : P.hat === 'gnome' ? ', red for the hat and white for the beard' : ''}, then oil or wax over the top.</li>
</ol>
<p class="tip">Sign and date the bottom. Your tenth face will look very different from your first, and it's good to see the progress.</p>`,
  });
  return steps;
}
