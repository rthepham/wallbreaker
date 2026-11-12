// Builds HTML for each panel from game state. No game logic here.

import { ZONES, zoneResPenalty } from '../data/zones.js';
import { THREATS } from '../data/monsters.js';
import { BASES, MODS, SLOT_NAMES, EQUIP_SLOTS, ITEM_TYPES, slotsForType } from '../data/items.js';
import { CURRENCY, CURRENCY_ORDER, CONVERSIONS } from '../data/currency.js';
import { RULES } from '../data/player.js';
import {
  getStats, getZone, xpToNext, statsWithItem, findItem, supportSlots, statsWithSkill,
  passivePoints, passivesSpent, canAllocate, canRefund, refundCost, statsWithPassives, automationUnlocked,
  leagueAutomationUnlocked, smithDiscount, legacyRank, canStartLeague, legacyPointsForReset, heirloomSlots,
} from '../game.js';
import { LEGACY_UPGRADES, CHALLENGES, MECHANICS, LEAGUE_AUTOMATION } from '../data/league.js';
import { eligibleFamilies } from '../loot.js';
import { AUTOMATION } from '../data/automation.js';
import { MAP_RULES, MAP_LAYOUTS, MAP_MODS } from '../data/maps.js';
import { mapLevel, mapIiq, canCraftMap } from '../maps.js';
import { PASSIVES, PASSIVE_REGIONS } from '../data/passives.js';
import { SKILLS, SKILL_ORDER, SUPPORTS, SUPPORT_ORDER, LINKS, supportFits } from '../data/skills.js';
import { maxHitTaken, effectiveRes, DAMAGE_TYPES } from '../stats.js';
import { monsterBaseLife } from '../combat.js';
import { canCraft, smithOptions, salvageValue } from '../crafting.js';
import { diagnose } from '../diagnosis.js';
import {
  fmt, fmt1, pct, cap, esc, modText, baseLine, itemTitle, timeAgo, statModText,
} from './format.js';

const dt = (type) => `<span class="dt dt-${type}">${type}</span>`;

function bar(cls, value, max, label) {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return `<div class="bar ${cls}" role="meter" aria-valuemin="0" aria-valuemax="${Math.round(max)}" aria-valuenow="${Math.round(value)}">
    <div class="bar-fill" style="width:${w}%"></div><div class="bar-label">${label}</div></div>`;
}

function mixShares(zone) {
  const total = zone.mix.reduce((a, m) => a + m.weight, 0);
  return zone.mix.map((m) => ({ ...m, share: (m.weight / total) * 100 }));
}

function resText(res) {
  const list = Object.entries(res || {}).filter(([, v]) => v > 0);
  return list.length ? ` · resists ${list.map(([t, v]) => `<span class="dt-${t}">${t} ${v}%</span>`).join(', ')}` : '';
}

function threatChip(m, zone) {
  const T = THREATS[m.threat];
  const type = m.threat === 'caster' ? m.element : T.damageType;
  const res = { ...(T.res || {}) };
  if (m.threat === 'caster' && T.ownElementRes) res[m.element] = T.ownElementRes;
  if (zone && zone.monsterEleRes) for (const t of ['fire', 'cold', 'lightning']) res[t] = (res[t] || 0) + zone.monsterEleRes;
  return `<span class="chip threat"><span class="dot dot-${type}"></span>${T.name}${m.threat === 'caster' ? ` (${m.element})` : ''} <span class="muted">${Math.round(m.share)}%${resText(res)}</span></span>`;
}

const STATUS = {
  ignite: (s) => `<span class="st st-fire">Burning ${Math.round(s.dps)}/s</span>`,
  shock: () => '<span class="st st-lightning">Shocked</span>',
  chill: () => '<span class="st st-cold">Chilled</span>',
  stun: () => '<span class="st st-physical">Stunned</span>',
};

// ---------- Header: zones ----------

export function ailmentRows(d) {
  const A = d.ailments;
  const rows = [];
  if (A.igniteChance) rows.push(`<div class="kv"><span class="dt-fire">Ignite chance</span><b>${Math.round(A.igniteChance)}% <span class="muted">(burns ${Math.round(A.igniteDpsPct * 100)}%/s)</span></b></div>`);
  if (A.shockChance) rows.push(`<div class="kv"><span class="dt-lightning">Shock chance</span><b>${Math.round(A.shockChance)}% <span class="muted">(+${Math.round(A.shockEffect)}% taken)</span></b></div>`);
  if (A.chillChance) rows.push(`<div class="kv"><span class="dt-cold">Chill chance</span><b>${Math.round(A.chillChance)}% <span class="muted">(${Math.round(A.chillSlow)}% slower)</span></b></div>`);
  if (A.stunThreshold) rows.push(`<div class="kv"><span>Stuns on hits of</span><b>${Math.round(A.stunThreshold * 100)}% <span class="muted">of enemy life</span></b></div>`);
  if (d.penetration || d.firePenetration) rows.push(`<div class="kv"><span>Penetration</span><b>${d.penetration}%${d.firePenetration ? ` <span class="muted">+${d.firePenetration}% fire</span>` : ''}</b></div>`);
  return rows.join('');
}

export function renderZones(state) {
  return ZONES.map((z) => {
    const locked = z.id > state.progress.unlocked;
    const cleared = state.progress.cleared.includes(z.id);
    const current = state.zoneId === z.id;
    const status = locked ? 'Locked' : cleared ? 'Cleared' : 'Not cleared';
    return `<button class="zone ${current ? 'current' : ''} ${locked ? 'locked' : ''}" data-action="zone" data-zone="${z.id}" ${locked ? 'disabled' : ''} aria-pressed="${current}">
      <span class="zone-num">${z.id}</span>
      <span class="zone-body"><span class="zone-name">${esc(z.name)}</span>
      <span class="zone-meta">Monster level ${z.level} · ${status}</span></span></button>`;
  }).join('');
}

// ---------- Character (live) ----------

export function renderVitals(state) {
  const area = state.run.zoneId;
  const s = getStats(state);
  const ch = state.character;
  const p = state.player;
  const need = xpToNext(ch.level);
  const d = s.damage;
  const zone = getZone(area);
  const mh = maxHitTaken(s, area);
  const bossLife = monsterBaseLife(zone.level) * THREATS.boss.lifeMult * (zone.lifeMult || 1) * (zone.champion ? 1.5 : 1);
  const ttk = bossLife / Math.max(1, d.dps);
  const resRow = (t) => {
    const eff = effectiveRes(s, t, area);
    const low = eff < 0 ? 'neg' : eff < 30 ? 'low' : '';
    return `<div class="kv"><span>${dt(t)} res</span><b class="${low}">${fmt(eff)}% <span class="muted">/ ${s.maxRes[t]}%</span></b></div>`;
  };
  return `
    <div class="level-row"><span class="level">Level ${ch.level}</span><span class="muted small">${fmt(ch.xp)} / ${fmt(need)} XP</span></div>
    ${bar('xp', ch.xp, need, '')}
    ${bar('life', Math.max(0, p.life), s.life, `Life ${fmt(Math.max(0, p.life))} / ${fmt(s.life)}`)}
    ${bar('mana', p.mana, s.mana, `Mana ${fmt(p.mana)} / ${fmt(s.mana)}`)}
    ${p.blight && p.blight.length ? `<div class="blight small">Blight ×${p.blight.length}: losing ${fmt(p.blight.reduce((a, b) => a + b.dps, 0) * (1 - effectiveRes(s, 'chaos', area) / 100))} life per second</div>` : ''}
    <h3>Offence <span class="muted small">${s.skill.name}${s.skill.supports.length ? ` + ${s.skill.supports.length} support${s.skill.supports.length > 1 ? 's' : ''}` : ''}</span></h3>
    <div class="kv"><span>Damage per second</span><b>${fmt(d.dps)}</b></div>
    <div class="kv"><span>Hit</span><b>${fmt(d.hitMin)}–${fmt(d.hitMax)}</b></div>
    <div class="kv"><span>${s.skill.kind === 'attack' ? 'Attacks' : 'Casts'} per second</span><b>${d.aps.toFixed(2)}</b></div>
    <div class="kv"><span>Targets per use</span><b>${d.targets}${d.splash ? ` <span class="muted">+${d.splash} splash</span>` : ''}</b></div>
    ${ailmentRows(d)}
    <div class="kv"><span>Crit chance / multiplier</span><b>${fmt1(d.critChance)}% / ${Math.round(d.critMulti * 100)}%</b></div>
    ${d.lifeCost
      ? `<div class="kv"><span>Life per use</span><b>${fmt1(d.manaCost)}</b></div>`
      : `<div class="kv"><span>Mana per second</span><b class="${d.manaPerSecond > s.manaRegen ? 'low' : ''}">${fmt1(d.manaPerSecond)} <span class="muted">(regen ${fmt1(s.manaRegen)})</span></b></div>`}
    <h3>Defence</h3>
    <div class="kv"><span>Armour</span><b>${fmt(s.armour)}</b></div>
    <div class="kv"><span>Evasion</span><b>${fmt(s.evasion)}</b></div>
    <div class="kv"><span>Life regen</span><b>${fmt1(s.lifeRegen)}/s</b></div>
    ${['fire', 'cold', 'lightning', 'chaos'].map(resRow).join('')}
    <h3>Max hit you can survive</h3>
    <div class="maxhit">${DAMAGE_TYPES.map((t) => `<div><span class="dot dot-${t}"></span>${cap(t)}<b>${fmt(mh[t])}</b></div>`).join('')}</div>
    <div class="kv boss-ttk"><span>Time to kill ${esc(zone.boss.name)}</span><b>${fmt(ttk)}s</b></div>
  `;
}

