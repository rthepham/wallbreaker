// Crafting operations. Each check returns null if allowed or a reason string.
// Each apply mutates the given item and returns a message.

import { CURRENCY, CONVERSIONS, SCRAP } from './data/currency.js';
import {
  addRandomMod, eligibleFamilies, openAffixTypes, rerollMods, setRarity,
  tiersAt, sortMods, rollModValue,
} from './loot.js';

export const CRAFTS = {
  kindling: {
    check: (item) => (item.rarity !== 'normal' ? 'Kindling only works on Normal items.' : null),
    apply(rng, item) {
      setRarity(rng, item, 'magic');
      rerollMods(rng, item);
    },
  },
  tempest: {
    check: (item) => (item.rarity !== 'magic' ? 'Tempest only works on Magic items.' : null),
    apply(rng, item) { rerollMods(rng, item); },
  },
  forge: {
    check: (item) => (item.rarity !== 'normal' ? 'Forge only works on Normal items.' : null),
    apply(rng, item) {
      setRarity(rng, item, 'rare');
      rerollMods(rng, item);
    },
  },
  ash: {
    check: (item) => (item.rarity === 'normal' ? 'This item is already Normal.' : null),
    apply(rng, item) {
      setRarity(rng, item, 'normal');
      item.mods = [];
    },
  },
  wildfire: {
    check: (item) => (item.rarity !== 'rare' ? 'Wildfire only works on Rare items.' : null),
    apply(rng, item) { rerollMods(rng, item); },
  },
  crown: {
    check(item) {
      if (item.rarity !== 'rare') return 'Crown only works on Rare items.';
      if (!eligibleFamilies(item).length) return 'This item has no open mod slots.';
      return null;
    },
    apply(rng, item) { addRandomMod(rng, item); },
  },
};

export function canCraft(currencyId, item, currency) {
  if ((currency[currencyId] || 0) < 1) return `You have no ${CURRENCY[currencyId].name}.`;
  return CRAFTS[currencyId].check(item);
}

// Spends one currency and changes the item. Returns { ok, reason }.
export function craft(rng, currencyId, item, currency) {
  const reason = canCraft(currencyId, item, currency);
  if (reason) return { ok: false, reason };
  currency[currencyId] -= 1;
  CRAFTS[currencyId].apply(rng, item);
  return { ok: true };
}

export function salvageValue(item) {
  return SCRAP.salvage[item.rarity];
}

// The Smith: add one chosen mod family at a fixed tier for Scrap.
export function smithTier(familyId, ilvl) {
  const avail = tiersAt(familyId, ilvl);
  if (!avail.length) return null;
  const capped = avail.filter((t) => t.tier <= SCRAP.smithMaxTier);
  return capped.length ? capped[capped.length - 1].tier : avail[0].tier;
}

export function smithCost(tier) {
  return SCRAP.smithBase + SCRAP.smithPerTier * tier;
}

// Families the Smith could add. A Normal item is upgraded to Magic first.
export function smithOptions(item) {
  const asItem = item.rarity === 'normal' ? { ...item, rarity: 'magic' } : item;
  const types = openAffixTypes(asItem);
  return eligibleFamilies(asItem, types).map((family) => {
    const tier = smithTier(family, item.ilvl);
    return { family, tier, cost: smithCost(tier) };
  });
}

export function smithCraft(rng, item, familyId, scrap) {
  const opt = smithOptions(item).find((o) => o.family === familyId);
  if (!opt) return { ok: false, reason: 'That mod cannot be added to this item.' };
  if (scrap < opt.cost) return { ok: false, reason: `Needs ${opt.cost} Scrap. You have ${scrap}.` };
  if (item.rarity === 'normal') setRarity(rng, item, 'magic');
  item.mods.push({ family: familyId, tier: opt.tier, value: rollModValue(rng, familyId, opt.tier), smithed: true });
  sortMods(item);
  return { ok: true, cost: opt.cost };
}

export function convert(currency, index) {
  const c = CONVERSIONS[index];
  if ((currency[c.from] || 0) < c.amount) {
    return { ok: false, reason: `Needs ${c.amount} ${CURRENCY[c.from].name}.` };
  }
  currency[c.from] -= c.amount;
  currency[c.to] = (currency[c.to] || 0) + 1;
  return { ok: true };
}

