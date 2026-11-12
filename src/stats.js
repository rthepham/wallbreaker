// Stat pipeline: collect modifiers -> group by stat and kind ->
// flat -> increased -> more -> caps. Pure functions, no UI.

import { PLAYER } from './data/player.js';
import { BASES, MODS, SLOT_NAMES } from './data/items.js';
import { SKILLS, SUPPORTS } from './data/skills.js';
import { zoneResPenalty, zoneMaxResMinus } from './data/zones.js';
import { PASSIVES, ATLAS_BONUSES } from './data/passives.js';
import { AILMENTS } from './data/ailments.js';

export const DAMAGE_TYPES = ['physical', 'fire', 'cold', 'lightning', 'chaos'];

export function itemLabel(item) {
  return item.name || BASES[item.baseId].name;
}

// Every modifier on the character, each tagged with where it came from.
export function collectModifiers(character) {
  const mods = [];
  const L = character.level;
  mods.push({ stat: 'life', kind: 'flat', value: PLAYER.life.base + PLAYER.life.perLevel * L, source: `Level ${L}` });
  mods.push({ stat: 'mana', kind: 'flat', value: PLAYER.mana.base + PLAYER.mana.perLevel * L, source: `Level ${L}` });
  for (const t of character.atlas || []) {
    const b = ATLAS_BONUSES[t];
    if (b) for (const m of b.mods) mods.push({ ...m, source: `Atlas: tier ${t}` });
  }
  for (const id of character.passives || []) {
    const node = PASSIVES[id];
    if (!node) continue;
    for (const m of node.mods) mods.push({ ...m, source: `Passive: ${node.name}` });
  }
  const sk = SKILLS[(character.skill && character.skill.id) || 'cleave'];
  for (const m of sk.mods || []) mods.push({ ...m, source: `Skill: ${sk.name}` });
  for (const id of (character.skill && character.skill.supports) || []) {
    const sup = SUPPORTS[id];
    for (const m of sup.mods) mods.push({ ...m, source: `Support: ${sup.name}` });
  }
  for (const [slot, item] of Object.entries(character.equipment)) {
    if (!item) continue;
    const base = BASES[item.baseId];
    const where = `${SLOT_NAMES[slot]}: ${itemLabel(item)}`;
    for (const imp of base.implicits || []) {
      mods.push({ stat: imp.stat, kind: imp.kind, value: imp.value, source: `${where} (implicit)` });
    }
    for (const m of item.mods) {
      const fam = MODS[m.family];
      mods.push({ stat: fam.stat, kind: fam.kind, value: m.value, source: where });
    }
  }
  return mods;
}

function group(mods) {
  const g = {};
  for (const m of mods) {
    const key = `${m.stat}:${m.kind}`;
    (g[key] ||= []).push(m);
  }
  const flat = (stat) => (g[`${stat}:flat`] || []).reduce((a, m) => a + m.value, 0);
  const inc = (stat) => (g[`${stat}:increased`] || []).reduce((a, m) => a + m.value, 0);
  const more = (stat) => (g[`${stat}:more`] || []).reduce((a, m) => a * (1 + m.value / 100), 1);
  const sources = (stat) => mods.filter((m) => m.stat === stat);
  return { flat, inc, more, sources };
}

export function armourReduction(armour, hit) {
  if (armour <= 0 || hit <= 0) return 0;
  return Math.min(PLAYER.armourCap, armour / (armour + 5 * hit));
}

export function evadeChance(evasion, monsterLevel) {
  if (evasion <= 0) return 0;
  return Math.min(PLAYER.evasionCap, evasion / (evasion + 100 + 10 * monsterLevel));
}

// Effective resistance in a zone, after the zone penalty, capped at max.
export function effectiveRes(stats, type, zoneId) {
  if (type === 'physical') return 0;
  const raw = stats.res[type];
  const penalty = type === 'chaos' ? 0 : zoneResPenalty(zoneId);
  const maxMinus = zoneMaxResMinus(zoneId);
  return Math.min(raw - penalty, stats.maxRes[type] - maxMinus);
}

