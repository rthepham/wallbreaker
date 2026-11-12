// Game state and the simulation loop. No UI code here.
// The UI calls tick() 10 times per simulated second and reads state.

import { PLAYER, RULES } from './data/player.js';
import { MONSTERS, THREATS } from './data/monsters.js';
import { ZONES, areaById, registerArea } from './data/zones.js';
import { MAP_RULES } from './data/maps.js';
import { makeMap, mapArea, rollMapDrops, craftMap, rollRareMonsterMap } from './maps.js';
import { BASES, EQUIP_SLOTS, slotsForType, MODS } from './data/items.js';
import { CURRENCY_ORDER } from './data/currency.js';
import { SKILLS, SUPPORTS, SUPPORT_ORDER, LINKS, supportFits } from './data/skills.js';
import { PASSIVES, PASSIVE_RULES } from './data/passives.js';
import { AILMENTS } from './data/ailments.js';
import { AUTOMATION, DEFAULT_AUTOMATION } from './data/automation.js';
import { LEAGUE_RULES, LEGACY_UPGRADES, CHALLENGES, MECHANICS, LEAGUE_AUTOMATION } from './data/league.js';
import { tiersAt, addRandomMod, setRarity, pickBase as pickBaseOf } from './loot.js';
import { createRng } from './rng.js';
import {
  computeStats, armourReduction, evadeChance, effectiveRes, itemLabel, damageTaken, monsterRes,
} from './stats.js';
import { makePack, makeBossPack, makeMonster } from './combat.js';
import { makeItem, rollMonsterDrops, pickBase, rollRarity, rollCurrencyType } from './loot.js';
import { craft, salvageValue, smithCraft, convert } from './crafting.js';

export const SAVE_VERSION = 4;
const DT = 1 / RULES.ticksPerSecond;
// Window used to describe what killed the player.
export const RECENT_SECONDS = 8;

// Runtime-only data (rng object, cached stats) kept outside the saved state.
const runtimes = new WeakMap();
function rt(state) {
  let r = runtimes.get(state);
  if (!r) {
    const rng = createRng(state.seed);
    rng.setState(state.rngState);
    r = { rng, stats: null };
    runtimes.set(state, r);
  }
  return r;
}
function rng(state) {
  return rt(state).rng;
}

export function getZone(id) {
  return areaById(id);
}

export function xpToNext(level) {
  return Math.round(PLAYER.xp.base * PLAYER.xp.growth ** level);
}

export function getStats(state) {
  const r = rt(state);
  if (!r.stats) r.stats = computeStats(state.character);
  return r.stats;
}

export function invalidateStats(state) {
  rt(state).stats = null;
  const s = getStats(state);
  // Keep current life/mana within the new maximum.
  state.player.life = Math.min(state.player.life, s.life);
  state.player.mana = Math.min(state.player.mana, s.mana);
  state.player.es = Math.min(state.player.es ?? s.energyShield, s.energyShield);
}

// Energy shield takes damage before life, except chaos damage.
const ES_RECHARGE_DELAY = 2; // seconds without taking damage
const ES_RECHARGE_RATE = 0.2; // share of max per second
function applyDamage(state, amount, type) {
  const p = state.player;
  p.lastDamageAt = state.time;
  if (type !== 'chaos' && p.es > 0) {
    const absorbed = Math.min(p.es, amount);
    p.es -= absorbed;
    amount -= absorbed;
  }
  p.life -= amount;
}

function newUid(state) {
  return () => state.nextUid++;
}
function newMonsterId(state) {
  return () => state.nextMonsterId++;
}

export function log(state, cls, text) {
  state.log.push({ t: state.time, cls, text });
  if (state.log.length > RULES.combatLogSize) state.log.splice(0, state.log.length - RULES.combatLogSize);
}

export function newGame(seed = (Date.now() ^ 0x5eed) >>> 0) {
  const state = {
    version: SAVE_VERSION,
    seed,
    rngState: seed,
    time: 0,
    character: { level: 1, xp: 0, skill: { id: 'cleave', supports: [] }, passives: ['origin'], atlas: [], equipment: Object.fromEntries(EQUIP_SLOTS.map((k) => [k, null])) },
    ownedSupports: [...LINKS.startingSupports],
    player: { life: 1, mana: 1, attackTimer: 0 },
    inventory: [],
    currency: Object.fromEntries(CURRENCY_ORDER.map((c) => [c, 0])),
    scrap: 0,
    progress: { unlocked: 1, cleared: [] },
    zoneId: 1,
    autoAdvance: true,
    run: null,
    runHistory: [],
    log: [],
    nextUid: 1,
    nextMonsterId: 1,
    lifetime: { kills: 0, deaths: 0, runs: 0 },
    automation: { ...DEFAULT_AUTOMATION, keepFamilies: [...DEFAULT_AUTOMATION.keepFamilies] },
    maps: [],
    mapProgress: { cleared: [], highest: 0 },
    mapRunner: { on: false, order: 'highest' },
    legacy: newLegacy(),
    league: { number: 1, mechanic: null, challenges: [], shards: 0, start: 0, zone10Deaths: 0 },
  };
  const r = rng(state);
  // Starting gear: a plain weapon and armour, no ring.
  state.character.equipment.weapon = makeItem(r, state.nextUid++, { baseId: 'rusted_blade', ilvl: 1 });
  state.character.equipment.body = makeItem(r, state.nextUid++, { baseId: 'leather_vest', ilvl: 1 });
  const s = getStats(state);
  state.player.life = s.life;
  state.player.mana = s.mana;
  state.player.es = s.energyShield;
  startRun(state, 1);
  log(state, 'info', 'Your character sets out for The Sunken Yard.');
  return state;
}

function newRecord(state, zoneId) {
  return {
    zoneId,
    start: state.time,
    end: null,
    outcome: 'running',
    packs: [],
    bossStart: null,
    bossSeconds: null,
    bossMaxLife: null,
    deaths: [],
    worstHits: {},
    fightTime: 0,
    starvedTime: 0,
    damageByType: {},
    xp: 0,
    items: 0,
    currency: 0,
  };
}

export function startRun(state, zoneId) {
  const s = getStats(state);
  // state.zoneId is the zone you farm; a map run doesn't change it.
  if (typeof zoneId === 'number') state.zoneId = zoneId;
  state.player.life = s.life;
  state.player.mana = s.mana;
  state.player.es = s.energyShield;
  state.player.attackTimer = 0;
  state.player.blight = [];
  state.run = {
    zoneId,
    phase: 'travel',
    timer: RULES.travelSeconds,
    packIndex: 0,
    pack: null,
    packStart: 0,
    pendingLoot: { items: [], currency: {} },
    recentHits: [],
    lastHit: null,
    record: newRecord(state, zoneId),
  };
  // League mechanics that roll per run.
  const area = getZone(zoneId);
  const mech = state.league && state.league.mechanic;
  const r = rng(state);
  if (mech === 'rifts' && r.chance(MECHANICS.rifts.chance)) state.run.rift = r.int(2, area.packs - 2);
  if (mech === 'bounties') state.run.bounty = r.int(0, area.packs - 1);
}

