// Item bases and modifier families.
// An item's base has a `slot`, which is its item type (weapon, helmet, ...).
// The character has 8 equipment slots; rings fit either ring slot.

export const ITEM_TYPES = ['weapon', 'helmet', 'body', 'gloves', 'boots', 'amulet', 'ring'];
export const EQUIP_SLOTS = ['weapon', 'helmet', 'body', 'gloves', 'boots', 'amulet', 'ring1', 'ring2'];
export const SLOT_NAMES = {
  weapon: 'Weapon', helmet: 'Helmet', body: 'Body Armour', gloves: 'Gloves', boots: 'Boots',
  amulet: 'Amulet', ring: 'Ring', ring1: 'Ring 1', ring2: 'Ring 2',
};
// Kept for older code paths: the list of item types.
export const SLOTS = ITEM_TYPES;

export function slotsForType(type) {
  return type === 'ring' ? ['ring1', 'ring2'] : [type];
}
export function typeOfSlot(slot) {
  return slot === 'ring1' || slot === 'ring2' ? 'ring' : slot;
}

const I = (stat, value, kind = 'flat') => ({ stat, kind, value });

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
  war_maul: { slot: 'weapon', name: 'War Maul', ilvl: 30, damage: [30, 58], aps: 1.05, crit: 5 },
  royal_sabre: { slot: 'weapon', name: 'Royal Sabre', ilvl: 30, damage: [22, 40], aps: 1.4, crit: 6 },
  ember_greatblade: { slot: 'weapon', name: 'Ember Greatblade', ilvl: 40, damage: [40, 72], aps: 1.1, crit: 6 },
  whisper_rapier: { slot: 'weapon', name: 'Whisper Rapier', ilvl: 40, damage: [30, 52], aps: 1.5, crit: 7 },
  // Wands: weak hits, but boost spells.
  ash_wand: { slot: 'weapon', name: 'Ash Wand', ilvl: 1, damage: [2, 5], aps: 1.4, crit: 7, implicits: [I('spell', 10, 'increased')] },
  bone_wand: { slot: 'weapon', name: 'Bone Wand', ilvl: 15, damage: [4, 9], aps: 1.4, crit: 7, implicits: [I('spell', 18, 'increased')] },
  runed_wand: { slot: 'weapon', name: 'Runed Wand', ilvl: 30, damage: [6, 13], aps: 1.4, crit: 7, implicits: [I('spell', 26, 'increased')] },
  void_sceptre: { slot: 'weapon', name: 'Void Sceptre', ilvl: 42, damage: [9, 18], aps: 1.3, crit: 7, implicits: [I('spell', 34, 'increased')] },

  // Body armour
  leather_vest: { slot: 'body', name: 'Leather Vest', ilvl: 1, implicits: [I('evasion', 20)] },
  iron_plate: { slot: 'body', name: 'Iron Plate', ilvl: 1, implicits: [I('armour', 20)] },
  studded_jerkin: { slot: 'body', name: 'Studded Jerkin', ilvl: 9, implicits: [I('evasion', 60)] },
  scale_mail: { slot: 'body', name: 'Scale Mail', ilvl: 9, implicits: [I('armour', 60)] },
  hide_coat: { slot: 'body', name: 'Hide Coat', ilvl: 18, implicits: [I('evasion', 120)] },
  plate_hauberk: { slot: 'body', name: 'Plate Hauberk', ilvl: 18, implicits: [I('armour', 120)] },
  warden_brigandine: { slot: 'body', name: 'Warden Brigandine', ilvl: 28, implicits: [I('armour', 110), I('evasion', 110)] },
  knight_plate: { slot: 'body', name: 'Knight Plate', ilvl: 34, implicits: [I('armour', 220)] },
  shadow_garb: { slot: 'body', name: 'Shadow Garb', ilvl: 34, implicits: [I('evasion', 220)] },
  silk_robe: { slot: 'body', name: 'Silk Robe', ilvl: 5, implicits: [I('energyShield', 25)] },
  sage_vestment: { slot: 'body', name: 'Sage Vestment', ilvl: 30, implicits: [I('energyShield', 90)] },

  // Helmets
  leather_cap: { slot: 'helmet', name: 'Leather Cap', ilvl: 1, implicits: [I('evasion', 10)] },
  iron_helm: { slot: 'helmet', name: 'Iron Helm', ilvl: 1, implicits: [I('armour', 10)] },
  sage_circlet: { slot: 'helmet', name: 'Sage Circlet', ilvl: 12, implicits: [I('mana', 20)] },
  hunter_hood: { slot: 'helmet', name: 'Hunter Hood', ilvl: 20, implicits: [I('evasion', 50)] },
  visored_helm: { slot: 'helmet', name: 'Visored Helm', ilvl: 20, implicits: [I('armour', 50)] },
  silk_hood: { slot: 'helmet', name: 'Silk Hood', ilvl: 8, implicits: [I('energyShield', 12)] },
  arcane_circlet: { slot: 'helmet', name: 'Arcane Circlet', ilvl: 34, implicits: [I('energyShield', 40)] },
  crowned_helm: { slot: 'helmet', name: 'Crowned Helm', ilvl: 36, implicits: [I('armour', 60), I('evasion', 60)] },

  // Gloves
  wrapped_mitts: { slot: 'gloves', name: 'Wrapped Mitts', ilvl: 1, implicits: [I('evasion', 8)] },
  iron_gauntlets: { slot: 'gloves', name: 'Iron Gauntlets', ilvl: 1, implicits: [I('armour', 8)] },
  spellweave_gloves: { slot: 'gloves', name: 'Spellweave Gloves', ilvl: 14, implicits: [I('castSpeed', 5, 'increased')] },
  studded_gloves: { slot: 'gloves', name: 'Studded Gloves', ilvl: 20, implicits: [I('evasion', 40)] },
  plated_gauntlets: { slot: 'gloves', name: 'Plated Gauntlets', ilvl: 20, implicits: [I('armour', 40)] },
  mystic_wraps: { slot: 'gloves', name: 'Mystic Wraps', ilvl: 10, implicits: [I('energyShield', 10)] },
  duelist_gloves: { slot: 'gloves', name: 'Duelist Gloves', ilvl: 32, implicits: [I('attackSpeed', 6, 'increased')] },

  // Boots
  leather_boots: { slot: 'boots', name: 'Leather Boots', ilvl: 1, implicits: [I('evasion', 8)] },
  iron_greaves: { slot: 'boots', name: 'Iron Greaves', ilvl: 1, implicits: [I('armour', 8)] },
  shadow_boots: { slot: 'boots', name: 'Shadow Boots', ilvl: 20, implicits: [I('evasion', 40)] },
  plated_greaves: { slot: 'boots', name: 'Plated Greaves', ilvl: 20, implicits: [I('armour', 40)] },
  silk_slippers: { slot: 'boots', name: 'Silk Slippers', ilvl: 10, implicits: [I('energyShield', 10)] },
  pilgrim_boots: { slot: 'boots', name: 'Pilgrim Boots', ilvl: 30, implicits: [I('lifeRegen', 4)] },

  // Amulets
  amber_amulet: { slot: 'amulet', name: 'Amber Amulet', ilvl: 1, implicits: [I('life', 12)] },
  coral_amulet: { slot: 'amulet', name: 'Coral Amulet', ilvl: 1, implicits: [I('manaRegen', 20, 'increased')] },
  onyx_amulet: { slot: 'amulet', name: 'Onyx Amulet', ilvl: 15, implicits: [I('fireRes', 6), I('coldRes', 6), I('lightningRes', 6)] },
  gold_amulet: { slot: 'amulet', name: 'Gold Amulet', ilvl: 25, implicits: [I('damage', 10, 'increased')] },

  // Rings
  iron_band: { slot: 'ring', name: 'Iron Band', ilvl: 1, implicits: [I('life', 10)] },
  ruby_band: { slot: 'ring', name: 'Ruby Band', ilvl: 1, implicits: [I('fireRes', 8)] },
  steel_band: { slot: 'ring', name: 'Steel Band', ilvl: 1, implicits: [I('armour', 25)] },
  sapphire_band: { slot: 'ring', name: 'Sapphire Band', ilvl: 1, implicits: [I('coldRes', 8)] },
  topaz_band: { slot: 'ring', name: 'Topaz Band', ilvl: 1, implicits: [I('lightningRes', 8)] },
  amethyst_band: { slot: 'ring', name: 'Amethyst Band', ilvl: 25, implicits: [I('chaosRes', 8)] },
};

