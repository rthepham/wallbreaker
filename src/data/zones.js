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
  // Zones 6-10: your resistances are 20% lower here (see zoneResPenalty).
  {
    id: 6,
    name: 'Frostmere Shallows',
    level: 23,
    packs: 10,
    mix: [
      { threat: 'swarm', weight: 1 },
      { threat: 'brute', weight: 1 },
      { threat: 'caster', element: 'cold', weight: 2 },
      { threat: 'caster', element: 'lightning', weight: 1 },
    ],
    boss: { name: 'Rimeheart Herald', damageType: 'cold', res: { cold: 40 } },
    targetPackSeconds: 6,
  },
  {
    id: 7,
    name: 'The Rotting Halls',
    level: 28,
    packs: 10,
    mix: [
      { threat: 'swarm', weight: 1 },
      { threat: 'blight', weight: 3 },
      { threat: 'brute', weight: 1 },
    ],
    boss: { name: 'The Mire Mother', damageType: 'chaos', res: { physical: 20 } },
    targetPackSeconds: 6,
  },
  {
    id: 8,
    name: 'Stormspire',
    level: 33,
    packs: 10,
    // From zone 8 on, monsters resist all elements a little.
    monsterEleRes: 10,
    mix: [
      { threat: 'caster', element: 'lightning', weight: 2 },
      { threat: 'caster', element: 'cold', weight: 1 },
      { threat: 'blight', weight: 1 },
      { threat: 'brute', weight: 1 },
    ],
    boss: { name: 'Stormcaller Vex', damageType: 'lightning', res: { lightning: 40 } },
    targetPackSeconds: 6,
  },
  {
    id: 9,
    name: 'The Gravefields',
    level: 38,
    packs: 10,
    monsterEleRes: 10,
    mix: [
      { threat: 'brute', weight: 3 },
      { threat: 'swarm', weight: 2 },
      { threat: 'blight', weight: 1 },
    ],
    boss: { name: 'The Gravewarden', damageType: 'physical', res: { physical: 40 } },
    targetPackSeconds: 6,
  },
  {
    id: 10,
    name: 'The Last Wall',
    level: 42,
    packs: 10,
    monsterEleRes: 10,
    mix: [
      { threat: 'swarm', weight: 1 },
      { threat: 'brute', weight: 1.5 },
      { threat: 'caster', element: 'fire', weight: 1 },
      { threat: 'caster', element: 'cold', weight: 1 },
      { threat: 'caster', element: 'lightning', weight: 1 },
      { threat: 'blight', weight: 1 },
    ],
    boss: { name: 'The Last Wall', damageType: 'physical', res: { physical: 20, fire: 20, cold: 20, lightning: 20 } },
    targetPackSeconds: 6,
  },
];

// Maps are areas too. They are registered at runtime by id ('map:<uid>').
const AREAS = new Map();
export function registerArea(area) {
  AREAS.set(area.id, area);
}
export function areaById(id) {
  if (typeof id === 'number') return ZONES.find((z) => z.id === id);
  return AREAS.get(id);
}

// Resistance penalty by area. Zones 1-5 have none, zones 6-10 have 20.
// Maps set their own (see data/maps.js).
export function zoneResPenalty(zoneId) {
  const a = typeof zoneId === 'number' ? null : AREAS.get(zoneId);
  if (a) return a.resPenalty || 0;
  if (zoneId >= 6) return 20;
  return 0;
}

// Reduction to maximum resistances in an area (the "Exposed" map mod).
export function zoneMaxResMinus(zoneId) {
  const a = typeof zoneId === 'number' ? null : AREAS.get(zoneId);
  return a ? a.maxResMinus || 0 : 0;
}
