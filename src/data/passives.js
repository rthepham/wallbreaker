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
  last_stand: {
    name: 'Last Stand',
    text: ['50% more damage while below 35% life', 'Life regeneration is disabled during fights'],
    mods: [L('lowLifeMore', 50), L('noRegen', 1)],
  },
  steady_hand: {
    name: 'Steady Hand',
    text: ['You never deal critical strikes', '40% more damage'],
    mods: [L('noCrit', 1), MORE('damage', 40)],
  },
  spread_thin: {
    name: 'Spread Thin',
    text: ['Skills hit double their targets', '35% less damage'],
    mods: [L('targetMultPct', 100), MORE('damage', -35)],
  },
  blood_price: {
    name: 'Blood Price',
    text: ['Skills cost life instead of mana'],
    mods: [L('lifeCost', 1)],
  },
  bulwark: {
    name: 'Bulwark of Will',
    text: ['+5% to all maximum resistances', '20% less maximum life'],
    mods: [L('maxFireRes', 5), L('maxColdRes', 5), L('maxLightningRes', 5), L('maxChaosRes', 5), MORE('life', -20)],
  },
};

// Each branch: 3 small nodes, a notable, then (optionally) 2 small and a keystone.
const REGIONS = [
  {
    id: 'might', name: 'Might', angle: -90,
    gate: [L('life', 10)],
    branches: [
      {
        smalls: [[L('armour', 20)], [L('life', 10)], [L('armour', 20)]],
        notable: { name: 'Ironbound', mods: [INC('armour', 25), L('armour', 30)] },
        tail: [[INC('life', 4)], [L('armour', 25)]],
        keystone: 'iron_hide',
      },
      {
        smalls: [[INC('physical', 8)], [INC('physical', 8)], [INC('attackSpeed', 4)]],
        notable: { name: 'Heavy Blows', mods: [INC('physical', 25), INC('attack', 10)] },
      },
      {
        smalls: [[L('life', 10)], [L('lifeRegen', 1.5)], [L('life', 10)]],
        notable: { name: 'Unbreaking', mods: [INC('life', 8), L('lifeRegen', 2)] },
        tail: [[INC('damage', 6)], [L('life', 12)]],
        keystone: 'last_stand',
      },
    ],
  },
  {
    id: 'finesse', name: 'Finesse', angle: 30,
    gate: [L('evasion', 20)],
    branches: [
      {
        smalls: [[INC('damage', 6)], [INC('attackSpeed', 4)], [INC('damage', 6)]],
        notable: { name: 'Relentless', mods: [INC('attackSpeed', 8), INC('castSpeed', 8), INC('damage', 10)] },
        tail: [[INC('attackSpeed', 3)], [INC('castSpeed', 3)]],
        keystone: 'steady_hand',
      },
      {
        smalls: [[INC('critChance', 12)], [L('critMulti', 8)], [INC('critChance', 12)]],
        notable: { name: 'Killer Instinct', mods: [INC('critChance', 30), L('critMulti', 20)] },
      },
      {
        smalls: [[L('evasion', 20)], [INC('castSpeed', 4)], [L('evasion', 20)]],
        notable: { name: 'Sweeping Reach', mods: [L('targets', 1)] },
        tail: [[INC('evasion', 10)], [L('evasion', 25)]],
        keystone: 'spread_thin',
      },
    ],
  },
  {
    id: 'mind', name: 'Mind', angle: 150,
    gate: [L('mana', 15)],
    branches: [
      {
        smalls: [[INC('spell', 10)], [L('mana', 15)], [INC('spell', 10)]],
        notable: { name: 'Arcane Focus', mods: [INC('spell', 25), L('mana', 20)] },
        tail: [[INC('spell', 8)], [INC('castSpeed', 3)]],
        keystone: 'blood_price',
      },
      {
        smalls: [[INC('manaRegen', 15)], [INC('elemental', 10)], [INC('manaRegen', 15)]],
        notable: { name: 'Wellspring', mods: [INC('manaRegen', 40), L('mana', 20)] },
      },
      {
        smalls: [[L('fireRes', 8)], [L('coldRes', 8)], [L('lightningRes', 8)]],
        notable: { name: 'Elemental Ward', mods: [L('fireRes', 12), L('coldRes', 12), L('lightningRes', 12)] },
        tail: [[INC('elemental', 10)], [L('fireRes', 6)]],
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
