// Item bases and modifier families.
// Slots in the prototype: weapon, body, ring.

export const SLOTS = ['weapon', 'body', 'ring'];
export const SLOT_NAMES = { weapon: 'Weapon', body: 'Body Armour', ring: 'Ring' };

// ilvl = lowest item level the base can drop at.
export const BASES = {
  // Weapons: damage range, attacks per second, base crit chance %.
  rusted_blade: { slot: 'weapon', name: 'Rusted Blade', ilvl: 1, damage: [3, 7], aps: 1.3, crit: 5 },
  hatchet: { slot: 'weapon', name: 'Hatchet', ilvl: 1, damage: [4, 9], aps: 1.15, crit: 5 },
  iron_cleaver: { slot: 'weapon', name: 'Iron Cleaver', ilvl: 6, damage: [6, 13], aps: 1.2, crit: 5 },
  bearded_axe: { slot: 'weapon', name: 'Bearded Axe', ilvl: 11, damage: [10, 21], aps: 1.1, crit: 5 },
  duelist_sabre: { slot: 'weapon', name: 'Duelist Sabre', ilvl: 11, damage: [8, 15], aps: 1.45, crit: 6 },
  war_cleaver: { slot: 'weapon', name: 'War Cleaver', ilvl: 16, damage: [15, 30], aps: 1.15, crit: 5 },
  headsman_blade: { slot: 'weapon', name: "Headsman's Blade", ilvl: 21, damage: [20, 40], aps: 1.1, crit: 6 },
  needle_rapier: { slot: 'weapon', name: 'Needle Rapier', ilvl: 21, damage: [14, 26], aps: 1.55, crit: 7 },

  // Body armour: implicit defences.
  leather_vest: { slot: 'body', name: 'Leather Vest', ilvl: 1, implicits: [{ stat: 'evasion', kind: 'flat', value: 20 }] },
  iron_plate: { slot: 'body', name: 'Iron Plate', ilvl: 1, implicits: [{ stat: 'armour', kind: 'flat', value: 20 }] },
  studded_jerkin: { slot: 'body', name: 'Studded Jerkin', ilvl: 9, implicits: [{ stat: 'evasion', kind: 'flat', value: 60 }] },
  scale_mail: { slot: 'body', name: 'Scale Mail', ilvl: 9, implicits: [{ stat: 'armour', kind: 'flat', value: 60 }] },
  hide_coat: { slot: 'body', name: 'Hide Coat', ilvl: 18, implicits: [{ stat: 'evasion', kind: 'flat', value: 120 }] },
  plate_hauberk: { slot: 'body', name: 'Plate Hauberk', ilvl: 18, implicits: [{ stat: 'armour', kind: 'flat', value: 120 }] },

  // Rings
  iron_band: { slot: 'ring', name: 'Iron Band', ilvl: 1, implicits: [{ stat: 'life', kind: 'flat', value: 10 }] },
  ruby_band: { slot: 'ring', name: 'Ruby Band', ilvl: 1, implicits: [{ stat: 'fireRes', kind: 'flat', value: 8 }] },
  steel_band: { slot: 'ring', name: 'Steel Band', ilvl: 1, implicits: [{ stat: 'armour', kind: 'flat', value: 25 }] },
};

// Tier item levels shared by most families: T1..T8.
const T = [1, 10, 20, 30, 40, 55, 70, 80];
function tiers(ranges, levels = T) {
  return ranges.map(([min, max], i) => ({ ilvl: levels[i], min, max }));
}

