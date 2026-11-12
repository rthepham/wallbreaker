// Late-game check: builds a well-geared character for each map tier (good rares at the
// best modifier tiers the item level allows) and runs every layout at that tier.
// Usage: node tools/lategame.js [runsPerLayout] [skill]
import {
  newGame, runTicks, runMap, invalidateStats, getStats, statsWithPassives, canAllocate, allocatePassive,
  passivePoints, passivesSpent, startNewLeague, buyLegacy, supportSlots,
} from '../src/game.js';
import { MODS } from '../src/data/items.js';
import { PASSIVES } from '../src/data/passives.js';
import { SUPPORT_ORDER } from '../src/data/skills.js';
import { MAP_LAYOUTS, MAP_RULES } from '../src/data/maps.js';
import { makeMap, mapLevel } from '../src/maps.js';
import { createRng } from '../src/rng.js';
import { tiersAt } from '../src/loot.js';

const PER = Number(process.argv[2] || 3);
const SKILL = process.argv[3] || 'cleave';

// Bases and mod plans per slot. Values roll at 70% of the best tier available.
const PLAN = {
  weapon: ['whisper_rapier', ['phys_inc', 'added_phys'], ['attack_speed', 'crit_chance', 'targets', 'crit_multi']],
  helmet: ['crowned_helm', ['life', 'ring_armour'], ['fire_res', 'cold_res', 'chaos_res']],
  body: ['knight_plate', ['life', 'armour'], ['lightning_res', 'cold_res', 'chaos_res']],
  gloves: ['plated_gauntlets', ['life', 'ring_armour', 'ring_added_phys'], ['attack_speed', 'fire_res', 'lightning_res']],
  boots: ['plated_greaves', ['life', 'ring_armour'], ['fire_res', 'lightning_res', 'chaos_res']],
  amulet: ['gold_amulet', ['life', 'amulet_damage', 'ring_added_phys'], ['crit_multi', 'cold_res', 'chaos_res']],
  ring1: ['steel_band', ['life', 'ring_armour', 'ring_added_phys'], ['fire_res', 'cold_res', 'lightning_res']],
  ring2: ['steel_band', ['life', 'ring_armour', 'ring_added_phys'], ['fire_res', 'cold_res', 'lightning_res']],
};

function gearFor(ilvl) {
  const eq = {};
  let uid = 1;
  for (const [slot, [baseId, pre, suf]] of Object.entries(PLAN)) {
    const mods = [];
    for (const fam of [...pre.slice(0, 3), ...suf]) {
      if (mods.filter((m) => MODS[m.family].type === MODS[fam].type).length >= 3) continue;
      const t = tiersAt(fam, ilvl);
      if (!t.length) continue;
      const best = t[t.length - 1];
      mods.push({ family: fam, tier: best.tier, value: Math.round(best.min + 0.7 * (best.max - best.min)) });
    }
    eq[slot] = { uid: uid++, baseId, ilvl, rarity: 'rare', name: `Crafted ${slot}`, mods };
  }
  return eq;
}

const SUPPORTS = {
  cleave: ['brutality', 'searing_edge', 'iron_will', 'swift_assault'],
  arc: ['brutality', 'overcharge', 'iron_will', 'efficacy'],
};

function score(s) {
  const pool = s.life + s.energyShield + s.armour * 0.4;
  return s.damage.dps * Math.sqrt(s.damage.targets) * pool;
}

function geared(tier, seed) {
  const g = newGame(seed);
  const level = Math.min(90, 52 + 2 * tier);
  g.character.level = level;
  g.character.skill = { id: SKILL, supports: SUPPORTS[SKILL] };
  g.ownedSupports = [...SUPPORT_ORDER];
  g.progress = { unlocked: 10, cleared: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] };
  const cleared = Array.from({ length: tier - 1 }, (_, i) => i + 1);
  g.mapProgress = { cleared, highest: tier - 1 };
  g.character.atlas = [...cleared];
  g.character.equipment = gearFor(mapLevel(tier));
  invalidateStats(g);
  // Spend passive points greedily, looking one node ahead.
  while (passivesSpent(g) < passivePoints(g)) {
    const have = g.character.passives;
    const open = Object.keys(PASSIVES).filter((id) => !canAllocate(g, id));
    if (!open.length) break;
    let best = null;
    for (const a of open) {
      let sc = score(statsWithPassives(g, [...have, a]));
      for (const b of PASSIVES[a].links) if (!have.includes(b) && b !== a) sc = Math.max(sc, score(statsWithPassives(g, [...have, a, b])) * 0.98);
      if (!best || sc > best.sc) best = { a, sc };
    }
    allocatePassive(g, best.a);
  }
  // Supports beyond the character's link count are dropped.
  g.character.skill.supports = g.character.skill.supports.slice(0, supportSlots(g));
  invalidateStats(g);
  return g;
}

