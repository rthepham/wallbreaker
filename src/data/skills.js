// Active skills (one equipped at a time) and support gems.
// Attacks scale with the weapon. Spells scale with character level.

export const SKILLS = {
  cleave: {
    name: 'Cleave',
    kind: 'attack',
    damageType: 'physical',
    // "Weapon damage x 1.2"
    damageMore: 1.2,
    // DOC: doc says 6. Lowered with the mana regen change so base Cleave never starves.
    manaCost: 4,
    targets: 3,
    tags: ['Attack', 'Melee', 'Area'],
    description: 'A wide swing. Uses your weapon’s damage and speed. Hits 3 enemies.',
  },
  fireball: {
    name: 'Fireball',
    kind: 'spell',
    damageType: 'fire',
    // DOC: doc says 12-18. Halved so spells don't outclass Cleave at level 1.
    base: [6, 9],
    // DOC: doc says 1.09 per level. That outgrew weapon scaling ~5x by level 20.
    growth: 1.065, // per character level
    castRate: 1.25,
    crit: 6,
    // DOC: doc says 10. Lowered with the mana regen change.
    manaCost: 6,
    targets: 1,
    splash: 2,
    splashMult: 0.5,
    damageMore: 1,
    tags: ['Spell', 'Projectile'],
    description: 'Hits one enemy hard, and splashes 2 more for half damage. Scales with your level.',
  },
  arc: {
    name: 'Arc',
    kind: 'spell',
    damageType: 'lightning',
    // DOC: doc says 4-30. Lowered so four full-damage chain hits don't dominate.
    base: [1, 10],
    growth: 1.065,
    castRate: 1.4,
    crit: 5,
    manaCost: 7,
    targets: 4,
    damageMore: 1,
    tags: ['Spell', 'Chain'],
    description: 'Chains between 4 enemies at full damage. Wide damage range. Scales with your level.',
  },
};

export const SKILL_ORDER = ['cleave', 'fireball', 'arc'];

// Supports add modifiers to the linked skill and multiply its mana cost.
// requires: the skill must have at least one of these tags (null = works with all).
export const SUPPORTS = {
  brutality: {
    name: 'Brutality', manaMult: 1.4, requires: null,
    text: '40% more damage',
    mods: [{ stat: 'damage', kind: 'more', value: 40 }],
  },
  wide_arc: {
    name: 'Wide Arc', manaMult: 1.3, requires: ['Area', 'Chain'],
    text: '+2 targets, 15% less damage',
    mods: [{ stat: 'targets', kind: 'flat', value: 2 }, { stat: 'damage', kind: 'more', value: -15 }],
  },
  searing_edge: {
    name: 'Searing Edge', manaMult: 1.2, requires: ['Attack'],
    text: 'Convert 50% of physical damage to fire',
    mods: [{ stat: 'convertPhysToFire', kind: 'flat', value: 50 }],
  },
  precision: {
    name: 'Precision', manaMult: 1.3, requires: null,
    text: '+3% base crit chance, +30% crit multiplier',
    mods: [{ stat: 'critChance', kind: 'flat', value: 3 }, { stat: 'critMulti', kind: 'flat', value: 30 }],
  },
  bloodthirst: {
    name: 'Bloodthirst', manaMult: 1.2, requires: null,
    text: 'Recover 2% of damage dealt as life',
    mods: [{ stat: 'leech', kind: 'flat', value: 2 }],
  },
  echo: {
    name: 'Echo', manaMult: 1.5, requires: ['Spell'],
    text: '25% more uses per second',
    mods: [{ stat: 'speed', kind: 'more', value: 25 }],
  },
  focused_strike: {
    name: 'Focused Strike', manaMult: 1.4, requires: null,
    text: '60% more damage, but hits only one target',
    mods: [{ stat: 'damage', kind: 'more', value: 60 }, { stat: 'singleTarget', kind: 'flat', value: 1 }],
  },
};

export const SUPPORT_ORDER = ['brutality', 'wide_arc', 'searing_edge', 'precision', 'bloodthirst', 'echo', 'focused_strike'];

export const LINKS = {
  base: 2,
  // DOC: doc unlocks the 3rd link at zone 6 and the 4th at map tier 1.
  // The prototype only has 5 zones, so they come earlier.
  unlocks: [{ zone: 3, slots: 3 }, { zone: 5, slots: 4 }],
  startingSupports: ['brutality'],
  // Chance a repeat boss kill drops a support you don't own.
  // A zone's first clear always gives one.
  bossDropChance: 0.25,
};

export function supportFits(supportId, skillId) {
  const req = SUPPORTS[supportId].requires;
  return !req || req.some((t) => SKILLS[skillId].tags.includes(t));
}
