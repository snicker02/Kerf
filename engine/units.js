// Length formatting and standard tool sizes. All internal lengths are millimetres.

export const MM_PER_IN = 25.4;

function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = a % b; a = b; b = t; }
  return a;
}

// 1.1875 -> "1 3/16″"
export function fracInches(inches, den = 16, mark = true) {
  const neg = inches < 0;
  const n = Math.round(Math.abs(inches) * den);
  const whole = Math.floor(n / den);
  const rem = n - whole * den;
  let s;
  if (rem === 0) s = String(whole);
  else {
    const g = gcd(rem, den);
    const fr = `${rem / g}/${den / g}`;
    s = whole ? `${whole} ${fr}` : fr;
  }
  return (neg && n ? '−' : '') + s + (mark ? '″' : '');
}

export function fmtLen(mm, units, opt = {}) {
  if (mm == null || !isFinite(mm)) return '—';
  if (units === 'in') return fracInches(mm / MM_PER_IN, opt.den || 16, opt.mark !== false);
  const a = Math.abs(mm);
  const v = a < 20 ? Math.round(mm * 2) / 2 : Math.round(mm);
  return opt.mark === false ? String(v) : `${v} mm`;
}

// Round a depth DOWN to the displayed precision so a printed depth never goes deeper than planned.
export function floorToDisplay(mm, units) {
  if (units === 'in') { const q = MM_PER_IN / 16; return Math.floor(mm / q + 1e-6) * q; }
  return Math.floor(mm * 2 + 1e-6) / 2;
}

export function toUnits(mm, units) { return units === 'in' ? mm / MM_PER_IN : mm; }
export function fromUnits(v, units) { return units === 'in' ? v * MM_PER_IN : v; }

const BITS_IN = [1 / 8, 3 / 16, 1 / 4, 5 / 16, 3 / 8, 1 / 2, 5 / 8, 3 / 4, 7 / 8, 1, 1.25, 1.5];
const BITS_MM = [3, 4, 5, 6, 8, 10, 12, 15, 16, 20, 25, 30, 35];
export function bitSizes(units) {
  return units === 'in'
    ? BITS_IN.map(x => ({ dia: x * MM_PER_IN, label: fracInches(x) }))
    : BITS_MM.map(x => ({ dia: x, label: `${x} mm` }));
}

const GOUGE_IN = [1 / 8, 3 / 16, 1 / 4, 5 / 16, 3 / 8, 1 / 2, 5 / 8, 3 / 4, 1];
const GOUGE_MM = [3, 4, 5, 6, 8, 10, 12, 14, 16, 20, 25];
export function gougeWidths(units) {
  return units === 'in'
    ? GOUGE_IN.map(x => ({ mm: x * MM_PER_IN, label: fracInches(x) }))
    : GOUGE_MM.map(x => ({ mm: x, label: `${x} mm` }));
}

// A "nice" grid spacing near the requested length.
export function niceStep(mm, units) {
  const c = units === 'in'
    ? [1 / 8, 1 / 4, 3 / 8, 1 / 2, 3 / 4, 1, 1.5, 2].map(x => x * MM_PER_IN)
    : [2, 2.5, 5, 10, 15, 20, 25, 50];
  let best = c[0];
  for (const v of c) if (Math.abs(Math.log(v / mm)) < Math.abs(Math.log(best / mm))) best = v;
  return best;
}
