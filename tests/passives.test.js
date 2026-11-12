import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeStats, maxHitTaken } from '../src/stats.js';
import { PASSIVES, KEYSTONES } from '../src/data/passives.js';
import {
  newGame, allocatePassive, refundPassive, passivePoints, canAllocate, getStats, runTicks, startRun,
  invalidateStats,
} from '../src/game.js';

const char = (passives, extra = {}) => ({
  level: 20, skill: { id: 'cleave', supports: [] }, passives: ['origin', ...passives],
  equipment: { weapon: null, body: null, ring: null }, ...extra,
});

// Path from the start to a node, following parent links.
function pathTo(id) {
  const prev = { origin: null };
  const q = ['origin'];
  while (q.length) {
    const c = q.shift();
    for (const n of PASSIVES[c].links) if (!(n in prev)) { prev[n] = c; q.push(n); }
  }
  if (!(id in prev)) throw new Error(`No node ${id}`);
  const out = [];
  for (let c = id; c !== 'origin'; c = prev[c]) out.unshift(c);
  return out;
}

test('tree shape: 149 nodes, 10 keystones, every node reachable, links are two-way', () => {
  const ids = Object.keys(PASSIVES);
  assert.equal(ids.length, 149);
  assert.equal(ids.filter((i) => PASSIVES[i].type === 'keystone').length, 10);
  for (const id of ids) {
    if (id !== 'origin') assert.ok(pathTo(id).length > 0, id);
    for (const n of PASSIVES[id].links) assert.ok(PASSIVES[n].links.includes(id));
  }
});

test('allocating nodes changes stats', () => {
  const a = computeStats(char([]));
  const b = computeStats(char(pathTo('might_2_3')));
  assert.ok(b.life > a.life);
  assert.ok(b.lifeRegen > a.lifeRegen);
});

test('points: one per level after the first; must connect; refund costs Scrap', () => {
  const g = newGame(1);
  assert.equal(passivePoints(g), 0);
  assert.match(canAllocate(g, 'might_gate'), /No passive points/);
  g.character.level = 4;
  assert.equal(passivePoints(g), 3);
  assert.match(canAllocate(g, 'might_0_0'), /connected/);
  assert.ok(allocatePassive(g, 'might_gate').ok);
  assert.ok(allocatePassive(g, 'might_0_0').ok);
  // Can't refund the gate: the next node depends on it.
  assert.equal(refundPassive(g, 'might_gate').ok, false);
  assert.equal(refundPassive(g, 'might_0_0').ok, false); // no Scrap yet
  g.scrap = 10;
  const r = refundPassive(g, 'might_0_0');
  assert.ok(r.ok);
  assert.equal(g.scrap, 10 - r.cost);
  assert.deepEqual(g.character.passives, ['origin', 'might_gate']);
  assert.match(canAllocate(g, 'bridge_might_finesse_0'), /connected/);
});

test('bonus points for first clears of zones 5 and 10', () => {
  const g = newGame(1);
  g.character.level = 10;
  g.progress.cleared.push(5);
  assert.equal(passivePoints(g), 11);
  g.progress.cleared.push(10);
  assert.equal(passivePoints(g), 13);
});

test('new keystones: Colossus, Thunderstruck, Deep Winter', () => {
  const lifeA = computeStats(char(pathTo('colossus').slice(0, -1)));
  const lifeB = computeStats(char(pathTo('colossus')));
  assert.equal(lifeB.life, Math.round(lifeA.life * 1.4));
  const arc = (p) => computeStats({ ...char(p), skill: { id: 'arc', supports: [] } });
  assert.equal(arc(pathTo('thunderstruck')).damage.ailments.shockChance, 100);
  const nova = (p) => computeStats({ ...char(p), skill: { id: 'ice_nova', supports: [] } });
  assert.ok(nova(pathTo('deep_winter')).damage.ailments.chillSlow >= 60);
});

test('bridges connect neighbouring regions', () => {
  const p = pathTo('bridge_might_finesse_2');
  assert.ok(p.includes('might_4_4') || p.includes('finesse_0_4'));
  assert.equal(PASSIVES.bridge_might_finesse_2.type, 'notable');
});

test('Reckless Tempo: 35% more speed, 20% less life', () => {
  const a = computeStats(char(pathTo('reckless_tempo').slice(0, -1)));
  const b = computeStats(char(pathTo('reckless_tempo')));
  assert.ok(Math.abs(b.damage.aps / a.damage.aps - 1.35) < 1e-9);
  assert.equal(b.life, Math.round(a.life * 0.8));
});

test('Spread Thin doubles targets for 35% less damage', () => {
  const a = computeStats(char(pathTo('spread_thin').slice(0, -1)));
  const b = computeStats(char(pathTo('spread_thin')));
  assert.equal(b.damage.targets, a.damage.targets * 2);
  assert.ok(Math.abs(b.damage.dps / a.damage.dps - 0.75) < 1e-9);
});

