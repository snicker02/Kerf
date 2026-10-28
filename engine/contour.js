// Marching squares on a 2D lattice of nb x nc points (spacing hb, hc).
// Returns contour segments (flat [x1,y1,x2,y2,...]) and, optionally, filled cell polygons
// for the region value > level. Coordinates are lattice millimetres (X = ib*hb, Y = ic*hc).
// The fill walk and the segments use the same corner order, so saddles resolve consistently.

export function contour2D(g, nb, nc, hb, hc, level = 0, wantFill = false) {
  const segs = [];
  const polys = wantFill ? [] : null;
  const v = [0, 0, 0, 0], X = [0, 0, 0, 0], Y = [0, 0, 0, 0];
  const cross = [];
  let runStart = -1, runRow = -1;
  const flush = (ibEnd) => {
    if (runStart >= 0 && polys) polys.push([runStart * hb, runRow * hc, ibEnd * hb, runRow * hc, ibEnd * hb, (runRow + 1) * hc, runStart * hb, (runRow + 1) * hc]);
    runStart = -1;
  };
  for (let ic = 0; ic < nc - 1; ic++) {
    flush(nb - 1);
    for (let ib = 0; ib < nb - 1; ib++) {
      const i0 = ib + nb * ic;
      v[0] = g[i0] - level; v[1] = g[i0 + 1] - level; v[2] = g[i0 + 1 + nb] - level; v[3] = g[i0 + nb] - level;
      const in0 = v[0] > 0, in1 = v[1] > 0, in2 = v[2] > 0, in3 = v[3] > 0;
      if (!(in0 || in1 || in2 || in3)) { flush(ib); continue; }
      X[0] = ib * hb; Y[0] = ic * hc; X[1] = (ib + 1) * hb; Y[1] = ic * hc;
      X[2] = (ib + 1) * hb; Y[2] = (ic + 1) * hc; X[3] = ib * hb; Y[3] = (ic + 1) * hc;
      if (in0 && in1 && in2 && in3) {
        if (runStart < 0) { runStart = ib; runRow = ic; }
        continue;
      }
      flush(ib);
      const poly = polys ? [] : null;
      cross.length = 0;
      for (let e = 0; e < 4; e++) {
        const a = e, b = (e + 1) & 3;
        const ia = v[a] > 0, ibb = v[b] > 0;
        if (ia && poly) poly.push(X[a], Y[a]);
        if (ia !== ibb) {
          const t = v[a] / (v[a] - v[b]);
          const x = X[a] + (X[b] - X[a]) * t, y = Y[a] + (Y[b] - Y[a]) * t;
          if (poly) poly.push(x, y);
          cross.push(x, y, ia ? 1 : 0);
        }
      }
      if (poly) polys.push(poly);
      // pair each "leaving" crossing with the next crossing in walk order
      const nCross = cross.length / 3;
      for (let q = 0; q < nCross; q++) {
        if (cross[q * 3 + 2] !== 1) continue;
        const r = (q + 1) % nCross;
        segs.push(cross[q * 3], cross[q * 3 + 1], cross[r * 3], cross[r * 3 + 1]);
      }
    }
  }
  flush(nb - 1);
  return { segs, polys };
}
