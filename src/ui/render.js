// Builds HTML for each panel from game state. No game logic here.

import { ZONES } from '../data/zones.js';
import { THREATS } from '../data/monsters.js';
import { BASES, MODS, SLOTS, SLOT_NAMES } from '../data/items.js';
import { CURRENCY, CURRENCY_ORDER, CONVERSIONS } from '../data/currency.js';
import { RULES } from '../data/player.js';
import { getStats, getZone, xpToNext, statsWithItem, findItem } from '../game.js';
import { maxHitTaken, effectiveRes, DAMAGE_TYPES } from '../stats.js';
import { monsterBaseLife } from '../combat.js';
import { canCraft, smithOptions, salvageValue } from '../crafting.js';
import { diagnose } from '../diagnosis.js';
import {
  fmt, fmt1, pct, cap, esc, modText, baseLine, itemTitle, timeAgo,
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

function threatChip(m) {
  const T = THREATS[m.threat];
  const type = m.threat === 'caster' ? m.element : T.damageType;
  return `<span class="chip threat"><span class="dot dot-${type}"></span>${T.name}${m.threat === 'caster' ? ` (${m.element})` : ''} <span class="muted">${Math.round(m.share)}%</span></span>`;
}

// ---------- Header: zones ----------

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
  const s = getStats(state);
  const ch = state.character;
  const p = state.player;
  const need = xpToNext(ch.level);
  const d = s.damage;
  const zone = getZone(state.zoneId);
  const mh = maxHitTaken(s, state.zoneId);
  const bossLife = monsterBaseLife(zone.level) * THREATS.boss.lifeMult;
  const ttk = bossLife / Math.max(1, d.dps);
  const resRow = (t) => {
    const eff = effectiveRes(s, t, state.zoneId);
    const low = eff < 0 ? 'neg' : eff < 30 ? 'low' : '';
    return `<div class="kv"><span>${dt(t)} res</span><b class="${low}">${fmt(eff)}% <span class="muted">/ ${s.maxRes[t]}%</span></b></div>`;
  };
  return `
    <div class="level-row"><span class="level">Level ${ch.level}</span><span class="muted small">${fmt(ch.xp)} / ${fmt(need)} XP</span></div>
    ${bar('xp', ch.xp, need, '')}
    ${bar('life', Math.max(0, p.life), s.life, `Life ${fmt(Math.max(0, p.life))} / ${fmt(s.life)}`)}
    ${bar('mana', p.mana, s.mana, `Mana ${fmt(p.mana)} / ${fmt(s.mana)}`)}
    <h3>Offence <span class="muted small">${s.skill.name}</span></h3>
    <div class="kv"><span>Damage per second</span><b>${fmt(d.dps)}</b></div>
    <div class="kv"><span>Hit</span><b>${fmt(d.hitMin)}–${fmt(d.hitMax)}</b></div>
    <div class="kv"><span>Attacks per second</span><b>${d.aps.toFixed(2)}</b></div>
    <div class="kv"><span>Targets per use</span><b>${d.targets}</b></div>
    <div class="kv"><span>Crit chance / multiplier</span><b>${fmt1(d.critChance)}% / ${Math.round(d.critMulti * 100)}%</b></div>
    <div class="kv"><span>Mana per second</span><b>${fmt1(d.manaPerSecond)} <span class="muted">(regen ${fmt1(s.manaRegen)})</span></b></div>
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
      return `<div class="mon ${dead ? 'dead' : ''} r-${m.rarity}">
        <span class="mon-name"><span class="dot dot-${m.damageType}" title="${m.damageType} damage"></span>${esc(m.name)}</span>
        ${bar('mlife', Math.max(0, m.life), m.maxLife, dead ? 'dead' : `${fmt(Math.max(0, m.life))}`)}${warn}</div>`;
    }).join('');
  } else {
    monsters = `<div class="phase">${phase}</div>`;
  }
  return `
    <div class="run-head">
      <div><h2>${esc(zone.name)}</h2><div class="muted small">Monster level ${zone.level} · ${progress}</div></div>
      <div class="mix">${mixShares(zone).map(threatChip).join('')}<span class="chip threat"><span class="dot dot-${zone.boss.damageType}"></span>Boss: ${esc(zone.boss.name)}</span></div>
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
      <p class="muted">No stall in ${esc(getZone(state.zoneId).name)} over your last ${d.runsConsidered} run${d.runsConsidered === 1 ? '' : 's'}. When the character gets stuck, the cause shows here.</p>`;
  } else {
    const p = d.primary;
    body = `<div class="diag-badge stalled">Stalled · ${p.state}</div>
      <div class="cause primary"><p>${esc(p.message)}</p>${p.detail ? `<p class="muted small">${esc(p.detail)}</p>` : ''}
      <p class="lookat">Look at: <b>${esc(p.lookAt)}</b></p></div>
      ${d.secondary.map((c) => `<div class="cause"><div class="cause-state">${c.state}</div><p>${esc(c.message)}</p><p class="lookat">Look at: <b>${esc(c.lookAt)}</b></p></div>`).join('')}`;
  }
  const recent = state.runHistory.slice(-8).reverse();
  const runs = recent.length
    ? `<ul class="runs">${recent.map((r) => `<li><span class="zone-tag">Z${r.zoneId}</span><span class="${r.outcome === 'died' ? 'neg' : 'good'}">${r.outcome === 'died' ? 'Died' : 'Cleared'}</span><span class="muted">${r.outcome === 'died' ? `pack ${Math.min(r.packs.length + 1, 10)}${r.bossStart != null ? ' (boss)' : ''}` : `${Math.round(r.end - r.start)}s`}</span><span class="muted">+${r.items} items</span></li>`).join('')}</ul>`
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
    <div class="item-sub">${cap(item.rarity)} ${esc(b.name)} · ${SLOT_NAMES[b.slot]} · item level ${item.ilvl}${equippedIn ? ' · <b>equipped</b>' : ''}</div>
    <div class="item-base">${esc(baseLine(item))}</div>
    ${lines ? `<ul class="mods">${lines}</ul>` : '<div class="muted small">No mods.</div>'}
  </div>`;
}