// ---------- Run (live) ----------

export function renderRun(state) {
  const run = state.run;
  const zone = getZone(run.zoneId);
  let phase = '';
  if (run.phase === 'travel') phase = run.packIndex >= zone.packs ? 'Approaching the boss…' : 'Walking to the next pack…';
  else if (run.phase === 'dead') phase = `<span class="neg">You died.</span> Respawning in ${Math.ceil(run.timer)}s.`;
  else if (run.phase === 'done') phase = '<span class="good">Zone cleared.</span> Starting the next run…';
  const progress = run.packIndex >= zone.packs ? 'Boss' : `Pack ${Math.min(run.packIndex + 1, zone.packs)} of ${zone.packs}`;
  let monsters = '';
  if (run.phase === 'fight' && run.pack) {
    const alive = run.pack.monsters.filter((m) => m.life > 0).length;
    monsters = `<div class="pack-head">${alive} of ${run.pack.monsters.length} alive</div>` + run.pack.monsters.map((m) => {
      const dead = m.life <= 0;
      const warn = m.bigHit && m.bigHit.warned ? '<span class="windup">Winding up a heavy blow</span>' : '';
      const tags = dead ? '' : Object.entries(m.status || {}).map(([k, v]) => STATUS[k](v)).join('');
      return `<div class="mon ${dead ? 'dead' : ''} r-${m.rarity}">
        <span class="mon-name"><span class="dot dot-${m.damageType}" title="${m.damageType} damage"></span>${esc(m.name)}</span>
        <span class="mon-bar">${bar('mlife', Math.max(0, m.life), m.maxLife, dead ? 'dead' : `${fmt(Math.max(0, m.life))}`)}${tags ? `<span class="tags">${tags}</span>` : ''}</span>${warn}</div>`;
    }).join('');
  } else {
    monsters = `<div class="phase">${phase}</div>`;
  }
  return `
    <div class="run-head">
      <div><h2>${esc(zone.name)}</h2><div class="muted small">Monster level ${zone.level} · ${progress}</div>${zoneResPenalty(zone.id) ? `<div class="small warn-line">Your elemental resistances are ${zoneResPenalty(zone.id)}% lower here.</div>` : ''}</div>
      <div class="mix">${mixShares(zone).map((m) => threatChip(m, zone)).join('')}<span class="chip threat"><span class="dot dot-${zone.boss.damageType}"></span>Boss: ${esc(zone.boss.name)}<span class="muted">${resText(zone.boss.res)}</span></span></div>
    </div>
    <div class="monsters">${monsters}</div>`;
}

export function renderLog(state) {
  const items = state.log.slice(-60).reverse();
  return items.map((l) => `<li class="log-${l.cls.split(' ').join(' log-')}"><span class="t">${timeAgo(l.t)}</span>${esc(l.text)}</li>`).join('');
}

// ---------- Diagnosis (live) ----------

export function renderDiagnosis(state) {
  const s = getStats(state);
  const d = diagnose(state, s);
  let body;
  if (!d.stalled) {
    body = `<div class="diag-badge ok">Progressing</div>
      <p class="muted">No stall in ${esc(getZone(state.run.zoneId).name)} over your last ${d.runsConsidered} run${d.runsConsidered === 1 ? '' : 's'}. When the character gets stuck, the cause shows here.</p>`;
  } else {
    const p = d.primary;
    body = `<div class="diag-badge stalled">Stalled · ${p.state}</div>
      <div class="cause primary"><p>${esc(p.message)}</p>${p.detail ? `<p class="muted small">${esc(p.detail)}</p>` : ''}
      <p class="lookat">Look at: <b>${esc(p.lookAt)}</b></p></div>
      ${d.secondary.map((c) => `<div class="cause"><div class="cause-state">${c.state}</div><p>${esc(c.message)}</p><p class="lookat">Look at: <b>${esc(c.lookAt)}</b></p></div>`).join('')}`;
  }
  const recent = state.runHistory.slice(-8).reverse();
  const runs = recent.length
    ? `<ul class="runs">${recent.map((r) => `<li><span class="zone-tag">${typeof r.zoneId === 'number' ? `Z${r.zoneId}` : 'Map'}</span><span class="${r.outcome === 'died' ? 'neg' : 'good'}">${r.outcome === 'died' ? 'Died' : 'Cleared'}</span><span class="muted">${r.outcome === 'died' ? `pack ${Math.min(r.packs.length + 1, 10)}${r.bossStart != null ? ' (boss)' : ''}` : `${Math.round(r.end - r.start)}s`}</span><span class="muted">+${r.items} items</span></li>`).join('')}</ul>`
    : '<p class="muted small">No finished runs yet.</p>';
  return `${body}<h3>Recent runs</h3>${runs}
    <p class="muted small totals">${fmt(state.lifetime.kills)} kills · ${fmt(state.lifetime.deaths)} deaths · ${fmt(state.lifetime.runs)} runs</p>`;
}

// ---------- Gear & crafting ----------

function itemCard(item, { equippedIn = null } = {}) {
  const b = BASES[item.baseId];
  const lines = item.mods.map((m) => {
    const fam = MODS[m.family];
    return `<li><span class="affix" title="${fam.type}">${fam.type === 'prefix' ? 'P' : 'S'}</span><span class="tier">T${m.tier}</span>${esc(modText(m))}${m.smithed ? ' <span class="muted small">(Smith)</span>' : ''}</li>`;
  }).join('');
  return `<div class="item-card r-${item.rarity}">
    <div class="item-name">${esc(itemTitle(item))}${item.locked ? ' <span class="lock" title="Locked: bulk salvage skips it">locked</span>' : ''}</div>
    <div class="item-sub">${cap(item.rarity)} ${esc(b.name)} · ${SLOT_NAMES[b.slot]} · item level ${item.ilvl}${equippedIn ? ` · <b>equipped as ${SLOT_NAMES[equippedIn]}</b>` : ''}</div>
    <div class="item-base">${esc(baseLine(item))}</div>
    ${lines ? `<ul class="mods">${lines}</ul>` : '<div class="muted small">No mods.</div>'}
  </div>`;
}