function regen(state, dt, outOfCombat = false) {
  const s = getStats(state);
  const p = state.player;
  const extra = outOfCombat ? s.life * PLAYER.outOfCombatRegenPctPerSec : 0;
  p.life = Math.min(s.life, p.life + (s.lifeRegen + extra) * dt);
  if (s.energyShield > 0) {
    const idle = outOfCombat || state.time - (p.lastDamageAt ?? -99) >= ES_RECHARGE_DELAY;
    if (idle) p.es = Math.min(s.energyShield, (p.es ?? 0) + s.energyShield * ES_RECHARGE_RATE * (outOfCombat ? 2 : 1) * dt);
  } else p.es = 0;
  p.mana = Math.min(s.mana, p.mana + s.manaRegen * dt);
}

// One simulation step (0.1 seconds).
export function tick(state) {
  const run = state.run;
  state.time += DT;
  switch (run.phase) {
    case 'travel':
      regen(state, DT, true);
      run.timer -= DT;
      if (run.timer <= 0) spawnNext(state);
      break;
    case 'fight':
      fightTick(state);
      break;
    case 'dead':
      run.timer -= DT;
      if (run.timer <= 0) startNext(state, false);
      break;
    case 'done':
      regen(state, DT, true);
      run.timer -= DT;
      if (run.timer <= 0) startNext(state, true);
      break;
    default:
      break;
  }
  state.rngState = rng(state).getState();
}

export function runTicks(state, n) {
  for (let i = 0; i < n; i++) tick(state);
}

function nextZoneChoice(state) {
  return state.autoAdvance ? state.progress.unlocked : state.zoneId;
}

// After a run ends: the map runner may start a map; otherwise farm the zone.
// A death in a zone retries the same zone; a map is used up either way.
function startNext(state, cleared) {
  if (state.mapRunner.on && automationUnlocked(state, 'mapRunner')) {
    const next = pickRunnerMap(state);
    if (next) return runMap(state, next.uid);
  }
  startRun(state, cleared ? nextZoneChoice(state) : state.zoneId);
}

function spawnNext(state) {
  const run = state.run;
  const zone = getZone(run.zoneId);
  const r = rng(state);
  if (run.rift === run.packIndex && !run.riftDone) {
    // Rift League: an extra wave with double drops. Doesn't count as a pack.
    const R = MECHANICS.rifts;
    const pack = { threat: 'rift', rift: true, monsters: [] };
    for (let i = 0; i < R.size; i++) {
      const entry = r.weighted(zone.mix);
      const m = makeMonster(r, newMonsterId(state), { zone, threatId: entry.threat, element: entry.element });
      m.dropMult *= R.dropMult;
      m.name = `Rift ${m.name}`;
      pack.monsters.push(m);
    }
    run.pack = pack;
    run.riftDone = true;
    log(state, 'boss', 'A rift tears open! Its monsters drop double loot.');
  } else if (run.packIndex < zone.packs) {
    run.pack = makePack(r, zone, newMonsterId(state));
    if (run.bounty === run.packIndex) {
      const m = run.pack.monsters[0];
      if (m.rarity !== 'rare') {
        m.maxLife *= 4;
        m.life = m.maxLife;
        m.rarity = 'rare';
      }
      m.bounty = true;
      m.name = `Marked ${m.name}`;
      log(state, 'boss', `${m.name} carries a bounty.`);
    }
  } else {
    run.pack = makeBossPack(r, zone, newMonsterId(state));
    run.record.bossStart = state.time;
    run.record.bossMaxLife = run.pack.monsters[0].maxLife;
    log(state, 'boss', `${run.pack.monsters[0].name} appears (${run.pack.monsters[0].maxLife.toLocaleString()} life).`);
  }
  run.packStart = state.time;
  run.phase = 'fight';
}

function fightTick(state) {
  const run = state.run;
  const p = state.player;
  const s = getStats(state);
  const rec = run.record;
  rec.fightTime += DT;

  // 1. Player skill fires if ready and affordable.
  p.attackTimer -= DT;
  if (p.attackTimer <= 0) {
    const d = s.damage;
    const canPay = d.lifeCost ? p.life > d.manaCost + 1 : p.mana >= d.manaCost;
    if (canPay) {
      if (d.lifeCost) p.life -= d.manaCost;
      else p.mana -= d.manaCost;
      playerAttack(state, s);
      p.attackTimer += 1 / s.damage.aps;
    } else {
      rec.starvedTime += DT;
      p.attackTimer = 0;
    }
  }
  if (run.pack.monsters.every((m) => m.life <= 0)) {
    packCleared(state);
    return;
  }

  // 2. Ailments tick, then monsters attack on their own timers.
  for (const m of run.pack.monsters) {
    if (m.life <= 0) continue;
    tickAilments(state, m);
    if (m.life <= 0) continue;
    // Stunned monsters don't act. Chilled ones act slower.
    if (m.status.stun) continue;
    const pace = m.status.chill ? 1 - m.status.chill.slow / 100 : 1;
    m.attackTimer -= DT * pace;
    if (m.attackTimer <= 0) {
      if (m.threat === 'blight') applyBlight(state, m);
      else {
        monsterHit(state, s, m, 1);
        if (getZone(run.zoneId).withering) applyBlight(state, m, 0.25);
      }
      m.attackTimer += m.interval;
      if (p.life <= 0) return playerDied(state, m);
    }
    if (m.bigHit) {
      const b = m.bigHit;
      b.timer -= DT * pace;
      if (!b.warned && b.timer <= b.windup) {
        b.warned = true;
        log(state, 'boss', `${m.name} winds up a heavy blow…`);
      }
      if (b.timer <= 0) {
        monsterHit(state, s, m, b.mult, true);
        b.timer += b.interval;
        b.warned = false;
        if (p.life <= 0) return playerDied(state, m);
      }
    }
  }

  if (run.pack.monsters.every((m) => m.life <= 0)) {
    packCleared(state);
    return;
  }

  // 3. Damage over time, then regen.
  if (tickBlight(state, s)) return;
  regen(state, DT);
}

function applyBlight(state, m, scale = 1) {
  const p = state.player;
  const B = THREATS.blight.stacks;
  p.blight ||= [];
  if (p.blight.length >= B.max) p.blight.shift();
  p.blight.push({ dps: m.hit * scale, time: B.duration });
  state.run.blightSource = m;
}

// Returns true if the blight killed the player.
function tickBlight(state, s) {
  const p = state.player;
  if (!p.blight || !p.blight.length) return false;
  const raw = p.blight.reduce((a, b) => a + b.dps, 0) * DT;
  const taken = damageTaken(s, 'chaos', raw, state.run.zoneId);
  applyDamage(state, taken, 'chaos');
  const rec = state.run.record;
  rec.damageByType.chaos = (rec.damageByType.chaos || 0) + taken;
  const recent = (state.run.recentHits ||= []);
  recent.push({ t: state.time, threat: 'blight', type: 'chaos', taken, raw, isBig: false, dot: true });
  while (recent.length && recent[0].t < state.time - RECENT_SECONDS) recent.shift();
  for (const b of p.blight) b.time -= DT;
  p.blight = p.blight.filter((b) => b.time > 0);
  if (p.life <= 0) {
    state.run.lastHit = { raw, taken, type: 'chaos', isBig: false };
    playerDied(state, state.run.blightSource || { name: 'Blight', damageType: 'chaos', threat: 'blight' });
    return true;
  }
  return false;
}

