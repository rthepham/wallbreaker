// Game state and the simulation loop. No UI code here.
// The UI calls tick() 10 times per simulated second and reads state.

import { PLAYER, RULES } from './data/player.js';
import { MONSTERS, THREATS } from './data/monsters.js';
import { ZONES } from './data/zones.js';
import { BASES, SLOTS } from './data/items.js';
import { CURRENCY_ORDER } from './data/currency.js';
import { createRng } from './rng.js';
import {
  computeStats, armourReduction, evadeChance, effectiveRes, itemLabel,
} from './stats.js';
import { makePack, makeBossPack } from './combat.js';
import { makeItem, rollMonsterDrops } from './loot.js';
import { craft, salvageValue, smithCraft, convert } from './crafting.js';

export const SAVE_VERSION = 1;
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
  return ZONES.find((z) => z.id === id);
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
    character: { level: 1, xp: 0, skillId: 'cleave', equipment: { weapon: null, body: null, ring: null } },
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
  };
  const r = rng(state);
  // Starting gear: a plain weapon and armour, no ring.
  state.character.equipment.weapon = makeItem(r, state.nextUid++, { baseId: 'rusted_blade', ilvl: 1 });
  state.character.equipment.body = makeItem(r, state.nextUid++, { baseId: 'leather_vest', ilvl: 1 });
  const s = getStats(state);
  state.player.life = s.life;
  state.player.mana = s.mana;
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
  state.zoneId = zoneId;
  state.player.life = s.life;
  state.player.mana = s.mana;
  state.player.attackTimer = 0;
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
}