function compareRows(cur, alt, zoneId, heading = 'If equipped') {
  const mhA = maxHitTaken(cur, zoneId);
  const mhB = maxHitTaken(alt, zoneId);
  const rows = [
    ['Damage per second', cur.damage.dps, alt.damage.dps],
    ['Targets per use', cur.damage.targets, alt.damage.targets],
    ['Crit chance', cur.damage.critChance, alt.damage.critChance, '%'],
    ['Uses per second', cur.damage.aps, alt.damage.aps, '', 2],
    ['Mana regen /s', cur.manaRegen, alt.manaRegen, '', 1],
    ['Life', cur.life, alt.life],
    ['Mana', cur.mana, alt.mana],
    ['Armour', cur.armour, alt.armour],
    ['Evasion', cur.evasion, alt.evasion],
    ['Fire resistance', cur.res.fire, alt.res.fire, '%'],
    ['Cold resistance', cur.res.cold, alt.res.cold, '%'],
    ['Lightning resistance', cur.res.lightning, alt.res.lightning, '%'],
    ['Life regen /s', cur.lifeRegen, alt.lifeRegen],
    ['Max physical hit', mhA.physical, mhB.physical],
    ['Max fire hit', mhA.fire, mhB.fire],
    ['Max cold hit', mhA.cold, mhB.cold],
    ['Max lightning hit', mhA.lightning, mhB.lightning],
  ];
  const show = (v, dec) => (dec ? v.toFixed(dec) : fmt(v));
  const out = rows.filter(([, a, b, , dec = 0]) => Math.abs(a - b) >= 0.5 / 10 ** dec).map(([label, a, b, unit = '', dec = 0]) => {
    const diff = b - a;
    return `<tr><td>${label}</td><td>${show(a, dec)}${unit}</td><td>${show(b, dec)}${unit}</td><td class="${diff > 0 ? 'good' : 'neg'}">${diff > 0 ? '+' : '−'}${show(Math.abs(diff), dec)}${unit}</td></tr>`;
  });
  return out.length ? `<div class="table-wrap"><table class="compare"><thead><tr><th>${heading}</th><th>Now</th><th>After</th><th>Change</th></tr></thead><tbody>${out.join('')}</tbody></table></div>` : '<p class="muted small">This changes none of your main numbers.</p>';
}

function craftPanel(state, item) {
  const buttons = CURRENCY_ORDER.map((c) => {
    const reason = canCraft(c, item, state.currency);
    return `<button class="cur-btn" data-action="craft" data-cur="${c}" data-uid="${item.uid}" ${reason ? 'disabled' : ''} title="${esc(reason || CURRENCY[c].effect)}">
      <span>${CURRENCY[c].name}</span><span class="count">${state.currency[c]}</span><span class="cur-eff">${esc(CURRENCY[c].effect)}</span></button>`;
  }).join('');
  const opts = smithOptions(item, smithDiscount(state));
  const smith = opts.length
    ? `<div class="smith"><label for="smith-select">The Smith adds one mod of your choice</label>
        <div class="smith-row"><select id="smith-select">${opts.map((o) => `<option value="${o.family}">${esc(MODS[o.family].name)} (${MODS[o.family].type}, T${o.tier}) · ${o.cost} Scrap</option>`).join('')}</select>
        <button data-action="smith" data-uid="${item.uid}">Craft</button></div>
        <div class="muted small">You have ${fmt(state.scrap)} Scrap.${item.rarity === 'normal' ? ' A Normal item becomes Magic.' : ''}</div></div>`
    : `<div class="smith muted small">The Smith can't add anything here: no open mod slots. Ash resets the item to Normal.</div>`;
  let rules = '';
  if (leagueAutomationUnlocked(state, 'craftRules')) {
    const fams = Object.keys(MODS).filter((f) => MODS[f].slots.includes(BASES[item.baseId].slot) && MODS[f].tiers.some((t) => t.ilvl <= item.ilvl));
    rules = `<div class="smith"><label for="cr-fam">Craft rule: repeat a currency until a mod appears</label>
      <div class="smith-row"><select id="cr-cur" aria-label="Currency">${['tempest', 'wildfire', 'kindling', 'forge', 'crown'].map((c) => `<option value="${c}">${CURRENCY[c].name} (${state.currency[c]})</option>`).join('')}</select>
      <select id="cr-fam">${fams.map((f) => `<option value="${f}">${esc(MODS[f].name)}</option>`).join('')}</select>
      <input id="cr-max" type="number" min="1" max="500" value="20" aria-label="Spend at most" class="num">
      <button data-action="craft-until" data-uid="${item.uid}">Repeat</button></div>
      <div class="muted small">Stops when the mod appears, the item can't take that currency, or the limit is spent.</div></div>`;
  }
  return `<div class="craft"><h4>Crafting</h4><div class="cur-grid">${buttons}</div>${smith}${rules}</div>`;
}

// What equipping `item` would change, as a few short chips, plus a sort score.
function changeSummary(state, cur, item) {
  const slots = slotsForType(BASES[item.baseId].slot);
  let best = null;
  for (const slot of slots) {
    const alt = statsWithItem(state, item, slot);
    const dps = cur.damage.dps > 0 ? alt.damage.dps / cur.damage.dps - 1 : 0;
    const life = alt.life - cur.life;
    const resSum = (x) => ['fire', 'cold', 'lightning', 'chaos'].reduce((a, t) => a + Math.min(x.res[t], x.maxRes[t]), 0);
    const res = resSum(alt) - resSum(cur);
    const def = (alt.armour + alt.evasion) - (cur.armour + cur.evasion);
    const score = dps + life / Math.max(1, cur.life) + res / 150 + def / (cur.armour + cur.evasion + 300);
    if (!best || score > best.score) best = { slot, dps, life, res, def, score };
  }
  const chips = [];
  if (Math.abs(best.dps) >= 0.01) chips.push([Math.abs(best.dps) * 3, `${best.dps > 0 ? '+' : '−'}${Math.round(Math.abs(best.dps) * 100)}% DPS`, best.dps > 0]);
  if (Math.abs(best.life) >= 1) chips.push([Math.abs(best.life) / Math.max(1, cur.life) * 3, `${best.life > 0 ? '+' : '−'}${fmt(Math.abs(best.life))} life`, best.life > 0]);
  if (Math.abs(best.res) >= 1) chips.push([Math.abs(best.res) / 50, `${best.res > 0 ? '+' : '−'}${fmt(Math.abs(best.res))}% res`, best.res > 0]);
  if (Math.abs(best.def) >= 1) chips.push([Math.abs(best.def) / (cur.armour + cur.evasion + 300), `${best.def > 0 ? '+' : '−'}${fmt(Math.abs(best.def))} def`, best.def > 0]);
  chips.sort((a, b) => b[0] - a[0]);
  return { ...best, chips: chips.slice(0, 3).map(([, t, good]) => `<span class="chg ${good ? 'up' : 'down'}">${t}</span>`).join('') };
}

const RARITY_RANK = { normal: 0, magic: 1, rare: 2 };

