import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeStats, damageFactorVs } from '../src/stats.js';
import { makeMonster } from '../src/combat.js';
import { createRng } from '../src/rng.js';
import { ZONES } from '../src/data/zones.js';
import { newGame, setSkill, startRun, runTicks, invalidateStats } from '../src/game.js';
import { AILMENTS } from '../src/data/ailments.js';

const char = (skill, level = 15) => ({ level, skill, passives: ['origin'], equipment: { weapon: null, body: null, ring: null } });
const zone = (id) => ZONES.find((z) => z.id === id);

test('monsters resist: Brutes physical, casters their own element, bosses per zone', () => {
  const r = createRng(1);
  assert.equal(makeMonster(r, 1, { zone: zone(3), threatId: 'brute' }).res.physical, 30);
  assert.equal(makeMonster(r, 2, { zone: zone(4), threatId: 'caster', element: 'fire' }).res.fire, 40);
  assert.equal(makeMonster(r, 3, { zone: zone(5), threatId: 'caster', element: 'lightning' }).res.lightning, 40);
  assert.equal(makeMonster(r, 4, { zone: zone(4), threatId: 'boss', isBoss: true }).res.fire, 40);
  assert.deepEqual(makeMonster(r, 5, { zone: zone(1), threatId: 'swarm' }).res, {});
});

test('resistance cuts your damage; Pierce gets some back; other elements ignore it', () => {
  const fb = computeStats(char({ id: 'fireball', supports: [] })).damage;
  const fbPierce = computeStats(char({ id: 'fireball', supports: ['pierce'] })).damage;
  const arc = computeStats(char({ id: 'arc', supports: [] })).damage;
  assert.ok(Math.abs(damageFactorVs(fb, { fire: 40 }) - 0.6) < 1e-9);
  assert.ok(Math.abs(damageFactorVs(fbPierce, { fire: 40 }) - 0.85) < 1e-9);
  assert.equal(damageFactorVs(arc, { fire: 40 }), 1);
  const cleave = computeStats(char({ id: 'cleave', supports: [] })).damage;
  assert.ok(Math.abs(damageFactorVs(cleave, { physical: 30 }) - 0.7) < 1e-9);
});

test('Searing Edge lets Cleave get around Brute hide', () => {
  const plain = computeStats(char({ id: 'cleave', supports: [] })).damage;
  const sear = computeStats(char({ id: 'cleave', supports: ['searing_edge'] })).damage;
  assert.ok(damageFactorVs(sear, { physical: 30 }) > damageFactorVs(plain, { physical: 30 }));
});

function play(skillId, zoneId, ticks, level = 20) {
  const g = newGame(11);
  g.character.level = level;
  g.progress.unlocked = zoneId;
  setSkill(g, skillId);
  invalidateStats(g);
  startRun(g, zoneId);
  runTicks(g, ticks);
  return g;
}

test('each element does its own thing in combat', () => {
  const fire = play('fireball', 1, 600);
  assert.ok(fire.log.some((l) => l.text.includes('ignites')), 'fireball ignites');
  const all = [fire.run.record, ...fire.runHistory].reduce((a, r) => a + (r.igniteDamage || 0), 0);
  assert.ok(all > 0, 'burning deals damage');
  assert.ok(play('arc', 1, 600).log.some((l) => l.text.includes('shocks')), 'arc shocks');
  assert.ok(play('ice_nova', 1, 600).log.some((l) => l.text.includes('chills')), 'ice nova chills');
});

test('heavy physical hits stun Brutes', () => {
  const g = newGame(12);
  g.character.level = 12;
  g.progress.unlocked = 3;
  g.character.equipment.weapon.mods = [{ family: 'phys_inc', tier: 8, value: 150 }];
  invalidateStats(g);
  startRun(g, 3);
  runTicks(g, 10 * 120);
  assert.ok(g.log.some((l) => l.text.includes('stuns')));
});

test('chill slows enemy attacks: less damage taken with it than without', () => {
  const taken = () => {
    const g = play('ice_nova', 3, 10 * 180, 10);
    const runs = [g.run.record, ...g.runHistory];
    const dmg = runs.reduce((a, r) => a + Object.values(r.damageByType).reduce((x, y) => x + y, 0), 0);
    const time = runs.reduce((a, r) => a + r.fightTime, 0);
    return dmg / time;
  };
  const withChill = taken();
  const saved = AILMENTS.chill.slow;
  AILMENTS.chill.slow = 0;
  const without = taken();
  AILMENTS.chill.slow = saved;
  assert.ok(withChill < without * 0.9, `with ${withChill} without ${without}`);
});
