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
    description: 'A wide swing that hits 3 enemies. Scales with your weapon. Heavy hits stun, pausing enemy attacks. Brutes shrug off some physical damage.',
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
    manaCost: 4,
    targets: 1,
    splash: 2,
    splashMult: 0.5,
    damageMore: 1,
    tags: ['Spell', 'Projectile', 'Fire'],
    // Extra ignite chance on top of the base 10% for fire hits.
    mods: [{ stat: 'igniteChance', kind: 'flat', value: 25 }],
    description: 'Hits one enemy hard and splashes 2 more for half damage. Often sets enemies burning, which melts bosses. Fire casters resist it.',
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
    // Deliberately hungry: Arc's weakness is mana.
    manaCost: 5,
    targets: 4,
    damageMore: 1,
    tags: ['Spell', 'Chain', 'Lightning'],
    mods: [{ stat: 'shockChance', kind: 'flat', value: 25 }],
    description: 'Chains between 4 enemies at full damage. Often shocks them so they take more damage. Hungry for mana.',
  },
  ice_nova: {
    name: 'Ice Nova',
    kind: 'spell',
    damageType: 'cold',
    base: [3, 6],
    growth: 1.065,
    castRate: 1.1,
    crit: 6,
    manaCost: 4.5,
    targets: 5,
    damageMore: 1,
    tags: ['Spell', 'Area', 'Cold'],
    description: 'A ring of frost that hits 5 enemies. Every hit chills, so enemies attack 30% slower. Lower damage, safer fights. Nothing resists cold yet.',
  },
};

export const SKILL_ORDER = ['cleave', 'fireball', 'arc', 'ice_nova'];

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
  pierce: {
    name: 'Pierce', manaMult: 1.3, requires: ['Fire', 'Lightning', 'Cold'],
    text: 'Hits ignore 25% of enemy elemental resistance',
    mods: [{ stat: 'penetration', kind: 'flat', value: 25 }],
  },
  kindle: {
    name: 'Kindle', manaMult: 1.2, requires: null, needs: 'fire damage',
    text: '+25% ignite chance, burning deals 40% more',
    mods: [{ stat: 'igniteChance', kind: 'flat', value: 25 }, { stat: 'ignite', kind: 'increased', value: 40 }],
  },
  overcharge: {
    name: 'Overcharge', manaMult: 1.2, requires: null, needs: 'lightning damage',
    text: '+25% shock chance, shocks are 40% stronger',
    mods: [{ stat: 'shockChance', kind: 'flat', value: 25 }, { stat: 'shock', kind: 'increased', value: 40 }],
  },
  frostbite: {
    name: 'Frostbite', manaMult: 1.2, requires: null, needs: 'cold damage',
    text: 'Chills are 50% stronger, 20% more cold damage',
    mods: [{ stat: 'chill', kind: 'increased', value: 50 }, { stat: 'cold', kind: 'more', value: 20 }],
  },
  concussive_force: {
    name: 'Concussive Force', manaMult: 1.3, requires: null, needs: 'physical damage',
    text: 'Stuns twice as easily, 20% more physical damage',
    mods: [{ stat: 'stun', kind: 'increased', value: 100 }, { stat: 'physical', kind: 'more', value: 20 }],
  },
  elemental_fury: {
    name: 'Elemental Fury', manaMult: 1.4, requires: null, needs: 'elemental damage',
    text: '30% more elemental damage',
    mods: [{ stat: 'elemental', kind: 'more', value: 30 }],
  },
  controlled_destruction: {
    name: 'Controlled Destruction', manaMult: 1.3, requires: ['Spell'],
    text: '35% more spell damage, but you never crit',
    mods: [{ stat: 'spell', kind: 'more', value: 35 }, { stat: 'noCrit', kind: 'flat', value: 1 }],
  },
  swift_assault: {
    name: 'Swift Assault', manaMult: 1.4, requires: ['Attack'],
    text: '25% more attack speed',
    mods: [{ stat: 'attackSpeed', kind: 'more', value: 25 }],
  },
  scatter: {
    name: 'Scatter', manaMult: 1.3, requires: ['Projectile'],
    text: '+2 splash targets, splash deals 25% more of the hit',
    mods: [{ stat: 'splash', kind: 'flat', value: 2 }, { stat: 'splashMultPct', kind: 'flat', value: 25 }],
  },
  executioner: {
    name: 'Executioner', manaMult: 1.3, requires: null,
    text: '60% more damage to enemies below 35% life',
    mods: [{ stat: 'executeMore', kind: 'flat', value: 60 }],
  },
  efficacy: {
    name: 'Efficacy', manaMult: 0.7, requires: null,
    text: '30% lower mana cost, 10% less damage',
    mods: [{ stat: 'damage', kind: 'more', value: -10 }],
  },
  iron_will: {
    name: 'Iron Will', manaMult: 1.3, requires: null,
    text: '+30% armour, and you take 10% less damage',
    mods: [{ stat: 'armour', kind: 'increased', value: 30 }, { stat: 'lessDamageTaken', kind: 'flat', value: 10 }],
  },
  lifetap: {
    name: 'Lifetap', manaMult: 1.2, requires: null,
    text: 'Recover 3% of maximum life on each kill',
    mods: [{ stat: 'lifeOnKillPct', kind: 'flat', value: 3 }],
  },
  focused_strike: {
    name: 'Focused Strike', manaMult: 1.4, requires: null,
    text: '60% more damage, but hits only one target',
    mods: [{ stat: 'damage', kind: 'more', value: 60 }, { stat: 'singleTarget', kind: 'flat', value: 1 }],
  },
};

export const SUPPORT_ORDER = [
  'brutality', 'wide_arc', 'searing_edge', 'precision', 'bloodthirst', 'echo', 'pierce', 'focused_strike',
  'kindle', 'overcharge', 'frostbite', 'concussive_force', 'elemental_fury', 'controlled_destruction',
  'swift_assault', 'scatter', 'executioner', 'efficacy', 'iron_will', 'lifetap',
];

export const LINKS = {
  base: 2,
  // DOC: doc unlocks the 3rd link at zone 6 and the 4th at map tier 1.
  // The prototype only has 5 zones, so they come earlier.
  unlocks: [{ zone: 3, slots: 3 }, { zone: 5, slots: 4 }, { zone: 8, slots: 5 }],
  startingSupports: ['brutality'],
  // Chance a repeat boss kill drops a support you don't own.
  // A zone's first clear always gives one.
  // Raised from 0.25 when the support count went from 8 to 20.
  bossDropChance: 0.35,
};

export function supportFits(supportId, skillId) {
  const req = SUPPORTS[supportId].requires;
  return !req || req.some((t) => SKILLS[skillId].tags.includes(t));
}