// Modifier families. Max 3 prefixes + 3 suffixes per item (Magic: 1 + 1).
// {v} is replaced with the rolled value. "double" shows "Adds v to 2v".
export const MODS = {
  life: {
    name: 'Maximum Life', type: 'prefix', slots: ['body', 'ring'],
    stat: 'life', kind: 'flat', text: '+{v} to maximum Life', weight: 100,
    tiers: tiers([[10, 19], [20, 34], [35, 49], [50, 69], [70, 89], [90, 109], [110, 124], [120, 139]]),
  },
  armour: {
    name: 'Armour', type: 'prefix', slots: ['body'],
    stat: 'armour', kind: 'flat', text: '+{v} to Armour', weight: 100,
    tiers: tiers([[10, 20], [25, 45], [50, 75], [80, 120], [130, 180], [190, 240], [250, 300], [300, 400]]),
  },
  evasion: {
    name: 'Evasion', type: 'prefix', slots: ['body'],
    stat: 'evasion', kind: 'flat', text: '+{v} to Evasion', weight: 100,
    tiers: tiers([[10, 20], [25, 45], [50, 75], [80, 120], [130, 180], [190, 240], [250, 300], [300, 400]]),
  },
  ring_armour: {
    name: 'Armour', type: 'prefix', slots: ['ring'],
    stat: 'armour', kind: 'flat', text: '+{v} to Armour', weight: 60,
    tiers: tiers([[5, 10], [12, 22], [25, 38], [40, 60], [65, 90], [95, 120], [125, 150], [150, 200]]),
  },
  mana: {
    name: 'Maximum Mana', type: 'prefix', slots: ['ring'],
    stat: 'mana', kind: 'flat', text: '+{v} to maximum Mana', weight: 80,
    tiers: tiers([[10, 19], [20, 29], [30, 39], [40, 54], [55, 69], [70, 84], [85, 99], [100, 120]]),
  },
  phys_inc: {
    name: 'Increased Physical Damage', type: 'prefix', slots: ['weapon'],
    stat: 'physical', kind: 'increased', text: '{v}% increased Physical Damage', weight: 100,
    tiers: tiers([[15, 24], [25, 39], [40, 59], [60, 79], [80, 99], [100, 119], [120, 149], [150, 169]]),
  },
  added_phys: {
    name: 'Added Physical Damage', type: 'prefix', slots: ['weapon'],
    stat: 'addedPhys', kind: 'flat', text: 'Adds {v} to {v2} Physical Damage', double: true, weight: 100,
    tiers: tiers([[1, 2], [2, 4], [4, 6], [6, 9], [9, 12], [12, 15], [15, 19], [19, 24]]),
  },
  ring_added_phys: {
    name: 'Added Physical Damage', type: 'prefix', slots: ['ring'],
    stat: 'addedPhys', kind: 'flat', text: 'Adds {v} to {v2} Physical Damage to Attacks', double: true, weight: 60,
    tiers: tiers([[1, 1], [1, 2], [2, 3], [3, 5], [5, 7], [7, 9], [9, 11], [11, 14]]),
  },
  fire_res: {
    name: 'Fire Resistance', type: 'suffix', slots: ['body', 'ring'],
    stat: 'fireRes', kind: 'flat', text: '+{v}% to Fire Resistance', weight: 100,
    tiers: tiers([[6, 11], [12, 17], [18, 23], [24, 29], [30, 35], [36, 38], [39, 41], [42, 45]]),
  },
  cold_res: {
    name: 'Cold Resistance', type: 'suffix', slots: ['body', 'ring'],
    stat: 'coldRes', kind: 'flat', text: '+{v}% to Cold Resistance', weight: 100,
    tiers: tiers([[6, 11], [12, 17], [18, 23], [24, 29], [30, 35], [36, 38], [39, 41], [42, 45]]),
  },
  lightning_res: {
    name: 'Lightning Resistance', type: 'suffix', slots: ['body', 'ring'],
    stat: 'lightningRes', kind: 'flat', text: '+{v}% to Lightning Resistance', weight: 100,
    tiers: tiers([[6, 11], [12, 17], [18, 23], [24, 29], [30, 35], [36, 38], [39, 41], [42, 45]]),
  },
  chaos_res: {
    name: 'Chaos Resistance', type: 'suffix', slots: ['body', 'ring'],
    stat: 'chaosRes', kind: 'flat', text: '+{v}% to Chaos Resistance', weight: 50,
    // Starts at tier 4 (item level 40).
    tiers: tiers([[11, 15], [16, 20], [21, 25], [26, 30]], [40, 55, 70, 80]).map((t, i) => ({ ...t, tier: i + 4 })),
  },
  life_regen: {
    name: 'Life Regeneration', type: 'suffix', slots: ['body', 'ring'],
    stat: 'lifeRegen', kind: 'flat', text: 'Regenerate {v} Life per second', weight: 70,
    tiers: tiers([[1, 2], [3, 4], [5, 7], [8, 11], [12, 16], [17, 22], [23, 29], [30, 38]]),
  },
  mana_regen: {
    name: 'Mana Regeneration', type: 'suffix', slots: ['ring'],
    stat: 'manaRegen', kind: 'increased', text: '{v}% increased Mana Regeneration Rate', weight: 70,
    tiers: tiers([[10, 19], [20, 29], [30, 39], [40, 49], [50, 59], [60, 69], [70, 79], [80, 89]]),
  },
  attack_speed: {
    name: 'Attack Speed', type: 'suffix', slots: ['weapon'],
    stat: 'attackSpeed', kind: 'increased', text: '{v}% increased Attack Speed', weight: 80,
    tiers: tiers([[5, 7], [8, 10], [11, 13], [14, 16], [17, 19], [20, 22], [23, 25], [26, 27]]),
  },
  crit_chance: {
    name: 'Critical Strike Chance', type: 'suffix', slots: ['weapon'],
    stat: 'critChance', kind: 'increased', text: '{v}% increased Critical Strike Chance', weight: 80,
    tiers: tiers([[10, 14], [15, 19], [20, 24], [25, 29], [30, 34], [35, 37], [38, 40], [41, 45]]),
  },
  crit_multi: {
    name: 'Critical Strike Multiplier', type: 'suffix', slots: ['weapon'],
    stat: 'critMulti', kind: 'flat', text: '+{v}% to Critical Strike Multiplier', weight: 80,
    tiers: tiers([[8, 12], [13, 16], [17, 19], [20, 24], [25, 28], [29, 31], [32, 34], [35, 38]]),
  },
  targets: {
    name: 'Additional Targets', type: 'suffix', slots: ['weapon'],
    stat: 'targets', kind: 'flat', text: 'Skills hit +{v} additional targets', weight: 40,
    tiers: [{ ilvl: 40, min: 1, max: 1, tier: 4 }, { ilvl: 80, min: 2, max: 2, tier: 8 }],
  },
};

// Number every tier (1-based) unless a family set it explicitly.
for (const fam of Object.values(MODS)) {
  fam.tiers.forEach((t, i) => { if (t.tier == null) t.tier = i + 1; });
}

export const RARE_NAME_PARTS = {
  first: ['Grim', 'Ash', 'Storm', 'Bone', 'Dusk', 'Iron', 'Ember', 'Gloom', 'Rune', 'Thorn', 'Blood', 'Cinder', 'Hollow', 'Wraith'],
  second: {
    weapon: ['Bite', 'Edge', 'Song', 'Hunger', 'Fang', 'Cleaver', 'Mangler'],
    body: ['Shell', 'Ward', 'Hide', 'Carapace', 'Bastion', 'Coat'],
    ring: ['Loop', 'Coil', 'Circle', 'Band', 'Knot', 'Spiral'],
  },
};
