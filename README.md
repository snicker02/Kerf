# Kerf 2.0 — Carvin' Jack edition

Step-by-step carving guides built around one tool, the **Flexcut Carvin' Jack 2.0** (JKN291 right-handed, JKNL291 left-handed), and its six blades: detail knife, pelican knife, hook knife, straight gouge, gouge scorp and V-scorp.

There are eight kinds of project:

- math surfaces
- corner faces
- your own 3D models
- chip carving
- spoons
- ball-in-cage puzzles
- wooden chains
- reliefs from a photo

Every guide can be followed in **shop mode** at the bench, works **offline**, and exports as a **PDF booklet**.

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

## Your model

Open any 3D model and get a carving guide for it. Supported formats:
- OBJ
- STL (ASCII or binary)
- PLY (ASCII or binary)
- OFF
- glTF, as a binary .glb or as .gltf with embedded buffers

You can also drop a file on the 3D view. A trefoil knot is built in as a sample.

**Placement:**
- Up axis (Y, Z or X).
- Turn about the vertical in 90° steps.
- Upside down.
- Size of the longest side.
- Margin of extra wood round the model.

The block is the model plus the margin, rounded to 1/16″.

**How it works:** the mesh is welded and checked for holes. It is then turned into a signed distance field on the planner's grid:
- **Inside or outside:** rays are cast along all three axes and the majority vote decides, so small holes and seams still work.
- **Distance near the surface:** exact distance to the nearest triangle.
- **Distance further out:** a distance transform beyond that.

From there it goes through the same Carvin' Jack planner as the math surfaces: layers, waste behind overhangs, depth maps, the tool map, the reach check and wall thickness. Parts that don't connect to the main piece are reported, and so are open meshes.

**Saw the outline (optional, any non-face project):** the two views with the most see-through waste become coping-saw outlines, sawn before the knife work. Tape the first set of offcuts back on before sawing the second. The saw line is printed on the templates.

The last model file is kept in the browser's IndexedDB, so it's still there after a reload.

## Chip carving

Geometric rosettes and borders, cut into a flat square or round board with the detail knife alone.

**Patterns:**
- Rosette with a border, rosette only, border only, or all-over triangles.
- The rosette has n-fold dihedral symmetry (5 to 24 folds) and 1 to 5 rings.
- Each ring is one of: outward triangles, inward triangles, diamonds, petals or scallops. The **Variation** setting picks the mix.
- Borders are a triangle frieze, with corner pyramids on square boards.

**Chips:**
- A three-corner chip's depth at a point is tan(wall angle) × the distance to its nearest edge. Its three walls are planes of equal slope that meet under the incentre, which is where the stop cuts start.
- Two-corner chips (petals and scallops) are lenses cut from both sides.
- You set the wall angle, which sets how deep the chips go.

**Guide:** one step per ring, carved from the centre outward, with the stop-cut and slicing-cut order and a cross-section of the wall angle. The template is the full pattern at true size, with its construction circles and the stop-cut lines.

## Spoons

A spoon designer. You set:

- overall length
- bowl shape (egg, round or pointed), length, width, depth and wall thickness
- handle width, neck width and thickness
- crank: how far the bowl sits above the handle line
- handle end

**Steps:** these follow the spoon carver's usual order.
1. Cut the top outline.
2. Cut the side profile and crank.
3. Rough out the bowl with the gouge scorp and hook knife.
4. Shape the back of the bowl with the pelican knife.
5. Round the handle and thin the neck.
6. Finish the bowl with the hook knife.
7. Soften the rim, then dry and oil.

**Hook check:** Kerf compares the curve at the bottom of the bowl with the hook knife's 3/4″ radius. If the bowl is too tight for the hook, it warns you and sends you to the gouge scorp.

**Templates:** true-scale top and side views. Long spoons are split over two pages with join marks.

## Ball in a cage and wooden chain

Classic one-piece whittling puzzles. The loose parts are carved from the same block and never glued.

**Ball in a cage:** four corner posts, two end caps, and one to three balls.
- To stay caged, the ball must be wider than the gap between the posts.
- To roll, it must clear the posts' inner corners: d ≤ √2 × (block − 2 × post).
- Kerf keeps the ball inside that window and lengthens the block if the balls need it.
- **Steps:** open the windows, free the posts by rounding the core, cut V grooves to free the ball from the caps, round the ball, chamfer the posts.

**Chain:** the links alternate between two planes at right angles.
- **Geometry:** each link's hole has to pass the next link's wood and hold the ends of both neighbours. The pitch also allows for the round ends of the holes sagging where the links cross.
- **Steps:** cut the plus-shaped section, cut the outlines of the links on each fin, open the holes, free the crossings, round the links.

