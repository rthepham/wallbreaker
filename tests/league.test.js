import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  newGame, runTicks, startNewLeague, canStartLeague, buyLegacy, supportSlots, legacyPointsForReset,
  scaleHeirloom, shardCraft, craftUntil, offlineCapHours, smithDiscount, automationUnlocked, startRun,
  invalidateStats, serialize, migrate,
} from '../src/game.js';
import { MODS } from '../src/data/items.js';

function endgame(seed = 1) {
  const g = newGame(seed);
  g.character.level = 60;
  g.progress.cleared = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  g.progress.unlocked = 10;
  g.mapProgress = { cleared: [1, 2, 3, 4, 5, 6, 7, 8], highest: 8 };
  g.league.challenges = ['level_30', 'zone10', 'map_t4'];
  g.currency.kindling = 40;
  g.scrap = 99;
  return g;
}

test('new leagues unlock after a tier 8 map', () => {
  const g = newGame(1);
  assert.match(canStartLeague(g), /tier 8/);
  assert.equal(canStartLeague(endgame()), null);
});

test('reset wipes progress, keeps legacy, automation, one heirloom', () => {
  const g = endgame(2);
  const ring = { uid: 555, baseId: 'iron_band', ilvl: 60, rarity: 'rare', name: 'Old', mods: [{ family: 'fire_res', tier: 6, value: 37 }] };
  g.inventory.push(ring);
  assert.equal(legacyPointsForReset(g), 8 + 3);
  const res = startNewLeague(g, [555]);
  assert.ok(res.ok);
  const n = res.state;
  assert.equal(n.character.level, 1);
  assert.equal(n.progress.unlocked, 1);
  assert.equal(n.mapProgress.highest, 0);
  assert.equal(n.currency.kindling, 0);
  assert.equal(n.scrap, 0);
  assert.equal(n.legacy.points, 11);
  assert.equal(n.legacy.resets, 1);
  assert.equal(n.league.number, 2);
  assert.ok(n.league.mechanic);
  assert.deepEqual(n.league.challenges, []);
  assert.ok(automationUnlocked(n, 'autoSalvage') && automationUnlocked(n, 'lootFilter'));
  const h = n.inventory.find((i) => i.name === 'Old');
  assert.equal(h.ilvl, 1);
  assert.equal(h.mods[0].tier, 1);
  assert.ok(h.mods[0].value >= MODS.fire_res.tiers[0].min && h.mods[0].value <= MODS.fire_res.tiers[0].max);
  assert.equal(startNewLeague(endgame(), [1, 2]).ok, false); // one heirloom only
});

test('legacy upgrades apply', () => {
  const g = newGame(3);
  g.legacy.points = 30;
  const links = supportSlots(g);
  assert.ok(buyLegacy(g, 'head_start').ok);
  assert.equal(supportSlots(g), links + 1);
  assert.equal(buyLegacy(g, 'head_start').ok, false);
  assert.ok(buyLegacy(g, 'long_absence').ok);
  assert.equal(offlineCapHours(g), 10);
  assert.ok(buyLegacy(g, 'smiths_favor').ok);
  assert.equal(smithDiscount(g), 0.15);
  g.legacy.points = 0;
  assert.equal(buyLegacy(g, 'fortune').ok, false);
});

test('challenges complete during play', () => {
  const g = newGame(4);
  g.character.level = 31;
  runTicks(g, 10 * 200);
  assert.ok(g.league.challenges.includes('level_30'));
});

test('heirloom scaling keeps the roll position within the lowest tier', () => {
  const t = MODS.life.tiers;
  const top = scaleHeirloom({ uid: 1, baseId: 'iron_band', ilvl: 80, rarity: 'magic', mods: [{ family: 'life', tier: 8, value: t[7].max }] });
  assert.equal(top.mods[0].value, t[0].max);
});

test('league mechanics: rifts, bounties and shards', () => {
  for (const mech of ['rifts', 'bounties', 'shards']) {
    const g = newGame(5);
    g.league.mechanic = mech;
    g.character.equipment.weapon.mods = [{ family: 'phys_inc', tier: 8, value: 400 }];
    invalidateStats(g);
    startRun(g, 1);
    runTicks(g, 10 * 60 * 15);
    if (mech === 'rifts') assert.ok(g.log.some((l) => l.text.includes('rift')) || g.runHistory.length > 0);
    if (mech === 'bounties') assert.ok(g.log.some((l) => l.text.includes('bounty')));
    if (mech === 'shards') {
      assert.ok(g.league.shards > 0, 'shards drop');
      g.league.shards = 10;
      const r = shardCraft(g, 'ring', 'fire_res');
      assert.ok(r.ok, r.reason);
      assert.equal(r.item.rarity, 'rare');
      assert.ok(r.item.mods.some((m) => m.family === 'fire_res'));
      assert.equal(g.league.shards, 0);
    }
  }
});

test('craft rules: repeat Tempest until fire resistance, within a budget (after a reset)', () => {
  const g = newGame(6);
  g.inventory.push({ uid: 700, baseId: 'iron_band', ilvl: 30, rarity: 'magic', name: null, mods: [{ family: 'mana', tier: 1, value: 12 }] });
  g.currency.tempest = 200;
  assert.equal(craftUntil(g, 700, 'tempest', 'fire_res', 50).ok, false);
  g.legacy.resets = 1;
  const r = craftUntil(g, 700, 'tempest', 'fire_res', 200);
  assert.ok(r.ok && r.found, JSON.stringify(r));
  assert.equal(g.currency.tempest, 200 - r.spent);
});

test('old saves gain legacy and league data', () => {
  const d = JSON.parse(serialize(newGame(7)));
  delete d.legacy;
  delete d.league;
  const m = migrate(d);
  assert.equal(m.legacy.points, 0);
  assert.equal(m.league.number, 1);
});
