// Crafting currencies and drop weights.
export const CURRENCY = {
  kindling: { name: 'Kindling', effect: 'Normal → Magic', weight: 40 },
  tempest: { name: 'Tempest', effect: "Reroll a Magic item's mods", weight: 25 },
  forge: { name: 'Forge', effect: 'Normal → Rare', weight: 12 },
  ash: { name: 'Ash', effect: 'Reset any item to Normal', weight: 10 },
  wildfire: { name: 'Wildfire', effect: 'Reroll all mods on a Rare', weight: 8 },
  crown: { name: 'Crown', effect: 'Add one random mod to a Rare', weight: 1 },
};

export const CURRENCY_ORDER = ['kindling', 'tempest', 'forge', 'ash', 'wildfire', 'crown'];

export const CONVERSIONS = [
  { from: 'kindling', amount: 5, to: 'tempest' },
  { from: 'tempest', amount: 4, to: 'forge' },
  { from: 'wildfire', amount: 6, to: 'crown' },
];

export const DROPS = {
  itemChance: 0.08,
  rarityWeights: { normal: 70, magic: 25, rare: 5 },
  currencyChance: 0.03,
  bossItems: 3,
  bossCurrency: 2,
};

// Scrap from salvaging, and the Smith's prices.
export const SCRAP = {
  salvage: { normal: 1, magic: 2, rare: 5 },
  // Smith cost = base + perTier * tier
  smithBase: 6,
  smithPerTier: 6,
  // Smith crafts at the best tier the item level allows, capped here.
  smithMaxTier: 3,
};
