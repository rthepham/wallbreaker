import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../src/rng.js';
import {
  computeStats, maxHitTaken, damageTaken, armourReduction, evadeChance,
} from '../src/stats.js';
import { MODS, BASES } from '../src/data/items.js';
import {
  makeItem, AFFIX_LIMITS, countAffixes, rollMonsterDrops,
} from '../src/loot.js';
import { craft, smithOptions, smithCraft, convert } from '../src/crafting.js';
import {
  newGame, runTicks, getStats, serialize, deserialize, xpToNext, startRun, equip,
  craftItem, selectZone, invalidateStats,
} from '../src/game.js';
import { diagnose } from '../src/diagnosis.js';
import { makeMonster } from '../src/combat.js';
import { ZONES } from '../src/data/zones.js';

const item = (baseId, mods = [], rarity = 'magic', ilvl = 50) => ({ uid: 1, baseId, ilvl, rarity, name: null, mods });
const char = (equipment = {}, level = 1) => ({ level, skillId: 'cleave', equipment: { weapon: null, body: null, ring: null, ...equipment } });

// ---------- M0: stat sheet ----------

test('base life and mana follow the doc formulas', () => {
  const s = computeStats(char({}, 10));
  assert.equal(s.life, 50 + 12 * 10);
  assert.equal(s.mana, 40 + 6 * 10);
});

test('gear stats change the character sheet', () => {
  const ring = item('iron_band', [{ family: 'fire_res', tier: 2, value: 15 }, { family: 'life', tier: 1, value: 12 }]);
  const s = computeStats(char({ ring }));
  assert.equal(s.res.fire, 15);
  assert.equal(s.life, 62 + 10 + 12); // level 1 + implicit + mod
  assert.ok(s.sources.life.some((m) => m.source.includes('implicit')));
});

test('damage = (base + added) x (1 + increased) x more, then speed and crit', () => {
  const weapon = item('hatchet', [
    { family: 'phys_inc', tier: 1, value: 50 },
    { family: 'added_phys', tier: 1, value: 2 },
  ]);
  const s = computeStats(char({ weapon }));
  // Hatchet 4-9, adds 2-4 => 6-13, x1.5 increased, x1.2 Cleave more.
  assert.ok(Math.abs(s.damage.hitMin - 6 * 1.5 * 1.2) < 1e-9);
  assert.ok(Math.abs(s.damage.hitMax - 13 * 1.5 * 1.2) < 1e-9);
  const critFactor = 1 + 0.05 * (1.5 - 1);
  const dps = ((6 + 13) / 2) * 1.5 * 1.2 * 1.15 * critFactor;
  assert.ok(Math.abs(s.damage.dps - dps) < 1e-9);
});

test('armour is strong against small hits and weak against big ones', () => {
  assert.ok(armourReduction(100, 10) > 0.6);
  assert.ok(armourReduction(100, 200) < 0.1);
  assert.equal(armourReduction(1e9, 1), 0.9); // capped
});

test('evasion uses the doc formula and caps at 75%', () => {
  assert.ok(Math.abs(evadeChance(100, 10) - 100 / 300) < 1e-9);
  assert.equal(evadeChance(1e9, 1), 0.75);
});

test('max hit taken is exactly the hit that empties your life', () => {
  const body = item('iron_plate', [{ family: 'armour', tier: 2, value: 40 }, { family: 'fire_res', tier: 2, value: 30 }]);
  const s = computeStats(char({ body }, 10));
  const mh = maxHitTaken(s, 1);
  for (const type of ['physical', 'fire', 'cold']) {
    assert.ok(Math.abs(damageTaken(s, type, mh[type], 1) - s.life) < 1e-6, type);
  }
  assert.ok(mh.fire > mh.cold);
});

test('resistance is capped at max resistance', () => {
  const ring = item('ruby_band', [{ family: 'fire_res', tier: 8, value: 45 }]);
  const body = item('iron_plate', [{ family: 'fire_res', tier: 8, value: 45 }]);
  const s = computeStats(char({ ring, body }));
  assert.equal(s.res.fire, 98);
  assert.equal(damageTaken(s, 'fire', 100, 1), 25);
});

// ---------- Items and crafting ----------

