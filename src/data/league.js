// League resets, Legacy upgrades, challenges and rotating mechanics (doc section 9).

export const LEAGUE_RULES = {
  // A new league can start after the first clear of this map tier.
  unlockMapTier: 8,
};

// Legacy upgrades, bought with Legacy points. cost is per rank.
export const LEGACY_UPGRADES = {
  head_start: { name: 'Head Start', text: 'Start each league with +1 support link', max: 1, cost: 5 },
  fortune: { name: 'Fortune', text: '+5% item quantity per rank', max: 5, cost: 3 },
  smiths_favor: { name: "Smith's Favor", text: 'Smith crafts cost 15% less Scrap per rank', max: 3, cost: 3 },
  long_absence: { name: 'Long Absence', text: '+2 hours offline cap per rank', max: 4, cost: 2 },
  second_heirloom: { name: 'Second Heirloom', text: 'Carry 2 items into a new league instead of 1', max: 1, cost: 6 },
  quick_study: { name: 'Quick Study', text: '+20% XP in zones 1–10 per rank', max: 3, cost: 3 },
};

// Challenges are checked at the end of every run. Each gives 1 Legacy point at reset.
export const CHALLENGES = {
  level_30: { name: 'Reach level 30' },
  level_50: { name: 'Reach level 50' },
  zone5_fast: { name: 'Clear zone 5 within 30 minutes of league play' },
  zone10: { name: 'Clear The Last Wall (zone 10)' },
  zone10_no_death: { name: 'Clear zone 10 without dying in that zone this league' },
  map_t4: { name: 'Clear a tier 4 map' },
  map_t8_keystone: { name: 'Clear a tier 8 map with a keystone allocated' },
  map_t12: { name: 'Clear a tier 12 map' },
  withering_clean: { name: 'Clear a Withering map without dying' },
  rare_map: { name: 'Clear a Rare map' },
  all_supports: { name: 'Own every support gem' },
  six_mods: { name: 'Equip an item with 6 mods' },
};

// Each new league picks one at random. The first league has none.
export const MECHANICS = {
  shards: {
    name: 'Shard League',
    text: 'Monsters drop shards. 10 shards craft a Rare item with one mod family of your choice at a high tier.',
    shardChance: 0.02, shardsPerCraft: 10,
  },
  rifts: {
    name: 'Rift League',
    text: 'Each run has a 20% chance to open a rift: an extra wave of monsters with double drops.',
    chance: 0.2, size: 12, dropMult: 2,
  },
  bounties: {
    name: 'Bounty League',
    text: 'Each run has one marked rare monster carrying a guaranteed stack of currency.',
    currency: [3, 6],
  },
  echoes: {
    name: 'Echo League',
    text: 'Clearing a map has a 15% chance to give the map back, so you can run it again for free.',
    chance: 0.15,
  },
};

// Automation earned from league resets.
export const LEAGUE_AUTOMATION = {
  craftRules: { name: 'Craft rules', resets: 1, text: 'Repeat a currency on an item until a chosen mod appears, with a spending limit.' },
  upgradeAdvisor: { name: 'Upgrade advisor', resets: 2, text: 'Marks dropped items that would make your character stronger.' },
};