export function renderGear(state, ui) {
  const sel = ui.selectedUid != null ? findItem(state, ui.selectedUid) : null;
  const cur = getStats(state);
  const equipped = EQUIP_SLOTS.map((slot) => {
    const it = state.character.equipment[slot];
    return `<button class="slot ${sel && sel.item === it ? 'selected' : ''}" data-action="select" data-uid="${it ? it.uid : ''}" ${it ? '' : 'disabled'}>
      <span class="slot-name">${SLOT_NAMES[slot]}</span>
      ${it ? `<span class="slot-item r-${it.rarity}">${esc(itemTitle(it))}</span><span class="muted small">${esc(BASES[it.baseId].name)} · ${it.mods.length} mod${it.mods.length === 1 ? '' : 's'}</span>` : '<span class="muted small">Empty</span>'}
    </button>`;
  }).join('');

  const conv = CONVERSIONS.map((c, i) => `<button class="small-btn" data-action="convert" data-idx="${i}" ${(state.currency[c.from] || 0) < c.amount ? 'disabled' : ''}>${c.amount} ${CURRENCY[c.from].name} → 1 ${CURRENCY[c.to].name}</button>`).join('');
  const wallet = `<div class="wallet">${CURRENCY_ORDER.map((c) => `<span class="coin"><b>${state.currency[c]}</b> ${CURRENCY[c].name}</span>`).join('')}<span class="coin scrap"><b>${fmt(state.scrap)}</b> Scrap</span></div><div class="conv">${conv}</div>`;

  // Inventory: filter, search, sort.
  const filter = ui.filter || 'all';
  const rarity = ui.rarity || 'all';
  const sort = ui.sort || 'new';
  const q = (ui.search || '').trim().toLowerCase();
  let list = state.inventory.map((it, idx) => ({ it, idx }))
    .filter(({ it }) => filter === 'all' || BASES[it.baseId].slot === filter)
    .filter(({ it }) => rarity === 'all' || it.rarity === rarity)
    .filter(({ it }) => !q || `${itemTitle(it)} ${BASES[it.baseId].name} ${baseLine(it)} ${it.mods.map(modText).join(' ')}`.toLowerCase().includes(q));
  list = list.map((e) => ({ ...e, ch: changeSummary(state, cur, e.it) }));
  const sorters = {
    new: (a, b) => b.idx - a.idx,
    upgrade: (a, b) => b.ch.score - a.ch.score,
    rarity: (a, b) => RARITY_RANK[b.it.rarity] - RARITY_RANK[a.it.rarity] || b.it.ilvl - a.it.ilvl,
    ilvl: (a, b) => b.it.ilvl - a.it.ilvl || b.idx - a.idx,
    type: (a, b) => ITEM_TYPES.indexOf(BASES[a.it.baseId].slot) - ITEM_TYPES.indexOf(BASES[b.it.baseId].slot) || b.idx - a.idx,
  };
  list.sort(sorters[sort] || sorters.new);
  const advisor = leagueAutomationUnlocked(state, 'upgradeAdvisor');

  const counts = {};
  for (const it of state.inventory) counts[BASES[it.baseId].slot] = (counts[BASES[it.baseId].slot] || 0) + 1;
  const filters = ['all', ...ITEM_TYPES].map((f) => `<button class="tab-chip ${filter === f ? 'on' : ''}" data-action="filter" data-filter="${f}" aria-pressed="${filter === f}">${f === 'all' ? 'All' : SLOT_NAMES[f]}${f !== 'all' && counts[f] ? ` <span class="muted">${counts[f]}</span>` : ''}</button>`).join('');
  const opt = (v, label, curV) => `<option value="${v}" ${curV === v ? 'selected' : ''}>${label}</option>`;
  const controls = `<div class="inv-controls">
      <input id="inv-search" type="search" placeholder="Search mods, e.g. fire res" value="${esc(ui.search || '')}" data-input="search" aria-label="Search inventory">
      <select id="inv-rarity" data-change="rarity" aria-label="Rarity">${opt('all', 'All rarities', rarity)}${opt('rare', 'Rare', rarity)}${opt('magic', 'Magic', rarity)}${opt('normal', 'Normal', rarity)}</select>
      <select id="inv-sort" data-change="sort" aria-label="Sort">${opt('new', 'Newest', sort)}${opt('upgrade', 'Best upgrade', sort)}${opt('rarity', 'Rarity', sort)}${opt('ilvl', 'Item level', sort)}${opt('type', 'Type', sort)}</select>
    </div>`;
  const rows = list.length
    ? list.map(({ it, ch }) => `<button class="inv-row ${sel && sel.item === it ? 'selected' : ''}" data-action="select" data-uid="${it.uid}">
        <span class="r-${it.rarity} inv-name">${advisor && ch.score > 0.03 ? '<span class="adv">Upgrade</span> ' : ''}${esc(itemTitle(it))}${it.locked ? ' <span class="lock">locked</span>' : ''}</span>
        <span class="muted small">${SLOT_NAMES[BASES[it.baseId].slot]} · ilvl ${it.ilvl}</span>
        <span class="inv-mods small">${it.mods.map((m) => esc(modText(m))).join(' · ') || `<span class="muted">${esc(BASES[it.baseId].name)}, no mods</span>`}</span>
        <span class="chgs">${ch.chips || '<span class="muted small">no change</span>'}</span></button>`).join('')
    : `<p class="muted small empty">${state.inventory.length ? 'Nothing matches these filters.' : 'No items yet. Items drop from monsters and are picked up when a pack dies.'}</p>`;

  let detail = '<p class="muted">Select an item to inspect, compare and craft it. You can craft on equipped items too.</p><p class="muted small">The chips on each item show what equipping it would change. For rings, they compare against whichever ring it would replace best.</p>';
  if (sel) {
    const item = sel.item;
    const isEq = sel.where !== 'inventory';
    const type = BASES[item.baseId].slot;
    let actions;
    let compare = '';
    if (isEq) {
      actions = `<button data-action="unequip" data-slot="${sel.where}">Unequip</button>`;
    } else {
      const slots = slotsForType(type);
      const target = slots.includes(ui.compareSlot) ? ui.compareSlot : changeSummary(state, cur, item).slot;
      actions = slots.map((sl) => {
        const occupant = state.character.equipment[sl];
        const label = slots.length > 1 ? `Equip as ${SLOT_NAMES[sl]}` : 'Equip';
        return `<button class="${sl === target ? 'primary' : ''}" data-action="equip" data-uid="${item.uid}" data-slot="${sl}" title="${occupant ? `Replaces ${esc(itemTitle(occupant))}` : 'Slot is empty'}">${label}</button>`;
      }).join('') + `<button data-action="salvage" data-uid="${item.uid}">Salvage (+${salvageValue(item)} Scrap)</button>`;
      const tabs = slots.length > 1
        ? `<div class="cmp-tabs">${slots.map((sl) => `<button class="tab-chip ${sl === target ? 'on' : ''}" data-action="compare-slot" data-slot="${sl}">vs ${SLOT_NAMES[sl]}${state.character.equipment[sl] ? '' : ' (empty)'}</button>`).join('')}</div>` : '';
      compare = tabs + compareRows(cur, statsWithItem(state, item, target), state.zoneId, slots.length > 1 ? `If equipped as ${SLOT_NAMES[target]}` : 'If equipped');
    }
    detail = `${itemCard(item, { equippedIn: isEq ? sel.where : null })}
      <div class="actions">${actions}<button data-action="lock" data-uid="${item.uid}">${item.locked ? 'Unlock' : 'Lock'}</button></div>
      ${compare}${craftPanel(state, item)}`;
  }

  return `<div class="gear-grid">
    <section class="gear-left">
      <h3>Equipped</h3><div class="slots">${equipped}</div>
      <h3>Currency</h3>${wallet}
      <h3>Inventory <span class="muted small">${state.inventory.length} / ${RULES.inventorySize}${list.length !== state.inventory.length ? ` · showing ${list.length}` : ''}</span></h3>
      <div class="filters">${filters}</div>
      ${controls}
      <div class="bulk"><button class="small-btn" data-action="salvage-all" data-rarity="normal">Salvage all Normal</button><button class="small-btn" data-action="salvage-all" data-rarity="magic">Salvage all Magic</button><span class="muted small">Ctrl+click an item to salvage it. Locked items are skipped.</span></div>
      <div class="inv">${rows}</div>
    </section>
    <section class="gear-right">${detail}</section>
  </div>`;
}

// ---------- Character sheet (breakdown) ----------

