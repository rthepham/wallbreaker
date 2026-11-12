// Passive tree: three regions around a free starting node, joined by bridges.
// Each region has a gate node and five branches; most end in a keystone.
// Node positions are generated from angles so the data stays readable.

const L = (stat, value, kind = 'flat') => ({ stat, kind, value });
const INC = (stat, value) => ({ stat, kind: 'increased', value });
const MORE = (stat, value) => ({ stat, kind: 'more', value });

export const KEYSTONES = {
  iron_hide: {
    name: 'Iron Hide',
    text: ['You cannot evade attacks', 'Armour also reduces elemental hits, at half effect'],
    mods: [L('cannotEvade', 1), L('armourVsElemental', 50)],
  },
  ember_heart: {
    name: 'Ember Heart',
    text: ['All your damage is converted to fire', 'Your hits ignore 15% of enemy fire resistance', '+15% chance to ignite'],
    mods: [L('convertAllToFire', 100), L('firePenetration', 15), L('igniteChance', 15)],
  },
  reckless_tempo: {
    name: 'Reckless Tempo',
    text: ['35% more attack and cast speed', '20% less maximum life'],
    mods: [MORE('speed', 35), MORE('life', -20)],
  },
  spread_thin: {
    name: 'Spread Thin',
    text: ['Skills hit double their targets', '25% less damage'],
    mods: [L('targetMultPct', 100), MORE('damage', -25)],
  },
  blood_price: {
    name: 'Blood Price',
    text: ['Skills cost life instead of mana', '25% more damage'],
    mods: [L('lifeCost', 1), MORE('damage', 25)],
  },
  colossus: {
    name: 'Colossus',
    text: ['40% more maximum life', '25% less attack and cast speed'],
    mods: [MORE('life', 40), MORE('speed', -25)],
  },
  thunderstruck: {
    name: 'Thunderstruck',
    text: ['Your lightning hits always shock', '15% less damage'],
    mods: [L('shockChance', 100), MORE('damage', -15)],
  },
  deep_winter: {
    name: 'Deep Winter',
    text: ['Your chills slow twice as much (up to 60%)', '20% less damage'],
    mods: [INC('chill', 100), MORE('damage', -20)],
  },
  hollow_vessel: {
    name: 'Hollow Vessel',
    text: ['Chaos damage cannot harm you', 'Your maximum life is 1', 'You gain energy shield equal to twice your maximum life'],
    mods: [L('hollowVessel', 1)],
  },
  bulwark: {
    name: 'Bulwark of Will',
    text: ['+5% to all maximum resistances', '+20% to fire, cold and lightning resistance', '15% less maximum life'],
    mods: [
      L('maxFireRes', 5), L('maxColdRes', 5), L('maxLightningRes', 5), L('maxChaosRes', 5),
      L('fireRes', 20), L('coldRes', 20), L('lightningRes', 20), MORE('life', -15),
    ],
  },
};

