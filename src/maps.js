// Map items, the areas they open, map crafting and map drops. Pure logic.

import { MAP_RULES, MAP_LAYOUTS, MAP_MODS, MAP_MOD_COUNT } from './data/maps.js';
import { CURRENCY } from './data/currency.js';

export function mapLevel(tier) {
  return MAP_RULES.levelBase + MAP_RULES.levelPerTier * tier;
}

export function mapIiq(map) {
  return map.mods.reduce((a, id) => a + MAP_MODS[id].iiq, 0);
}

export function mapName(map) {
  return `${MAP_LAYOUTS[map.layout].name}`;
}

function rollMods(rng, map) {
  const [lo, hi] = MAP_MOD_COUNT[map.rarity];
  const n = rng.int(lo, hi);
  const pool = Object.keys(MAP_MODS).filter((id) => !map.mods.includes(id));
  map.mods = [];
  for (let i = 0; i < n && pool.length; i++) {
    map.mods.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
  }
}

export function makeMap(rng, uid, tier, rarity = 'normal', layout = null) {
  const map = { uid, kind: 'map', tier, rarity, layout: layout || rng.pick(Object.keys(MAP_LAYOUTS)), mods: [] };
  rollMods(rng, map);
  return map;
}

// The playable area a map opens. Registered with the zone registry while it runs.
export function mapArea(map) {
  const L = MAP_LAYOUTS[map.layout];
  const has = (id) => map.mods.includes(id);
  return {
    id: `map:${map.uid}`,
    isMap: true,
    map,
    name: `${L.name} (tier ${map.tier})`,
    level: mapLevel(map.tier),
    packs: MAP_RULES.packs,
    mix: has('teeming') ? [{ threat: 'swarm', weight: 1 }] : L.mix,
    boss: { ...L.boss },
    targetPackSeconds: 6,
    monsterEleRes: MAP_RULES.eleRes(map.tier),
    resPenalty: MAP_RULES.resPenalty,
    maxResMinus: has('exposed') ? 15 : 0,
    lifeMult: has('hardened') ? 1.4 : 1,
    extraFire: has('fiery') ? 0.4 : 0,
    withering: has('withering'),
    champion: has('champion'),
    iiq: mapIiq(map),
  };
}

// Map crafting uses the same currencies as items.
const MAP_CRAFTS = {
  kindling: { need: 'normal', to: 'magic' },
  forge: { need: 'normal', to: 'rare' },
  tempest: { need: 'magic', reroll: true },
  wildfire: { need: 'rare', reroll: true },
  ash: { need: ['magic', 'rare'], to: 'normal' },
  crown: { need: 'rare', add: true },
};

export function canCraftMap(currencyId, map, currency) {
  const c = MAP_CRAFTS[currencyId];
  if (!c) return 'This currency does nothing to maps.';
  if ((currency[currencyId] || 0) < 1) return `You have no ${CURRENCY[currencyId].name}.`;
  const need = Array.isArray(c.need) ? c.need : [c.need];
  if (!need.includes(map.rarity)) return `${CURRENCY[currencyId].name} needs a ${need.join(' or ')} map.`;
  if (c.add && map.mods.length >= MAP_MOD_COUNT.rare[1]) return 'This map has no room for another mod.';
  return null;
}

export function craftMap(rng, currencyId, map, currency) {
  const reason = canCraftMap(currencyId, map, currency);
  if (reason) return { ok: false, reason };
  currency[currencyId] -= 1;
  const c = MAP_CRAFTS[currencyId];
  if (c.to) {
    map.rarity = c.to;
    rollMods(rng, map);
  } else if (c.reroll) {
    rollMods(rng, map);
  } else if (c.add) {
    const pool = Object.keys(MAP_MODS).filter((id) => !map.mods.includes(id));
    map.mods.push(rng.pick(pool));
  }
  return { ok: true };
}

const weighted = (rng, pairs) => rng.weighted(pairs, (p) => p[1])[0];

// Tier for a dropped map: around the source map's tier, never past one above your best clear.
export function rollDropTier(rng, sourceTier, highestCleared) {
  return Math.max(1, Math.min(MAP_RULES.maxTier, highestCleared + 1, sourceTier + weighted(rng, MAP_RULES.tierShift)));
}

// A rare monster inside a map may carry a map.
export function rollRareMonsterMap(rng, map, highestCleared, uid) {
  if (!rng.chance(MAP_RULES.rareMonsterChance * (1 + mapIiq(map) / 100))) return null;
  return makeMap(rng, uid, rollDropTier(rng, map.tier, highestCleared), weighted(rng, Object.entries(MAP_RULES.rarityWeights)));
}

// Maps dropped when a map's boss dies. Higher item quantity means more drops.
// Tiers never go above one past the highest tier you've cleared.
export function rollMapDrops(rng, map, highestCleared, nextUid) {
  let count = weighted(rng, MAP_RULES.dropCount);
  if (rng.chance(mapIiq(map) / 100)) count++;
  const out = [];
  for (let i = 0; i < count; i++) {
    const tier = rollDropTier(rng, map.tier, highestCleared);
    out.push(makeMap(rng, nextUid(), tier, weighted(rng, Object.entries(MAP_RULES.rarityWeights))));
  }
  return out;
}
