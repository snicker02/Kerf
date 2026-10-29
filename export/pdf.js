// A small PDF writer with no dependencies: US Letter pages, the standard Helvetica fonts
// (WinAnsi encoding), filled/stroked rectangles and lines, and JPEG images.
// Coordinates are points from the TOP-left of the page.

export const PW = 612, PH = 792;

// Unicode → WinAnsi (cp1252) for the characters Kerf's text uses
const WIN = { 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2026: 0x85, 0x2122: 0x99, 0x20AC: 0x80 };
const SUB = { '″': '"', '′': "'", '−': '-', '→': '->', '←': '<-', '≤': '<=', '≥': '>=', '≈': '~', ' ': ' ', ' ': ' ', ' ': ' ', '✕': 'x', '✓': 'v', '‑': '-' };
export function winAnsi(str) {
  const out = [];
  for (const ch of String(str)) {
    if (SUB[ch]) { for (const c of SUB[ch]) out.push(c.charCodeAt(0)); continue; }
    const c = ch.codePointAt(0);
    if (c >= 32 && c < 127) out.push(c);
    else if (c >= 0xA0 && c <= 0xFF) out.push(c);
    else if (WIN[c]) out.push(WIN[c]);
    else if (c === 10 || c === 9) out.push(32);
    else out.push(63); // '?'
  }
  return out;
}
const esc = bytes => bytes.map(b => (b === 40 || b === 41 || b === 92 ? '\\' + String.fromCharCode(b) : b < 32 || b > 126 ? '\\' + b.toString(8).padStart(3, '0') : String.fromCharCode(b))).join('');
const n2 = v => (Math.round(v * 100) / 100).toString();
const rgb = c => { if (typeof c === 'string') { let h = c.replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); } return c; };

export class PDF {
  // measure(text, size, bold) -> width in points; defaults to an average-width estimate
  constructor({ measure, title = 'Kerf', author = '' } = {}) {
    this.measure = measure || ((t, s, b) => [...String(t)].length * s * (b ? 0.56 : 0.52));
    this.pages = []; this.images = []; this.title = title; this.author = author;
  }
  addPage() { this.cur = { ops: [], imgs: new Set() }; this.pages.push(this.cur); return this.cur; }
  _op(s) { if (!this.cur) this.addPage(); this.cur.ops.push(s); }

  text(x, y, str, size = 10, { bold = false, color = '#000' } = {}) {
    const [r, g, b] = rgb(color);
    this._op(`BT /${bold ? 'F2' : 'F1'} ${n2(size)} Tf ${n2(r)} ${n2(g)} ${n2(b)} rg 1 0 0 1 ${n2(x)} ${n2(PH - y)} Tm (${esc(winAnsi(str))}) Tj ET`);
  }
  width(str, size, bold) { return this.measure(str, size, bold); }
  rect(x, y, w, h, { fill = null, stroke = null, lw = 0.75 } = {}) {
    let s = 'q ';
    if (fill) s += `${rgb(fill).map(n2).join(' ')} rg `;
    if (stroke) s += `${rgb(stroke).map(n2).join(' ')} RG ${n2(lw)} w `;
    s += `${n2(x)} ${n2(PH - y - h)} ${n2(w)} ${n2(h)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'} Q`;
    this._op(s);
  }
  line(x1, y1, x2, y2, { color = '#000', lw = 0.75 } = {}) {
    this._op(`q ${rgb(color).map(n2).join(' ')} RG ${n2(lw)} w ${n2(x1)} ${n2(PH - y1)} m ${n2(x2)} ${n2(PH - y2)} l S Q`);
  }
  // jpeg: Uint8Array of a baseline JPEG; pw × ph pixels; drawn at x, y with size w × h (points)
  addImage(jpeg, pw, ph) { const id = this.images.length; this.images.push({ jpeg, pw, ph }); return id; }
  image(id, x, y, w, h) {
    if (!this.cur) this.addPage();
    this.cur.imgs.add(id);
    this._op(`q ${n2(w)} 0 0 ${n2(h)} ${n2(x)} ${n2(PH - y - h)} cm /Im${id} Do Q`);
  }

  finish() {
    const enc = new TextEncoder();
    const chunks = []; let len = 0;
    const offsets = [];
    const push = b => { const u = typeof b === 'string' ? latin1(b) : b; chunks.push(u); len += u.length; };
    const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); for (const b of [].concat(body)) push(b); push('\nendobj\n'); };
    // object numbers: 1 catalog, 2 pages, 3 F1, 4 F2, 5 info, then images, then page+content pairs
    const nImg = this.images.length, firstImg = 6, firstPage = firstImg + nImg;
    const pageNums = this.pages.map((_, i) => firstPage + i * 2);
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Count ${this.pages.length} /Kids [${pageNums.map(n => `${n} 0 R`).join(' ')}] >>`);
    obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    obj(5, `<< /Title (${esc(winAnsi(this.title))}) /Producer (Kerf) ${this.author ? `/Author (${esc(winAnsi(this.author))})` : ''} >>`);
    this.images.forEach((im, i) => obj(firstImg + i, [`<< /Type /XObject /Subtype /Image /Width ${im.pw} /Height ${im.ph} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>\nstream\n`, im.jpeg, '\nendstream']));
    this.pages.forEach((p, i) => {
      const n = pageNums[i];
      const content = latin1(p.ops.join('\n'));
      const xo = [...p.imgs].map(id => `/Im${id} ${firstImg + id} 0 R`).join(' ');
      obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xo ? ` /XObject << ${xo} >>` : ''} >> /Contents ${n + 1} 0 R >>`);
      obj(n + 1, [`<< /Length ${content.length} >>\nstream\n`, content, '\nendstream']);
    });
    const total = firstPage + this.pages.length * 2;
    const xref = len;
    let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let i = 1; i < total; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    push(x);
    push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    void enc;
    const out = new Uint8Array(len); let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }
}

function latin1(s) { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; }

// word-wrap rich text: runs = [{ t, bold }] → lines of runs that fit in width w
export function wrapRuns(runs, size, w, measure) {
  const words = [];
  for (const r of runs) {
    const parts = String(r.t).split(/(\s+)/);
    for (const p of parts) { if (p === '') continue; words.push({ t: /^\s+$/.test(p) ? ' ' : p, bold: !!r.bold, sp: /^\s+$/.test(p) }); }
  }
  const lines = []; let line = [], lw = 0;
  for (const wd of words) {
    const ww = measure(wd.t, size, wd.bold);
    if (wd.sp) { if (line.length) { line.push(wd); lw += ww; } continue; }
    if (lw + ww > w && line.length) {
      while (line.length && line[line.length - 1].sp) line.pop();
      lines.push(line); line = []; lw = 0;
    }
    line.push(wd); lw += ww;
  }
  while (line.length && line[line.length - 1].sp) line.pop();
  if (line.length) lines.push(line);
  // merge neighbouring words of the same weight
  return lines.map(l => { const m = []; for (const wd of l) { const last = m[m.length - 1]; if (last && last.bold === wd.bold) last.t += wd.t; else m.push({ t: wd.t, bold: wd.bold }); } return m; });
}