function tickAilments(state, m) {
  const st = m.status;
  if (st.ignite) {
    const dmg = st.ignite.dps * DT;
    m.life -= dmg;
    state.run.record.igniteDamage = (state.run.record.igniteDamage || 0) + dmg;
    if (m.life <= 0) monsterKilled(state, m);
  }
  for (const k of Object.keys(st)) {
    st[k].time -= DT;
    if (st[k].time <= 0) delete st[k];
  }
}

function playerAttack(state, s) {
  const r = rng(state);
  const d = s.damage;
  const A = d.ailments;
  const alive = state.run.pack.monsters.filter((m) => m.life > 0);
  const main = alive.slice(0, d.targets);
  const splashed = alive.slice(d.targets, d.targets + d.splash);
  const lowLife = d.lowLifeMore > 0 && state.player.life < s.life * 0.35 ? 1 + d.lowLifeMore / 100 : 1;
  const shown = [];
  const applied = new Set();
  let dealt = 0;
  const strike = (m, mult) => {
    const roll = r.next();
    const crit = r.chance(d.critChance / 100);
    const shock = m.status.shock ? 1 + m.status.shock.effect / 100 : 1;
    const execute = d.executeMore && m.life < m.maxLife * 0.35 ? 1 + d.executeMore / 100 : 1;
    const base = mult * lowLife * (crit ? d.critMulti : 1) * shock * execute;
    // Each damage type is reduced by the monster's resistance to it.
    const byType = {};
    let total = 0;
    for (const p of d.parts) {
      const amt = (p.hitMin + roll * (p.hitMax - p.hitMin)) * base * (1 - monsterRes(d, m.res, p.type) / 100);
      byType[p.type] = (byType[p.type] || 0) + amt;
      total += amt;
    }
    total = Math.max(1, Math.round(total));
    dealt += Math.min(total, Math.max(0, m.life));
    m.life -= total;
    shown.push(crit ? `${total}!` : `${total}`);
    if (m.life <= 0) {
      monsterKilled(state, m);
      return;
    }
    // Ailments.
    if (byType.fire && r.chance(A.igniteChance / 100)) {
      const dps = byType.fire * A.igniteDpsPct;
      if (!m.status.ignite || m.status.ignite.dps < dps) m.status.ignite = { dps, time: AILMENTS.ignite.duration };
      applied.add('ignites');
    }
    if (byType.lightning && r.chance(A.shockChance / 100)) {
      m.status.shock = { effect: A.shockEffect, time: AILMENTS.shock.duration };
      applied.add('shocks');
    }
    if (byType.cold && r.chance(A.chillChance / 100)) {
      m.status.chill = { slow: A.chillSlow, time: AILMENTS.chill.duration };
      applied.add('chills');
    }
    if (byType.physical && A.stunThreshold > 0) {
      const need = A.stunThreshold * (m.isBoss ? AILMENTS.stun.bossMult : 1) * m.maxLife;
      if (byType.physical >= need) {
        m.status.stun = { time: AILMENTS.stun.duration };
        applied.add('stuns');
      }
    }
  };
  for (const m of main) strike(m, 1);
  for (const m of splashed) strike(m, d.splashMult);
  if (d.leech > 0) {
    state.player.life = Math.min(s.life, state.player.life + dealt * (d.leech / 100));
  }
  const n = main.length + splashed.length;
  const extra = applied.size ? ` · ${[...applied].join(', ')}` : '';
  log(state, 'hit', `${s.skill.name} hits ${n} for ${shown.join(', ')}${extra}`);
}

function monsterHit(state, s, m, mult, isBig = false) {
  const r = rng(state);
  const p = state.player;
  const rec = state.run.record;
  const raw = m.hit * mult * r.range(1 - MONSTERS.hitVariance, 1 + MONSTERS.hitVariance);
  const type = m.damageType;
  let taken;
  if (type === 'physical') {
    if (r.chance(evadeChance(s.evasion, m.level))) {
      log(state, 'evade', `Evaded ${m.name}'s attack.`);
      return;
    }
    taken = damageTaken(s, 'physical', raw, state.run.zoneId);
  } else {
    taken = damageTaken(s, type, raw, state.run.zoneId);
  }
  // Fiery maps: monsters deal extra fire damage with each hit.
  const extra = getZone(state.run.zoneId).extraFire;
  if (extra) taken += damageTaken(s, 'fire', raw * extra, state.run.zoneId);
  taken = Math.max(0, taken);
  applyDamage(state, taken, type);
  state.run.lastHit = { raw, taken, type, isBig };
  // Damage taken in the last few seconds, used to explain deaths.
  const recent = (state.run.recentHits ||= []);
  recent.push({ t: state.time, threat: m.isBoss ? 'boss' : m.threat, type, taken, raw, isBig });
  while (recent.length && recent[0].t < state.time - RECENT_SECONDS) recent.shift();
  rec.damageByType[type] = (rec.damageByType[type] || 0) + taken;

  const key = `${m.isBoss ? 'boss' : m.threat}:${type}${isBig ? ':big' : ''}`;
  const pct = taken / (s.life + (type === 'chaos' ? 0 : s.energyShield));
  const prev = rec.worstHits[key];
  if (!prev || pct > prev.pct) {
    rec.worstHits[key] = {
      threat: m.isBoss ? 'boss' : m.threat, type, isBig, raw, taken, pct, source: m.name,
      maxLife: s.life, res: type === 'physical' ? null : effectiveRes(s, type, state.run.zoneId),
      armourPct: type === 'physical' ? armourReduction(s.armour, raw) : null,
    };
  }
  const verb = isBig ? 'SLAMS you' : 'hits you';
  log(state, `taken ${type}`, `${m.name} ${verb} for ${Math.round(taken)} ${type} (${Math.round(raw)} before mitigation).`);
}