function compareRows(cur, alt, zoneId) {
  const mhA = maxHitTaken(cur, zoneId);
  const mhB = maxHitTaken(alt, zoneId);
  const rows = [
    ['Damage per second', cur.damage.dps, alt.damage.dps],
    ['Targets per use', cur.damage.targets, alt.damage.targets],
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
  const out = rows.filter(([, a, b]) => Math.abs(a - b) >= 0.5).map(([label, a, b, unit = '']) => {
    const diff = b - a;
    return `<tr><td>${label}</td><td>${fmt(a)}${unit}</td><td>${fmt(b)}${unit}</td><td class="${diff > 0 ? 'good' : 'neg'}">${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))}${unit}</td></tr>`;
  });
  return out.length ? `<table class="compare"><thead><tr><th>If equipped</th><th>Now</th><th>After</th><th>Change</th></tr></thead><tbody>${out.join('')}</tbody></table>` : '<p class="muted small">Equipping this changes nothing.</p>';
}

function craftPanel(state, item) {
  const buttons = CURRENCY_ORDER.map((c) => {
    const reason = canCraft(c, item, state.currency);
    return `<button class="cur-btn" data-action="craft" data-cur="${c}" data-uid="${item.uid}" ${reason ? 'disabled' : ''} title="${esc(reason || CURRENCY[c].effect)}">
      <span>${CURRENCY[c].name}</span><span class="count">${state.currency[c]}</span><span class="cur-eff">${esc(CURRENCY[c].effect)}</span></button>`;
  }).join('');
  const opts = smithOptions(item);
  const smith = opts.length
    ? `<div class="smith"><label for="smith-select">The Smith adds one mod of your choice</label>
        <div class="smith-row"><select id="smith-select">${opts.map((o) => `<option value="${o.family}">${esc(MODS[o.family].name)} (${MODS[o.family].type}, T${o.tier}) · ${o.cost} Scrap</option>`).join('')}</select>
        <button data-action="smith" data-uid="${item.uid}">Craft</button></div>
        <div class="muted small">You have ${fmt(state.scrap)} Scrap.${item.rarity === 'normal' ? ' A Normal item becomes Magic.' : ''}</div></div>`
    : `<div class="smith muted small">The Smith can't add anything here: no open mod slots. Ash resets the item to Normal.</div>`;
  return `<div class="craft"><h4>Crafting</h4><div class="cur-grid">${buttons}</div>${smith}</div>`;
}

export function renderGear(state, ui) {
  const sel = ui.selectedUid != null ? findItem(state, ui.selectedUid) : null;
  const equipped = SLOTS.map((slot) => {
    const it = state.character.equipment[slot];
    return `<button class="slot ${sel && sel.item === it ? 'selected' : ''}" data-action="select" data-uid="${it ? it.uid : ''}" ${it ? '' : 'disabled'}>
      <span class="slot-name">${SLOT_NAMES[slot]}</span>
      ${it ? `<span class="slot-item r-${it.rarity}">${esc(itemTitle(it))}</span><span class="muted small">${esc(BASES[it.baseId].name)} · ${it.mods.length} mod${it.mods.length === 1 ? '' : 's'}</span>` : '<span class="muted">Empty</span>'}
    </button>`;
  }).join('');

  const conv = CONVERSIONS.map((c, i) => `<button class="small-btn" data-action="convert" data-idx="${i}" ${(state.currency[c.from] || 0) < c.amount ? 'disabled' : ''}>${c.amount} ${CURRENCY[c.from].name} → 1 ${CURRENCY[c.to].name}</button>`).join('');
  const wallet = `<div class="wallet">${CURRENCY_ORDER.map((c) => `<span class="coin"><b>${state.currency[c]}</b> ${CURRENCY[c].name}</span>`).join('')}<span class="coin scrap"><b>${fmt(state.scrap)}</b> Scrap</span></div><div class="conv">${conv}</div>`;

  const filter = ui.filter || 'all';
  const list = state.inventory.filter((it) => filter === 'all' || BASES[it.baseId].slot === filter).slice().reverse();
  const filters = ['all', ...SLOTS].map((f) => `<button class="tab-chip ${filter === f ? 'on' : ''}" data-action="filter" data-filter="${f}" aria-pressed="${filter === f}">${f === 'all' ? 'All' : SLOT_NAMES[f]}</button>`).join('');
  const rows = list.length
    ? list.map((it) => `<button class="inv-row ${sel && sel.item === it ? 'selected' : ''}" data-action="select" data-uid="${it.uid}">
        <span class="r-${it.rarity} inv-name">${esc(itemTitle(it))}${it.locked ? ' <span class="lock">locked</span>' : ''}</span>
        <span class="muted small">${esc(BASES[it.baseId].name)} · ilvl ${it.ilvl}</span>
        <span class="inv-mods small">${it.mods.map((m) => esc(modText(m))).join(' · ') || '<span class="muted">no mods</span>'}</span></button>`).join('')
    : '<p class="muted small empty">No items here yet. Items drop from monsters and are picked up when a pack dies.</p>';

  let detail = '<p class="muted">Select an item to inspect, compare and craft it. You can craft on equipped items too.</p>';
  if (sel) {
    const item = sel.item;
    const isEq = sel.where !== 'inventory';
    const actions = isEq
      ? `<button data-action="unequip" data-slot="${sel.where}">Unequip</button>`
      : `<button class="primary" data-action="equip" data-uid="${item.uid}">Equip</button>
         <button data-action="salvage" data-uid="${item.uid}">Salvage (+${salvageValue(item)} Scrap)</button>`;
    const compare = isEq ? '' : compareRows(getStats(state), statsWithItem(state, item), state.zoneId);
    detail = `${itemCard(item, { equippedIn: isEq ? sel.where : null })}
      <div class="actions">${actions}<button data-action="lock" data-uid="${item.uid}">${item.locked ? 'Unlock' : 'Lock'}</button></div>
      ${compare}${craftPanel(state, item)}`;
  }

  return `<div class="gear-grid">
    <section class="gear-left">
      <h3>Equipped</h3><div class="slots">${equipped}</div>
      <h3>Currency</h3>${wallet}
      <h3>Inventory <span class="muted small">${state.inventory.length} / ${RULES.inventorySize}</span></h3>
      <div class="inv-tools"><div class="filters">${filters}</div>
        <div class="bulk"><button class="small-btn" data-action="salvage-all" data-rarity="normal">Salvage all Normal</button><button class="small-btn" data-action="salvage-all" data-rarity="magic">Salvage all Magic</button></div></div>
      <div class="inv">${rows}</div>
    </section>
    <section class="gear-right" aria-live="polite">${ui.message ? `<div class="toast ${ui.messageKind || ''}">${esc(ui.message)}</div>` : ''}${detail}</section>
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
      <table class="formula"><tbody>
        <tr><td>Base damage (weapon + added)</td><td>${fmt(d.baseMin)}–${fmt(d.baseMax)}</td></tr>
        <tr><td>× (1 + increased)</td><td>× ${(1 + d.increased / 100).toFixed(2)} <span class="muted">(${d.increased}% total)</span></td></tr>
        <tr><td>× more multipliers</td><td>× ${d.moreMult.toFixed(2)} <span class="muted">(${s.skill.name} 20% more)</span></td></tr>
        <tr><td>= Damage per hit</td><td>${fmt(d.hitMin)}–${fmt(d.hitMax)} <span class="muted">avg ${fmt1(d.avgHit)}</span></td></tr>
        <tr><td>× attacks per second</td><td>× ${d.aps.toFixed(2)} <span class="muted">(weapon ${d.weaponAps.toFixed(2)})</span></td></tr>
        <tr><td>× crit factor</td><td>× ${d.critFactor.toFixed(3)} <span class="muted">(${fmt1(d.critChance)}% × ${Math.round(d.critMulti * 100)}%)</span></td></tr>
        <tr class="total"><td>= Damage per second (one target)</td><td>${fmt(d.dps)}</td></tr>
        <tr><td>Targets per use</td><td>${d.targets}</td></tr>
      </tbody></table>
      <h3>Offence sources</h3>
      ${row('Increased physical damage', `${d.increased}%`, 'physical')}
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