// Each branch has 8 nodes: 3 small, a notable, 3 small, then a notable or keystone.
// `small` lists two small-node bonuses that alternate along the branch.
const N = (name, ...mods) => ({ name, mods });
const REGIONS = [
  {
    id: 'might', name: 'Might', angle: -90,
    gate: [L('life', 20)],
    branches: [
      { small: [L('armour', 30), L('life', 15)], mid: N('Ironbound', INC('armour', 30), L('armour', 40)), end: 'iron_hide' },
      {
        small: [INC('physical', 15), INC('stun', 25)], mid: N('Crushing Blows', INC('physical', 30), INC('stun', 50)), end: N('Juggernaut Strength', INC('physical', 40), INC('attackSpeed', 10)),
        ext: { small: [INC('physical', 15), L('life', 20)], end: N("Titan's Grip", INC('physical', 30), INC('stun', 40)), length: 3 },
      },
      { small: [L('life', 15), L('lifeRegen', 2)], mid: N('Unbreaking', INC('life', 10), L('lifeRegen', 3)), end: 'colossus' },
      { small: [INC('fire', 15), L('igniteChance', 6)], mid: N('Kindled Fury', INC('ignite', 50), L('igniteChance', 10)), end: 'ember_heart' },
      { small: [INC('armour', 12), L('fireRes', 8)], mid: N('Steelskin', INC('armour', 25), L('life', 25)), end: N('Bastion', L('armour', 80), L('fireRes', 15), INC('life', 6)) },
    ],
  },
  {
    id: 'finesse', name: 'Finesse', angle: 30,
    gate: [L('evasion', 30)],
    branches: [
      { small: [INC('attackSpeed', 6), INC('castSpeed', 6)], mid: N('Relentless', INC('attackSpeed', 10), INC('castSpeed', 10)), end: 'reckless_tempo' },
      {
        small: [INC('critChance', 25), L('critMulti', 10)], mid: N('Killer Instinct', INC('critChance', 50), L('critMulti', 20)), end: N('Deadly Precision', INC('critChance', 60), L('critMulti', 30)),
        ext: { small: [INC('critChance', 25), L('critMulti', 10)], end: N("Assassin's Mark", L('critMulti', 35), INC('damage', 15)), length: 3 },
      },
      { small: [L('evasion', 30), INC('damage', 8)], mid: N('Sweeping Reach', L('targets', 1), INC('evasion', 20)), end: 'spread_thin' },
      { small: [INC('lightning', 15), L('shockChance', 6)], mid: N('Static Charge', INC('shock', 50), L('shockChance', 10)), end: 'thunderstruck' },
      { small: [INC('evasion', 12), INC('attack', 12)], mid: N("Duelist's Grace", INC('evasion', 25), INC('attack', 20)), end: N('Opportunist', INC('damage', 30), L('evasion', 60)) },
    ],
  },
  {
    id: 'mind', name: 'Mind', angle: 150,
    gate: [L('mana', 20)],
    branches: [
      { small: [INC('spell', 15), INC('manaRegen', 15)], mid: N('Arcane Focus', INC('spell', 30), L('mana', 30)), end: 'blood_price' },
      {
        small: [L('mana', 15), INC('manaRegen', 20)], mid: N('Wellspring', INC('manaRegen', 40), L('mana', 20)), end: N('Deep Reserves', L('mana', 60), INC('manaRegen', 50)),
        // Past the mana notable: an energy shield path to Hollow Vessel.
        ext: { small: [L('energyShield', 30), INC('energyShield', 15)], end: 'hollow_vessel', length: 4 },
      },
      { small: [L('fireRes', 10), L('lightningRes', 10)], mid: N('Elemental Ward', L('fireRes', 12), L('coldRes', 12), L('lightningRes', 12)), end: 'bulwark' },
      { small: [INC('cold', 15), INC('chill', 15)], mid: N('Hoarfrost', INC('chill', 40), INC('cold', 25)), end: 'deep_winter' },
      { small: [INC('elemental', 12), INC('castSpeed', 5)], mid: N('Elemental Mastery', INC('elemental', 30)), end: N('Piercing Will', L('penetration', 10), INC('elemental', 15)) },
    ],
  },
];

// Paths between neighbouring regions, for hybrid builds.
const BRIDGES = [
  { from: 'might', to: 'finesse', small: [INC('attack', 10), L('life', 12)], mid: N("Warrior's Poise", INC('attack', 20), INC('life', 6)) },
  { from: 'finesse', to: 'mind', small: [INC('critChance', 15), INC('spell', 10)], mid: N('Arcane Precision', INC('critChance', 30), INC('spell', 20)) },
  { from: 'mind', to: 'might', small: [L('chaosRes', 6), L('life', 12)], mid: N('Resolute Spirit', L('chaosRes', 12), L('fireRes', 8), L('coldRes', 8), L('lightningRes', 8)) },
];

const BRANCH_SPREAD = 20; // degrees between branches in a region
const R0 = 2.0;
const STEP = 0.8;