function regen(state, dt, outOfCombat = false) {
  const s = getStats(state);
  const p = state.player;
  const extra = outOfCombat ? s.life * PLAYER.outOfCombatRegenPctPerSec : 0;
  p.life = Math.min(s.life, p.life + (s.lifeRegen + extra) * dt);
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
      if (run.timer <= 0) startRun(state, state.zoneId);
      break;
    case 'done':
      regen(state, DT, true);
      run.timer -= DT;
      if (run.timer <= 0) startRun(state, nextZoneChoice(state));
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

function spawnNext(state) {
  const run = state.run;
  const zone = getZone(run.zoneId);
  const r = rng(state);
  if (run.packIndex < zone.packs) {
    run.pack = makePack(r, zone, newMonsterId(state));
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
    if (p.mana >= s.damage.manaCost) {
      p.mana -= s.damage.manaCost;
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

  // 2. Monsters attack on their own timers.
  for (const m of run.pack.monsters) {
    if (m.life <= 0) continue;
    m.attackTimer -= DT;
    if (m.attackTimer <= 0) {
      monsterHit(state, s, m, 1);
      m.attackTimer += m.interval;
      if (p.life <= 0) return playerDied(state, m);
    }
    if (m.bigHit) {
      const b = m.bigHit;
      b.timer -= DT;
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

  // 3. Regen.
  regen(state, DT);
}

function playerAttack(state, s) {
  const r = rng(state);
  const d = s.damage;
  const targets = state.run.pack.monsters.filter((m) => m.life > 0).slice(0, d.targets);
  const parts = [];
  for (const m of targets) {
    let dmg = r.range(d.hitMin, d.hitMax);
    const crit = r.chance(d.critChance / 100);
    if (crit) dmg *= d.critMulti;
    dmg = Math.max(1, Math.round(dmg));
    m.life -= dmg;
    parts.push(crit ? `${dmg}!` : `${dmg}`);
    if (m.life <= 0) monsterKilled(state, m);
  }
  log(state, 'hit', `${s.skill.name} hits ${targets.length} for ${parts.join(', ')}`);
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
    taken = raw * (1 - armourReduction(s.armour, raw));
  } else {
    taken = raw * (1 - effectiveRes(s, type, state.run.zoneId) / 100);
  }
  taken = Math.max(0, taken);
  p.life -= taken;
  state.run.lastHit = { raw, taken, type, isBig };
  // Damage taken in the last few seconds, used to explain deaths.
  const recent = (state.run.recentHits ||= []);
  recent.push({ t: state.time, threat: m.isBoss ? 'boss' : m.threat, type, taken, raw, isBig });
  while (recent.length && recent[0].t < state.time - RECENT_SECONDS) recent.shift();
  rec.damageByType[type] = (rec.damageByType[type] || 0) + taken;

  const key = `${m.isBoss ? 'boss' : m.threat}:${type}${isBig ? ':big' : ''}`;
  const pct = taken / s.life;
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
  const rec = state.run.record;
  // XP with over-level penalty.
  const L = state.character.level;
  let xp = MONSTERS.xpBase * MONSTERS.xpGrowth ** m.level * m.xpMult;
  const over = L - m.level - PLAYER.xpGraceLevels;
  if (over > 0) xp *= Math.max(0, 1 - over * PLAYER.xpPenaltyPerLevel);
  gainXp(state, xp);
  rec.xp += xp;
  // Drops wait in the pack's loot pile until the pack is cleared.
  const drops = rollMonsterDrops(rng(state), m, newUid(state));
  const pl = state.run.pendingLoot;
  pl.items.push(...drops.items);
  for (const [c, n] of Object.entries(drops.currency)) pl.currency[c] = (pl.currency[c] || 0) + n;
  if (m.isBoss || m.rarity === 'rare') log(state, 'kill', `${m.name} dies.`);
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
  if (run.pack.threat === 'boss') {
    rec.bossSeconds = seconds;
    runComplete(state);
    return;
  }
  rec.packs.push({ threat: run.pack.threat, element: run.pack.element, seconds, size: run.pack.monsters.length });
  run.packIndex++;
  run.pack = null;
  run.phase = 'travel';
  run.timer = RULES.travelSeconds;
  if (run.packIndex === zone.packs) log(state, 'info', 'The area falls quiet. The boss awaits.');
}

function pickUpLoot(state) {
  const pl = state.run.pendingLoot;
  const rec = state.run.record;
  for (const item of pl.items) {
    if (state.inventory.length >= RULES.inventorySize) {
      log(state, 'warn', `Inventory full: left ${itemLabel(item)} behind.`);
      continue;
    }
    state.inventory.push(item);
    rec.items++;
    if (item.rarity !== 'normal') log(state, `loot ${item.rarity}`, `Picked up ${item.rarity} ${BASES[item.baseId].name}${item.name ? ` "${item.name}"` : ''}.`);
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
}

function runComplete(state) {
  const run = state.run;
  const zoneId = run.zoneId;
  finishRecord(state, 'cleared');
  log(state, 'clear', `${getZone(zoneId).name} cleared in ${Math.round(state.time - run.record.start)}s.`);
  if (!state.progress.cleared.includes(zoneId)) {
    state.progress.cleared.push(zoneId);
    if (getZone(zoneId + 1) && state.progress.unlocked < zoneId + 1) {
      state.progress.unlocked = zoneId + 1;
      log(state, 'clear', `First clear! ${getZone(zoneId + 1).name} is now open.`);
    }
  }
  run.phase = 'done';
  run.timer = RULES.runEndSeconds;
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
  for (const slot of SLOTS) {
    const it = state.character.equipment[slot];
    if (it && it.uid === uid) return { item: it, where: slot };
  }
  return null;
}

export function equip(state, uid) {
  const f = findItem(state, uid);
  if (!f || f.where !== 'inventory') return { ok: false, reason: 'Item not in inventory.' };
  const slot = BASES[f.item.baseId].slot;
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
    if (it.rarity !== rarity || it.locked) return true;
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
  const res = smithCraft(rng(state), f.item, familyId, state.scrap);
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
export function statsWithItem(state, item) {
  const slot = BASES[item.baseId].slot;
  const ch = { ...state.character, equipment: { ...state.character.equipment, [slot]: item } };
  return computeStats(ch);
}

// ---------- Saving ----------

export function serialize(state) {
  return JSON.stringify(state);
}

export function deserialize(text) {
  const data = JSON.parse(text);
  const state = migrate(data);
  if (!state.run || !getZone(state.run.zoneId)) startRun(state, state.zoneId || 1);
  return state;
}

// One function per version bump so old saves keep working.
export function migrate(data) {
  if (!data || typeof data !== 'object' || !data.version) throw new Error('Not a Wallbreaker save.');
  if (data.version > SAVE_VERSION) throw new Error('Save is from a newer version.');
  return data;
}

export { THREATS, ZONES };