export function renderSheet(state) {
  const s = getStats(state);
  const d = s.damage;
  const src = (key, unit = '') => {
    const list = s.sources[key];
    if (!list || !list.length) return '<li class="muted">No sources.</li>';
    return list.map((m) => `<li><span>${esc(m.source)}</span><b>${m.kind === 'increased' ? `${m.value}% increased` : m.kind === 'more' ? `${m.value}% more` : `${key === 'addedPhys' ? `${m.value}–${m.value * 2}` : `+${m.value}`}${unit}`}</b></li>`).join('');
  };
  const row = (label, value, key, unit) => `<details><summary><span>${label}</span><b>${value}</b></summary><ul class="sources">${src(key, unit)}</ul></details>`;
  return `<div class="sheet-grid">
    <section>
      <h3>How your damage is built</h3>
      <p class="muted small">Increased bonuses add together, then apply once. More multipliers each multiply separately, which makes them stronger as you stack them.</p>
      ${d.parts.map((p) => `<table class="formula"><tbody>
        <tr><td colspan="2"><b>${dt(p.type)} damage</b>${p.convertedFrom ? ` <span class="muted small">(converted from ${p.convertedFrom})</span>` : ''}</td></tr>
        <tr><td>Base${s.skill.kind === 'attack' ? ' (weapon + added)' : ` (${s.skill.name} at level ${s.level})`}</td><td>${fmt1(p.baseMin)}–${fmt1(p.baseMax)}</td></tr>
        <tr><td>× (1 + increased)</td><td>× ${(1 + p.increased / 100).toFixed(2)} <span class="muted">(${p.increased}% total)</span></td></tr>
        <tr><td>× more multipliers</td><td>× ${p.more.toFixed(2)}</td></tr>
        <tr><td>= Damage per hit</td><td>${fmt(p.hitMin)}–${fmt(p.hitMax)}</td></tr>
      </tbody></table>`).join('')}
      <table class="formula"><tbody>
        <tr><td>Total damage per hit</td><td>${fmt(d.hitMin)}–${fmt(d.hitMax)} <span class="muted">avg ${fmt1(d.avgHit)}</span></td></tr>
        <tr><td>× uses per second</td><td>× ${d.aps.toFixed(2)} <span class="muted">(base ${d.speedBase.toFixed(2)}, +${d.speedInc}%)</span></td></tr>
        <tr><td>× crit factor</td><td>× ${d.critFactor.toFixed(3)} <span class="muted">(${fmt1(d.critChance)}% × ${Math.round(d.critMulti * 100)}%)</span></td></tr>
        <tr class="total"><td>= Damage per second (one target)</td><td>${fmt(d.dps)}</td></tr>
        <tr><td>Targets per use</td><td>${d.targets}${d.splash ? ` + ${d.splash} splash at ${Math.round(d.splashMult * 100)}%` : ''}</td></tr>
      </tbody></table>
      <h3>Offence sources</h3>
      ${row('Increased damage (all)', `${s.sources.damage.filter((m) => m.kind === 'increased').reduce((a, m) => a + m.value, 0)}%`, 'damage')}
      ${row('Increased physical damage', `${s.sources.physical.reduce((a, m) => a + m.value, 0)}%`, 'physical')}
      ${row('Increased spell damage', `${s.sources.spell.reduce((a, m) => a + m.value, 0)}%`, 'spell')}
      ${row('Increased elemental damage', `${s.sources.elemental.reduce((a, m) => a + m.value, 0)}%`, 'elemental')}
      ${row('Increased cast speed', `${s.sources.castSpeed.reduce((a, m) => a + m.value, 0)}%`, 'castSpeed')}
      ${row('Added physical damage', `${d.added}–${d.added * 2}`, 'addedPhys')}
      ${row('Increased attack speed', `${s.sources.attackSpeed.reduce((a, m) => a + m.value, 0)}%`, 'attackSpeed')}
      ${row('Increased crit chance', `${s.sources.critChance.reduce((a, m) => a + m.value, 0)}%`, 'critChance')}
      ${row('Crit multiplier', `${Math.round(d.critMulti * 100)}%`, 'critMulti', '%')}
    </section>
    <section>
      <h3>Defence sources</h3>
      <p class="muted small">Tap a stat to see where it comes from.</p>
      ${row('Maximum life', fmt(s.life), 'life')}
      ${row('Maximum mana', fmt(s.mana), 'mana')}
      ${row('Armour', fmt(s.armour), 'armour')}
      ${row('Evasion', fmt(s.evasion), 'evasion')}
      ${row('Fire resistance', `${s.res.fire}%`, 'fireRes', '%')}
      ${row('Cold resistance', `${s.res.cold}%`, 'coldRes', '%')}
      ${row('Lightning resistance', `${s.res.lightning}%`, 'lightningRes', '%')}
      ${row('Life regeneration', `${fmt1(s.lifeRegen)}/s`, 'lifeRegen', '/s')}
      <h3>Rules</h3>
      <ul class="rules small">
        <li>Armour reduces a physical hit by Armour ÷ (Armour + 5 × hit), up to 90%. Strong against small hits, weak against big ones.</li>
        <li>Evasion avoids physical attacks entirely: Evasion ÷ (Evasion + 100 + 10 × monster level), up to 75%.</li>
        <li>Resistances reduce elemental damage, capped at 75%.</li>
        <li>Dying ends the run, loses loot from the current pack and 10% of a level's XP. You never lose a level.</li>
      </ul>
    </section>
  </div>`;
}

// ---------- Skills & supports ----------

function skillSummary(st) {
  const d = st.damage;
  return `${ailmentRows(d)}<div class="kv"><span>Damage per second</span><b>${fmt(d.dps)}</b></div>
    <div class="kv"><span>Targets</span><b>${d.targets}${d.splash ? ` +${d.splash} splash` : ''}</b></div>
    <div class="kv"><span>${d.lifeCost ? 'Life' : 'Mana'} per use</span><b>${fmt1(d.manaCost)}</b></div>`;
}

export function renderSkills(state) {
  const cur = getStats(state);
  const sk = state.character.skill;
  const slots = supportSlots(state);

  const cards = SKILL_ORDER.map((id) => {
    const S = SKILLS[id];
    const on = sk.id === id;
    const preview = on ? cur : statsWithSkill(state, { id, supports: sk.supports.filter((x) => supportFits(x, id)) });
    return `<button class="skill-card ${on ? 'selected' : ''}" data-action="skill" data-skill="${id}" aria-pressed="${on}">
      <span class="skill-name"><span class="dot dot-${S.damageType}"></span>${S.name}${on ? ' <span class="muted small">equipped</span>' : ''}</span>
      <span class="muted small">${S.tags.join(' · ')}</span>
      <span class="small">${esc(S.description)}</span>
      <span class="skill-stats">${skillSummary(preview)}</span>
    </button>`;
  }).join('');

  const linkRows = [];
  for (let i = 0; i < LINKS.unlocks[LINKS.unlocks.length - 1].slots - 1; i++) {
    if (i >= slots) {
      const u = LINKS.unlocks.find((x) => x.slots - 1 > i);
      linkRows.push(`<div class="link locked"><span class="link-num">${i + 1}</span><span class="muted">Locked · opens on first clear of zone ${u.zone}</span></div>`);
      continue;
    }
    const curId = sk.supports[i] || '';
    const options = state.ownedSupports
      .filter((id) => supportFits(id, sk.id) && (id === curId || !sk.supports.includes(id)))
      .map((id) => `<option value="${id}" ${id === curId ? 'selected' : ''}>${esc(SUPPORTS[id].name)}: ${esc(SUPPORTS[id].text)} (mana ×${SUPPORTS[id].manaMult})</option>`).join('');
    const disabled = i > sk.supports.length;
    linkRows.push(`<div class="link"><span class="link-num">${i + 1}</span>
      <select id="link-${i}" data-change="support" data-slot="${i}" ${disabled ? 'disabled' : ''} aria-label="Support slot ${i + 1}">
        <option value="">${disabled ? 'Fill the slot above first' : 'Empty'}</option>${options}</select></div>`);
  }

  const d = cur.damage;
  const manaWarn = !d.lifeCost && d.manaPerSecond > cur.manaRegen
    ? `<p class="warn small">Your skill uses ${fmt1(d.manaPerSecond)} mana per second but you only regenerate ${fmt1(cur.manaRegen)}. You will run dry in long fights.</p>` : '';

  const free = sk.supports.length < slots;
  const owned = SUPPORT_ORDER.map((id) => {
    const S = SUPPORTS[id];
    const have = state.ownedSupports.includes(id);
    const fits = supportFits(id, sk.id);
    const linked = sk.supports.includes(id);
    let note = '';
    if (!have) note = '<span class="muted">Not found yet</span>';
    else if (!fits) note = `<span class="muted">Needs a ${S.requires.join(' or ')} skill</span>`;
    else if (linked) note = '<span class="good">Linked</span>';
    else if (free) {
      const alt = statsWithSkill(state, { id: sk.id, supports: [...sk.supports, id] }).damage;
      const dd = alt.dps - d.dps;
      note = `If added: ${fmt(d.dps)} → <b>${fmt(alt.dps)}</b> DPS <span class="${dd >= 0 ? 'good' : 'neg'}">(${dd >= 0 ? '+' : '−'}${fmt(Math.abs(dd))})</span>${alt.targets !== d.targets ? `, ${alt.targets} targets` : ''}, ${fmt1(alt.manaCost)} mana per use`;
    } else note = '<span class="muted">No free link slot</span>';
    return `<li class="${have ? '' : 'unowned'}"><b>${S.name}</b> <span class="small">${esc(S.text)} · mana ×${S.manaMult}${S.requires ? ` · ${S.requires.join('/')} only` : ''}${S.needs ? ` · needs ${S.needs}` : ''}</span><div class="small">${note}</div></li>`;
  }).join('');

  return `<div class="skills-grid">
    <section>
      <h3>Active skill</h3>
      <div class="skill-cards">${cards}</div>
    </section>
    <section>
      <h3>Linked supports <span class="muted small">${sk.supports.length} / ${slots}</span></h3>
      <div class="links">${linkRows.join('')}</div>
      <div class="link-total">
        <div class="kv"><span>Damage per second</span><b>${fmt(d.dps)}</b></div>
        <div class="kv"><span>Uses per second</span><b>${d.aps.toFixed(2)}</b></div>
        <div class="kv"><span>Targets</span><b>${d.targets}${d.splash ? ` +${d.splash} splash` : ''}</b></div>
        <div class="kv"><span>${d.lifeCost ? 'Life' : 'Mana'} per use</span><b>${fmt1(d.manaCost)} <span class="muted">(base ${SKILLS[sk.id].manaCost} × ${d.manaMult.toFixed(2)})</span></b></div>
        ${d.lifeCost ? '' : `<div class="kv"><span>Mana per second / regen</span><b>${fmt1(d.manaPerSecond)} / ${fmt1(cur.manaRegen)}</b></div>`}
      </div>
      ${manaWarn}
      <p class="muted small">Each support multiplies the skill's mana cost. "More" bonuses from supports multiply each other, so two 40% more supports give 96% more, not 80%.</p>
      <h3>Support gems</h3>
      <ul class="support-list">${owned}</ul>
      <p class="muted small">Every zone's first clear gives a new support. Repeat boss kills have a ${Math.round(LINKS.bossDropChance * 100)}% chance.</p>
    </section>
  </div>`;
}

