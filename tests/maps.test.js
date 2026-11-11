import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../src/rng.js';
import { makeMap, mapArea, craftMap, rollMapDrops, mapLevel } from '../src/maps.js';
import { makeMonster } from '../src/combat.js';
import { computeStats, effectiveRes } from '../src/stats.js';
import { registerArea } from '../src/data/zones.js';
import {
  newGame, runTicks, runMap, invalidateStats, passivePoints, serialize, deserialize, startRun, setMapRunner,
} from '../src/game.js';

// A character strong enough to clear early maps quickly.
function strong(seed = 1) {
  const g = newGame(seed);
  g.character.level = 70;
  g.progress.unlocked = 10;
  g.progress.cleared = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  g.character.equipment.weapon.mods = [{ family: 'phys_inc', tier: 8, value: 60000 }];
  g.character.equipment.body.mods = [{ family: 'armour', tier: 8, value: 30000 }, { family: 'life', tier: 8, value: 3000 }];
  g.character.equipment.ring1 = { uid: 900, baseId: 'iron_band', ilvl: 80, rarity: 'rare', name: 'x', mods: [
    { family: 'fire_res', tier: 8, value: 120 }, { family: 'cold_res', tier: 8, value: 120 }, { family: 'lightning_res', tier: 8, value: 120 }, { family: 'chaos_res', tier: 5, value: 90 }] };
  invalidateStats(g);
  return g;
}

test('maps roll mods by rarity; mods change the area', () => {
  const r = createRng(1);
  assert.equal(makeMap(r, 1, 3, 'normal').mods.length, 0);
  const rare = makeMap(r, 2, 3, 'rare');
  assert.ok(rare.mods.length >= 3 && rare.mods.length <= 4);
  const map = { uid: 3, kind: 'map', tier: 5, rarity: 'rare', layout: 'storm_crag', mods: ['hardened', 'exposed', 'teeming', 'champion'] };
  const a = mapArea(map);
  assert.equal(a.level, mapLevel(5));
  assert.equal(a.lifeMult, 1.4);
  assert.equal(a.maxResMinus, 15);
  assert.deepEqual(a.mix, [{ threat: 'swarm', weight: 1 }]);
  assert.equal(a.iiq, 15 + 20 + 20 + 25);
  registerArea(a);
  const boss = makeMonster(r, 1, { zone: a, threatId: 'boss', isBoss: true });
  const plain = makeMonster(r, 2, { zone: { ...a, lifeMult: 1, champion: false }, threatId: 'boss', isBoss: true });
  assert.ok(Math.abs(boss.maxLife / plain.maxLife - 1.4 * 1.5) < 0.01);
});

test('map penalties: -30% resistances, Exposed lowers the cap', () => {
  const ch = { level: 50, skill: { id: 'cleave', supports: [] }, passives: ['origin'], equipment: { ring1: { uid: 1, baseId: 'iron_band', ilvl: 80, rarity: 'magic', mods: [{ family: 'fire_res', tier: 8, value: 200 }] } } };
  const s = computeStats(ch);
  registerArea(mapArea({ uid: 50, kind: 'map', tier: 1, rarity: 'magic', layout: 'storm_crag', mods: ['exposed'] }));
  registerArea(mapArea({ uid: 51, kind: 'map', tier: 1, rarity: 'normal', layout: 'storm_crag', mods: [] }));
  assert.equal(effectiveRes(s, 'fire', 'map:50'), 60);
  assert.equal(effectiveRes(s, 'fire', 'map:51'), 75);
  ch.equipment.ring1.mods[0].value = 50;
  assert.equal(effectiveRes(computeStats(ch), 'fire', 'map:51'), 20);
});

test('map crafting: Kindling, Forge, Crown, Ash', () => {
  const r = createRng(4);
  const m = makeMap(r, 1, 2, 'normal');
  const cur = { kindling: 1, forge: 1, crown: 3, ash: 1, tempest: 0 };
  assert.ok(craftMap(r, 'kindling', m, cur).ok);
  assert.equal(m.rarity, 'magic');
  assert.equal(craftMap(r, 'forge', m, cur).ok, false);
  assert.ok(craftMap(r, 'ash', m, cur).ok);
  assert.ok(craftMap(r, 'forge', m, cur).ok);
  assert.equal(m.rarity, 'rare');
  while (m.mods.length < 4) assert.ok(craftMap(r, 'crown', m, cur).ok);
  assert.equal(craftMap(r, 'crown', m, cur).ok, false);
});

test('dropped maps never exceed one tier past your best clear', () => {
  const r = createRng(9);
  let uid = 1;
  for (let i = 0; i < 200; i++) {
    for (const d of rollMapDrops(r, { tier: 6, mods: [] }, 3, () => uid++)) assert.ok(d.tier <= 4 && d.tier >= 1);
  }
});

test('first zone 10 clear drops a tier 1 map', () => {
  const g = strong(2);
  startRun(g, 10);
  runTicks(g, 10 * 300);
  assert.ok(g.progress.cleared.includes(10));
  assert.ok(g.maps.some((m) => m.tier === 1) || g.mapProgress.cleared.length);
});

test('running a map: consumed, cleared, may drop maps, then back to the zone', () => {
  const g = strong(3);
  g.progress.cleared.push(10);
  g.maps.push(makeMap(createRng(1), 777, 1, 'magic'));
  g.autoAdvance = false;
  startRun(g, 10);
  assert.ok(runMap(g, 777).ok);
  assert.equal(g.zoneId, 10);
  assert.equal(g.run.zoneId, 'map:777');
  assert.equal(g.maps.length, 0);
  // Save and load in the middle of a map.
  runTicks(g, 50);
  const g2 = deserialize(serialize(g));
  runTicks(g2, 10 * 300);
  assert.ok(g2.mapProgress.cleared.includes(1));
  assert.equal(typeof g2.run.zoneId, 'number');
});

test('map tier bonus points and the map runner', () => {
  const g = strong(4);
  const before = passivePoints(g);
  g.mapProgress.cleared.push(4);
  assert.equal(passivePoints(g), before + 2);
  g.progress.cleared.push(10);
  const r = createRng(2);
  g.maps.push(makeMap(r, 801, 1), makeMap(r, 802, 1), makeMap(r, 803, 1));
  g.mapProgress.highest = 4;
  setMapRunner(g, { on: true });
  startRun(g, 10);
  runTicks(g, 10 * 900);
  assert.ok(g.maps.filter((m) => [801, 802, 803].includes(m.uid)).length < 3, 'runner used maps');
});