**Tests:** these count the separate pieces of wood after each step. The cage must end as the cage plus its balls, and the chain as exactly n links, joined until the freeing step.

## Relief from a photo

Open any picture (PNG, JPEG, GIF, WebP) or use the built-in sample, and it becomes a shallow carved panel.

**How the picture becomes a panel:**
1. It is blurred by the **Simplify** setting.
2. It is posterised into 2 to 7 evenly spaced depth levels. Light is high by default; **Dark is high** reverses that.
3. It is placed inside an optional uncarved frame.

**Steps:**
1. Outline every level boundary with the V-scorp: a 70° groove whose depth comes from the distance to the boundary.
2. Lower the panel layer by layer with the straight gouge and the gouge scorp.
3. Finish in one of two styles. **Stepped** softens the top edge of each level into the one below. **Smooth** blends everything into a continuous surface.

Every stage only removes wood. The outline template shows the level boundaries at true size, with level numbers; large panels are tiled over several pages. The last picture is kept in IndexedDB.

## Shop mode

Open the guide and press **Shop mode** for use at the bench with sawdust on your hands.

- **Big type and buttons:** the Back and Done buttons are large enough to hit with a knuckle.
- **Strop reminder:** every 15, 20, 30 or 45 minutes, a chime plays, a spoken reminder follows and a full-screen prompt appears. Tap **Stropped** to reset it, or snooze for 5 minutes.
- **Voice commands:** say “next”, “back”, “repeat”, “done” or “stropped”. Moving by voice reads the new step aloud.
- **Page-turner pedals:** Bluetooth page-turner pedals work too, as they send PageDown and PageUp.
- **Screen stays on:** a wake lock keeps the screen awake while shop mode is open.

**Voice and the network:** voice commands use the browser's speech recognition. In Chrome and Edge that service runs online, so voice needs a connection even though the rest of the app works offline. If it can't connect, Kerf tells you and the buttons still work.

## Offline

**Service worker:** a service worker (`sw.js`) caches every file on first visit. After that, the app opens and works with no connection. The cache is versioned, so a new release replaces it.

**Install:** `manifest.webmanifest` lets you install Kerf to a home screen.

**Requirements:** offline support needs HTTPS or localhost.

## PDF booklet

**Export → PDF booklet** writes the whole project into one PDF:

- **Cover:** a 3D view and the key numbers.
- **One section per step:** the 3D view at that step, the figure and its key, the instructions, hole tables, and tick boxes for the checklist.
- **Templates:** placed at true size at the back, so they still print at 100%.

**How it's made:** the PDF writer is part of the app and has no dependencies. Text uses the standard Helvetica fonts, and images are embedded as JPEG. The templates are rasterised at 200 dpi.

## Your Jack

Flexcut publishes the six blade types and the 3/4″ hook radius. The gouge, scorp and V-scorp widths come from the original Carvin' Jack spec. Blade lengths and grip clearance are estimates: measure your Jack and enter the numbers under **Your Jack**. The reach analysis and the instructions follow them.

## Running

The app uses ES modules, so serve it over HTTP rather than opening the file directly:

```
python3 -m http.server 8000
```

It has no dependencies and runs on WebGL1. Tests:

```
node tests/engine.test.mjs        # math surfaces, planner, reach
node tests/meshio.test.mjs out/   # model import
node tests/projects.test.mjs      # chip, spoon, cage, chain, relief, PDF writer, shop, offline list
node tests/browser.mjs shots/     # headless walkthrough (needs the server on :8765 and Playwright)
```

## Layout

```
engine/  meshio.js (model import) · meshsdf.js (mesh → signed distance)
         jack.js (blades) · reach.js (blade-reach analysis) · technique.js (grips, stropping)
         tpms.js · model.js · plan.js · mesh.js · steps.js · contour.js · units.js   (math surfaces)
         face.js (corner face as ordered cuts) · facesteps.js · facerelief.js         (corner face)
         staged.js (shared: a project as an ordered list of cuts)
         chip.js · spoon.js · cage.js (ball-in-cage and chain) · relief.js
render/  view3d.js · figures.js · jackfig.js · facefig.js
         sheet2d.js (shared 2D drawing) · chipfig.js · spoonfig.js · puzzlefig.js · relieffig.js
export/  templates.js · facetemplate.js · stl.js · pdf.js (PDF writer) · booklet.js
ui/      guide.js · controls.js · shop.js
sw.js · manifest.webmanifest · icon.svg   (offline and install)
tests/   engine.test.mjs, meshio.test.mjs, projects.test.mjs (node) · browser.mjs (playwright walkthrough)
```

---

Created with help from Claude AI