// ---------- Passive tree ----------

const SCALE = 46;

export function nodeLines(node) {
  return node.text ? node.text : node.mods.map(statModText);
}

// Small nodes are named after what they give.
export function nodeName(node) {
  return node.type === 'small' ? nodeLines(node).join(', ') : node.name;
}

export function renderTree(state, ui) {
  const have = new Set(state.character.passives);
  const points = passivePoints(state);
  const spent = passivesSpent(state);
  const free = points - spent;
  const xs = Object.values(PASSIVES).map((n) => n.x);
  const ys = Object.values(PASSIVES).map((n) => n.y);
  const pad = 2.6;
  const minX = (Math.min(...xs) - pad) * SCALE;
  const minY = (Math.min(...ys) - pad) * SCALE;
  const w = (Math.max(...xs) - Math.min(...xs) + pad * 2) * SCALE;
  const h = (Math.max(...ys) - Math.min(...ys) + pad * 2) * SCALE;

  const edges = [];
  const drawn = new Set();
  for (const n of Object.values(PASSIVES)) {
    for (const m of n.links) {
      const key = [n.id, m].sort().join('|');
      if (drawn.has(key)) continue;
      drawn.add(key);
      const o = PASSIVES[m];
      const on = have.has(n.id) && have.has(m);
      edges.push(`<line x1="${n.x * SCALE}" y1="${n.y * SCALE}" x2="${o.x * SCALE}" y2="${o.y * SCALE}" class="edge ${on ? 'on' : ''}"/>`);
    }
  }
  const R = { origin: 10, small: 7, notable: 11, keystone: 15 };
  const nodes = Object.values(PASSIVES).map((n) => {
    const on = have.has(n.id);
    const reachable = !on && n.links.some((l) => have.has(l));
    const cls = `node t-${n.type} ${on ? 'on' : reachable ? (free > 0 ? 'open' : 'near') : ''} ${ui.selectedNode === n.id ? 'sel' : ''}`;
    const cx = n.x * SCALE;
    const cy = n.y * SCALE;
    const shape = n.type === 'keystone'
      ? `<rect x="${cx - R.keystone}" y="${cy - R.keystone}" width="${R.keystone * 2}" height="${R.keystone * 2}" rx="3" transform="rotate(45 ${cx} ${cy})"/>`
      : `<circle cx="${cx}" cy="${cy}" r="${R[n.type]}"/>`;
    const label = n.type === 'keystone' || n.type === 'notable'
      ? `<text x="${cx}" y="${cy + R[n.type] + 15}" class="nlabel ${n.type}">${esc(n.name)}</text>` : '';
    const title = n.type === 'small' ? nodeName(n) : `${n.name}: ${nodeLines(n).join('; ')}`;
    return `<g class="${cls}" data-action="node" data-node="${n.id}" tabindex="0" role="button" aria-label="${esc(title)}" aria-pressed="${ui.selectedNode === n.id}"><title>${esc(title)}</title>${shape}${label}</g>`;
  }).join('');
  const regionLabels = PASSIVE_REGIONS.map((r) => {
    const a = (r.angle * Math.PI) / 180;
    return `<text x="${Math.cos(a) * 9.9 * SCALE}" y="${Math.sin(a) * 9.9 * SCALE + 6}" class="rlabel">${r.name}</text>`;
  }).join('');

  let detail = `<p class="muted">Click a node to see what it does and how it would change your character.</p>
    <ul class="small tree-help">
      <li>You get 1 point per level, plus 2 each for first clearing zones 5 and 10.</li>
      <li>Bridges between regions let you mix, e.g. attacks with life, or crits with spells.</li>
      <li>A node can be taken once it touches one you already have. <b>Ctrl+click</b> a node to allocate it straight away.</li>
      <li>Big diamond nodes are <b>keystones</b>: they change a rule of the game, with a real cost.</li>
      <li>Refunding a node costs ${refundCost(state)} Scrap at your level.</li>
    </ul>`;
  const sel = ui.selectedNode && PASSIVES[ui.selectedNode];
  if (sel) {
    const on = have.has(sel.id);
    const cur = getStats(state);
    const alt = statsWithPassives(state, on ? state.character.passives.filter((x) => x !== sel.id) : [...state.character.passives, sel.id]);
    const reason = on ? canRefund(state, sel.id) : canAllocate(state, sel.id);
    const typeName = { origin: 'Starting point', small: 'Passive', notable: 'Notable', keystone: 'Keystone' }[sel.type];
    const btn = sel.type === 'origin' ? '' : on
      ? `<button data-action="refund" data-node="${sel.id}" ${reason ? 'disabled' : ''}>Refund (${refundCost(state)} Scrap)</button>`
      : `<button class="primary" data-action="allocate" data-node="${sel.id}" ${reason ? 'disabled' : ''}>Allocate (1 point)</button>`;
    detail = `<div class="node-card t-${sel.type}">
        <div class="muted small">${typeName}${sel.region ? ` · ${cap(sel.region)}` : ''}${on ? ' · <span class="good">allocated</span>' : ''}</div>
        <div class="item-name">${esc(sel.type === 'small' ? 'Passive' : sel.name)}</div>
        <ul class="mods">${nodeLines(sel).map((l) => `<li>${esc(l)}</li>`).join('') || '<li class="muted">Where every build begins.</li>'}</ul>
      </div>
      <div class="actions">${btn}</div>
      ${reason && sel.type !== 'origin' ? `<p class="muted small">${esc(reason)}</p>` : ''}
      ${sel.type === 'origin' ? '' : compareRows(cur, alt, state.zoneId, on ? 'If refunded' : 'If allocated')}`;
  }

  return `<div class="tree-grid">
    <section class="tree-wrap">
      <div class="tree-head"><b class="${free > 0 ? 'good' : ''}">${free} point${free === 1 ? '' : 's'} to spend</b><span class="muted small">${spent} of ${points} used · ${Object.keys(PASSIVES).length - 1} nodes in the tree</span></div>
      <div class="tree-zoom"><button class="small-btn" data-action="tree-zoom" data-dir="in" aria-label="Zoom in">+</button><button class="small-btn" data-action="tree-zoom" data-dir="out" aria-label="Zoom out">−</button><button class="small-btn" data-action="tree-zoom" data-dir="fit">Fit</button><span class="muted small">Drag to move · scroll to zoom · Ctrl+click to allocate</span></div>
      <svg class="tree" id="tree-svg" viewBox="${ui.treeView ? ui.treeView.join(' ') : `${minX} ${minY} ${w} ${h}`}" data-full="${minX} ${minY} ${w} ${h}" role="group" aria-label="Passive tree">${edges.join('')}${regionLabels}${nodes}</svg>
    </section>
    <section class="tree-detail">${detail}</section>
  </div>`;
}

