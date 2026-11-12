import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newGame, lootAction, setAutomation, runTicks, serialize, migrate } from '../src/game.js';

const item = (rarity, mods = [], baseId = 'iron_band') => ({ uid: 1, baseId, ilvl: 20, rarity, name: null, mods });

test('before unlocks, everything is kept', () => {
  const g = newGame(1);
  assert.equal(lootAction(g, item('normal')), 'keep');
  setAutomation(g, { salvageMagic: true });
  assert.equal(lootAction(g, item('magic', [{ family: 'mana', tier: 1, value: 12 }])), 'keep');
});

test('auto-salvage (zone 3) salvages Normal items when switched on', () => {
  const g = newGame(1);
  g.progress.cleared.push(1, 2, 3);
  assert.equal(lootAction(g, item('normal')), 'salvage');
  setAutomation(g, { salvageNormal: false });
  assert.equal(lootAction(g, item('normal')), 'keep');
});

test('loot filter (zone 8) salvages Magic/Rare items without a kept mod', () => {
  const g = newGame(1);
  g.progress.cleared.push(3, 8);
  setAutomation(g, { salvageMagic: true, salvageRare: false, keepFamilies: ['fire_res'] });
  assert.equal(lootAction(g, item('magic', [{ family: 'mana', tier: 1, value: 12 }])), 'salvage');
  assert.equal(lootAction(g, item('magic', [{ family: 'fire_res', tier: 1, value: 9 }])), 'keep');
  assert.equal(lootAction(g, item('rare', [{ family: 'mana', tier: 1, value: 12 }])), 'keep');
  setAutomation(g, { keepTypes: ['ring'] });
  assert.equal(lootAction(g, item('magic', [{ family: 'mana', tier: 1, value: 12 }])), 'keep');
});

test('auto-salvaged drops become Scrap instead of inventory', () => {
  const g = newGame(2);
  g.progress.cleared.push(3);
  const scrap = g.scrap;
  runTicks(g, 10 * 120);
  assert.ok(g.scrap > scrap);
  assert.ok(g.inventory.every((i) => i.rarity !== 'normal'));
});

test('older saves get default automation settings', () => {
  const data = JSON.parse(serialize(newGame(3)));
  delete data.automation;
  assert.ok(migrate(data).automation.keepFamilies.length);
});

test('salvage all keeps locked items and pays Scrap for the rest', async () => {
  const { salvageAll } = await import('../src/game.js');
  const g = newGame(11);
  g.inventory = [item('normal'), item('magic'), item('rare'), { ...item('rare'), uid: 9, locked: true }];
  const res = salvageAll(g, 'all');
  assert.equal(res.count, 3);
  assert.equal(res.scrap, 1 + 2 + 5);
  assert.equal(g.inventory.length, 1);
  assert.ok(g.inventory[0].locked);
});
