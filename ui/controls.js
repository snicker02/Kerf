// Small DOM helpers for the parameter panel.

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}

export function section(parent, title, open = true) {
  const d = el('details', { class: 'sec', open });
  d.append(el('summary', {}, title));
  const body = el('div', { class: 'sec-body' });
  d.append(body);
  parent.append(d);
  return body;
}

export function row(parent, label, control, hint) {
  const r = el('div', { class: 'row' }, el('label', {}, label), control);
  if (hint) r.append(el('div', { class: 'hint' }, hint));
  parent.append(r);
  return r;
}

export function select(options, value, onChange) {
  const s = el('select', { onchange: () => onChange(s.value) });
  for (const o of options) s.append(el('option', { value: o.id }, o.name));
  s.value = value;
  return s;
}

export function segmented(options, value, onChange) {
  const g = el('div', { class: 'seg', role: 'group' });
  const set = v => { for (const b of g.children) b.classList.toggle('on', b.dataset.v === v); };
  for (const o of options) {
    g.append(el('button', { type: 'button', 'data-v': o.id, title: o.title || o.name, onclick: () => { set(o.id); onChange(o.id); } }, o.name));
  }
  set(value);
  g.setValue = set;
  return g;
}

// slider with a live readout; onInput fires while dragging, onChange on release
export function slider({ min, max, step, value, fmt, onInput, onChange }) {
  const out = el('output', {}, fmt(value));
  const r = el('input', { type: 'range', min, max, step, value });
  r.addEventListener('input', () => { const v = +r.value; out.textContent = fmt(v); onInput && onInput(v); });
  r.addEventListener('change', () => onChange && onChange(+r.value));
  const w = el('div', { class: 'slider' }, r, out);
  w.setValue = v => { r.value = v; out.textContent = fmt(+r.value); };
  w.setRange = (a, b, s) => { r.min = a; r.max = b; r.step = s; };
  return w;
}

export function numberField({ value, step, min, max, suffix, onChange }) {
  const i = el('input', { type: 'number', value, step, min, max, inputmode: 'decimal' });
  i.addEventListener('change', () => { const v = parseFloat(i.value); if (isFinite(v)) onChange(v); });
  const w = el('div', { class: 'num' }, i, suffix ? el('span', { class: 'suffix' }, suffix) : null);
  w.setValue = (v, sfx) => { i.value = v; if (sfx !== undefined && w.lastChild.className === 'suffix') w.lastChild.textContent = sfx; };
  w.input = i;
  return w;
}
