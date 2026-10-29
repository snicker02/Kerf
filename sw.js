// Offline support: every file Kerf needs is cached on first visit, so the app (and the guide
// you're following in the workshop) keeps working without a connection.
const VERSION = 'kerf-2.0.0';
const FILES = [
  './',
  'index.html',
  'style.css',
  'main.js',
  'manifest.webmanifest',
  'icon.svg',
  'engine/cage.js',
  'engine/chip.js',
  'engine/contour.js',
  'engine/face.js',
  'engine/facerelief.js',
  'engine/facesteps.js',
  'engine/jack.js',
  'engine/mesh.js',
  'engine/meshio.js',
  'engine/meshsdf.js',
  'engine/model.js',
  'engine/plan.js',
  'engine/reach.js',
  'engine/relief.js',
  'engine/spoon.js',
  'engine/staged.js',
  'engine/steps.js',
  'engine/technique.js',
  'engine/tpms.js',
  'engine/units.js',
  'export/booklet.js',
  'export/facetemplate.js',
  'export/pdf.js',
  'export/stl.js',
  'export/templates.js',
  'render/chipfig.js',
  'render/facefig.js',
  'render/figures.js',
  'render/jackfig.js',
  'render/puzzlefig.js',
  'render/relieffig.js',
  'render/sheet2d.js',
  'render/spoonfig.js',
  'render/view3d.js',
  'ui/controls.js',
  'ui/guide.js',
  'ui/shop.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// cache first, then refresh the cache in the background when online
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const r = await net;
    return r || (req.mode === 'navigate' ? c.match('./') : new Response('Offline', { status: 503 }));
  }));
});
