import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeStats } from '../src/stats.js';
import {
  newGame, setSkill, setSupport, supportSlots, getStats, runTicks, startRun, serialize, deserialize, migrate,
} from '../src/game.js';
import { supportFits } from '../src/data/skills.js';

const char = (skill, level = 10, equipment = {}) => ({
  level, skill, equipment: { weapon: null, body: null, ring: null, ...equipment },
});
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

test('Brutality: 40% more damage, 1.4x mana cost', () => {
  const a = computeStats(char({ id: 'cleave', supports: [] }));
  const b = computeStats(char({ id: 'cleave', supports: ['brutality'] }));
  near(b.damage.dps, a.damage.dps * 1.4, 'dps');
  near(b.damage.manaCost, a.damage.manaCost * 1.4, 'mana');
});

test('more multipliers stack multiplicatively', () => {
  const a = computeStats(char({ id: 'fireball', supports: [] }));
  const b = computeStats(char({ id: 'fireball', supports: ['brutality', 'focused_strike'] }));
  near(b.damage.dps, a.damage.dps * 1.4 * 1.6, 'dps');
  near(b.damage.manaCost, Math.round(6 * 1.4 * 1.4 * 10) / 10, 'mana');
});

test('Wide Arc adds 2 targets and 15% less damage; only for Area/Chain skills', () => {
  const a = computeStats(char({ id: 'arc', supports: [] }));
  const b = computeStats(char({ id: 'arc', supports: ['wide_arc'] }));
  assert.equal(b.damage.targets, a.damage.targets + 2);
  near(b.damage.dps, a.damage.dps * 0.85, 'dps');
  assert.equal(supportFits('wide_arc', 'fireball'), false);
  assert.equal(supportFits('wide_arc', 'cleave'), true);
});

test('Focused Strike removes extra targets and splash', () => {
  const s = computeStats(char({ id: 'fireball', supports: ['focused_strike'] }));
  assert.equal(s.damage.targets, 1);
  assert.equal(s.damage.splash, 0);
});

test('Echo: 25% more casts, spells only', () => {
  const a = computeStats(char({ id: 'arc', supports: [] }));
  const b = computeStats(char({ id: 'arc', supports: ['echo'] }));
  near(b.damage.aps, a.damage.aps * 1.25, 'speed');
  assert.equal(supportFits('echo', 'cleave'), false);
});

test('Searing Edge converts half of physical damage to fire, total unchanged', () => {
  const a = computeStats(char({ id: 'cleave', supports: [] }));
  const b = computeStats(char({ id: 'cleave', supports: ['searing_edge'] }));
  near(b.damage.avgHit, a.damage.avgHit, 'avg hit');
  const fire = b.damage.parts.find((p) => p.type === 'fire');
  const phys = b.damage.parts.find((p) => p.type === 'physical');
  near(fire.hitMax, phys.hitMax, 'split');
  assert.equal(supportFits('searing_edge', 'fireball'), false);
});

test('Precision adds base crit and multiplier', () => {
  const b = computeStats(char({ id: 'cleave', supports: ['precision'] }));
  near(b.damage.critChance, 5 + 3, 'crit'); // unarmed 5% + 3
  near(b.damage.critMulti, 1.8, 'multi');
});

test('spells scale with level, attacks with the weapon', () => {
  const lo = computeStats(char({ id: 'fireball', supports: [] }, 1));
  const hi = computeStats(char({ id: 'fireball', supports: [] }, 20));
  near(hi.damage.avgHit / lo.damage.avgHit, 1.065 ** 19, 'growth');
  const c1 = computeStats(char({ id: 'cleave', supports: [] }, 1));
  const c20 = computeStats(char({ id: 'cleave', supports: [] }, 20));
  near(c1.damage.avgHit, c20.damage.avgHit, 'cleave ignores level');
});

test('spell damage mods boost spells, not attacks', () => {
  const weapon = { uid: 1, baseId: 'hatchet', ilvl: 20, rarity: 'magic', mods: [{ family: 'spell_inc', tier: 2, value: 50 }] };
  const f0 = computeStats(char({ id: 'fireball', supports: [] }));
  const f1 = computeStats(char({ id: 'fireball', supports: [] }, 10, { weapon }));
  near(f1.damage.dps, f0.damage.dps * 1.5, 'fireball');
  const c = computeStats(char({ id: 'cleave', supports: [] }, 10, { weapon }));
  assert.equal(c.damage.increased, 0);
});

test('link slots: 1 support at start, more after zone 3 and 5', () => {
  const g = newGame(1);
  assert.equal(supportSlots(g), 1);
  g.progress.cleared.push(3);
  assert.equal(supportSlots(g), 2);
  g.progress.cleared.push(5);
  assert.equal(supportSlots(g), 3);
});

test('setSupport validates ownership, fit and slots; setSkill drops misfits', () => {
  const g = newGame(1);
  assert.ok(setSupport(g, 0, 'brutality').ok);
  assert.equal(setSupport(g, 1, 'brutality').ok, false); // only one slot
  assert.equal(setSupport(g, 0, 'echo').ok, false); // not owned
  g.ownedSupports.push('searing_edge', 'echo');
  assert.ok(setSupport(g, 0, 'searing_edge').ok);
  assert.ok(setSkill(g, 'fireball').ok);
  assert.deepEqual(g.character.skill.supports, []);
  assert.ok(setSupport(g, 0, 'echo').ok);
  assert.ok(getStats(g).damage.aps > 1.25);
});

test('first clear of a zone grants a new support', () => {
  const g = newGame(4);
  const before = g.ownedSupports.length;
  runTicks(g, 10 * 60 * 4);
  assert.ok(g.progress.cleared.includes(1));
  assert.ok(g.ownedSupports.length > before);
});

test('Fireball and Arc characters can clear zone 1', () => {
  for (const id of ['fireball', 'arc']) {
    const g = newGame(5);
    setSkill(g, id);
    startRun(g, 1);
    runTicks(g, 10 * 60 * 4);
    assert.ok(g.progress.cleared.includes(1), id);
  }
});

test('Bloodthirst heals from damage dealt', () => {
  const g = newGame(6);
  setSupport(g, 0, 'brutality');
  g.ownedSupports.push('bloodthirst');
  setSupport(g, 0, 'bloodthirst');
  assert.equal(getStats(g).damage.leech, 2);
});

test('version 1 saves migrate to the current version', () => {
  const g = newGame(7);
  const v1 = JSON.parse(serialize(g));
  v1.version = 1;
  v1.character.skillId = 'cleave';
  delete v1.character.skill;
  delete v1.ownedSupports;
  const m = migrate(v1);
  assert.equal(m.version, 3);
  assert.deepEqual(m.character.passives, ['origin']);
  assert.deepEqual(m.character.skill, { id: 'cleave', supports: [] });
  const loaded = deserialize(JSON.stringify(v1));
  runTicks(loaded, 100);
});
