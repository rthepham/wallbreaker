// Stat pipeline: collect modifiers -> group by stat and kind ->
// flat -> increased -> more -> caps. Pure functions, no UI.

import { PLAYER } from './data/player.js';
import { BASES, MODS, SLOT_NAMES } from './data/items.js';
import { SKILLS } from './data/skills.js';
import { zoneResPenalty } from './data/zones.js';

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
  return Math.min(raw - penalty, stats.maxRes[type]);
}

// Damage actually taken from one hit of the given type.
export function damageTaken(stats, type, hit, zoneId) {
  if (type === 'physical') return hit * (1 - armourReduction(stats.armour, hit));
  return hit * (1 - effectiveRes(stats, type, zoneId) / 100);
}

// Largest single hit of each type the character survives from full life.
export function maxHitTaken(stats, zoneId) {
  const L = stats.life;
  const out = {};
  // Physical: taken = 5H^2 / (A + 5H) = L, solved for H. Armour cap applies.
  const A = stats.armour;
  let H = (5 * L + Math.sqrt(25 * L * L + 20 * L * A)) / 10;
  if (A / (A + 5 * H) > PLAYER.armourCap) H = L / (1 - PLAYER.armourCap);
  out.physical = H;
  for (const t of ['fire', 'cold', 'lightning', 'chaos']) {
    out[t] = L / (1 - effectiveRes(stats, t, zoneId) / 100);
  }
  return out;
}

export function computeStats(character) {
  const mods = collectModifiers(character);
  const { flat, inc, more, sources } = group(mods);
  const skill = SKILLS[character.skillId || 'cleave'];

  const life = Math.round(flat('life') * (1 + inc('life') / 100) * more('life'));
  const mana = Math.round(flat('mana') * (1 + inc('mana') / 100) * more('mana'));
  const manaRegen = mana * PLAYER.manaRegenPctPerSec * (1 + inc('manaRegen') / 100);
  const lifeRegen = flat('lifeRegen') + life * PLAYER.lifeRegenPctPerSec;
  const armour = Math.round(flat('armour') * (1 + inc('armour') / 100));
  const evasion = Math.round(flat('evasion') * (1 + inc('evasion') / 100));

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

  // Weapon damage (attacks scale with the weapon).
  const weapon = character.equipment.weapon;
  const wb = weapon ? BASES[weapon.baseId] : PLAYER.unarmed;
  const added = flat('addedPhys');
  const baseMin = wb.damage[0] + added;
  const baseMax = wb.damage[1] + added * 2;
  const increased = inc('physical') + inc('damage');
  const moreMult = skill.damageMore * more('physical') * more('damage');
  const hitMin = baseMin * (1 + increased / 100) * moreMult;
  const hitMax = baseMax * (1 + increased / 100) * moreMult;
  const aps = wb.aps * (1 + inc('attackSpeed') / 100);
  const critChance = Math.min(100, (wb.crit + flat('critChance')) * (1 + inc('critChance') / 100));
  const critMulti = PLAYER.baseCritMulti + flat('critMulti') / 100;
  const critFactor = 1 + (critChance / 100) * (critMulti - 1);
  const avgHit = (hitMin + hitMax) / 2;
  const dps = avgHit * aps * critFactor;
  const targets = skill.targets + flat('targets');
  const manaCost = skill.manaCost;

  return {
    level: character.level,
    life, mana, lifeRegen, manaRegen, armour, evasion, res, maxRes,
    skill: { name: skill.name, damageType: skill.damageType, tags: skill.tags },
    damage: {
      baseMin, baseMax, added, increased, moreMult, hitMin, hitMax, avgHit,
      weaponAps: wb.aps, aps, critChance, critMulti, critFactor, dps, targets,
      manaCost, manaPerSecond: manaCost * aps,
    },
    sources: {
      life: sources('life'), mana: sources('mana'), armour: sources('armour'),
      evasion: sources('evasion'), fireRes: sources('fireRes'), coldRes: sources('coldRes'),
      lightningRes: sources('lightningRes'), chaosRes: sources('chaosRes'),
      lifeRegen: sources('lifeRegen'), manaRegen: sources('manaRegen'),
      physical: sources('physical'), addedPhys: sources('addedPhys'),
      attackSpeed: sources('attackSpeed'), critChance: sources('critChance'),
      critMulti: sources('critMulti'), targets: sources('targets'),
    },
  };
}
