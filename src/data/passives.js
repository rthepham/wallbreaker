// Passive tree: three regions around a free starting node.
// Each region has a gate node and three branches. The two side branches end
// in keystones; the middle branch ends in a notable.
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
  bulwark: {
    name: 'Bulwark of Will',
    text: ['+5% to all maximum resistances', '+20% to fire, cold and lightning resistance', '15% less maximum life'],
    mods: [
      L('maxFireRes', 5), L('maxColdRes', 5), L('maxLightningRes', 5), L('maxChaosRes', 5),
      L('fireRes', 20), L('coldRes', 20), L('lightningRes', 20), MORE('life', -15),
    ],
  },
};

// Each branch: 3 small nodes, a notable, then (optionally) 2 small and a keystone.
// Small nodes are deliberately chunky so one point is something you can feel.
const REGIONS = [
  {
    id: 'might', name: 'Might', angle: -90,
    gate: [L('life', 20)],
    branches: [
      {
        smalls: [[L('armour', 30)], [L('life', 15)], [L('armour', 30)]],
        notable: { name: 'Ironbound', mods: [INC('armour', 30), L('armour', 40), INC('life', 6)] },
        tail: [[L('life', 20)], [L('armour', 40)]],
        keystone: 'iron_hide',
      },
      {
        smalls: [[INC('physical', 15)], [INC('stun', 25)], [INC('physical', 15)]],
        notable: { name: 'Crushing Blows', mods: [INC('physical', 30), INC('stun', 50)] },
      },
      {
        smalls: [[INC('fire', 15)], [L('igniteChance', 8)], [INC('fire', 15)]],
        notable: { name: 'Kindled Fury', mods: [INC('ignite', 50), L('igniteChance', 10)] },
        tail: [[INC('fire', 15)], [INC('ignite', 25)]],
        keystone: 'ember_heart',
      },
    ],
  },
  {
    id: 'finesse', name: 'Finesse', angle: 30,
    gate: [L('evasion', 30)],
    branches: [
      {
        smalls: [[INC('attackSpeed', 6)], [INC('castSpeed', 6)], [INC('damage', 10)]],
        notable: { name: 'Relentless', mods: [INC('attackSpeed', 10), INC('castSpeed', 10)] },
        tail: [[INC('attackSpeed', 5)], [INC('castSpeed', 5)]],
        keystone: 'reckless_tempo',
      },
      {
        smalls: [[INC('critChance', 25)], [L('critMulti', 12)], [INC('critChance', 25)]],
        notable: { name: 'Killer Instinct', mods: [INC('critChance', 50), L('critMulti', 25)] },
      },
      {
        smalls: [[L('evasion', 30)], [INC('damage', 10)], [L('evasion', 30)]],
        notable: { name: 'Sweeping Reach', mods: [L('targets', 1), INC('evasion', 20)] },
        tail: [[L('evasion', 40)], [INC('damage', 10)]],
        keystone: 'spread_thin',
      },
    ],
  },
  {
    id: 'mind', name: 'Mind', angle: 150,
    gate: [L('mana', 20)],
    branches: [
      {
        smalls: [[INC('spell', 15)], [INC('manaRegen', 20)], [INC('spell', 15)]],
        notable: { name: 'Arcane Focus', mods: [INC('spell', 30), L('mana', 30)] },
        tail: [[INC('spell', 15)], [INC('manaRegen', 25)]],
        keystone: 'blood_price',
      },
      {
        smalls: [[INC('lightning', 15)], [L('shockChance', 8)], [INC('cold', 15)]],
        notable: { name: 'Storm and Frost', mods: [INC('shock', 50), INC('chill', 40), L('shockChance', 8)] },
      },
      {
        smalls: [[L('fireRes', 10)], [L('lightningRes', 10)], [L('coldRes', 10)]],
        notable: { name: 'Elemental Ward', mods: [L('fireRes', 12), L('coldRes', 12), L('lightningRes', 12)] },
        tail: [[L('fireRes', 10)], [L('lightningRes', 10)]],
        keystone: 'bulwark',
      },
    ],
  },
];

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
    const gate = add({ id: `${R.id}_gate`, name: `${R.name} Gate`, type: 'small', region: R.id, mods: R.gate, ...pos(R.angle, 1.2) });
    link('origin', gate);
    R.branches.forEach((B, bi) => {
      const spread = (bi - 1) * 30; // -30, 0, +30 degrees
      let prev = gate;
      let r = 2.1;
      const step = (id, n) => {
        add({ id, region: R.id, ...n, ...pos(R.angle + spread * Math.min(1, (r - 1.2) / 1.8), r) });
        link(prev, id);
        prev = id;
        r += 0.9;
      };
      B.smalls.forEach((mods, i) => step(`${R.id}_${bi}_s${i}`, { name: `${R.name} node`, type: 'small', mods }));
      step(`${R.id}_${bi}_n`, { name: B.notable.name, type: 'notable', mods: B.notable.mods });
      if (B.keystone) {
        B.tail.forEach((mods, i) => step(`${R.id}_${bi}_t${i}`, { name: `${R.name} node`, type: 'small', mods }));
        const K = KEYSTONES[B.keystone];
        step(B.keystone, { name: K.name, type: 'keystone', mods: K.mods, text: K.text });
      }
    });
  }
  return nodes;
}

export const PASSIVES = build();
export const PASSIVE_REGIONS = REGIONS.map((r) => ({ id: r.id, name: r.name, angle: r.angle }));

export const PASSIVE_RULES = {
  // 1 point per level after the first, plus bonus points for first clears.
  // DOC: doc gives +2 for zones 5 and 10. Zone 5 is the prototype's last zone.
  bonusPoints: [{ zone: 5, points: 2 }],
  // Refund cost in Scrap: base + level / perLevels.
  refundBase: 1,
  refundPerLevels: 4,
};