// Damage actually taken from one hit of the given type.
export function damageTaken(stats, type, hit, zoneId) {
  if (type === 'chaos' && stats.chaosImmune) return 0;
  const less = 1 - (stats.lessDamageTaken || 0) / 100;
  if (type === 'physical') return hit * (1 - armourReduction(stats.armour, hit)) * less;
  let taken = hit * (1 - effectiveRes(stats, type, zoneId) / 100);
  // Iron Hide: armour also works on elemental hits, at reduced effect.
  if (stats.armourVsEle > 0 && type !== 'chaos') taken *= 1 - armourReduction(stats.armour, hit) * stats.armourVsEle;
  return taken * less;
}

// Largest single hit of each type the character survives from full life.
// damageTaken grows with the hit, so a binary search finds it.
export function maxHitTaken(stats, zoneId) {
  const out = {};
  for (const t of DAMAGE_TYPES) {
    // Chaos skips energy shield; everything else hits it first.
    const pool = stats.life + (t === 'chaos' ? 0 : stats.energyShield || 0);
    if (t === 'chaos' && stats.chaosImmune) {
      out[t] = Infinity;
      continue;
    }
    let lo = 0;
    let hi = pool;
    while (damageTaken(stats, t, hi, zoneId) < pool && hi < 1e9) hi *= 2;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (damageTaken(stats, t, mid, zoneId) < pool) lo = mid;
      else hi = mid;
    }
    out[t] = hi;
  }
  return out;
}

