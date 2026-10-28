// Binary STL of an indexed triangle mesh (millimetres).
export function meshToSTL(mesh, name = 'kerf') {
  const nt = mesh.idx.length / 3;
  const buf = new ArrayBuffer(84 + nt * 50);
  const dv = new DataView(buf);
  const head = `${name} - Kerf`.slice(0, 79);
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i) & 127);
  dv.setUint32(80, nt, true);
  const P = mesh.pos, I = mesh.idx;
  let o = 84;
  for (let t = 0; t < nt; t++) {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
    for (let k = 0; k < 3; k++) {
      const v = I[t * 3 + k] * 3;
      dv.setFloat32(o + 12 + k * 12, P[v], true); dv.setFloat32(o + 16 + k * 12, P[v + 1], true); dv.setFloat32(o + 20 + k * 12, P[v + 2], true);
    }
    dv.setUint16(o + 48, 0, true);
    o += 50;
  }
  return new Blob([buf], { type: 'model/stl' });
}