function monsterKilled(state, m) {
  state.lifetime.kills++;
  const ks = getStats(state);
  if (ks.damage.lifeOnKillPct) state.player.life = Math.min(ks.life, state.player.life + ks.life * ks.damage.lifeOnKillPct / 100);
  const rec = state.run.record;
  // XP with over-level penalty.
  const L = state.character.level;
  let xp = MONSTERS.xpBase * MONSTERS.xpGrowth ** m.level * m.xpMult;
  const over = L - m.level - PLAYER.xpGraceLevels;
  if (over > 0) xp *= Math.max(0, 1 - over * PLAYER.xpPenaltyPerLevel);
  if (typeof state.run.zoneId === 'number') xp *= 1 + 0.2 * legacyRank(state, 'quick_study');
  gainXp(state, xp);
  rec.xp += xp;
  // Drops wait in the pack's loot pile until the pack is cleared.
  const fortune = 1 + 0.05 * legacyRank(state, 'fortune') + getStats(state).itemQuantity / 100;
  const drops = rollMonsterDrops(rng(state), { ...m, dropMult: m.dropMult * fortune }, newUid(state));
  const pl = state.run.pendingLoot;
  const mech = state.league.mechanic;
  if (mech === 'shards' && !m.isBoss && rng(state).chance(MECHANICS.shards.shardChance * fortune)) state.league.shards++;
  if (m.bounty) {
    const [lo, hi] = MECHANICS.bounties.currency;
    const n = rng(state).int(lo, hi);
    for (let i = 0; i < n; i++) {
      const c = rollCurrencyType(rng(state));
      pl.currency[c] = (pl.currency[c] || 0) + 1;
    }
    log(state, 'loot currency', `The bounty pays out ${n} currency.`);
  }
  pl.items.push(...drops.items);
  for (const [c, n] of Object.entries(drops.currency)) pl.currency[c] = (pl.currency[c] || 0) + n;
  if (m.isBoss || m.rarity === 'rare') log(state, 'kill', `${m.name} dies.`);
  // Rare monsters in maps can drop a map; it waits in the pack's loot like items do.
  if (m.rarity === 'rare' && state.run.map) {
    const dropped = rollRareMonsterMap(rng(state), state.run.map, state.mapProgress.highest, state.nextUid);
    if (dropped) {
      state.nextUid++;
      (pl.maps ||= []).push(dropped);
    }
  }
}

export function gainXp(state, amount) {
  const ch = state.character;
  if (ch.level >= PLAYER.levelCap) return;
  ch.xp += amount;
  while (ch.level < PLAYER.levelCap && ch.xp >= xpToNext(ch.level)) {
    ch.xp -= xpToNext(ch.level);
    ch.level++;
    invalidateStats(state);
    const s = getStats(state);
    state.player.life = s.life;
    state.player.mana = s.mana;
    state.player.es = s.energyShield;
    log(state, 'level', `Level up! Now level ${ch.level}. Life ${s.life}.`);
  }
  if (ch.level >= PLAYER.levelCap) ch.xp = 0;
}

function packCleared(state) {
  const run = state.run;
  const rec = run.record;
  const zone = getZone(run.zoneId);
  const seconds = state.time - run.packStart;
  pickUpLoot(state);
  state.player.blight = [];
  if (run.pack.threat === 'boss') {
    rec.bossSeconds = seconds;
    runComplete(state);
    return;
  }
  if (run.pack.rift) {
    run.pack = null;
    run.phase = 'travel';
    run.timer = RULES.travelSeconds;
    return;
  }
  rec.packs.push({ threat: run.pack.threat, element: run.pack.element, seconds, size: run.pack.monsters.length });
  run.packIndex++;
  run.pack = null;
  run.phase = 'travel';
  run.timer = RULES.travelSeconds;
  if (run.packIndex === zone.packs) log(state, 'info', 'The area falls quiet. The boss awaits.');
}

export function automationUnlocked(state, key) {
  const A = AUTOMATION[key];
  if (state.legacy && state.legacy.automation.includes(key)) return true;
  if (A.mapTier) return !!state.mapProgress && state.mapProgress.cleared.includes(A.mapTier);
  return state.progress.cleared.includes(A.zone);
}

// What the automation rules do with a dropped item: 'keep' or 'salvage'.
export function lootAction(state, item) {
  const a = state.automation || DEFAULT_AUTOMATION;
  if ((a.keepTypes || []).includes(BASES[item.baseId].slot)) return 'keep';
  if (item.rarity === 'normal') return automationUnlocked(state, 'autoSalvage') && a.salvageNormal ? 'salvage' : 'keep';
  if (!automationUnlocked(state, 'lootFilter')) return 'keep';
  const wanted = item.mods.some((m) => a.keepFamilies.includes(m.family));
  if (item.rarity === 'magic' && a.salvageMagic && !wanted) return 'salvage';
  if (item.rarity === 'rare' && a.salvageRare && !wanted) return 'salvage';
  return 'keep';
}

function pickUpLoot(state) {
  const pl = state.run.pendingLoot;
  const rec = state.run.record;
  if (pl.maps && pl.maps.length) {
    addMaps(state, pl.maps);
    log(state, 'loot rare', `A rare monster dropped a tier ${pl.maps.map((m) => m.tier).join(', ')} map.`);
  }
  let autoCount = 0;
  let autoScrap = 0;
  for (const item of pl.items) {
    if (lootAction(state, item) === 'salvage') {
      autoCount++;
      autoScrap += salvageValue(item);
      rec.items++;
      continue;
    }
    if (state.inventory.length >= RULES.inventorySize) {
      log(state, 'warn', `Inventory full: left ${itemLabel(item)} behind.`);
      continue;
    }
    state.inventory.push(item);
    rec.items++;
    if (item.rarity !== 'normal') log(state, `loot ${item.rarity}`, `Picked up ${item.rarity} ${BASES[item.baseId].name}${item.name ? ` "${item.name}"` : ''}.`);
  }
  if (autoCount) {
    state.scrap += autoScrap;
    rec.autoSalvaged = (rec.autoSalvaged || 0) + autoCount;
  }
  for (const [c, n] of Object.entries(pl.currency)) {
    state.currency[c] += n;
    rec.currency += n;
    log(state, 'loot currency', `Picked up ${n} ${c[0].toUpperCase() + c.slice(1)}.`);
  }
  state.run.pendingLoot = { items: [], currency: {} };
}

function finishRecord(state, outcome) {
  const rec = state.run.record;
  rec.outcome = outcome;
  rec.end = state.time;
  state.runHistory.push(rec);
  if (state.runHistory.length > RULES.runHistorySize) state.runHistory.shift();
  state.lifetime.runs++;
  checkChallenges(state, outcome);
}

function runComplete(state) {
  const run = state.run;
  const zoneId = run.zoneId;
  if (run.map) return mapComplete(state);
  finishRecord(state, 'cleared');
  log(state, 'clear', `${getZone(zoneId).name} cleared in ${Math.round(state.time - run.record.start)}s.`);
  const firstClear = !state.progress.cleared.includes(zoneId);
  if (firstClear || rng(state).chance(LINKS.bossDropChance)) grantSupport(state);
  if (firstClear) {
    state.progress.cleared.push(zoneId);
    const link = LINKS.unlocks.find((u) => u.zone === zoneId);
    if (link) log(state, 'clear', `Your skill can now hold ${link.slots - 1} supports.`);
    if (getZone(zoneId + 1) && state.progress.unlocked < zoneId + 1) {
      state.progress.unlocked = zoneId + 1;
      log(state, 'clear', `First clear! ${getZone(zoneId + 1).name} is now open.`);
    }
  }
  // The last zone's boss drops tier 1 maps: always the first time, then sometimes.
  if (zoneId === ZONES[ZONES.length - 1].id && (firstClear || rng(state).chance(MAP_RULES.zone10BossChance))) {
    addMaps(state, [makeMap(rng(state), state.nextUid++, 1)]);
    if (firstClear) log(state, 'clear', 'The Last Wall falls. A map drops: maps are the endgame. Open the Maps tab.');
  }
  run.phase = 'done';
  run.timer = RULES.runEndSeconds;
}