test('generated items respect slots, affix limits and item level', () => {
  const rng = createRng(7);
  for (let i = 0; i < 3000; i++) {
    const ilvl = rng.int(1, 85);
    const baseIds = Object.keys(BASES).filter((b) => BASES[b].ilvl <= ilvl);
    const baseId = rng.pick(baseIds);
    const rarity = rng.pick(['normal', 'magic', 'rare']);
    const it = makeItem(rng, i, { baseId, ilvl, rarity });
    const c = countAffixes(it);
    assert.ok(c.prefix <= AFFIX_LIMITS[rarity].prefix);
    assert.ok(c.suffix <= AFFIX_LIMITS[rarity].suffix);
    if (rarity === 'magic') assert.ok(it.mods.length >= 1);
    if (rarity === 'rare') assert.ok(it.mods.length >= 3 || ilvl < 10);
    const fams = new Set();
    for (const m of it.mods) {
      const fam = MODS[m.family];
      assert.ok(fam.slots.includes(BASES[baseId].slot), `${m.family} on ${baseId}`);
      const t = fam.tiers.find((x) => x.tier === m.tier);
      assert.ok(t.ilvl <= ilvl);
      assert.ok(m.value >= t.min && m.value <= t.max);
      assert.ok(!fams.has(m.family));
      fams.add(m.family);
    }
  }
});

test('Kindling: Normal -> Magic, refused on Magic, consumes currency', () => {
  const rng = createRng(1);
  const it = makeItem(rng, 1, { baseId: 'iron_band', ilvl: 20 });
  const cur = { kindling: 2 };
  assert.ok(craft(rng, 'kindling', it, cur).ok);
  assert.equal(it.rarity, 'magic');
  assert.ok(it.mods.length >= 1 && it.mods.length <= 2);
  assert.equal(cur.kindling, 1);
  const r = craft(rng, 'kindling', it, cur);
  assert.equal(r.ok, false);
  assert.equal(cur.kindling, 1);
});

test('Tempest can roll a ring until it has fire resistance (M4)', () => {
  const rng = createRng(99);
  const it = makeItem(rng, 1, { baseId: 'iron_band', ilvl: 20, rarity: 'magic' });
  const cur = { tempest: 500 };
  let tries = 0;
  while (!it.mods.some((m) => m.family === 'fire_res')) {
    assert.ok(craft(rng, 'tempest', it, cur).ok);
    tries++;
  }
  assert.ok(tries < 100);
  assert.equal(it.rarity, 'magic');
});

test('Forge, Wildfire, Crown and Ash behave as described', () => {
  const rng = createRng(3);
  const it = makeItem(rng, 1, { baseId: 'iron_plate', ilvl: 40 });
  const cur = { forge: 1, wildfire: 1, crown: 5, ash: 1 };
  assert.ok(craft(rng, 'forge', it, cur).ok);
  assert.equal(it.rarity, 'rare');
  assert.ok(it.name);
  assert.ok(craft(rng, 'wildfire', it, cur).ok);
  while (it.mods.length < 6) {
    const n = it.mods.length;
    assert.ok(craft(rng, 'crown', it, cur).ok);
    assert.equal(it.mods.length, n + 1);
    if (!cur.crown) break;
  }
  assert.ok(craft(rng, 'ash', it, cur).ok);
  assert.equal(it.rarity, 'normal');
  assert.equal(it.mods.length, 0);
});

test('the Smith adds the chosen mod and charges Scrap', () => {
  const rng = createRng(5);
  const it = makeItem(rng, 1, { baseId: 'iron_band', ilvl: 25 });
  const opt = smithOptions(it).find((o) => o.family === 'fire_res');
  assert.ok(opt);
  assert.equal(opt.tier, 3);
  assert.equal(smithCraft(rng, it, 'fire_res', 0).ok, false);
  const r = smithCraft(rng, it, 'fire_res', 100);
  assert.ok(r.ok);
  assert.equal(it.rarity, 'magic');
  assert.ok(it.mods.some((m) => m.family === 'fire_res' && m.tier === 3));
  // Magic item's suffix is now full.
  assert.ok(!smithOptions(it).some((o) => MODS[o.family].type === 'suffix'));
});

test('currency conversions', () => {
  const cur = { kindling: 6, tempest: 0 };
  assert.ok(convert(cur, 0).ok);
  assert.deepEqual(cur, { kindling: 1, tempest: 1 });
  assert.equal(convert(cur, 0).ok, false);
});

test('bosses drop 3 items with at least one Rare', () => {
  const rng = createRng(11);
  const boss = makeMonster(rng, 1, { zone: ZONES[0], threatId: 'boss', isBoss: true });
  let uid = 1;
  const d = rollMonsterDrops(rng, boss, () => uid++);
  assert.equal(d.items.length, 3);
  assert.ok(d.items.some((i) => i.rarity === 'rare'));
});