export function computeStats(character) {
  const mods = collectModifiers(character);
  const { flat, inc, more, sources } = group(mods);
  const skill = SKILLS[(character.skill && character.skill.id) || 'cleave'];

  let life = Math.round(flat('life') * (1 + inc('life') / 100) * more('life'));
  // Energy shield: a second pool that takes hits before life (not chaos).
  // Hollow Vessel: life becomes 1, gain energy shield equal to twice your life, immune to chaos.
  const hollow = flat('hollowVessel') > 0;
  let esFlat = flat('energyShield');
  if (hollow) {
    esFlat += 2 * life;
    life = 1;
  }
  const energyShield = Math.round(esFlat * (1 + inc('energyShield') / 100) * more('energyShield'));
  const chaosImmune = hollow;
  const mana = Math.round(flat('mana') * (1 + inc('mana') / 100) * more('mana'));
  const manaRegen = mana * PLAYER.manaRegenPctPerSec * (1 + inc('manaRegen') / 100);
  const noRegen = flat('noRegen') > 0;
  const lifeRegen = noRegen ? 0 : flat('lifeRegen') + life * PLAYER.lifeRegenPctPerSec;
  const armourVsEle = flat('armourVsElemental') / 100;
  const armour = Math.round(flat('armour') * (1 + inc('armour') / 100));
  const cannotEvade = flat('cannotEvade') > 0;
  const evasion = cannotEvade ? 0 : Math.round(flat('evasion') * (1 + inc('evasion') / 100));

  const res = {
    fire: flat('fireRes'),
    cold: flat('coldRes'),
    lightning: flat('lightningRes'),
    chaos: flat('chaosRes'),
  };
  const maxRes = {
    fire: PLAYER.maxRes + flat('maxFireRes'),
    cold: PLAYER.maxRes + flat('maxColdRes'),
    lightning: PLAYER.maxRes + flat('maxLightningRes'),
    chaos: PLAYER.maxRes + flat('maxChaosRes'),
  };

  // ---- Skill damage ----
  const skillId = (character.skill && character.skill.id) || 'cleave';
  const isAttack = skill.kind === 'attack';
  const weapon = character.equipment.weapon;
  const wb = weapon ? BASES[weapon.baseId] : PLAYER.unarmed;
  let baseMin;
  let baseMax;
  let added = 0;
  if (isAttack) {
    added = flat('addedPhys');
    baseMin = wb.damage[0] + added;
    baseMax = wb.damage[1] + added * 2;
  } else {
    const g = skill.growth ** character.level;
    baseMin = skill.base[0] * g;
    baseMax = skill.base[1] * g;
  }
  // Split base damage into typed parts. Conversion moves physical into fire.
  const convert = Math.min(100, flat('convertPhysToFire') + flat('convertAllToFire')) / 100;
  const typed = {};
  if (skill.damageType === 'physical') {
    if (convert < 1) typed.physical = [baseMin * (1 - convert), baseMax * (1 - convert)];
    if (convert > 0) typed.fire = [baseMin * convert, baseMax * convert, 'physical'];
  } else {
    const allFire = flat('convertAllToFire') >= 100 && skill.damageType !== 'fire';
    typed[allFire ? 'fire' : skill.damageType] = [baseMin, baseMax, allFire ? skill.damageType : null];
  }
  const kindInc = isAttack ? inc('attack') : inc('spell');
  const moreAll = skill.damageMore * more('damage') * (isAttack ? more('attack') : more('spell'));
  const parts = [];
  let hitMin = 0;
  let hitMax = 0;
  for (const [type, [lo, hi, from]] of Object.entries(typed)) {
    // Converted damage benefits from bonuses to both its old and new type.
    let increased = inc('damage') + kindInc + inc(type);
    if (from) increased += inc(from);
    const isEle = (t) => t === 'fire' || t === 'cold' || t === 'lightning';
    if (isEle(type) || (from && isEle(from))) increased += inc('elemental');
    const m = moreAll * more(type) * (isEle(type) ? more('elemental') : 1);
    const pMin = lo * (1 + increased / 100) * m;
    const pMax = hi * (1 + increased / 100) * m;
    parts.push({ type, baseMin: lo, baseMax: hi, increased, more: m, hitMin: pMin, hitMax: pMax, convertedFrom: from || null });
    hitMin += pMin;
    hitMax += pMax;
  }
  const mainPart = parts.reduce((a, b) => (b.hitMax > a.hitMax ? b : a), parts[0]);

  const speedBase = isAttack ? wb.aps : skill.castRate;
  const speedInc = isAttack ? inc('attackSpeed') : inc('castSpeed');
  const aps = speedBase * (1 + speedInc / 100) * more('speed') * (isAttack ? more('attackSpeed') : more('castSpeed'));
  const critBase = isAttack ? wb.crit : skill.crit;
  const noCrit = flat('noCrit') > 0;
  const critChance = noCrit ? 0 : Math.min(100, (critBase + flat('critChance')) * (1 + inc('critChance') / 100));
  const critMulti = PLAYER.baseCritMulti + flat('critMulti') / 100;
  const critFactor = 1 + (critChance / 100) * (critMulti - 1);
  const avgHit = (hitMin + hitMax) / 2;
  const dps = avgHit * aps * critFactor;
  const single = flat('singleTarget') > 0;
  const targetMult = 1 + flat('targetMultPct') / 100;
  const targets = single ? 1 : Math.round((skill.targets + flat('targets')) * targetMult);
  const splash = single ? 0 : Math.round(((skill.splash || 0) + flat('splash')) * targetMult);
  const splashMult = Math.min(1, (skill.splashMult || 0.5) + flat('splashMultPct') / 100);
  const supportIds = (character.skill && character.skill.supports) || [];
  const manaMult = supportIds.reduce((a, id) => a * SUPPORTS[id].manaMult, 1);
  const manaCost = Math.round(skill.manaCost * manaMult * 10) / 10;
  const lifeCost = flat('lifeCost') > 0;
  const leech = flat('leech');
  const lowLifeMore = flat('lowLifeMore');
  // Ailments: what each damage type does to enemies.
  const types = new Set(parts.map((p) => p.type));
  const ailments = {
    igniteChance: types.has('fire') ? Math.min(100, AILMENTS.ignite.baseChance + flat('igniteChance')) : 0,
    igniteDpsPct: AILMENTS.ignite.dpsPct * (1 + inc('ignite') / 100),
    shockChance: types.has('lightning') ? Math.min(100, AILMENTS.shock.baseChance + flat('shockChance')) : 0,
    shockEffect: AILMENTS.shock.effect * (1 + inc('shock') / 100),
    chillChance: types.has('cold') ? Math.min(100, AILMENTS.chill.baseChance + flat('chillChance')) : 0,
    chillSlow: Math.min(60, AILMENTS.chill.slow * (1 + inc('chill') / 100)),
    stunThreshold: types.has('physical') ? AILMENTS.stun.threshold / (1 + inc('stun') / 100) : 0,
  };
  const penetration = flat('penetration');
  const firePenetration = flat('firePenetration');

  return {
    level: character.level,
    life, mana, lifeRegen, manaRegen, armour, evasion, res, maxRes, armourVsEle, cannotEvade, noRegen,
    lessDamageTaken: Math.min(50, flat('lessDamageTaken')),
    energyShield, chaosImmune, itemQuantity: flat('itemQuantity'),
    keystones: (character.passives || []).filter((id) => PASSIVES[id] && PASSIVES[id].type === 'keystone'),
    skill: { id: skillId, name: skill.name, kind: skill.kind, damageType: mainPart.type, tags: skill.tags, supports: supportIds },
    damage: {
      baseMin, baseMax, added, parts, increased: mainPart.increased, moreMult: mainPart.more, hitMin, hitMax, avgHit,
      speedBase, speedInc, weaponAps: speedBase, aps, critChance, critMulti, critFactor, dps, targets,
      splash, splashMult, manaCost, manaMult, manaPerSecond: manaCost * aps, lifeCost, leech, lowLifeMore,
      ailments, penetration, firePenetration, executeMore: flat('executeMore'), lifeOnKillPct: flat('lifeOnKillPct'),
    },
    sources: {
      life: sources('life'), mana: sources('mana'), armour: sources('armour'),
      evasion: sources('evasion'), fireRes: sources('fireRes'), coldRes: sources('coldRes'),
      lightningRes: sources('lightningRes'), chaosRes: sources('chaosRes'),
      lifeRegen: sources('lifeRegen'), energyShield: sources('energyShield'), manaRegen: sources('manaRegen'),
      physical: sources('physical'), addedPhys: sources('addedPhys'),
      attackSpeed: sources('attackSpeed'), castSpeed: sources('castSpeed'), critChance: sources('critChance'),
      attack: sources('attack'),
      spell: sources('spell'), cold: sources('cold'), lightning: sources('lightning'),
      ignite: sources('ignite'), shock: sources('shock'), chill: sources('chill'), stun: sources('stun'),
      igniteChance: sources('igniteChance'), shockChance: sources('shockChance'), penetration: sources('penetration'), elemental: sources('elemental'), fire: sources('fire'), damage: sources('damage'),
      critMulti: sources('critMulti'), targets: sources('targets'),
    },
  };
}

// Resistance a monster has against one of your damage types, after your penetration.
export function monsterRes(damage, monsterResMap, type) {
  const raw = (monsterResMap && monsterResMap[type]) || 0;
  if (type === 'physical' || type === 'chaos') return raw;
  const pen = damage.penetration + (type === 'fire' ? damage.firePenetration : 0);
  return raw - pen;
}

// Share of your hit damage a monster with these resistances takes (1 = all of it).
export function damageFactorVs(damage, monsterResMap) {
  let total = 0;
  let after = 0;
  for (const p of damage.parts) {
    const avg = (p.hitMin + p.hitMax) / 2;
    total += avg;
    after += avg * (1 - monsterRes(damage, monsterResMap, p.type) / 100);
  }
  return total > 0 ? after / total : 1;
}