// Tier item levels shared by most families: T1..T8.
const T = [1, 10, 20, 30, 40, 55, 70, 80];
function tiers(ranges, levels = T) {
  return ranges.map(([min, max], i) => ({ ilvl: levels[i], min, max }));
}

const ARMOUR_PIECES = ['helmet', 'body', 'gloves', 'boots'];
const NOT_WEAPON = ['helmet', 'body', 'gloves', 'boots', 'amulet', 'ring'];
const RES_TIERS = tiers([[6, 11], [12, 17], [18, 23], [24, 29], [30, 35], [36, 38], [39, 41], [42, 45]]);

// Modifier families. Max 3 prefixes + 3 suffixes per item (Magic: 1 + 1).
// {v} is replaced with the rolled value. "double" shows "Adds v to 2v".
export const MODS = {
  life: {
    name: 'Maximum Life', type: 'prefix', slots: NOT_WEAPON,
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
  // Smaller armour/evasion rolls for helmets, gloves, boots and rings.
  ring_armour: {
    name: 'Armour', type: 'prefix', slots: ['helmet', 'gloves', 'boots', 'ring'],
    stat: 'armour', kind: 'flat', text: '+{v} to Armour', weight: 70,
    tiers: tiers([[5, 10], [12, 22], [25, 38], [40, 60], [65, 90], [95, 120], [125, 150], [150, 200]]),
  },
  piece_evasion: {
    name: 'Evasion', type: 'prefix', slots: ['helmet', 'gloves', 'boots'],
    stat: 'evasion', kind: 'flat', text: '+{v} to Evasion', weight: 70,
    tiers: tiers([[5, 10], [12, 22], [25, 38], [40, 60], [65, 90], [95, 120], [125, 150], [150, 200]]),
  },
  energy_shield: {
    name: 'Energy Shield', type: 'prefix', slots: ['body'],
    stat: 'energyShield', kind: 'flat', text: '+{v} to Energy Shield', weight: 80,
    tiers: tiers([[8, 15], [16, 28], [29, 45], [46, 65], [66, 90], [91, 115], [116, 140], [141, 170]]),
  },
  piece_es: {
    name: 'Energy Shield', type: 'prefix', slots: ['helmet', 'gloves', 'boots', 'amulet'],
    stat: 'energyShield', kind: 'flat', text: '+{v} to Energy Shield', weight: 60,
    tiers: tiers([[4, 8], [9, 15], [16, 24], [25, 35], [36, 48], [49, 62], [63, 76], [77, 92]]),
  },
  es_inc: {
    name: 'Increased Energy Shield', type: 'prefix', slots: ['body', 'helmet'],
    stat: 'energyShield', kind: 'increased', text: '{v}% increased Energy Shield', weight: 60,
    tiers: tiers([[10, 15], [16, 22], [23, 30], [31, 39], [40, 49], [50, 59], [60, 69], [70, 80]]),
  },
  mana: {
    name: 'Maximum Mana', type: 'prefix', slots: ['ring', 'amulet', 'helmet'],
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
    name: 'Added Physical Damage', type: 'prefix', slots: ['ring', 'gloves', 'amulet'],
    stat: 'addedPhys', kind: 'flat', text: 'Adds {v} to {v2} Physical Damage to Attacks', double: true, weight: 60,
    tiers: tiers([[1, 1], [1, 2], [2, 3], [3, 5], [5, 7], [7, 9], [9, 11], [11, 14]]),
  },
  spell_inc: {
    name: 'Increased Spell Damage', type: 'prefix', slots: ['weapon'],
    stat: 'spell', kind: 'increased', text: '{v}% increased Spell Damage', weight: 100,
    tiers: tiers([[12, 19], [20, 31], [32, 47], [48, 63], [64, 79], [80, 95], [96, 119], [120, 135]]),
  },
  ring_ele_inc: {
    name: 'Increased Elemental Damage', type: 'prefix', slots: ['ring', 'amulet'],
    stat: 'elemental', kind: 'increased', text: '{v}% increased Elemental Damage', weight: 60,
    tiers: tiers([[5, 8], [9, 12], [13, 16], [17, 20], [21, 24], [25, 28], [29, 32], [33, 36]]),
  },
  amulet_damage: {
    name: 'Increased Damage', type: 'prefix', slots: ['amulet'],
    stat: 'damage', kind: 'increased', text: '{v}% increased Damage', weight: 60,
    tiers: tiers([[6, 10], [11, 15], [16, 20], [21, 25], [26, 30], [31, 35], [36, 40], [41, 45]]),
  },
  cast_speed: {
    name: 'Cast Speed', type: 'suffix', slots: ['weapon', 'amulet'],
    stat: 'castSpeed', kind: 'increased', text: '{v}% increased Cast Speed', weight: 80,
    tiers: tiers([[5, 7], [8, 10], [11, 13], [14, 16], [17, 19], [20, 22], [23, 25], [26, 28]]),
  },
  fire_res: {
    name: 'Fire Resistance', type: 'suffix', slots: NOT_WEAPON,
    stat: 'fireRes', kind: 'flat', text: '+{v}% to Fire Resistance', weight: 100, tiers: RES_TIERS,
  },
  cold_res: {
    name: 'Cold Resistance', type: 'suffix', slots: NOT_WEAPON,
    stat: 'coldRes', kind: 'flat', text: '+{v}% to Cold Resistance', weight: 100, tiers: RES_TIERS,
  },
  lightning_res: {
    name: 'Lightning Resistance', type: 'suffix', slots: NOT_WEAPON,
    stat: 'lightningRes', kind: 'flat', text: '+{v}% to Lightning Resistance', weight: 100, tiers: RES_TIERS,
  },
  chaos_res: {
    name: 'Chaos Resistance', type: 'suffix', slots: NOT_WEAPON,
    stat: 'chaosRes', kind: 'flat', text: '+{v}% to Chaos Resistance', weight: 60,
    // DOC: doc starts chaos res at item level 40. Blight arrives in zone 7 (level 28),
    // so lower tiers start at 22 to give players an answer there.
    tiers: tiers([[5, 9], [10, 14], [15, 19], [20, 24], [26, 30]], [22, 32, 45, 60, 80]),
  },
  life_regen: {
    name: 'Life Regeneration', type: 'suffix', slots: ['body', 'ring', 'amulet', 'helmet', 'boots'],
    stat: 'lifeRegen', kind: 'flat', text: 'Regenerate {v} Life per second', weight: 70,
    tiers: tiers([[1, 2], [3, 4], [5, 7], [8, 11], [12, 16], [17, 22], [23, 29], [30, 38]]),
  },
  mana_regen: {
    name: 'Mana Regeneration', type: 'suffix', slots: ['ring', 'amulet'],
    stat: 'manaRegen', kind: 'increased', text: '{v}% increased Mana Regeneration Rate', weight: 70,
    tiers: tiers([[10, 19], [20, 29], [30, 39], [40, 49], [50, 59], [60, 69], [70, 79], [80, 89]]),
  },
  attack_speed: {
    name: 'Attack Speed', type: 'suffix', slots: ['weapon', 'gloves'],
    stat: 'attackSpeed', kind: 'increased', text: '{v}% increased Attack Speed', weight: 80,
    tiers: tiers([[5, 7], [8, 10], [11, 13], [14, 16], [17, 19], [20, 22], [23, 25], [26, 27]]),
  },
  crit_chance: {
    name: 'Critical Strike Chance', type: 'suffix', slots: ['weapon', 'gloves'],
    stat: 'critChance', kind: 'increased', text: '{v}% increased Critical Strike Chance', weight: 80,
    tiers: tiers([[10, 14], [15, 19], [20, 24], [25, 29], [30, 34], [35, 37], [38, 40], [41, 45]]),
  },
  crit_multi: {
    name: 'Critical Strike Multiplier', type: 'suffix', slots: ['weapon', 'amulet'],
    stat: 'critMulti', kind: 'flat', text: '+{v}% to Critical Strike Multiplier', weight: 80,
    tiers: tiers([[8, 12], [13, 16], [17, 19], [20, 24], [25, 28], [29, 31], [32, 34], [35, 38]]),
  },
  targets: {
    name: 'Additional Targets', type: 'suffix', slots: ['weapon', 'amulet'],
    stat: 'targets', kind: 'flat', text: 'Skills hit +{v} additional targets', weight: 40,
    tiers: [{ ilvl: 40, min: 1, max: 1, tier: 4 }, { ilvl: 80, min: 2, max: 2, tier: 8 }],
  },
  // Helmet suffixes that feed elemental builds.
  ignite_chance: {
    name: 'Ignite Chance', type: 'suffix', slots: ['helmet'],
    stat: 'igniteChance', kind: 'flat', text: '+{v}% chance to ignite with fire damage', weight: 50,
    tiers: tiers([[4, 6], [7, 9], [10, 12], [13, 15], [16, 18], [19, 21], [22, 24], [25, 28]]),
  },
  shock_chance: {
    name: 'Shock Chance', type: 'suffix', slots: ['helmet'],
    stat: 'shockChance', kind: 'flat', text: '+{v}% chance to shock with lightning damage', weight: 50,
    tiers: tiers([[4, 6], [7, 9], [10, 12], [13, 15], [16, 18], [19, 21], [22, 24], [25, 28]]),
  },
  chill_effect: {
    name: 'Chill Effect', type: 'suffix', slots: ['helmet', 'boots'],
    stat: 'chill', kind: 'increased', text: '{v}% increased Chill effect', weight: 50,
    tiers: tiers([[8, 12], [13, 17], [18, 22], [23, 27], [28, 32], [33, 37], [38, 42], [43, 47]]),
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
    helmet: ['Crown', 'Visage', 'Brow', 'Cowl', 'Dome', 'Halo'],
    body: ['Shell', 'Ward', 'Hide', 'Carapace', 'Bastion', 'Coat'],
    gloves: ['Grip', 'Grasp', 'Fist', 'Hand', 'Talons', 'Claw'],
    boots: ['Stride', 'Tread', 'March', 'Track', 'Step', 'Path'],
    amulet: ['Charm', 'Heart', 'Talisman', 'Locket', 'Pendant', 'Eye'],
    ring: ['Loop', 'Coil', 'Circle', 'Band', 'Knot', 'Spiral'],
  },
};
