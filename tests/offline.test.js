import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newGame, runTicks, applyOffline, offlineRates, serialize, deserialize } from '../src/game.js';
import { RULES } from '../src/data/player.js';

function played(minutes = 10, seed = 3) {
  const g = newGame(seed);
  g.autoAdvance = false;
  runTicks(g, minutes * 600);
  return g;
}

test('no runs yet: nothing gained, with a reason', () => {
  const g = newGame(1);
  const sum = applyOffline(g, 3600);
  assert.equal(sum.runs, 0);
  assert.ok(sum.reason);
});

test('short absences are ignored', () => {
  assert.equal(applyOffline(played(5), 30), null);
});

test('an hour away grants about half the active rate of runs, XP, items and currency', () => {
  const g = played(12);
  const rates = offlineRates(g);
  const xpBefore = g.character.level * 1e6 + g.character.xp;
  const invBefore = g.inventory.length;
  const sum = applyOffline(g, 3600);
  assert.equal(sum.runs, Math.floor((3600 / rates.seconds) * 0.5));
  assert.ok(sum.runs > 5);
  assert.ok(g.character.level * 1e6 + g.character.xp > xpBefore);
  assert.equal(g.inventory.length, invBefore + sum.kept);
  assert.ok(sum.items > 0);
});

test('offline time is capped at 8 hours', () => {
  const sum = applyOffline(played(8), 20 * 3600);
  assert.equal(sum.seconds, RULES.offline.capHours * 3600);
  assert.ok(sum.capped);
});

test('a full inventory turns extra items into Scrap', () => {
  const g = played(8);
  while (g.inventory.length < RULES.inventorySize) g.inventory.push({ ...g.inventory[0] || g.character.equipment.body, uid: g.nextUid++ });
  const scrap = g.scrap;
  const sum = applyOffline(g, 8 * 3600);
  assert.equal(sum.kept, 0);
  assert.ok(sum.salvaged > 0);
  assert.equal(g.scrap, scrap + sum.scrap);
});

test('the save keeps what offline progress needs', () => {
  const g = played(6);
  g.savedAt = 123;
  const back = deserialize(serialize(g));
  assert.equal(back.savedAt, 123);
  assert.ok(offlineRates(back));
});

test('offline XP respects the over-level penalty', () => {
  const g = played(10);
  g.character.level = 3;
  g.character.xp = 0;
  applyOffline(g, 8 * 3600);
  // Zone 1 is monster level 1: XP reaches zero 15 levels above it (5 free, then -10% per level).
  assert.ok(g.character.level <= 16, `level ${g.character.level}`);
});
