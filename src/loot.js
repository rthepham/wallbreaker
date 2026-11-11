// Item generation and drops. Pure logic: takes an rng, returns plain data.

import { BASES, MODS, RARE_NAME_PARTS } from './data/items.js';
import { CURRENCY, DROPS } from './data/currency.js';

export const AFFIX_LIMITS = {
  normal: { prefix: 0, suffix: 0 },
  magic: { prefix: 1, suffix: 1 },
  rare: { prefix: 3, suffix: 3 },
};

export function tiersAt(familyId, ilvl) {
  return MODS[familyId].tiers.filter((t) => t.ilvl <= ilvl);
}

export function countAffixes(item) {
  const c = { prefix: 0, suffix: 0 };
  for (const m of item.mods) c[MODS[m.family].type]++;
  return c;
}

export function openAffixTypes(item) {
  const lim = AFFIX_LIMITS[item.rarity];
  const c = countAffixes(item);
  return ['prefix', 'suffix'].filter((t) => c[t] < lim[t]);
}

// Families that could legally be added to this item.
export function eligibleFamilies(item, types = openAffixTypes(item)) {
  const slot = BASES[item.baseId].slot;
  const have = new Set(item.mods.map((m) => m.family));
  return Object.keys(MODS).filter((id) => {
    const fam = MODS[id];
    return (
      types.includes(fam.type) &&
      fam.slots.includes(slot) &&
      !have.has(id) &&
      // A family's stat can only appear once (e.g. weapon and ring added phys are different families
      // but never share a slot, so this only blocks true duplicates).
      tiersAt(id, item.ilvl).length > 0
    );
  });
}

export function rollModValue(rng, familyId, tier) {
  const t = MODS[familyId].tiers.find((x) => x.tier === tier);
  return rng.int(t.min, t.max);
}

export function rollMod(rng, familyId, ilvl) {
  const t = rng.pick(tiersAt(familyId, ilvl));
  return { family: familyId, tier: t.tier, value: rng.int(t.min, t.max) };
}

// Adds one random legal mod. Returns false if the item has no room.
export function addRandomMod(rng, item) {
  const fams = eligibleFamilies(item);
  if (!fams.length) return false;
  const famId = rng.weighted(fams, (id) => MODS[id].weight);
  item.mods.push(rollMod(rng, famId, item.ilvl));
  sortMods(item);
  return true;
}

export function sortMods(item) {
  item.mods.sort((a, b) => (MODS[a.family].type === MODS[b.family].type ? 0 : MODS[a.family].type === 'prefix' ? -1 : 1));
}

export function rollModCount(rng, rarity) {
  if (rarity === 'magic') return rng.int(1, 2);
  if (rarity === 'rare') return rng.weighted([[3, 3], [4, 4], [5, 2], [6, 1]], (e) => e[1])[0];
  return 0;
}

// Replace all mods with a fresh roll appropriate to the item's rarity.
export function rerollMods(rng, item) {
  item.mods = [];
  const n = rollModCount(rng, item.rarity);
  for (let i = 0; i < n; i++) addRandomMod(rng, item);
}

export function rareName(rng, slot) {
  return `${rng.pick(RARE_NAME_PARTS.first)} ${rng.pick(RARE_NAME_PARTS.second[slot])}`;
}

export function setRarity(rng, item, rarity) {
  item.rarity = rarity;
  item.name = rarity === 'rare' ? rareName(rng, BASES[item.baseId].slot) : null;
}

export function pickBase(rng, ilvl, slot = null) {
  const bases = Object.entries(BASES).filter(([, b]) => b.ilvl <= ilvl && (!slot || b.slot === slot));
  // Newer bases (closer to the item level) are more likely.
  const [id] = rng.weighted(bases, ([, b]) => 1 + 2 * (b.ilvl / Math.max(1, ilvl)));
  return id;
}

export function makeItem(rng, uid, { baseId, ilvl, rarity = 'normal' }) {
  const item = { uid, baseId, ilvl, rarity: 'normal', name: null, mods: [] };
  setRarity(rng, item, rarity);
  rerollMods(rng, item);
  return item;
}

export function rollRarity(rng, forceAtLeast = null) {
  if (forceAtLeast === 'rare') return 'rare';
  return rng.weighted(Object.entries(DROPS.rarityWeights), (e) => e[1])[0];
}

export function rollCurrencyType(rng) {
  return rng.weighted(Object.entries(CURRENCY), ([, c]) => c.weight)[0];
}

// Drops from one dead monster. newUid() hands out item ids.
// Returns { items: [], currency: { id: n } }.
export function rollMonsterDrops(rng, monster, newUid) {
  const out = { items: [], currency: {} };
  const ilvl = monster.level;
  if (monster.isBoss) {
    for (let i = 0; i < DROPS.bossItems; i++) {
      const rarity = i === 0 ? 'rare' : rollRarity(rng);
      out.items.push(makeItem(rng, newUid(), { baseId: pickBase(rng, ilvl), ilvl, rarity }));
    }
    for (let i = 0; i < DROPS.bossCurrency; i++) {
      const c = rollCurrencyType(rng);
      out.currency[c] = (out.currency[c] || 0) + 1;
    }
    return out;
  }
  const mult = monster.dropMult;
  if (rng.chance(DROPS.itemChance * mult)) {
    out.items.push(makeItem(rng, newUid(), { baseId: pickBase(rng, ilvl), ilvl, rarity: rollRarity(rng) }));
  }
  if (rng.chance(DROPS.currencyChance * mult)) {
    const c = rollCurrencyType(rng);
    out.currency[c] = 1;
  }
  return out;
}
