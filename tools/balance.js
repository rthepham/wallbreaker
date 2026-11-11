// Headless balance check: a bot plays the game and reports progress.
// Usage: node tools/balance.js [minutes] [seed] [mode]
//   mode: "naive"  = equips upgrades only (expected to hit the fire wall)
//         "smart"  = also crafts/smiths fire resistance when dying to fire

import {
  newGame, runTicks, getStats, equip, salvageAll, statsWithItem, craftItem, smithItem,
  findItem, getZone,
} from '../src/game.js';
import { diagnose } from '../src/diagnosis.js';
import { BASES } from '../src/data/items.js';
import { smithOptions } from '../src/crafting.js';

const minutes = Number(process.argv[2] || 30);
const seed = Number(process.argv[3] || 12345);
const mode = process.argv[4] || 'naive';

function score(s) {
  const ehp = s.life + s.armour * 0.3 + s.evasion * 0.3;
  const fire = 1 + Math.min(s.res.fire, 75) / 50;
  return s.damage.dps * s.damage.targets ** 0.5 * ehp * fire;
}

function upgrade(state) {
  let changed = true;
  while (changed) {
    changed = false;
    const cur = score(getStats(state));
    let best = null;
    for (const it of state.inventory) {
      const sc = score(statsWithItem(state, it));
      if (sc > cur * 1.01 && (!best || sc > best.sc)) best = { it, sc };
    }
    if (best) {
      equip(state, best.it.uid);
      changed = true;
    }
  }
}

function craftFire(state) {
  // Use the Smith to add fire res to the ring or body when possible.
  for (const slot of ['ring', 'body']) {
    const it = state.character.equipment[slot];
    if (!it) continue;
    if (it.mods.some((m) => m.family === 'fire_res')) continue;
    const opt = smithOptions(it).find((o) => o.family === 'fire_res');
    if (opt && state.scrap >= opt.cost) smithItem(state, it.uid, 'fire_res');
  }
  // Roll Kindling/Tempest on the ring for fire res.
  const ring = state.character.equipment.ring;
  if (ring && !ring.mods.some((m) => m.family === 'fire_res')) {
    if (ring.rarity === 'normal' && state.currency.kindling > 0) craftItem(state, 'kindling', ring.uid);
    while (ring.rarity === 'magic' && !ring.mods.some((m) => m.family === 'fire_res') && state.currency.tempest > 0) {
      craftItem(state, 'tempest', ring.uid);
    }
  }
}

const state = newGame(seed);
const totalTicks = minutes * 60 * 10;
let lastRuns = 0;
const firstClear = {};
const report = [];
const allRuns = [];
for (let t = 0; t < totalTicks; t += 10) {
  runTicks(state, 10);
  if (state.lifetime.runs !== lastRuns) {
    lastRuns = state.lifetime.runs;
    const rec = state.runHistory[state.runHistory.length - 1];
    allRuns.push(rec);
    if (rec.outcome === 'cleared' && !firstClear[rec.zoneId]) firstClear[rec.zoneId] = state.time;
    upgrade(state);
    if (mode === 'smart') {
      craftFire(state);
      upgrade(state);
    }
    salvageAll(state, 'normal');
    const s = getStats(state);
    report.push(
      `${(state.time / 60).toFixed(1).padStart(5)}m z${rec.zoneId} ${rec.outcome.padEnd(7)} ${Math.round(rec.end - rec.start)}s` +
        ` L${state.character.level} life ${s.life} dps ${Math.round(s.damage.dps)} arm ${s.armour} eva ${s.evasion} fire ${s.res.fire}%` +
        ` scrap ${state.scrap} cur ${JSON.stringify(state.currency).replace(/"/g, '')}`,
    );
  }
}
if (process.env.VERBOSE) console.log(report.join('\n'));
const tally = {};
for (const r of allRuns) {
  const z = (tally[r.zoneId] ||= { runs: 0, cleared: 0, deaths: {} });
  z.runs++;
  if (r.outcome === 'cleared') z.cleared++;
  for (const d of r.deaths) {
    const k = `${d.threat}/${d.type}`;
    z.deaths[k] = (z.deaths[k] || 0) + 1;
  }
}
console.log('\nPer zone:');
for (const [z, t] of Object.entries(tally)) console.log(`  z${z}: ${t.runs} runs, ${t.cleared} cleared, deaths ${JSON.stringify(t.deaths)}`);
console.log('\nFirst clears (minutes):', Object.fromEntries(Object.entries(firstClear).map(([z, t]) => [z, (t / 60).toFixed(1)])));
const s = getStats(state);
const d = diagnose(state, s);
console.log('Zone now:', state.zoneId, getZone(state.zoneId).name, 'deaths', state.lifetime.deaths);
console.log('Diagnosis:', d.primary ? `${d.primary.state}: ${d.primary.message}` : 'none');
for (const c of d.secondary) console.log('  also:', `${c.state}: ${c.message}`);
console.log('Equipped:', Object.values(state.character.equipment).map((i) => i && `${i.rarity} ${BASES[i.baseId].name} [${i.mods.map((m) => `${m.family}:${m.value}`).join(', ')}]`).join(' | '));