test('Bulwark of Will: +5% max res, +20% resistances, 15% less life', () => {
  const a = computeStats(char(pathTo('bulwark').slice(0, -1)));
  const b = computeStats(char(pathTo('bulwark')));
  assert.equal(b.maxRes.fire, 80);
  assert.equal(b.res.fire, a.res.fire + 20);
  assert.equal(b.life, Math.round(a.life * 0.85));
});

test('Iron Hide: no evasion, armour helps against fire', () => {
  const path = pathTo('iron_hide');
  const a = computeStats(char(path.slice(0, -1)));
  const b = computeStats(char(path));
  assert.equal(b.evasion, 0);
  assert.ok(maxHitTaken(b, 1).fire > maxHitTaken(a, 1).fire);
});

test('Blood Price: skills cost life, and the character still fights', () => {
  const g = newGame(2);
  g.character.level = 30;
  g.character.passives = ['origin', ...pathTo('blood_price')];
  invalidateStats(g);
  assert.ok(getStats(g).damage.lifeCost);
  startRun(g, 1);
  const mana = g.player.mana;
  runTicks(g, 300);
  assert.ok(g.lifetime.kills > 0);
  assert.equal(g.player.mana, mana);
});

test('Ember Heart: Cleave deals all fire damage and ignores some fire resistance', () => {
  const b = computeStats(char(pathTo('ember_heart')));
  assert.deepEqual(b.damage.parts.map((p) => p.type), ['fire']);
  assert.equal(b.damage.firePenetration, 15);
  assert.ok(b.damage.ailments.igniteChance >= 25);
});

test('Blood Price: 25% more damage', () => {
  const path = pathTo('blood_price');
  const a = computeStats(char(path.slice(0, -1)));
  const b = computeStats(char(path));
  assert.ok(Math.abs(b.damage.dps / a.damage.dps - 1.25) < 1e-9);
});

test('every keystone has a working rule text', () => {
  for (const k of Object.values(KEYSTONES)) assert.ok(k.text.length && k.mods.length);
});

// ---------- Energy shield, Hollow Vessel, start region, Atlas ----------
import { maxHitTaken as mht, damageTaken as dt2 } from '../src/stats.js';

test('energy shield adds to the pool for every type except chaos', () => {
  const body = { uid: 1, baseId: 'sage_vestment', ilvl: 40, rarity: 'magic', mods: [{ family: 'energy_shield', tier: 4, value: 60 }] };
  const s = computeStats(char([], { equipment: { weapon: null, body, ring1: null } }));
  assert.equal(s.energyShield, 150);
  const mh = mht(s, 1);
  assert.ok(mh.fire > s.life + 100);
  assert.ok(Math.abs(mh.chaos - s.life) < 1e-6);
});

test('Hollow Vessel: life 1, energy shield = 2x life, immune to chaos', () => {
  const path = pathTo('hollow_vessel');
  const a = computeStats(char(path.slice(0, -1)));
  const b = computeStats(char(path));
  assert.equal(b.life, 1);
  assert.ok(b.energyShield >= a.life * 2);
  assert.equal(dt2(b, 'chaos', 1000, 1), 0);
});

test('energy shield absorbs hits and recharges in combat', () => {
  const g = newGame(13);
  g.character.equipment.body = { uid: 77, baseId: 'sage_vestment', ilvl: 40, rarity: 'normal', mods: [] };
  invalidateStats(g);
  startRun(g, 2);
  assert.equal(g.player.es, getStats(g).energyShield);
  runTicks(g, 600);
  assert.ok(g.lifetime.kills > 0);
  assert.ok(g.player.es >= 0 && g.player.es <= getStats(g).energyShield);
});

test('start region: the first gate is free, other gates need a bridge', () => {
  const g = newGame(14);
  g.character.level = 20;
  assert.ok(allocatePassive(g, 'might_gate').ok);
  assert.match(canAllocate(g, 'mind_gate'), /start region is Might/);
  // Walk to the Mind branch over the Might-Mind bridge, then the gate opens.
  for (const id of pathTo('mind_4_4').filter((n) => !g.character.passives.includes(n)).slice(0, 30)) allocatePassive(g, id);
  if (g.character.passives.includes('mind_4_0')) assert.equal(canAllocate(g, 'mind_gate'), null);
});

test('Atlas bonuses apply from cleared map tiers', () => {
  const base = computeStats(char([]));
  const withAtlas = computeStats(char([], { atlas: [2, 4] }));
  assert.equal(withAtlas.res.fire, base.res.fire + 5);
  assert.ok(withAtlas.damage.dps > base.damage.dps);
  assert.equal(computeStats(char([], { atlas: [1, 5] })).itemQuantity, 8);
});
