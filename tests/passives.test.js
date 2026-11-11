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

test('tree shape: 58 nodes, 6 keystones, every node reachable, links are two-way', () => {
  const ids = Object.keys(PASSIVES);
  assert.equal(ids.length, 58);
  assert.equal(ids.filter((i) => PASSIVES[i].type === 'keystone').length, 6);
  for (const id of ids) {
    if (id !== 'origin') assert.ok(pathTo(id).length > 0, id);
    for (const n of PASSIVES[id].links) assert.ok(PASSIVES[n].links.includes(id));
  }
});

test('allocating nodes changes stats', () => {
  const a = computeStats(char([]));
  const b = computeStats(char(pathTo('might_2_n')));
  assert.ok(b.life > a.life);
  assert.ok(b.lifeRegen > a.lifeRegen);
});

test('points: one per level after the first; must connect; refund costs Scrap', () => {
  const g = newGame(1);
  assert.equal(passivePoints(g), 0);
  assert.match(canAllocate(g, 'might_gate'), /No passive points/);
  g.character.level = 4;
  assert.equal(passivePoints(g), 3);
  assert.match(canAllocate(g, 'might_0_s0'), /connected/);
  assert.ok(allocatePassive(g, 'might_gate').ok);
  assert.ok(allocatePassive(g, 'might_0_s0').ok);
  // Can't refund the gate: the next node depends on it.
  assert.equal(refundPassive(g, 'might_gate').ok, false);
  assert.equal(refundPassive(g, 'might_0_s0').ok, false); // no Scrap yet
  g.scrap = 10;
  const r = refundPassive(g, 'might_0_s0');
  assert.ok(r.ok);
  assert.equal(g.scrap, 10 - r.cost);
  assert.deepEqual(g.character.passives, ['origin', 'might_gate']);
});

test('bonus points for first clear of zone 5', () => {
  const g = newGame(1);
  g.character.level = 10;
  g.progress.cleared.push(5);
  assert.equal(passivePoints(g), 11);
});

test('Reckless Tempo: 35% more speed, 20% less life', () => {
  const a = computeStats(char(pathTo('finesse_0_t1')));
  const b = computeStats(char(pathTo('reckless_tempo')));
  assert.ok(Math.abs(b.damage.aps / a.damage.aps - 1.35) < 1e-9);
  assert.equal(b.life, Math.round(a.life * 0.8));
});

test('Spread Thin doubles targets for 35% less damage', () => {
  const a = computeStats(char(pathTo('finesse_2_t1')));
  const b = computeStats(char(pathTo('spread_thin')));
  assert.equal(b.damage.targets, a.damage.targets * 2);
  assert.ok(Math.abs(b.damage.dps / a.damage.dps - 0.75) < 1e-9);
});

test('Bulwark of Will: +5% max res, +20% resistances, 15% less life', () => {
  const a = computeStats(char(pathTo('mind_2_t1')));
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
