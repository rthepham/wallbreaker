// Monster scaling, threat types and rarities.

export const MONSTERS = {
  lifeBase: 15,
  lifeGrowth: 1.14,
  hitBase: 5,
  hitGrowth: 1.08,
  // Global knob for monster damage. 1.0 = doc values. Lowered because every
  // monster in a pack attacks at once, which the doc's per-hit numbers didn't account for.
  damageScale: 0.46,
  // Hits roll between (1 - variance) and (1 + variance) of their base.
  hitVariance: 0.2,
  xpBase: 2,
  xpGrowth: 1.13,
  packSize: [5, 8],
  rarity: {
    normal: { lifeMult: 1, damageMult: 1, xpMult: 1, dropMult: 1 },
    magic: { chance: 0.12, lifeMult: 2, damageMult: 1.1, xpMult: 2, dropMult: 1.5 },
    // At most one rare per pack.
    rare: { chance: 0.05, lifeMult: 4, damageMult: 1.2, xpMult: 5, dropMult: 3 },
  },
  rareMods: [
    { id: 'hulking', name: 'Hulking', lifeMult: 1.5 },
    { id: 'savage', name: 'Savage', damageMult: 1.4 },
    { id: 'swift', name: 'Swift', speedMult: 1.3 },
  ],
};

// Each threat type tests a different part of a build.
export const THREATS = {
  swarm: {
    name: 'Swarm',
    damageType: 'physical',
    // DOC: doc says 0.5x. With 15 attackers that out-damages every other
    // threat; Swarms are meant to test clear speed, not defences.
    interval: 1.8,
    hitMult: 0.35,
    lifeMult: 0.3,
    packSize: [15, 15],
    xpMult: 0.4,
    dropMult: 0.35,
    names: ['Gnawling', 'Mire Rat', 'Ash Mite', 'Scuttler'],
  },
  brute: {
    name: 'Brute',
    damageType: 'physical',
    interval: 2.0,
    hitMult: 2.5,
    lifeMult: 1.2,
    // Thick hide: physical hits deal less. Tests attack builds.
    res: { physical: 30 },
    xpMult: 1.4,
    dropMult: 1.2,
    names: ['Quarry Ogre', 'Slagback', 'Hollow Brute', 'Stonejaw'],
  },
  caster: {
    name: 'Caster',
    // Element is chosen by the zone's threat mix.
    damageType: 'fire',
    interval: 1.0,
    hitMult: 1.5,
    // Casters resist their own element.
    ownElementRes: 40,
    lifeMult: 0.8,
    xpMult: 1.1,
    dropMult: 1,
    names: {
      fire: ['Cinder Acolyte', 'Pyre Mage', 'Ember Witch'],
      cold: ['Rime Acolyte', 'Frost Mage'],
      lightning: ['Storm Acolyte', 'Spark Mage'],
    },
  },
  // Blight: hits add a stack of chaos damage over time instead of dealing a hit.
  // Can't be evaded or blocked by armour. Chaos resistance and regen answer it.
  blight: {
    name: 'Blight',
    damageType: 'chaos',
    interval: 1.5,
    hitMult: 0.4, // damage per second per stack, as a share of a normal hit
    lifeMult: 1.0,
    xpMult: 1.2,
    dropMult: 1,
    stacks: { duration: 4, max: 5 },
    names: ['Rotspawn', 'Blightmaw', 'Sporeling', 'Mire Leech'],
  },
  boss: {
    name: 'Boss',
    interval: 1.5,
    hitMult: 1.0,
    lifeMult: 20,
    xpMult: 12,
    dropMult: 0, // bosses use guaranteed drops instead
    bigHit: { mult: 4.0, interval: 6.0, windup: 1.0 },
  },
};
