// Text formatting helpers for the UI.
import { MODS, BASES } from '../data/items.js';

export const fmt = (n) => Math.round(n).toLocaleString('en-US');
export const fmt1 = (n) => (Math.round(n * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const pct = (n) => `${Math.round(n)}%`;
export const cap = (s) => s[0].toUpperCase() + s.slice(1);

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function modText(m) {
  const fam = MODS[m.family];
  return fam.text.replace('{v}', m.value).replace('{v2}', m.value * 2);
}

export function implicitText(imp) {
  const map = {
    life: `+${imp.value} to maximum Life`,
    armour: `+${imp.value} to Armour`,
    evasion: `+${imp.value} to Evasion`,
    fireRes: `+${imp.value}% to Fire Resistance`,
  };
  return map[imp.stat] || `${imp.stat} ${imp.value}`;
}

export function baseLine(item) {
  const b = BASES[item.baseId];
  if (b.slot === 'weapon') return `Physical ${b.damage[0]}–${b.damage[1]} · ${b.aps.toFixed(2)} attacks/s · ${b.crit}% crit`;
  return (b.implicits || []).map(implicitText).join(' · ');
}

export function itemTitle(item) {
  const b = BASES[item.baseId];
  return item.name ? item.name : b.name;
}

export function timeAgo(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}
