// The Flexcut Carvin' Jack 2.0 (JKN291 right-handed / JKNL291 left-handed): six folding blades.
// Published by Flexcut: the six blade types, a 3/4" hook-knife radius, 4-1/4" closed length.
// Widths of the gouge, scorp and V-scorp come from the original Carvin' Jack spec
// (#11 gouge 3/16", scorp 3/8", 70° V-scorp 1/4"); 2.0 kept those and swapped the chisel for a pelican knife.
// Reach (exposed blade length) and grip clearance are not published: they are estimates the user can measure.

import { MM_PER_IN as IN } from './units.js';

export const JACK_DEFAULT = {
  hand: 'right',
  hookR: 0.75 * IN,       // published
  gougeW: 3 / 16 * IN,    // original Jack spec
  scorpW: 3 / 8 * IN,     // original Jack spec
  vscorpW: 1 / 4 * IN,    // original Jack spec, 70°
  knifeReach: 1.5 * IN,   // estimate: detail and pelican knife edge length
  hookReach: 1.25 * IN,   // estimate
  scorpReach: 1.0 * IN,   // estimate: ring to handle
  grip: 1.25 * IN,        // estimate: diameter of opening the handle plus your fingers need
};

export const JACK_FIELDS = [
  { key: 'hookR', label: 'Hook knife radius', source: 'published' },
  { key: 'scorpW', label: 'Gouge scorp width', source: 'original spec' },
  { key: 'gougeW', label: 'Straight gouge width', source: 'original spec' },
  { key: 'vscorpW', label: 'V-scorp width', source: 'original spec' },
  { key: 'knifeReach', label: 'Knife blade length', source: 'estimate' },
  { key: 'hookReach', label: 'Hook knife reach', source: 'estimate' },
  { key: 'scorpReach', label: 'Scorp reach', source: 'estimate' },
  { key: 'grip', label: 'Grip clearance', source: 'estimate' },
];

export const BLADES = {
  detail: { name: 'detail knife', short: 'Detail', color: '#7c6a55' },
  pelican: { name: 'pelican knife', short: 'Pelican', color: '#a98b62' },
  hook: { name: 'hook knife', short: 'Hook', color: '#2f8f8a' },
  gouge: { name: 'straight gouge', short: 'Gouge', color: '#7b5cb0' },
  scorp: { name: 'gouge scorp', short: 'Scorp', color: '#d18a1e' },
  vscorp: { name: 'V-scorp', short: 'V-scorp', color: '#4f6d8f' },
};

export function model(jack) {
  const J = { ...JACK_DEFAULT, ...(jack || {}) };
  const other = J.hand === 'right' ? 'left' : 'right';
  return {
    ...J, other,
    title: `Flexcut Carvin’ Jack 2.0 (${J.hand === 'right' ? 'right-handed, JKN291' : 'left-handed, JKNL291'})`,
    gougeR: J.gougeW / 2,
    scorpR: J.scorpW / 2,
    flatR: 6 * J.hookR,   // hollows gentler than this are flat enough for the pelican knife's belly
    maxReach: Math.max(J.knifeReach, J.hookReach, J.scorpReach),
  };
}

// Which blade suits a spot on the finished surface, from its concave radius (Infinity if convex).
export function bladeFor(J, r) {
  if (r < J.scorpR) return 'gouge';
  if (r < J.hookR) return 'scorp';
  if (r < J.flatR) return 'hook';
  return 'pelican';
}
export function reachOf(J, blade) {
  if (blade === 'hook') return J.hookReach;
  if (blade === 'scorp' || blade === 'vscorp') return J.scorpReach;
  return J.knifeReach;
}