function build() {
  const nodes = {};
  const add = (n) => { nodes[n.id] = { links: [], ...n }; return n.id; };
  const link = (a, b) => { nodes[a].links.push(b); nodes[b].links.push(a); };
  const pos = (angleDeg, r) => {
    const a = (angleDeg * Math.PI) / 180;
    return { x: Math.round(Math.cos(a) * r * 100) / 100, y: Math.round(Math.sin(a) * r * 100) / 100 };
  };
  add({ id: 'origin', name: 'Wanderer', type: 'origin', region: null, mods: [], ...pos(0, 0) });
  for (const R of REGIONS) {
    const gate = add({ id: `${R.id}_gate`, name: `${R.name} Gate`, type: 'small', region: R.id, mods: R.gate, ...pos(R.angle, 1.1) });
    link('origin', gate);
    R.branches.forEach((B, bi) => {
      const angle = R.angle + (bi - 2) * BRANCH_SPREAD;
      let prev = gate;
      for (let i = 0; i < 8; i++) {
        const r = R0 + i * STEP;
        const at = pos(angle, r);
        let id;
        if (i === 3) id = add({ id: `${R.id}_${bi}_${i}`, region: R.id, type: 'notable', ...B.mid, ...at });
        else if (i === 7 && typeof B.end === 'string') {
          const K = KEYSTONES[B.end];
          id = add({ id: B.end, region: R.id, type: 'keystone', name: K.name, mods: K.mods, text: K.text, ...at });
        } else if (i === 7) id = add({ id: `${R.id}_${bi}_${i}`, region: R.id, type: 'notable', ...B.end, ...at });
        else id = add({ id: `${R.id}_${bi}_${i}`, region: R.id, type: 'small', name: 'Passive', mods: [B.small[i % 2]], ...at });
        link(prev, id);
        prev = id;
      }
      // Some branches continue past their last notable.
      if (B.ext) {
        for (let j = 0; j < B.ext.length; j++) {
          const i = 8 + j;
          const at = pos(angle, R0 + i * STEP);
          const last = j === B.ext.length - 1;
          let id;
          if (last && typeof B.ext.end === 'string') {
            const K = KEYSTONES[B.ext.end];
            id = add({ id: B.ext.end, region: R.id, type: 'keystone', name: K.name, mods: K.mods, text: K.text, ...at });
          } else if (last) id = add({ id: `${R.id}_${bi}_${i}`, region: R.id, type: 'notable', ...B.ext.end, ...at });
          else id = add({ id: `${R.id}_${bi}_${i}`, region: R.id, type: 'small', name: 'Passive', mods: [B.ext.small[j % 2]], ...at });
          link(prev, id);
          prev = id;
        }
      }
    });
  }
  // Bridges run from the last branch of one region to the first branch of the next,
  // starting and ending at each branch's fifth node (just past its first notable).
  for (const Bd of BRIDGES) {
    const A = REGIONS.find((r) => r.id === Bd.from);
    const B = REGIONS.find((r) => r.id === Bd.to);
    const a0 = A.angle + 2 * BRANCH_SPREAD;
    let a1 = B.angle - 2 * BRANCH_SPREAD;
    if (a1 < a0) a1 += 360;
    const start = `${A.id}_4_4`;
    const end = `${B.id}_0_4`;
    let prev = start;
    const n = 5;
    for (let i = 0; i < n; i++) {
      const ang = a0 + ((i + 1) / (n + 1)) * (a1 - a0);
      const id = add({
        id: `bridge_${A.id}_${B.id}_${i}`, region: null, ...pos(ang, R0 + 4 * STEP + 0.6),
        ...(i === 2 ? { type: 'notable', ...Bd.mid } : { type: 'small', name: 'Passive', mods: [Bd.small[i % 2]] }),
      });
      link(prev, id);
      prev = id;
    }
    link(prev, end);
  }
  return nodes;
}

export const PASSIVES = build();
export const PASSIVE_REGIONS = REGIONS.map((r) => ({ id: r.id, name: r.name, angle: r.angle }));

export const PASSIVE_RULES = {
  // 1 point per level after the first, plus bonus points for first clears.
  // DOC: doc gives +2 for zones 5 and 10. Zone 5 is the prototype's last zone.
  bonusPoints: [{ zone: 5, points: 2 }, { zone: 10, points: 2 }],
  // Refund cost in Scrap: base + level / perLevels.
  refundBase: 1,
  refundPerLevels: 4,
};

// Atlas: the first clear of each map tier gives a small bonus for the rest of the league.
export const ATLAS_BONUSES = {
  1: { text: '+3% item quantity', mods: [L('itemQuantity', 3)] },
  2: { text: '+5% to fire, cold and lightning resistance', mods: [L('fireRes', 5), L('coldRes', 5), L('lightningRes', 5)] },
  3: { text: '4% increased maximum life', mods: [INC('life', 4)] },
  4: { text: '8% increased damage', mods: [INC('damage', 8)] },
  5: { text: '+5% item quantity', mods: [L('itemQuantity', 5)] },
  6: { text: '+6% to chaos resistance', mods: [L('chaosRes', 6)] },
  7: { text: '5% increased attack and cast speed', mods: [INC('attackSpeed', 5), INC('castSpeed', 5)] },
  8: { text: '+1% to all maximum resistances', mods: [L('maxFireRes', 1), L('maxColdRes', 1), L('maxLightningRes', 1), L('maxChaosRes', 1)] },
  9: { text: '6% increased maximum life', mods: [INC('life', 6)] },
  10: { text: '12% increased damage', mods: [INC('damage', 12)] },
  11: { text: '+7% item quantity', mods: [L('itemQuantity', 7)] },
  12: { text: '10% increased armour, evasion and energy shield', mods: [INC('armour', 10), INC('evasion', 10), INC('energyShield', 10)] },
  13: { text: '+8% to chaos resistance', mods: [L('chaosRes', 8)] },
  14: { text: '+1% to all maximum resistances', mods: [L('maxFireRes', 1), L('maxColdRes', 1), L('maxLightningRes', 1), L('maxChaosRes', 1)] },
  15: { text: '+10% item quantity', mods: [L('itemQuantity', 10)] },
  16: { text: '15% increased damage, 5% increased maximum life', mods: [INC('damage', 15), INC('life', 5)] },
};
