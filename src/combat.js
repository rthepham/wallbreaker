// Monster and pack creation. Pure logic.

import { MONSTERS, THREATS } from './data/monsters.js';

export function monsterBaseLife(level) {
  return MONSTERS.lifeBase * MONSTERS.lifeGrowth ** level;
}

export function monsterBaseHit(level) {
  return MONSTERS.hitBase * MONSTERS.hitGrowth ** level * MONSTERS.damageScale;
}

export function makeMonster(rng, id, { zone, threatId, element, rarity = 'normal', isBoss = false }) {
  const T = THREATS[threatId];
  const R = MONSTERS.rarity[rarity];
  const level = zone.level;
  let lifeMult = T.lifeMult * R.lifeMult * (zone.lifeMult || 1);
  let damageMult = T.hitMult * R.damageMult;
  if (isBoss && zone.champion) {
    lifeMult *= 1.5;
    damageMult *= 1.5;
  }
  let speedMult = 1;
  let mod = null;
  if (rarity === 'rare') {
    mod = rng.pick(MONSTERS.rareMods);
    lifeMult *= mod.lifeMult || 1;
    damageMult *= mod.damageMult || 1;
    speedMult *= mod.speedMult || 1;
  }
  let name;
  let damageType;
  if (isBoss) {
    name = zone.boss.name;
    damageType = zone.boss.damageType;
  } else if (threatId === 'caster') {
    damageType = element || T.damageType;
    name = rng.pick(T.names[damageType]);
  } else {
    damageType = T.damageType;
    name = rng.pick(T.names);
  }
  if (mod) name = `${mod.name} ${name}`;
  const maxLife = Math.round(monsterBaseLife(level) * lifeMult);
  const interval = T.interval / speedMult;
  const m = {
    id,
    name,
    threat: threatId,
    rarity: isBoss ? 'boss' : rarity,
    level,
    maxLife,
    life: maxLife,
    hit: monsterBaseHit(level) * damageMult,
    damageType,
    interval,
    // Stagger first attacks so a pack doesn't hit in perfect sync.
    attackTimer: interval * (0.5 + rng.next() * 0.5),
    isBoss,
    xpMult: T.xpMult * (isBoss ? 1 : R.xpMult),
    dropMult: (T.dropMult ?? 1) * R.dropMult * (1 + (zone.iiq || 0) / 100),
  };
  if (isBoss) {
    m.bigHit = { ...T.bigHit, timer: T.bigHit.interval, warned: false };
  }
  // Resistances (percent) by damage type.
  m.res = { ...(T.res || {}) };
  if (threatId === 'caster' && T.ownElementRes) m.res[damageType] = T.ownElementRes;
  if (isBoss && zone.boss.res) m.res = { ...zone.boss.res };
  // Zone-wide elemental resistance (zone 8 on).
  for (const t of ['fire', 'cold', 'lightning']) {
    if (zone.monsterEleRes) m.res[t] = (m.res[t] || 0) + zone.monsterEleRes;
  }
  // Active ailments: { ignite, shock, chill, stun } with remaining time.
  m.status = {};
  return m;
}

export function makePack(rng, zone, nextId) {
  const entry = rng.weighted(zone.mix);
  const T = THREATS[entry.threat];
  const [lo, hi] = T.packSize || MONSTERS.packSize;
  const size = rng.int(lo, hi);
  const monsters = [];
  let hasRare = false;
  for (let i = 0; i < size; i++) {
    let rarity = 'normal';
    if (!hasRare && rng.chance(MONSTERS.rarity.rare.chance)) {
      rarity = 'rare';
      hasRare = true;
    } else if (rng.chance(MONSTERS.rarity.magic.chance)) {
      rarity = 'magic';
    }
    monsters.push(makeMonster(rng, nextId(), { zone, threatId: entry.threat, element: entry.element, rarity }));
  }
  return { threat: entry.threat, element: entry.element, monsters };
}

export function makeBossPack(rng, zone, nextId) {
  return {
    threat: 'boss',
    monsters: [makeMonster(rng, nextId(), { zone, threatId: 'boss', isBoss: true })],
  };
}
