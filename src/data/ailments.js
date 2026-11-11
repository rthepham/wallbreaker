// What each damage type does to enemies besides damage. This is what makes
// a fire build play differently from a lightning or cold one.

export const AILMENTS = {
  // Fire: burning damage over time. Strongest against big, long-lived targets (bosses).
  ignite: {
    name: 'Burning', from: 'fire', baseChance: 10, duration: 4,
    // Burn per second, as a share of the fire damage the hit dealt.
    dpsPct: 0.3,
  },
  // Lightning: the target takes more damage from everything.
  shock: {
    name: 'Shocked', from: 'lightning', baseChance: 10, duration: 4,
    effect: 25, // % increased damage taken
  },
  // Cold: the target attacks slower. Defence through offence.
  chill: {
    name: 'Chilled', from: 'cold', baseChance: 100, duration: 3,
    slow: 30, // % slower attacks
  },
  // Physical: a hit dealing at least `threshold` of the target's max life stuns it,
  // pausing its attacks. Bosses need `bossMult` times as much.
  stun: {
    name: 'Stunned', from: 'physical', threshold: 0.15, duration: 0.8, bossMult: 3,
  },
};