function mapComplete(state) {
  const run = state.run;
  const map = run.map;
  finishRecord(state, 'cleared');
  log(state, 'clear', `Tier ${map.tier} map cleared in ${Math.round(state.time - run.record.start)}s.`);
  const mp = state.mapProgress;
  if (!mp.cleared.includes(map.tier)) {
    mp.cleared.push(map.tier);
    mp.highest = Math.max(mp.highest, map.tier);
    state.character.atlas = [...mp.cleared];
    invalidateStats(state);
    log(state, 'clear', `First clear of a tier ${map.tier} map!`);
    if (MAP_RULES.bonusPointTiers.includes(map.tier)) log(state, 'level', 'You gain 2 passive points.');
    if (map.tier === AUTOMATION.mapRunner.mapTier) log(state, 'clear', 'Map runner unlocked (Automation tab).');
    grantSupport(state);
  }
  if (state.league.mechanic === 'echoes' && rng(state).chance(MECHANICS.echoes.chance)) {
    addMaps(state, [{ ...map, uid: state.nextUid++ }]);
    log(state, 'loot rare', 'The map echoes: you can run it again.');
  }
  const drops = rollMapDrops(rng(state), map, mp.highest, newUid(state));
  addMaps(state, drops);
  if (drops.length) log(state, 'loot rare', `${drops.length} map${drops.length > 1 ? 's' : ''} dropped: tier ${drops.map((d) => d.tier).join(', ')}.`);
  run.phase = 'done';
  run.timer = RULES.runEndSeconds;
}

function addMaps(state, maps) {
  for (const m of maps) {
    if (state.maps.length >= MAP_RULES.stashSize) {
      log(state, 'warn', 'Map stash full: a map was left behind.');
      continue;
    }
    state.maps.push(m);
  }
}

// ---------- Maps ----------

export function runMap(state, uid) {
  const idx = state.maps.findIndex((m) => m.uid === uid);
  if (idx < 0) return { ok: false, reason: 'Map not found.' };
  const [map] = state.maps.splice(idx, 1);
  const area = mapArea(map);
  registerArea(area);
  startRun(state, area.id);
  state.run.map = map;
  log(state, 'info', `Entering ${area.name}${map.mods.length ? ` (${map.mods.join(', ')})` : ''}.`);
  return { ok: true };
}

function pickRunnerMap(state) {
  if (!state.maps.length) return null;
  const allowed = state.maps.filter((m) => m.tier <= state.mapProgress.highest + 1);
  if (!allowed.length) return null;
  const order = state.mapRunner.order === 'lowest' ? 1 : -1;
  return allowed.slice().sort((a, b) => order * (a.tier - b.tier))[0];
}

export function setMapRunner(state, patch) {
  state.mapRunner = { ...state.mapRunner, ...patch };
  return { ok: true };
}

export function craftOnMap(state, currencyId, uid) {
  const map = state.maps.find((m) => m.uid === uid);
  if (!map) return { ok: false, reason: 'Map not found.' };
  const res = craftMap(rng(state), currencyId, map, state.currency);
  state.rngState = rng(state).getState();
  return res;
}

export function discardMap(state, uid) {
  const idx = state.maps.findIndex((m) => m.uid === uid);
  if (idx < 0) return { ok: false, reason: 'Map not found.' };
  state.maps.splice(idx, 1);
  state.scrap += 1;
  return { ok: true };
}

function playerDied(state, killer) {
  const run = state.run;
  const rec = run.record;
  const s = getStats(state);
  const hit = run.lastHit || { raw: 0, taken: 0, isBig: false };
  // Who dealt the damage in the last few seconds, grouped by threat and type.
  const groups = {};
  for (const h of run.recentHits || []) {
    const k = `${h.threat}:${h.type}`;
    const g = (groups[k] ||= { threat: h.threat, type: h.type, taken: 0, hits: 0, biggestRaw: 0 });
    g.taken += h.taken;
    g.hits++;
    g.biggestRaw = Math.max(g.biggestRaw, h.raw);
  }
  const recentDamage = Object.values(groups).sort((a, b) => b.taken - a.taken);
  const raw = hit.raw;
  const type = killer.damageType;
  rec.deaths.push({
    source: killer.name,
    threat: killer.isBoss ? 'boss' : killer.threat,
    type,
    raw,
    taken: hit.taken,
    isBig: hit.isBig,
    maxLife: s.life,
    res: type === 'physical' ? null : effectiveRes(s, type, run.zoneId),
    maxRes: type === 'physical' ? null : s.maxRes[type],
    armour: s.armour,
    damageByType: { ...rec.damageByType },
    recentDamage,
    atBoss: killer.isBoss,
  });
  state.lifetime.deaths++;
  if (run.zoneId === 10) state.league.zone10Deaths++;
  const ch = state.character;
  const loss = xpToNext(ch.level) * PLAYER.deathXpLossPct;
  ch.xp = Math.max(0, ch.xp - loss);
  const lostItems = run.pendingLoot.items.length;
  run.pendingLoot = { items: [], currency: {} };
  log(state, 'death', `You were slain by ${killer.name}.${lostItems ? ` ${lostItems} unclaimed item(s) lost.` : ''}`);
  finishRecord(state, 'died');
  state.player.life = 0;
  run.phase = 'dead';
  run.timer = PLAYER.respawnSeconds;
}

// ---------- Player actions ----------

export function findItem(state, uid) {
  const idx = state.inventory.findIndex((i) => i.uid === uid);
  if (idx >= 0) return { item: state.inventory[idx], where: 'inventory', idx };
  for (const slot of EQUIP_SLOTS) {
    const it = state.character.equipment[slot];
    if (it && it.uid === uid) return { item: it, where: slot };
  }
  return null;
}

// Which equipment slot an item goes into: the requested one, else an empty one, else the first.
export function targetSlot(state, item, wanted = null) {
  const slots = slotsForType(BASES[item.baseId].slot);
  if (wanted && slots.includes(wanted)) return wanted;
  return slots.find((s) => !state.character.equipment[s]) || slots[0];
}

export function equip(state, uid, wanted = null) {
  const f = findItem(state, uid);
  if (!f || f.where !== 'inventory') return { ok: false, reason: 'Item not in inventory.' };
  const slot = targetSlot(state, f.item, wanted);
  const old = state.character.equipment[slot];
  state.inventory.splice(f.idx, 1);
  if (old) state.inventory.splice(f.idx, 0, old);
  state.character.equipment[slot] = f.item;
  invalidateStats(state);
  return { ok: true };
}

export function unequip(state, slot) {
  const it = state.character.equipment[slot];
  if (!it) return { ok: false, reason: 'Nothing equipped there.' };
  if (state.inventory.length >= RULES.inventorySize) return { ok: false, reason: 'Inventory is full.' };
  state.character.equipment[slot] = null;
  state.inventory.push(it);
  invalidateStats(state);
  return { ok: true };
}