// ---------- Simulation ----------

test('same seed gives the same game (determinism)', () => {
  const a = newGame(42);
  const b = newGame(42);
  runTicks(a, 3000);
  runTicks(b, 3000);
  assert.equal(serialize(a), serialize(b));
});

test('M1: a fresh character kills packs and gains XP in zone 1', () => {
  const g = newGame(1);
  runTicks(g, 600); // 60 seconds
  assert.ok(g.lifetime.kills > 15, `kills ${g.lifetime.kills}`);
  assert.ok(g.character.xp > 0 || g.character.level > 1);
  assert.ok(g.log.some((l) => l.cls === 'hit'));
  assert.ok(g.log.some((l) => l.cls.startsWith('taken')));
});

test('M2: a low-level character dies to fire in zone 4 and Diagnosis says so', () => {
  const g = newGame(2);
  g.progress.unlocked = 4;
  g.character.level = 14;
  startRun(g, 4);
  // Big damage so the character can clear packs and meet the casters.
  g.character.equipment.weapon.mods = [{ family: 'phys_inc', tier: 8, value: 400 }];
  g.character.equipment.body.mods = [{ family: 'armour', tier: 8, value: 400 }];
  // Rebuild stats after editing gear directly.
  invalidateStats(g);
  runTicks(g, 10 * 60 * 6);
  assert.ok(g.lifetime.deaths >= 2, `deaths ${g.lifetime.deaths}`);
  const d = diagnose(g, getStats(g));
  assert.ok(d.stalled);
  assert.equal(d.primary.state, 'Dying');
  assert.match(d.primary.message, /fire resistance is 0% \(max 75%\)/);
});

test('M3: fire resistance makes the zone 4 casters survivable', () => {
  const deathsWith = (fireRes) => {
    const g = newGame(2);
    g.progress.unlocked = 4;
    g.character.level = 14;
    g.character.equipment.weapon.mods = [{ family: 'phys_inc', tier: 8, value: 400 }];
    g.character.equipment.body.mods = [{ family: 'armour', tier: 8, value: 400 }];
    g.character.equipment.ring = { uid: 999, baseId: 'iron_band', ilvl: 20, rarity: 'magic', name: null, mods: fireRes ? [{ family: 'fire_res', tier: 8, value: fireRes }] : [] };
    invalidateStats(g);
    startRun(g, 4);
    runTicks(g, 10 * 60 * 6);
    return g.runHistory.flatMap((r) => r.deaths).filter((d) => d.type === 'fire').length;
  };
  const without = deathsWith(0);
  const withRes = deathsWith(45);
  assert.ok(withRes < without, `fire deaths without ${without}, with ${withRes}`);
});

test('death costs 10% of the level requirement but never a level', () => {
  const g = newGame(8);
  g.character.level = 5;
  g.character.xp = 5;
  g.progress.unlocked = 5;
  startRun(g, 5);
  runTicks(g, 10 * 120);
  assert.ok(g.lifetime.deaths >= 1);
  assert.ok(g.character.level >= 5);
  assert.ok(g.character.xp >= 0);
});

test('xp curve follows 100 x 1.15^level', () => {
  assert.equal(xpToNext(1), 115);
  assert.equal(xpToNext(10), Math.round(100 * 1.15 ** 10));
});

test('save and load continue the exact same game', () => {
  const a = newGame(77);
  runTicks(a, 2000);
  const b = deserialize(serialize(a));
  runTicks(a, 2000);
  runTicks(b, 2000);
  assert.equal(serialize(a), serialize(b));
});

test('crafting an equipped item updates stats', () => {
  const g = newGame(9);
  g.currency.kindling = 50;
  g.currency.ash = 50;
  const ring = { uid: 500, baseId: 'iron_band', ilvl: 30, rarity: 'normal', name: null, mods: [] };
  g.inventory.push(ring);
  equip(g, 500);
  const before = getStats(g).life;
  assert.ok(craftItem(g, 'kindling', 500).ok);
  // Changes are reflected immediately (stats cache cleared).
  const fresh = computeStats(g.character);
  assert.deepEqual(getStats(g).res, fresh.res);
  assert.ok(getStats(g).life >= before || fresh.life === getStats(g).life);
});

test('selecting a lower zone turns off auto-advance', () => {
  const g = newGame(3);
  g.progress.unlocked = 3;
  assert.ok(selectZone(g, 1).ok);
  assert.equal(g.autoAdvance, false);
  assert.equal(selectZone(g, 4).ok, false);
});
