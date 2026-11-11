// Early-game zones. Each introduces one new threat.
// mix weights pick the threat type for each pack.
// targetPackSeconds: a pack taking over 3x this long counts as "Slow".

export const ZONES = [
  {
    id: 1,
    name: 'The Sunken Yard',
    level: 1,
    packs: 10,
    mix: [{ threat: 'swarm', weight: 1 }],
    boss: { name: 'Yard Matron', damageType: 'physical' },
    targetPackSeconds: 6,
  },
  {
    id: 2,
    name: 'Mirefield',
    level: 4,
    packs: 10,
    mix: [{ threat: 'swarm', weight: 1 }],
    boss: { name: 'The Bloated Reeve', damageType: 'physical' },
    targetPackSeconds: 6,
  },
  {
    id: 3,
    name: 'Broken Quarry',
    level: 8,
    packs: 10,
    mix: [
      { threat: 'swarm', weight: 2 },
      { threat: 'brute', weight: 3 },
    ],
    boss: { name: 'Foreman Gath', damageType: 'physical', res: { physical: 30 } },
    targetPackSeconds: 6,
  },
  {
    id: 4,
    name: 'Emberwatch',
    level: 13,
    packs: 10,
    mix: [
      { threat: 'swarm', weight: 1 },
      { threat: 'brute', weight: 0.5 },
      { threat: 'caster', element: 'fire', weight: 3 },
    ],
    boss: { name: 'The Pyre Warden', damageType: 'fire', res: { fire: 40 } },
    targetPackSeconds: 6,
  },
  {
    id: 5,
    name: 'The Ashen Steps',
    level: 18,
    packs: 10,
    mix: [
      { threat: 'swarm', weight: 1 },
      { threat: 'brute', weight: 1.5 },
      { threat: 'caster', element: 'fire', weight: 1 },
      { threat: 'caster', element: 'lightning', weight: 1.5 },
    ],
    boss: { name: 'Ashborn Colossus', damageType: 'physical', res: { physical: 30, fire: 30 } },
    targetPackSeconds: 6,
  },
];

// Resistance penalty by zone. Zones 1-5 have none (doc: -20% from zone 6, -40% in maps).
export function zoneResPenalty(zoneId) {
  if (zoneId >= 6) return 20;
  return 0;
}
