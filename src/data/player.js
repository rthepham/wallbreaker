// Player base values and global rules. All balance numbers live in data files.
// Deviations from the design doc are marked "DOC:" with the reason.

export const PLAYER = {
  life: { base: 50, perLevel: 12 },
  mana: { base: 40, perLevel: 6 },
  // DOC: doc says 2% of max mana per second. At that rate the starting skill
  // runs dry in a few seconds, so mana would be the first wall instead of fire.
  manaRegenPctPerSec: 0.12,
  // DOC: doc has 0 base life regen. With none, damage only ever piles up across
  // a 10-pack zone, so every zone eventually kills you. A small base regen keeps
  // walls about specific threats.
  lifeRegenPctPerSec: 0.015,
  // Extra recovery while walking between packs (not in the doc). Makes each
  // pack a fair test on its own instead of slow attrition across a zone.
  outOfCombatRegenPctPerSec: 0.25,
  baseCritMulti: 1.5,
  maxRes: 75,
  armourCap: 0.9,
  evasionCap: 0.75,
  levelCap: 90,
  xp: { base: 100, growth: 1.15 },
  xpGraceLevels: 5,
  xpPenaltyPerLevel: 0.10,
  deathXpLossPct: 0.10,
  respawnSeconds: 5,
  // Used when no weapon is equipped.
  unarmed: { damage: [2, 5], aps: 1.2, crit: 5 },
};

export const RULES = {
  ticksPerSecond: 10,
  // Seconds of walking between packs. Regen still applies.
  travelSeconds: 1.5,
  // Pause after a run ends before the next one starts.
  runEndSeconds: 2.0,
  inventorySize: 60,
  combatLogSize: 150,
  runHistorySize: 30,
};