// ---------- Automation ----------

const FAMILY_GROUPS = [
  ['Defence', ['life', 'armour', 'ring_armour', 'evasion', 'piece_evasion', 'life_regen']],
  ['Resistances', ['fire_res', 'cold_res', 'lightning_res', 'chaos_res']],
  ['Attacks', ['phys_inc', 'added_phys', 'ring_added_phys', 'attack_speed']],
  ['Spells and elements', ['spell_inc', 'cast_speed', 'ring_ele_inc', 'ignite_chance', 'shock_chance', 'chill_effect']],
  ['General', ['amulet_damage', 'crit_chance', 'crit_multi', 'targets', 'mana', 'mana_regen']],
];

export function renderAutomation(state) {
  const a = state.automation;
  const check = (key, label, on) => `<label class="check"><input type="checkbox" id="auto-${key}" data-change="auto" data-key="${key}" ${on ? 'checked' : ''}> ${label}</label>`;
  const locked = (k) => `<p class="muted small">Locked. Unlocks on the first clear of zone ${AUTOMATION[k].zone}. ${AUTOMATION[k].text}</p>`;
  const salv = automationUnlocked(state, 'autoSalvage')
    ? `${check('salvageNormal', 'Salvage Normal items as they drop', a.salvageNormal)}`
    : locked('autoSalvage');
  let filter = locked('lootFilter');
  if (automationUnlocked(state, 'lootFilter')) {
    const groups = FAMILY_GROUPS.map(([title, fams]) => `<fieldset class="fam-group"><legend>${title}</legend>${fams.map((f) => {
      const fam = MODS[f];
      const where = fam.slots.length > 3 ? '' : ` <span class="muted">(${fam.slots.map((x) => SLOT_NAMES[x].toLowerCase()).join(', ')})</span>`;
      return `<label class="check"><input type="checkbox" id="keep-${f}" data-change="keep-family" data-family="${f}" ${a.keepFamilies.includes(f) ? 'checked' : ''}> ${esc(fam.name)}${where}</label>`;
    }).join('')}</fieldset>`).join('');
    const types = ITEM_TYPES.map((t) => `<label class="check"><input type="checkbox" id="keeptype-${t}" data-change="keep-type" data-type="${t}" ${(a.keepTypes || []).includes(t) ? 'checked' : ''}> ${SLOT_NAMES[t]}</label>`).join('');
    filter = `${check('salvageMagic', 'Salvage Magic items that have none of the mods below', a.salvageMagic)}
      ${check('salvageRare', 'Salvage Rare items that have none of the mods below', a.salvageRare)}
      <h4>Mods worth keeping</h4><div class="fam-grid">${groups}</div>
      <h4>Always keep these item types</h4><div class="type-row">${types}</div>`;
  }
  const last = state.runHistory.slice(-10);
  const auto = last.reduce((x, r) => x + (r.autoSalvaged || 0), 0);
  return `<div class="auto-grid">
    <section><h3>${AUTOMATION.autoSalvage.name}</h3>${salv}
      <h3>${AUTOMATION.lootFilter.name}</h3>${filter}
      ${auto ? `<p class="muted small">Your rules salvaged ${auto} items over the last ${last.length} runs.</p>` : ''}</section>
    <section><h3>Coming later</h3>
      <ul class="small muted tree-help">
        ${automationUnlocked(state, 'mapRunner') ? '' : `<li><b>Map runner</b>: runs maps from your stash automatically (first clear of a tier ${AUTOMATION.mapRunner.mapTier} map).</li>`}
        ${Object.entries(LEAGUE_AUTOMATION).map(([k, A]) => `<li><b>${A.name}</b>: ${A.text} ${leagueAutomationUnlocked(state, k) ? '<span class="good">Unlocked.</span>' : `Unlocks after ${A.resets === 1 ? 'your first league reset' : `${A.resets} league resets`}.`}</li>`).join('')}
      </ul>
      <p class="muted small">Salvaged items become Scrap, which the Smith and passive refunds use.</p></section>
  </div>`;
}

// ---------- Maps ----------

function mapRow(m, selected) {
  const L = MAP_LAYOUTS[m.layout];
  const iiq = mapIiq(m);
  return `<button class="inv-row ${selected ? 'selected' : ''}" data-action="select-map" data-uid="${m.uid}">
    <span class="r-${m.rarity} inv-name">Tier ${m.tier} · ${esc(L.name)}</span>
    <span class="muted small">${cap(m.rarity)}${iiq ? ` · +${iiq}% items` : ''}</span>
    <span class="inv-mods small">${m.mods.map((id) => MAP_MODS[id].name).join(' · ') || '<span class="muted">no mods</span>'}</span></button>`;
}