function runOne(g, tier, layout, seed) {
  const map = makeMap(createRng(seed), 90000 + seed, tier, 'normal', layout);
  g.maps.push(map);
  runMap(g, map.uid);
  const before = g.runHistory.length;
  for (let t = 0; t < 10 * 2400 && g.runHistory.length === before; t++) runTicks(g, 1);
  return g.runHistory[g.runHistory.length - 1];
}

console.log(`Late-game sweep: ${SKILL}, ${PER} runs per layout per tier\n`);
console.log('tier  lvl  mon  life    dps     arm   cleared  boss(s)  deaths');
let seed = 1;
for (let tier = 1; tier <= (process.env.LEAGUE_ONLY ? 0 : MAP_RULES.maxTier); tier++) {
  let cleared = 0;
  let runs = 0;
  const boss = [];
  const deaths = {};
  let sample = null;
  for (const layout of Object.keys(MAP_LAYOUTS)) {
    for (let i = 0; i < PER; i++) {
      const g = geared(tier, seed++);
      sample ||= getStats(g);
      const rec = runOne(g, tier, layout, seed);
      runs++;
      if (rec && rec.outcome === 'cleared') {
        cleared++;
        boss.push(rec.bossSeconds);
      }
      for (const d of (rec && rec.deaths) || []) {
        const k = `${d.atBoss ? 'boss' : (d.recentDamage[0] || d).threat}/${(d.recentDamage[0] || d).type}`;
        deaths[k] = (deaths[k] || 0) + 1;
      }
    }
  }
  const avgBoss = boss.length ? Math.round(boss.reduce((a, b) => a + b, 0) / boss.length) : '-';
  console.log(`${String(tier).padStart(4)}  ${String(Math.min(90, 52 + 2 * tier)).padStart(3)}  ${String(mapLevel(tier)).padStart(3)}  ${String(sample.life).padStart(5)}  ${String(Math.round(sample.damage.dps)).padStart(6)}  ${String(sample.armour).padStart(5)}  ${String(cleared).padStart(2)}/${runs}    ${String(avgBoss).padStart(5)}    ${JSON.stringify(deaths)}`);
}

// League loop: start a new league from a tier 8 character and play the first 30 minutes.
console.log('\nLeague loop check');
const old = geared(9, 999);
old.league.challenges = ['level_30', 'level_50', 'zone10', 'map_t4'];
const res = startNewLeague(old, [old.character.equipment.weapon.uid]);
console.log(`  new league: ok=${res.ok}, earned ${res.earned} Legacy points, mechanic ${res.state.league.mechanic}`);
const n = res.state;
for (const id of ['head_start', 'quick_study', 'fortune']) buyLegacy(n, id);
console.log(`  bought: ${JSON.stringify(n.legacy.upgrades)}, ${n.legacy.points} points left, support slots ${supportSlots(n)}`);
const heir = n.inventory[0];
const { equip } = await import('../src/game.js');
equip(n, heir.uid);
const fresh = newGame(999);
for (const [label, g] of [['league 1 (fresh)', fresh], ['league 2 (legacy + heirloom)', n]]) {
  runTicks(g, 10 * 60 * 30);
  console.log(`  ${label}: after 30 min level ${g.character.level}, zones cleared ${g.progress.cleared.length}, deaths ${g.runHistory.filter((r) => r.outcome === 'died').length} of last ${g.runHistory.length} runs (lifetime counter ${g.lifetime.deaths})`);
}
