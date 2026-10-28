# Kerf 1.2 — Carvin' Jack edition

Step-by-step carving guides built around one tool, the **Flexcut Carvin' Jack 2.0** (JKN291 right-handed, JKNL291 left-handed), and its six blades: detail knife, pelican knife, hook knife, straight gouge, gouge scorp and V-scorp.

There are two kinds of project.

## Math surface

Gyroid, Schwarz P, Schwarz D, Neovius and I-WP. Each can be a network or a sheet solid, finished as a block, sphere or cylinder.

- **Roughing:** the block comes down in layers from every face, using stop cuts with the detail knife and relief cuts with the pelican knife. A drill for bulk waste is optional and off by default.
- **Blade choice:** each spot on the finished surface is assigned the Jack blade whose curve fits it, from its concave principal radius:
  - straight gouge: tighter than the scorp radius
  - gouge scorp: up to the hook's 3/4″ radius
  - hook knife: up to 6× the hook radius
  - pelican knife: flatter than that, or convex
- **Reach:** a straight-line reach analysis checks whether the Jack can get a blade onto each surface point. The line must avoid finished wood, and from some distance onward there must be room for the handle and your grip. That distance is the blade length needed at that point. Spots deeper than the longest blade are shown striped red. The design HUD gives a verdict for the whole piece.
- **Tool map:** colours the 3D model by blade.

## Corner face

The classic whittled face on the corner of a square basswood stick.

**Styles** (each sets all the options; change any to make your own): First face, Friendly old man, Santa, Wizard, Garden gnome, Cowboy, Old grump, Laughing, Wood spirit.

**Options**
- Expression: grumpy to smiling.
- Age: adds forehead lines, crow's feet and bags under the eyes.
- Face length.
- Nose: size, and shape (straight, hooked, round tip).
- Eyes: open, wide, squinting, closed.
- Eyebrows: plain or bushy.
- Mouth: closed or open.
- Ears.
- Hat: none, stocking cap, wizard hat, brimmed hat, gnome hat. The gnome hat covers the eyes.
- Hair: bald, swept back, curly.
- Beard: short, long, pointed.
- Mustache: full, handlebar, walrus.

The stick length grows automatically when a tall hat or long beard needs it, so there is always a handle to hold.

The face is modelled as the actual ordered list of Jack cuts. Planar notches and side wedges do the roughing. Height-map setbacks free the mustache, the ears, the hat brim and an open mouth; each setback fades to zero at its edge so it leaves no step. Then come the round-over, the scorp sockets, and V-scorp and detail-knife grooves projected onto the surface. Every step shows the stick exactly as it should look after that cut. The front view highlights the wood the cut removes, and a side profile shows before and after. A true-scale layout sheet wraps round the corner.

## Your Jack

Flexcut publishes the six blade types and the 3/4″ hook radius. The gouge, scorp and V-scorp widths come from the original Carvin' Jack spec. Blade lengths and grip clearance are estimates: measure your Jack and enter the numbers under **Your Jack**. The reach analysis and the instructions follow them.

## Running

The app uses ES modules, so serve it over HTTP rather than opening the file directly:

```
python3 -m http.server 8000
```

It has no dependencies and runs on WebGL1.

## Layout

```
engine/  jack.js (blades) · reach.js (blade-reach analysis) · technique.js (grips, stropping)
         tpms.js · model.js · plan.js · mesh.js · steps.js · contour.js · units.js   (math surfaces)
         face.js (corner face as ordered cuts) · facesteps.js · facerelief.js         (corner face)
render/  view3d.js · figures.js · jackfig.js · facefig.js
export/  templates.js · facetemplate.js · stl.js
ui/      guide.js · controls.js
tests/   engine.test.mjs (node) · browser.mjs (playwright walkthrough of both projects)
```
