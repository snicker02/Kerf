// WebGL1 renderer: the carved block with a solid wood-grain shader, orbit camera,
// face labels, and step highlights (drill paths, depth planes, slice planes, markers).

import { FACES, faceNormal } from '../engine/model.js';

const VS = `
attribute vec3 a_pos;
attribute vec3 a_nrm;
attribute vec3 a_aux;
uniform mat4 u_vp;
varying vec3 v_pos;
varying vec3 v_nrm;
varying vec3 v_aux;
void main() {
  v_pos = a_pos; v_nrm = a_nrm; v_aux = a_aux;
  gl_Position = u_vp * vec4(a_pos, 1.0);
}`;

const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 v_pos;
varying vec3 v_nrm;
varying vec3 v_aux;
uniform vec3 u_eye;
uniform vec3 u_right;
uniform vec3 u_up;
uniform vec3 u_grain;
uniform vec3 u_pith;
uniform float u_ring;
uniform float u_toolMap;
uniform vec4 u_toolR;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
                 mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
                 mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
vec3 woodColor(vec3 p) {
  vec3 g = normalize(u_grain);
  vec3 d = p - u_pith;
  vec3 q = d - g * dot(d, g);
  float along = dot(p, g);
  float r = length(q);
  float wob = vnoise(p * 0.045) * 1.6 + vnoise(q * 0.012 + g * along * 0.006) * 1.2;
  float ring = fract(r * u_ring + wob * 0.45);
  float late = smoothstep(0.62, 0.9, ring) - 0.6 * smoothstep(0.9, 1.0, ring);
  float fiber = vnoise(q * 0.7 + g * along * 0.02);
  vec3 early = vec3(0.87, 0.75, 0.58);
  vec3 latec = vec3(0.70, 0.54, 0.35);
  vec3 c = mix(early, latec, clamp(late, 0.0, 1.0) * 0.75);
  return c * (0.93 + 0.12 * fiber);
}
void main() {
  vec3 n = normalize(v_nrm);
  vec3 V = normalize(u_eye - v_pos);
  if (dot(n, V) < 0.0) n = -n;
  vec3 base = woodColor(v_pos);
  float cls = v_aux.x;
  if (cls > 1.5) {
    base = mix(base, vec3(0.94, 0.91, 0.85), 0.55);
  } else if (cls > 0.5) {
    float chat = 0.5 + 0.5 * sin(dot(v_pos, vec3(0.83, 1.21, 0.57)) * 1.3 + vnoise(v_pos * 0.2) * 3.0);
    base = mix(base, vec3(0.96, 0.89, 0.77), 0.38) * (0.93 + 0.09 * chat);
  } else if (u_toolMap > 0.5) {
    float r = v_aux.y;
    if (v_aux.z > u_toolR.w) {
      float st = step(0.5, fract(dot(v_pos, vec3(0.35, 0.35, 0.35))));
      base = mix(base, mix(vec3(0.86, 0.22, 0.16), vec3(0.98, 0.55, 0.45), st), 0.75);
    }
    else if (r < u_toolR.x) base = mix(base, vec3(0.48, 0.36, 0.69), 0.62);
    else if (r < u_toolR.y) base = mix(base, vec3(0.82, 0.54, 0.12), 0.55);
    else if (r < u_toolR.z) base = mix(base, vec3(0.18, 0.56, 0.54), 0.5);
  }
  vec3 L = normalize(V * 0.55 + u_up * 0.65 - u_right * 0.45);
  vec3 L2 = normalize(V * 0.4 + u_right * 0.7 - u_up * 0.2);
  float diff = max(dot(n, L), 0.0);
  float fill = max(dot(n, L2), 0.0);
  float hemi = 0.5 + 0.5 * n.z;
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(n, H), 0.0), 36.0) * 0.09;
  vec3 col = base * (0.2 + 0.16 * hemi + 0.7 * diff + 0.14 * fill) + vec3(spec);
  col += pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.06;
  gl_FragColor = vec4(col, 1.0);
}`;

const LVS = `
attribute vec3 a_pos;
uniform mat4 u_vp;
void main() { gl_Position = u_vp * vec4(a_pos, 1.0); }`;
const LFS = `
precision mediump float;
uniform vec4 u_color;
void main() { gl_FragColor = u_color; }`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Shader compile failed: ' + log);
  }
  return sh;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Program link failed: ' + gl.getProgramInfoLog(p));
  return p;
}

// ---- tiny column-major mat4 helpers
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function lookAt(eye, target, up) {
  const z = norm(sub(eye, target)), x = norm(cross(up, z)), y = cross(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
}
function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}

export class View3D {
  constructor(canvas, labelsEl) {
    this.canvas = canvas;
    this.labelsEl = labelsEl;
    const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true, alpha: false });
    if (!gl) throw new Error('WebGL is not available in this browser.');
    this.gl = gl;
    this.ext32 = gl.getExtension('OES_element_index_uint');
    this.prog = program(gl, VS, FS);
    this.lprog = program(gl, LVS, LFS);
    this.loc = {
      pos: gl.getAttribLocation(this.prog, 'a_pos'), nrm: gl.getAttribLocation(this.prog, 'a_nrm'), aux: gl.getAttribLocation(this.prog, 'a_aux'),
      vp: gl.getUniformLocation(this.prog, 'u_vp'), eye: gl.getUniformLocation(this.prog, 'u_eye'),
      right: gl.getUniformLocation(this.prog, 'u_right'), up: gl.getUniformLocation(this.prog, 'u_up'),
      grain: gl.getUniformLocation(this.prog, 'u_grain'), pith: gl.getUniformLocation(this.prog, 'u_pith'),
      ring: gl.getUniformLocation(this.prog, 'u_ring'), toolMap: gl.getUniformLocation(this.prog, 'u_toolMap'),
      toolR: gl.getUniformLocation(this.prog, 'u_toolR'),
      lpos: gl.getAttribLocation(this.lprog, 'a_pos'), lvp: gl.getUniformLocation(this.lprog, 'u_vp'), lcolor: gl.getUniformLocation(this.lprog, 'u_color'),
    };
    this.buf = { pos: gl.createBuffer(), nrm: gl.createBuffer(), aux: gl.createBuffer(), idx: gl.createBuffer(), lines: gl.createBuffer(), hlLines: gl.createBuffer(), hlTris: gl.createBuffer() };
    this.count = 0; this.indexed = false; this.indexType = gl.UNSIGNED_SHORT;
    this.boxLines = 0; this.hlLineCount = 0; this.hlTriCount = 0;
    this.dims = [100, 100, 100];
    this.grain = [0, 0, 1]; this.pith = [-140, -90, 0];
    this.toolMap = false; this.toolR = [5, 10, 60, 40];
    this.yaw = -0.95; this.pitch = 0.5; this.dist = 300; this.target = [0, 0, 0];
    this.anim = null;
    this.labels = FACES.map(fd => {
      const el = document.createElement('div');
      el.className = 'flabel'; el.textContent = fd.id; el.title = fd.name;
      labelsEl.appendChild(el);
      return el;
    });
    this.marker = document.createElement('div');
    this.marker.className = 'marker'; this.marker.hidden = true;
    labelsEl.appendChild(this.marker);
    this.markerAt = null;
    this._bind();
    this.dirty = true;
    const loop = () => { this._tick(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  _bind() {
    const c = this.canvas;
    const ptrs = new Map();
    let lastPinch = 0;
    c.addEventListener('pointerdown', e => { c.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); this.anim = null; });
    c.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return;
      const prev = ptrs.get(e.pointerId);
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 1) {
        this.yaw -= (e.clientX - prev[0]) * 0.008;
        this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + (e.clientY - prev[1]) * 0.008));
        this.dirty = true;
      } else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (lastPinch) this.dist = Math.max(this.minDist, Math.min(this.maxDist, this.dist * lastPinch / d));
        lastPinch = d; this.dirty = true;
      }
    });
    const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) lastPinch = 0; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.dist = Math.max(this.minDist, Math.min(this.maxDist, this.dist * Math.exp(e.deltaY * 0.0012)));
      this.dirty = true;
    }, { passive: false });
    new ResizeObserver(() => { this.dirty = true; }).observe(c);
  }

  setScene(dims, grainAxis, opt = {}) {
    this.dims = dims.slice();
    this.target = opt.target || [0, 0, 0];
    this.labels.forEach(el => { el.hidden = !!opt.noLabels; });
    this.minDist = Math.max(...dims) * (opt.target ? 0.5 : 0.9);
    const L = Math.max(...dims);
    if (!opt.target) this.minDist = L * 0.9;
    this.maxDist = L * 8;
    if (!this._sized) { this.dist = L * 3.3; this._sized = true; }
    const ga = { x: 0, y: 1, z: 2 }[grainAxis] ?? 2;
    this.grain = [0, 0, 0]; this.grain[ga] = 1;
    const others = [0, 1, 2].filter(i => i !== ga);
    this.pith = [0, 0, 0]; this.pith[others[0]] = -1.4 * L; this.pith[others[1]] = -0.9 * L;
    // stock box outline
    const [w, d, h] = dims.map(x => x / 2);
    const P = [[-w, -d, -h], [w, -d, -h], [w, d, -h], [-w, d, -h], [-w, -d, h], [w, -d, h], [w, d, h], [-w, d, h]];
    const E = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7];
    const arr = new Float32Array(E.length * 3);
    E.forEach((v, i) => arr.set(P[v], i * 3));
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.lines);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    this.boxLines = E.length;
    this.dirty = true;
  }

  setMesh(mesh) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.pos); gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.nrm); gl.bufferData(gl.ARRAY_BUFFER, mesh.nrm, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.aux); gl.bufferData(gl.ARRAY_BUFFER, mesh.aux, gl.STATIC_DRAW);
    if (mesh.nv < 65536) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buf.idx);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.idx), gl.STATIC_DRAW);
      this.indexType = gl.UNSIGNED_SHORT; this.indexed = true;
    } else if (this.ext32) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buf.idx);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);
      this.indexType = gl.UNSIGNED_INT; this.indexed = true;
    } else {
      // no 32-bit indices: expand to plain triangles
      const n = mesh.idx.length;
      const p = new Float32Array(n * 3), q = new Float32Array(n * 3), a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const v = mesh.idx[i];
        p.set(mesh.pos.subarray(v * 3, v * 3 + 3), i * 3); q.set(mesh.nrm.subarray(v * 3, v * 3 + 3), i * 3); a.set(mesh.aux.subarray(v * 3, v * 3 + 3), i * 3);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.pos); gl.bufferData(gl.ARRAY_BUFFER, p, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.nrm); gl.bufferData(gl.ARRAY_BUFFER, q, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.aux); gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW);
      this.indexed = false;
    }
    this.count = mesh.idx.length;
    this.dirty = true;
  }

  setToolMap(on, radii) { this.toolMap = !!on; if (radii) this.toolR = radii; this.dirty = true; }

  // hl: {type:'holes', face, holes, model} | {type:'plane', face, depth} | {type:'slice', axis, pos} | {type:'point', p} | null
  setHighlight(hl, model, plan) {
    const lines = [], tris = [];
    this.hlColor = [0.35, 0.85, 0.95, 1]; this.hlFill = [0.98, 0.72, 0.25, 0.22];
    this.markerAt = null;
    if (hl && model) {
      if (hl.type === 'holes' && plan) {
        const f = model.faces[hl.face];
        for (const h of plan.holes[hl.face]) {
          const top = f.toWorld(h.X, h.Y, -2), bot = f.toWorld(h.X, h.Y, h.depth);
          lines.push(...top, ...bot);
          const segs = 20;
          for (let q = 0; q < segs; q++) {
            for (const t of [q, q + 1]) {
              const a = (t / segs) * Math.PI * 2;
              lines.push(...f.toWorld(h.X + Math.cos(a) * h.r, h.Y + Math.sin(a) * h.r, -0.3));
            }
          }
        }
      } else if (hl.type === 'plane' || hl.type === 'slice') {
        let corners;
        if (hl.type === 'plane') {
          const f = model.faces[hl.face];
          corners = [[0, 0], [f.wb, 0], [f.wb, f.wc], [0, f.wc]].map(([X, Y]) => f.toWorld(X, Y, hl.depth));
          this.hlFill = [0.98, 0.72, 0.25, 0.2];
        } else {
          const a = hl.axis, d = model.dims;
          const [b, c] = [0, 1, 2].filter(x => x !== a);
          corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sb, sc]) => { const p = [0, 0, 0]; p[a] = hl.pos; p[b] = sb * d[b] / 2; p[c] = sc * d[c] / 2; return p; });
          this.hlFill = [0.35, 0.8, 0.95, 0.16];
        }
        tris.push(...corners[0], ...corners[1], ...corners[2], ...corners[0], ...corners[2], ...corners[3]);
        for (let q = 0; q < 4; q++) lines.push(...corners[q], ...corners[(q + 1) % 4]);
        this.hlColor = hl.type === 'plane' ? [0.98, 0.72, 0.25, 1] : [0.35, 0.85, 0.95, 1];
      } else if (hl.type === 'point' && hl.p) {
        this.markerAt = hl.p;
      }
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.hlLines); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.hlTris); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tris), gl.DYNAMIC_DRAW);
    this.hlLineCount = lines.length / 3; this.hlTriCount = tris.length / 3;
    this.dirty = true;
  }

  faceAngles(fi) {
    const n = faceNormal(FACES[fi]);
    let yaw = this.yaw, pitch;
    if (n[2] > 0) pitch = 1.05;
    else if (n[2] < 0) pitch = -1.05;
    else { yaw = Math.atan2(n[1], n[0]) + 0.42; pitch = 0.42; }
    return [yaw, pitch];
  }
  focusFace(fi) { const [y, p] = this.faceAngles(fi); this.lookFrom(y, p); }
  // turn the camera to a yaw/pitch (radians), the shortest way round; instant skips the animation
  lookFrom(yaw, pitch, instant = false) {
    while (yaw - this.yaw > Math.PI) yaw -= 2 * Math.PI;
    while (yaw - this.yaw < -Math.PI) yaw += 2 * Math.PI;
    if (instant) { this.anim = null; this.yaw = yaw; this.pitch = pitch; this.dirty = true; return; }
    this.anim = { t0: performance.now(), from: [this.yaw, this.pitch], to: [yaw, pitch] };
  }
  frame(dist, cornerMode, home) {
    this.dist = dist; this.homeDist = dist; this.cornerMode = !!cornerMode; this.cornerDist = dist; this._sized = true;
    this.home = home || [-0.95, 0.5];
    if (cornerMode) this.lookCorner();
    else this.lookFrom(this.home[0], this.home[1]);
    this.dirty = true;
  }

  // look straight at the vertical corner between the front (C) and right (E) faces
  lookCorner() {
    let yaw = -Math.PI / 4;
    while (yaw - this.yaw > Math.PI) yaw -= 2 * Math.PI;
    while (yaw - this.yaw < -Math.PI) yaw += 2 * Math.PI;
    this.anim = { t0: performance.now(), from: [this.yaw, this.pitch], to: [yaw, 0.16] };
  }
  resetView() {
    if (this.cornerMode) { this.lookCorner(); this.dist = this.cornerDist; this.dirty = true; return; }
    const h = this.home || [-0.95, 0.5];
    this.lookFrom(h[0], h[1]);
    this.dist = this.homeDist || Math.max(...this.dims) * 3.3;
  }

  _tick() {
    if (this.anim) {
      const t = Math.min(1, (performance.now() - this.anim.t0) / 550);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      this.yaw = this.anim.from[0] + (this.anim.to[0] - this.anim.from[0]) * e;
      this.pitch = this.anim.from[1] + (this.anim.to[1] - this.anim.from[1]) * e;
      if (t >= 1) this.anim = null;
      this.dirty = true;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.render();
  }

  render() {
    const gl = this.gl, c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    gl.viewport(0, 0, w, h);
    const bg = this.bg || [0.105, 0.094, 0.082];
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const cp = Math.cos(this.pitch);
    const eye = [this.target[0] + this.dist * cp * Math.cos(this.yaw), this.target[1] + this.dist * cp * Math.sin(this.yaw), this.target[2] + this.dist * Math.sin(this.pitch)];
    const L = Math.max(...this.dims);
    const proj = perspective(0.62, w / h, Math.max(1, this.dist - L * 2), this.dist + L * 2);
    const view = lookAt(eye, this.target, [0, 0, 1]);
    const vp = mul(proj, view);
    const fwd = norm(sub(this.target, eye)), right = norm(cross(fwd, [0, 0, 1])), up = cross(right, fwd);
    this.vp = vp; this.eye = eye;

    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    if (this.count) {
      gl.useProgram(this.prog);
      gl.uniformMatrix4fv(this.loc.vp, false, vp);
      gl.uniform3fv(this.loc.eye, eye); gl.uniform3fv(this.loc.right, right); gl.uniform3fv(this.loc.up, up);
      gl.uniform3fv(this.loc.grain, this.grain); gl.uniform3fv(this.loc.pith, this.pith);
      gl.uniform1f(this.loc.ring, 1 / 3.6);
      gl.uniform1f(this.loc.toolMap, this.toolMap ? 1 : 0);
      gl.uniform4fv(this.loc.toolR, this.toolR);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.pos); gl.enableVertexAttribArray(this.loc.pos); gl.vertexAttribPointer(this.loc.pos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.nrm); gl.enableVertexAttribArray(this.loc.nrm); gl.vertexAttribPointer(this.loc.nrm, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.aux); gl.enableVertexAttribArray(this.loc.aux); gl.vertexAttribPointer(this.loc.aux, 3, gl.FLOAT, false, 0, 0);
      if (this.indexed) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buf.idx); gl.drawElements(gl.TRIANGLES, this.count, this.indexType, 0); }
      else gl.drawArrays(gl.TRIANGLES, 0, this.count);
      gl.disableVertexAttribArray(this.loc.nrm); gl.disableVertexAttribArray(this.loc.aux);
    }
    gl.useProgram(this.lprog);
    gl.uniformMatrix4fv(this.loc.lvp, false, vp);
    gl.enableVertexAttribArray(this.loc.lpos);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (this.boxLines) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.lines); gl.vertexAttribPointer(this.loc.lpos, 3, gl.FLOAT, false, 0, 0);
      gl.uniform4f(this.loc.lcolor, 0.85, 0.78, 0.66, 0.22);
      gl.drawArrays(gl.LINES, 0, this.boxLines);
    }
    if (this.hlTriCount) {
      gl.depthMask(false);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.hlTris); gl.vertexAttribPointer(this.loc.lpos, 3, gl.FLOAT, false, 0, 0);
      gl.uniform4fv(this.loc.lcolor, this.hlFill);
      gl.drawArrays(gl.TRIANGLES, 0, this.hlTriCount);
      gl.depthMask(true);
    }
    if (this.hlLineCount) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.hlLines); gl.vertexAttribPointer(this.loc.lpos, 3, gl.FLOAT, false, 0, 0);
      // draw once hidden-faint, once visible-bright so drill paths show through the wood
      gl.disable(gl.DEPTH_TEST);
      gl.uniform4f(this.loc.lcolor, this.hlColor[0], this.hlColor[1], this.hlColor[2], 0.28);
      gl.drawArrays(gl.LINES, 0, this.hlLineCount);
      gl.enable(gl.DEPTH_TEST);
      gl.uniform4fv(this.loc.lcolor, this.hlColor);
      gl.drawArrays(gl.LINES, 0, this.hlLineCount);
    }
    gl.disable(gl.BLEND);
    gl.disableVertexAttribArray(this.loc.lpos);
    this._labels(vp, eye, w / dpr, h / dpr);
  }

  _project(vp, p, cw, ch) {
    const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
    const y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
    const w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
    return [(x / w * 0.5 + 0.5) * cw, (1 - (y / w * 0.5 + 0.5)) * ch, w];
  }

  _labels(vp, eye, cw, ch) {
    FACES.forEach((fd, i) => {
      const n = faceNormal(fd);
      const c = n.map((v, k) => v * (this.dims[k] / 2 + Math.max(...this.dims) * 0.09));
      const [x, y] = this._project(vp, c, cw, ch);
      const facing = dot(n, sub(eye, c)) > 0;
      const el = this.labels[i];
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      el.classList.toggle('back', !facing);
    });
    if (this.markerAt) {
      const [x, y] = this._project(vp, this.markerAt, cw, ch);
      this.marker.hidden = false;
      this.marker.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    } else this.marker.hidden = true;
  }

  snapshot() { this.render(); return this.canvas.toDataURL('image/png'); }
}