export function salvage(state, uid) {
  const f = findItem(state, uid);
  if (!f || f.where !== 'inventory') return { ok: false, reason: 'Only unequipped items can be salvaged.' };
  state.inventory.splice(f.idx, 1);
  const v = salvageValue(f.item);
  state.scrap += v;
  return { ok: true, scrap: v };
}

export function salvageAll(state, rarity) {
  let total = 0;
  let count = 0;
  state.inventory = state.inventory.filter((it) => {
    // rarity 'all' salvages every unlocked item.
    if (it.locked || (rarity !== 'all' && it.rarity !== rarity)) return true;
    total += salvageValue(it);
    count++;
    return false;
  });
  state.scrap += total;
  return { ok: true, scrap: total, count };
}

export function toggleLock(state, uid) {
  const f = findItem(state, uid);
  if (!f) return { ok: false };
  f.item.locked = !f.item.locked;
  return { ok: true };
}

export function craftItem(state, currencyId, uid) {
  const f = findItem(state, uid);
  if (!f) return { ok: false, reason: 'Item not found.' };
  const res = craft(rng(state), currencyId, f.item, state.currency);
  if (res.ok && f.where !== 'inventory') invalidateStats(state);
  state.rngState = rng(state).getState();
  return res;
}

export function smithItem(state, uid, familyId) {
  const f = findItem(state, uid);
  if (!f) return { ok: false, reason: 'Item not found.' };
  const res = smithCraft(rng(state), f.item, familyId, state.scrap, smithDiscount(state));
  if (res.ok) {
    state.scrap -= res.cost;
    if (f.where !== 'inventory') invalidateStats(state);
  }
  state.rngState = rng(state).getState();
  return res;
}

export function convertCurrency(state, index) {
  return convert(state.currency, index);
}

export function selectZone(state, zoneId) {
  if (zoneId > state.progress.unlocked || !getZone(zoneId)) return { ok: false, reason: 'Zone is locked.' };
  if (zoneId < state.progress.unlocked) state.autoAdvance = false;
  if (state.run && state.run.phase !== 'dead') {
    log(state, 'info', `Leaving for ${getZone(zoneId).name}.`);
  }
  startRun(state, zoneId);
  return { ok: true };
}

export function setAutoAdvance(state, on) {
  state.autoAdvance = on;
}

// Stats as they would be with `item` equipped instead of the current one.
export function statsWithItem(state, item, wanted = null) {
  const slot = targetSlot(state, item, wanted);
  const ch = { ...state.character, equipment: { ...state.character.equipment, [slot]: item } };
  return computeStats(ch);
}

// ---------- Skills ----------

// Number of supports the active skill can hold (links minus the skill itself).
export function supportSlots(state) {
  let links = LINKS.base;
  for (const u of LINKS.unlocks) if (state.progress.cleared.includes(u.zone)) links = Math.max(links, u.slots);
  links += legacyRank(state, 'head_start');
  return Math.min(5, links) - 1;
}

function grantSupport(state) {
  const missing = SUPPORT_ORDER.filter((id) => !state.ownedSupports.includes(id));
  if (!missing.length) return null;
  const id = rng(state).pick(missing);
  state.ownedSupports.push(id);
  log(state, 'loot rare', `New support gem: ${SUPPORTS[id].name} (${SUPPORTS[id].text}). Link it in the Skills tab.`);
  return id;
}

export function setSkill(state, skillId) {
  if (!SKILLS[skillId]) return { ok: false, reason: 'Unknown skill.' };
  const sk = state.character.skill;
  sk.id = skillId;
  // Drop supports that don't work with the new skill.
  sk.supports = sk.supports.filter((id) => supportFits(id, skillId));
  invalidateStats(state);
  return { ok: true };
}

export function setSupport(state, slot, supportId) {
  const sk = state.character.skill;
  if (slot < 0 || slot >= supportSlots(state)) return { ok: false, reason: 'That link slot is locked.' };
  const next = sk.supports.slice();
  if (!supportId) {
    next.splice(slot, 1);
  } else {
    if (!state.ownedSupports.includes(supportId)) return { ok: false, reason: 'You don’t own that support yet.' };
    if (!supportFits(supportId, sk.id)) return { ok: false, reason: `${SUPPORTS[supportId].name} doesn’t work with ${SKILLS[sk.id].name}.` };
    const existing = next.indexOf(supportId);
    if (existing >= 0 && existing !== slot) return { ok: false, reason: 'That support is already linked.' };
    if (slot >= next.length) next.push(supportId);
    else next[slot] = supportId;
  }
  sk.supports = next;
  invalidateStats(state);
  return { ok: true };
}

// Stats for a hypothetical skill setup (for previews).
export function statsWithSkill(state, skill) {
  return computeStats({ ...state.character, skill });
}

// ---------- Passive tree ----------

export function passivePoints(state) {
  let pts = state.character.level - 1;
  for (const b of PASSIVE_RULES.bonusPoints) if (state.progress.cleared.includes(b.zone)) pts += b.points;
  for (const t of MAP_RULES.bonusPointTiers) if (state.mapProgress && state.mapProgress.cleared.includes(t)) pts += 2;
  return pts;
}

export function passivesSpent(state) {
  return state.character.passives.filter((id) => id !== 'origin').length;
}

export function refundCost(state) {
  return PASSIVE_RULES.refundBase + Math.floor(state.character.level / PASSIVE_RULES.refundPerLevels);
}

export function canAllocate(state, id) {
  const node = PASSIVES[id];
  const have = state.character.passives;
  if (!node) return 'Unknown node.';
  if (have.includes(id)) return 'Already allocated.';
  if (!node.links.some((n) => have.includes(n))) return 'Allocate a connected node first.';
  // Start region: the first region gate is free. Other regions are reached through bridges.
  if (id.endsWith('_gate')) {
    const otherGate = have.find((n) => n.endsWith('_gate'));
    const viaBranch = node.links.some((n) => n !== 'origin' && have.includes(n));
    if (otherGate && !viaBranch) return `Your start region is ${PASSIVES[otherGate].name.replace(' Gate', '')}. Reach other regions through the bridges.`;
  }
  if (passivesSpent(state) >= passivePoints(state)) return 'No passive points left. You get one per level.';
  return null;
}