export function renderMaps(state, ui) {
  const mp = state.mapProgress;
  if (!state.maps.length && !mp.cleared.length && !state.progress.cleared.includes(10)) {
    return `<div class="help"><p>Maps are the endgame. The boss of zone 10 drops your first map; each map you clear can drop more.</p>
      <ul class="small muted tree-help">
        <li>Map tiers go from 1 to ${MAP_RULES.maxTier}. Monster level is ${mapLevel(1)} at tier 1 and rises by ${MAP_RULES.levelPerTier} per tier.</li>
        <li>Your elemental resistances are ${MAP_RULES.resPenalty}% lower in maps, and monsters resist elements more each tier.</li>
        <li>Map mods make a map harder but raise how many items drop.</li>
        <li>First clears of tiers ${MAP_RULES.bonusPointTiers.join(', ')} give 2 passive points each.</li>
      </ul></div>`;
  }
  const sel = state.maps.find((m) => m.uid === ui.selectedMap) || null;
  const list = state.maps.slice().sort((a, b) => b.tier - a.tier || b.uid - a.uid);
  const tiers = Array.from({ length: MAP_RULES.maxTier }, (_, i) => i + 1).map((t) => {
    const done = mp.cleared.includes(t);
    const bonus = MAP_RULES.bonusPointTiers.includes(t);
    return `<span class="tier-cell ${done ? 'done' : ''}" title="Tier ${t}${done ? ': cleared' : ''}${bonus ? ' · 2 passive points on first clear' : ''}">${t}${bonus ? '<i>+2</i>' : ''}</span>`;
  }).join('');
  let detail = '<p class="muted">Select a map to see its monsters, mods and rewards, then run it. Running a map uses it up, whether you clear it or die.</p>';
  if (sel) {
    const L = MAP_LAYOUTS[sel.layout];
    const total = L.mix.reduce((a, m) => a + m.weight, 0);
    const mix = (sel.mods.includes('teeming') ? [{ threat: 'swarm', weight: 1 }] : L.mix).map((m) => `${THREATS[m.threat].name}${m.element ? ` (${m.element})` : ''} ${sel.mods.includes('teeming') ? 100 : Math.round((m.weight / total) * 100)}%`).join(' · ');
    const locked = sel.tier > mp.highest + 1;
    const crafts = ['kindling', 'tempest', 'forge', 'wildfire', 'crown', 'ash'].map((c) => {
      const reason = canCraftMap(c, sel, state.currency);
      return `<button class="cur-btn" data-action="craft-map" data-cur="${c}" data-uid="${sel.uid}" ${reason ? 'disabled' : ''} title="${esc(reason || '')}"><span>${CURRENCY[c].name}</span><span class="count">${state.currency[c]}</span></button>`;
    }).join('');
    detail = `<div class="item-card r-${sel.rarity}">
        <div class="item-name">${esc(L.name)}</div>
        <div class="item-sub">${cap(sel.rarity)} map · tier ${sel.tier} · monster level ${mapLevel(sel.tier)} · monsters resist elements ${MAP_RULES.eleRes(sel.tier)}%</div>
        <div class="item-base">${mix}</div>
        <div class="item-base">Boss: ${esc(L.boss.name)} (${L.boss.damageType})</div>
        <ul class="mods">${sel.mods.map((id) => `<li><b>${MAP_MODS[id].name}</b>&nbsp;${esc(MAP_MODS[id].text)} <span class="muted small">+${MAP_MODS[id].iiq}% items</span></li>`).join('') || '<li class="muted">No mods. Kindling or Forge adds some: harder, but more loot.</li>'}</ul>
      </div>
      <div class="actions"><button class="primary" data-action="run-map" data-uid="${sel.uid}" ${locked ? 'disabled' : ''}>Run this map</button><button data-action="discard-map" data-uid="${sel.uid}">Discard (+1 Scrap)</button></div>
      ${locked ? `<p class="muted small">Clear a tier ${sel.tier - 1} map first.</p>` : ''}
      <h4>Craft this map</h4><div class="cur-grid">${crafts}</div>`;
  }
  const runner = automationUnlocked(state, 'mapRunner')
    ? `<div class="runner"><label class="check"><input type="checkbox" id="map-runner" data-change="map-runner" ${state.mapRunner.on ? 'checked' : ''}> Map runner: run maps from the stash automatically</label>
       <label class="small">Order <select id="map-order" data-change="map-order"><option value="highest" ${state.mapRunner.order === 'highest' ? 'selected' : ''}>Highest tier first</option><option value="lowest" ${state.mapRunner.order === 'lowest' ? 'selected' : ''}>Lowest tier first</option></select></label></div>`
    : `<p class="muted small">Map runner unlocks on your first tier ${AUTOMATION.mapRunner.mapTier} clear.</p>`;
  const inMap = state.run.map ? `<p class="small good">Running ${esc(getZone(state.run.zoneId).name)} now.</p>` : '';
  return `<div class="gear-grid">
    <section class="gear-left">
      <h3>Tiers cleared</h3><div class="tier-grid">${tiers}</div>
      ${inMap}${runner}
      <h3>Map stash <span class="muted small">${state.maps.length} / ${MAP_RULES.stashSize}</span></h3>
      <div class="inv">${list.map((m) => mapRow(m, sel === m)).join('') || '<p class="muted small empty">No maps. Clear zone 10 or a map to find more.</p>'}</div>
    </section>
    <section class="gear-right">${detail}</section>
  </div>`;
}

// ---------- League ----------

export function renderLeague(state, ui) {
  const L = state.league;
  const leg = state.legacy;
  const mech = L.mechanic ? MECHANICS[L.mechanic] : null;
  const head = `<div class="league-head"><h3>League ${L.number}${mech ? ` · ${mech.name}` : ' · Standard'}</h3>
    <p class="small">${mech ? esc(mech.text) : 'The first league has no special mechanic. Each new league picks one at random.'}</p></div>`;
  const chall = Object.entries(CHALLENGES).map(([id, c]) => {
    const done = L.challenges.includes(id);
    return `<li class="${done ? 'done' : ''}"><span class="tick" aria-hidden="true">${done ? '✓' : ''}</span>${esc(c.name)}</li>`;
  }).join('');
  const ups = Object.entries(LEGACY_UPGRADES).map(([id, U]) => {
    const rank = legacyRank(state, id);
    const maxed = rank >= U.max;
    return `<div class="legacy-row"><div><b>${U.name}</b> <span class="muted small">${rank}/${U.max}</span><div class="small muted">${esc(U.text)}</div></div>
      <button data-action="buy-legacy" data-id="${id}" ${maxed || leg.points < U.cost ? 'disabled' : ''}>${maxed ? 'Maxed' : `Buy · ${U.cost}`}</button></div>`;
  }).join('');
  const lockReason = canStartLeague(state);
  let reset;
  if (lockReason) {
    reset = `<p class="muted small">${esc(lockReason)} You have cleared up to tier ${state.mapProgress.highest || 0}.</p>`;
  } else {
    const slots = heirloomSlots(state);
    const chosen = ui.heirlooms || [];
    const pool = [...Object.values(state.character.equipment).filter(Boolean), ...state.inventory.filter((i) => i.rarity !== 'normal')];
    const opts = pool.map((it) => `<label class="check"><input type="checkbox" data-change="heirloom" data-uid="${it.uid}" ${chosen.includes(it.uid) ? 'checked' : ''} ${!chosen.includes(it.uid) && chosen.length >= slots ? 'disabled' : ''}> <span class="r-${it.rarity}">${esc(itemTitle(it))}</span> <span class="muted small">${SLOT_NAMES[BASES[it.baseId].slot]}</span></label>`).join('');
    reset = `<p>Starting a new league earns <b>${legacyPointsForReset(state)}</b> Legacy points: ${state.mapProgress.highest} for your highest map tier and ${L.challenges.length} for challenges.</p>
      <ul class="small tree-help">
        <li><b>Resets:</b> level, passive tree, items, currency, Scrap, zone and map progress, support gems.</li>
        <li><b>Keeps:</b> Legacy points and upgrades, automation you've unlocked, your automation settings, and ${slots} heirloom item${slots > 1 ? 's' : ''} (its mods drop to their lowest tier).</li>
        <li>The next league gets a random mechanic.</li>
      </ul>
      <h4>Heirloom${slots > 1 ? 's' : ''} (${chosen.length}/${slots})</h4><div class="heirlooms">${opts || '<p class="muted small">No items to carry.</p>'}</div>
      <div class="actions"><button class="primary" data-action="league-ask">Start league ${L.number + 1}</button></div>
      <div class="reset-confirm" ${ui.confirmLeague ? '' : 'hidden'}><span>This wipes your character. Legacy, automation and heirlooms carry over.</span>
        <button class="danger" data-action="league-confirm">Start the new league</button><button data-action="league-cancel">Not yet</button></div>`;
  }
  let shards = '';
  if (L.mechanic === 'shards') {
    const type = ui.shardType || 'ring';
    const fams = Object.keys(MODS).filter((f) => MODS[f].slots.includes(type));
    shards = `<h3>Shard forge</h3><p class="small">You have <b>${L.shards}</b> shards. ${MECHANICS.shards.shardsPerCraft} make a Rare item with the mod you choose at the best tier your progress allows.</p>
      <div class="smith-row"><select id="shard-type" data-change="shard-type">${ITEM_TYPES.map((t) => `<option value="${t}" ${t === type ? 'selected' : ''}>${SLOT_NAMES[t]}</option>`).join('')}</select>
      <select id="shard-fam">${fams.map((f) => `<option value="${f}">${esc(MODS[f].name)}</option>`).join('')}</select>
      <button data-action="shard-craft" ${L.shards < MECHANICS.shards.shardsPerCraft ? 'disabled' : ''}>Forge</button></div>`;
  }
  return `<div class="auto-grid">
    <section>${head}${shards}<h3>Challenges <span class="muted small">${L.challenges.length} / ${Object.keys(CHALLENGES).length}</span></h3><ul class="challenges">${chall}</ul>
      <h3>New league</h3>${reset}</section>
    <section><h3>Legacy <span class="muted small">${leg.points} point${leg.points === 1 ? '' : 's'} to spend · ${leg.resets} reset${leg.resets === 1 ? '' : 's'}</span></h3>
      <div class="legacy">${ups}</div>
      <p class="muted small">Legacy upgrades are permanent and apply in every league.</p></section>
  </div>`;
}
