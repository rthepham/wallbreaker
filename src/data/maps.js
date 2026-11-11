// Maps: the repeatable endgame (doc section 8).

export const MAP_RULES = {
  maxTier: 16,
  // DOC: doc uses 52 + 2 x tier. Our zone 10 is level 42, so tier 1 matches it
  // (the step up is the larger resistance penalty and map mods).
  levelBase: 40,
  levelPerTier: 2,
  // DOC: doc says -40% resistances in maps. -30% keeps the 75% cap reachable with gear.
  resPenalty: 30,
  // Monsters resist all elements: 10% at tier 1 rising to 30% at tier 16.
  eleRes: (tier) => 10 + Math.round(((tier - 1) * 20) / 15),
  packs: 10,
  stashSize: 60,
  // The zone 10 boss drops a tier 1 map: always on its first clear, then sometimes.
  zone10BossChance: 0.15,
  // Maps dropped by a map's boss: how many, and their tier relative to the map.
  dropCount: [[0, 30], [1, 50], [2, 20]],
  tierShift: [[-1, 20], [0, 60], [1, 20]],
  rarityWeights: { normal: 70, magic: 25, rare: 5 },
  // First clears of these tiers give 2 passive points each.
  bonusPointTiers: [4, 8, 12],
};

export const MAP_LAYOUTS = {
  sunken_bastion: {
    name: 'Sunken Bastion',
    mix: [{ threat: 'brute', weight: 2 }, { threat: 'caster', element: 'fire', weight: 1 }, { threat: 'swarm', weight: 1 }],
    boss: { name: 'The Drowned Castellan', damageType: 'physical', res: { physical: 30 } },
  },
  glacier_vault: {
    name: 'Glacier Vault',
    mix: [{ threat: 'caster', element: 'cold', weight: 2 }, { threat: 'swarm', weight: 1 }, { threat: 'blight', weight: 1 }],
    boss: { name: 'Hoarmaw', damageType: 'cold', res: { cold: 40 } },
  },
  storm_crag: {
    name: 'Storm Crag',
    mix: [{ threat: 'caster', element: 'lightning', weight: 2 }, { threat: 'brute', weight: 1 }],
    boss: { name: 'The Thunder Abbot', damageType: 'lightning', res: { lightning: 40 } },
  },
  plague_warrens: {
    name: 'Plague Warrens',
    mix: [{ threat: 'blight', weight: 2 }, { threat: 'swarm', weight: 2 }],
    boss: { name: 'Mother of Rot', damageType: 'chaos', res: { physical: 20 } },
  },
  bone_orchard: {
    name: 'Bone Orchard',
    mix: [{ threat: 'brute', weight: 2 }, { threat: 'swarm', weight: 1 }, { threat: 'caster', element: 'cold', weight: 1 }],
    boss: { name: 'The Ossuary King', damageType: 'physical', res: { physical: 25, cold: 25 } },
  },
};

// Map modifiers make a map harder and raise item quantity (iiq, in %).
export const MAP_MODS = {
  fiery: { name: 'Fiery', text: 'Monsters deal 40% extra damage as fire', iiq: 15 },
  hardened: { name: 'Hardened', text: 'Monsters have 40% more life', iiq: 15 },
  exposed: { name: 'Exposed', text: 'Players have -15% to maximum resistances', iiq: 20 },
  teeming: { name: 'Teeming', text: 'All packs are Swarm packs', iiq: 20 },
  withering: { name: 'Withering', text: 'All monsters apply Blight', iiq: 20 },
  champion: { name: 'Champion', text: 'Boss has 50% more life and damage', iiq: 25 },
};

export const MAP_MOD_COUNT = { normal: [0, 0], magic: [1, 2], rare: [3, 4] };