// A node can be refunded if every other allocated node still connects to the start.
export function canRefund(state, id) {
  const have = state.character.passives;
  if (id === 'origin') return 'The starting node can’t be refunded.';
  if (!have.includes(id)) return 'Not allocated.';
  const rest = new Set(have.filter((n) => n !== id));
  const seen = new Set(['origin']);
  const queue = ['origin'];
  while (queue.length) {
    const cur = queue.shift();
    for (const n of PASSIVES[cur].links) if (rest.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
  }
  if (seen.size !== rest.size) return 'Other allocated nodes depend on this one. Refund those first.';
  if (state.scrap < refundCost(state)) return `Refunding costs ${refundCost(state)} Scrap. You have ${state.scrap}.`;
  return null;
}

export function allocatePassive(state, id) {
  const reason = canAllocate(state, id);
  if (reason) return { ok: false, reason };
  state.character.passives.push(id);
  invalidateStats(state);
  return { ok: true };
}

export function refundPassive(state, id) {
  const reason = canRefund(state, id);
  if (reason) return { ok: false, reason };
  const cost = refundCost(state);
  state.scrap -= cost;
  state.character.passives = state.character.passives.filter((n) => n !== id);
  invalidateStats(state);
  return { ok: true, cost };
}

export function statsWithPassives(state, passives) {
  return computeStats({ ...state.character, passives });
}

export function setAutomation(state, patch) {
  state.automation = { ...state.automation, ...patch };
  return { ok: true };
}

// ---------- Offline progress ----------

// Averages from recent finished runs in the current zone, or null if there are none.
export function offlineRates(state) {
  const O = RULES.offline;
  const runs = state.runHistory.filter((r) => r.zoneId === state.zoneId).slice(-O.sampleRuns);
  if (!runs.length) return null;
  const n = runs.length;
  const sum = (f) => runs.reduce((a, r) => a + f(r), 0);
  return {
    zoneId: state.zoneId,
    seconds: Math.max(10, sum((r) => r.end - r.start) / n),
    xp: sum((r) => r.xp) / n,
    items: sum((r) => r.items) / n,
    currency: sum((r) => r.currency) / n,
    deathRate: sum((r) => (r.outcome === 'died' ? 1 : 0)) / n,
  };
}

// Grants rewards for time away, using recorded averages instead of simulating.
// Returns a summary for the UI, or null if nothing happened.
export function offlineCapHours(state) {
  return RULES.offline.capHours + 2 * legacyRank(state, 'long_absence');
}

export function applyOffline(state, secondsAway, capHours = offlineCapHours(state)) {
  const O = RULES.offline;
  if (secondsAway < O.minSeconds) return null;
  const seconds = Math.min(secondsAway, capHours * 3600);
  const rates = offlineRates(state);
  if (!rates) return { seconds, runs: 0, reason: 'No finished runs in this zone yet, so nothing was gained.' };
  const runs = Math.floor((seconds / rates.seconds) * O.efficiency);
  if (runs < 1) return { seconds, runs: 0, reason: 'Not long enough for a full run.' };
  const r = rng(state);
  const zone = getZone(rates.zoneId);
  const levelBefore = state.character.level;
  // The same over-level XP penalty as active play, re-checked as levels go up.
  const factor = (L) => Math.max(0, 1 - Math.max(0, L - zone.level - PLAYER.xpGraceLevels) * PLAYER.xpPenaltyPerLevel);
  const base = factor(levelBefore) > 0 ? rates.xp / factor(levelBefore) : 0;
  let xp = 0;
  for (let i = 0; i < runs; i++) {
    const gain = base * factor(state.character.level);
    xp += gain;
    gainXp(state, gain);
  }
  // Items: roll real items so the inventory fills naturally; overflow becomes Scrap.
  const itemCount = Math.round(rates.items * runs);
  let kept = 0;
  let salvaged = 0;
  let scrap = 0;
  const byRarity = { normal: 0, magic: 0, rare: 0 };
  for (let i = 0; i < itemCount; i++) {
    const item = makeItem(r, state.nextUid++, { baseId: pickBase(r, zone.level), ilvl: zone.level, rarity: rollRarity(r) });
    byRarity[item.rarity]++;
    if (state.inventory.length < RULES.inventorySize) {
      state.inventory.push(item);
      kept++;
    } else {
      salvaged++;
      scrap += salvageValue(item);
    }
  }
  state.scrap += scrap;
  const currency = {};
  const curCount = Math.round(rates.currency * runs);
  for (let i = 0; i < curCount; i++) {
    const c = rollCurrencyType(r);
    currency[c] = (currency[c] || 0) + 1;
    state.currency[c] += 1;
  }
  state.rngState = r.getState();
  state.lifetime.runs += runs;
  return {
    seconds, runs, zoneName: zone.name, xp, levelsGained: state.character.level - levelBefore,
    items: itemCount, kept, salvaged, scrap, byRarity, currency, capped: secondsAway > capHours * 3600,
  };
}

// ---------- Leagues and Legacy ----------

function newLegacy() {
  return { points: 0, earnedTotal: 0, upgrades: {}, resets: 0, automation: [] };
}

export function legacyRank(state, id) {
  return (state.legacy && state.legacy.upgrades[id]) || 0;
}

export function smithDiscount(state) {
  return 0.15 * legacyRank(state, 'smiths_favor');
}

export function leagueAutomationUnlocked(state, key) {
  return (state.legacy ? state.legacy.resets : 0) >= LEAGUE_AUTOMATION[key].resets;
}

function completeChallenge(state, id) {
  if (state.league.challenges.includes(id)) return;
  state.league.challenges.push(id);
  log(state, 'clear', `Challenge complete: ${CHALLENGES[id].name}. (+1 Legacy point at your next league)`);
}

function checkChallenges(state, outcome) {
  const L = state.league;
  const ch = state.character;
  const run = state.run;
  if (ch.level >= 30) completeChallenge(state, 'level_30');
  if (ch.level >= 50) completeChallenge(state, 'level_50');
  if (state.progress.cleared.includes(10) || (outcome === 'cleared' && run.zoneId === 10)) completeChallenge(state, 'zone10');
  if (outcome === 'cleared' && run.zoneId === 10 && L.zone10Deaths === 0) completeChallenge(state, 'zone10_no_death');
  if (outcome === 'cleared' && run.zoneId === 5 && state.time - L.start <= 1800) completeChallenge(state, 'zone5_fast');
  if (outcome === 'cleared' && run.map) {
    const m = run.map;
    if (m.tier >= 4) completeChallenge(state, 'map_t4');
    if (m.tier >= 12) completeChallenge(state, 'map_t12');
    if (m.tier >= 8 && getStats(state).keystones.length) completeChallenge(state, 'map_t8_keystone');
    if (m.mods.includes('withering')) completeChallenge(state, 'withering_clean');
    if (m.rarity === 'rare') completeChallenge(state, 'rare_map');
  }
  if (SUPPORT_ORDER.every((id) => state.ownedSupports.includes(id))) completeChallenge(state, 'all_supports');
  if (Object.values(ch.equipment).some((it) => it && it.mods.length >= 6)) completeChallenge(state, 'six_mods');
}

export function canStartLeague(state) {
  if (!state.mapProgress.cleared.some((t) => t >= LEAGUE_RULES.unlockMapTier)) {
    return `Clear a tier ${LEAGUE_RULES.unlockMapTier} map to unlock new leagues.`;
  }
  return null;
}

export function legacyPointsForReset(state) {
  return state.mapProgress.highest + state.league.challenges.length;
}

export function heirloomSlots(state) {
  return 1 + legacyRank(state, 'second_heirloom');
}

// An heirloom keeps its base and mods, but every mod drops to its lowest tier.
export function scaleHeirloom(item) {
  const out = { ...item, ilvl: 1, locked: true, mods: [] };
  for (const m of item.mods) {
    const fam = MODS[m.family];
    const cur = fam.tiers.find((t) => t.tier === m.tier) || fam.tiers[0];
    const low = fam.tiers[0];
    const share = cur.max > cur.min ? (m.value - cur.min) / (cur.max - cur.min) : 1;
    out.mods.push({ family: m.family, tier: low.tier, value: Math.round(low.min + share * (low.max - low.min)) });
  }
  return out;
}

// Starts a new league. Returns the new state (the old one is left untouched).
export function startNewLeague(state, heirloomUids = [], seed = (state.rngState ^ 0x9e3779b9) >>> 0) {
  const reason = canStartLeague(state);
  if (reason) return { ok: false, reason };
  if (heirloomUids.length > heirloomSlots(state)) return { ok: false, reason: `You can carry ${heirloomSlots(state)} item(s).` };
  const earned = legacyPointsForReset(state);
  const fresh = newGame(seed);
  const legacy = JSON.parse(JSON.stringify(state.legacy));
  legacy.points += earned;
  legacy.earnedTotal += earned;
  legacy.resets += 1;
  for (const key of Object.keys(AUTOMATION)) if (automationUnlocked(state, key) && !legacy.automation.includes(key)) legacy.automation.push(key);
  fresh.legacy = legacy;
  fresh.automation = JSON.parse(JSON.stringify(state.automation));
  fresh.mapRunner = { ...state.mapRunner };
  fresh.lifetime = { ...state.lifetime };
  const mechs = Object.keys(MECHANICS);
  fresh.league = {
    number: state.league.number + 1,
    mechanic: mechs[(state.league.number + seed) % mechs.length],
    challenges: [], shards: 0, start: 0, zone10Deaths: 0,
  };
  for (const uid of heirloomUids) {
    const f = findItem(state, uid);
    if (f) fresh.inventory.push({ ...scaleHeirloom(f.item), uid: fresh.nextUid++ });
  }
  log(fresh, 'clear', `League ${fresh.league.number} begins: ${MECHANICS[fresh.league.mechanic].name}. You earned ${earned} Legacy points.`);
  invalidateStats(fresh);
  return { ok: true, state: fresh, earned };
}

export function buyLegacy(state, id) {
  const U = LEGACY_UPGRADES[id];
  const rank = legacyRank(state, id);
  if (rank >= U.max) return { ok: false, reason: 'Already at max rank.' };
  if (state.legacy.points < U.cost) return { ok: false, reason: `Needs ${U.cost} Legacy points.` };
  state.legacy.points -= U.cost;
  state.legacy.upgrades[id] = rank + 1;
  invalidateStats(state);
  return { ok: true };
}

// Shard League: spend shards on a Rare with a chosen mod family at the best tier available.
export function shardCraft(state, type, familyId) {
  const need = MECHANICS.shards.shardsPerCraft;
  if (state.league.mechanic !== 'shards') return { ok: false, reason: 'Shards only exist in the Shard League.' };
  if (state.league.shards < need) return { ok: false, reason: `Needs ${need} shards.` };
  const fam = MODS[familyId];
  if (!fam || !fam.slots.includes(type)) return { ok: false, reason: 'That mod cannot roll on that item type.' };
  const ilvl = Math.max(getZone(state.zoneId).level, state.mapProgress.highest ? MAP_RULES.levelBase + MAP_RULES.levelPerTier * state.mapProgress.highest : 0);
  const tiers = tiersAt(familyId, ilvl);
  if (!tiers.length) return { ok: false, reason: 'Your item level is too low for that mod.' };
  if (state.inventory.length >= RULES.inventorySize) return { ok: false, reason: 'Inventory is full.' };
  const r = rng(state);
  const item = { uid: state.nextUid++, baseId: pickBaseOf(r, ilvl, type), ilvl, rarity: 'normal', name: null, mods: [] };
  setRarity(r, item, 'rare');
  const t = tiers[tiers.length - 1];
  item.mods.push({ family: familyId, tier: t.tier, value: r.int(t.min, t.max) });
  const extra = r.int(2, 4);
  for (let i = 0; i < extra; i++) addRandomMod(r, item);
  state.league.shards -= need;
  state.inventory.push(item);
  state.rngState = r.getState();
  return { ok: true, item };
}

// Craft rules: repeat a currency until the item has a chosen mod family, within a budget.
export function craftUntil(state, uid, currencyId, familyId, maxSpend) {
  const f = findItem(state, uid);
  if (!f) return { ok: false, reason: 'Item not found.' };
  if (!leagueAutomationUnlocked(state, 'craftRules')) return { ok: false, reason: 'Craft rules unlock after your first league reset.' };
  let spent = 0;
  while (spent < maxSpend && !f.item.mods.some((m) => m.family === familyId)) {
    const res = craftItem(state, currencyId, uid);
    if (!res.ok) return { ok: spent > 0, spent, found: false, reason: res.reason };
    spent++;
  }
  return { ok: true, spent, found: f.item.mods.some((m) => m.family === familyId) };
}

// ---------- Saving ----------

export function serialize(state) {
  return JSON.stringify(state);
}

export function deserialize(text) {
  const data = JSON.parse(text);
  const state = migrate(data);
  if (state.run && state.run.map) registerArea(mapArea(state.run.map));
  if (!state.run || !getZone(state.run.zoneId)) startRun(state, state.zoneId || 1);
  return state;
}

// One function per version bump so old saves keep working.
export function migrate(data) {
  if (!data || typeof data !== 'object' || !data.version) throw new Error('Not a Wallbreaker save.');
  if (data.version > SAVE_VERSION) throw new Error('Save is from a newer version.');
  // Fields added without a version bump get defaults.
  data.automation ||= { ...DEFAULT_AUTOMATION, keepFamilies: [...DEFAULT_AUTOMATION.keepFamilies] };
  data.maps ||= [];
  data.mapProgress ||= { cleared: [], highest: 0 };
  data.mapRunner ||= { on: false, order: 'highest' };
  data.legacy ||= newLegacy();
  if (data.character && !data.character.atlas) data.character.atlas = data.mapProgress ? [...data.mapProgress.cleared] : [];
  data.league ||= { number: 1, mechanic: null, challenges: [], shards: 0, start: 0, zone10Deaths: 0 };
  if (data.version === 1) {
    // v2: skills and supports.
    data.character.skill = { id: data.character.skillId || 'cleave', supports: [] };
    delete data.character.skillId;
    data.ownedSupports = [...LINKS.startingSupports];
    data.version = 2;
  }
  if (data.version === 2) {
    // v3: passive tree.
    data.character.passives = ['origin'];
    data.version = 3;
  }
  if (data.version === 3) {
    // v4: eight equipment slots, and a rebuilt passive tree (points refunded).
    const eq = data.character.equipment;
    const next = Object.fromEntries(EQUIP_SLOTS.map((k) => [k, null]));
    next.weapon = eq.weapon || null;
    next.body = eq.body || null;
    next.ring1 = eq.ring || null;
    data.character.equipment = next;
    data.character.passives = ['origin'];
    data.notice = 'The passive tree was rebuilt, so your passive points have been refunded.';
    data.version = 4;
  }
  return data;
}

export { THREATS, ZONES };
