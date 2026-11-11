// Diagnosis: reads recent run records and names why progress has stalled.
// Rules (from the design doc):
// - one primary cause, up to two secondary ones
// - name a stat category, never a specific item
// - always show the player's current value next to the threat's value

import { THREATS } from './data/monsters.js';
import { ZONES } from './data/zones.js';
import { effectiveRes, evadeChance, damageFactorVs } from './stats.js';
import { RECENT_SECONDS } from './game.js';

const WINDOW_RUNS = 5;
const WINDOW_SECONDS = 180;

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const cap = (s) => s[0].toUpperCase() + s.slice(1);

function threatLabel(threat) {
  return threat === 'boss' ? 'the boss' : `a ${THREATS[threat].name}`;
}

export function diagnosisWindow(state) {
  const zoneId = state.zoneId;
  const finished = state.runHistory.filter((r) => r.zoneId === zoneId);
  const lastN = finished.slice(-WINDOW_RUNS);
  const recent = finished.filter((r) => r.end >= state.time - WINDOW_SECONDS);
  const win = recent.length > lastN.length ? recent : lastN;
  const cur = state.run && state.run.record;
  return cur && cur.outcome === 'running' && cur.zoneId === zoneId ? [...win, cur] : win;
}

function resLine(stats, type, zoneId) {
  const eff = effectiveRes(stats, type, zoneId);
  return `Your ${type} resistance is ${fmt(eff)}% (max ${stats.maxRes[type]}%).`;
}

function physLine(stats, raw, zone) {
  const red = raw > 0 ? stats.armour / (stats.armour + 5 * raw) : 0;
  const ev = zone ? evadeChance(stats.evasion, zone.level) : 0;
  return `Your armour (${fmt(stats.armour)}) stops ${fmt(Math.min(0.9, red) * 100)}% of a hit that size, you evade ${fmt(ev * 100)}% of attacks, and you have ${fmt(stats.life)} life.`;
}

function threatPlural(threat) {
  return threat === 'boss' ? 'The boss' : `${THREATS[threat].name}s`;
}

// What mainly killed the player: the biggest damage source in the last few seconds.
function mainKiller(d) {
  const top = d.recentDamage && d.recentDamage[0];
  if (top) return top;
  return { threat: d.threat, type: d.type, taken: d.taken, hits: 1, biggestRaw: d.raw };
}

function lookAtFor(type) {
  if (type === 'physical') return 'Armour, Evasion, maximum Life';
  if (type === 'chaos') return 'Chaos resistance, Life regeneration';
  return `${cap(type)} resistance, maximum Life`;
}

export function diagnose(state, stats) {
  const zone = ZONES.find((z) => z.id === state.zoneId);
  const runs = diagnosisWindow(state);
  const causes = [];

  // Dying: 2+ deaths in the window.
  const deaths = runs.flatMap((r) => r.deaths);
  if (deaths.length >= 2) {
    const counts = {};
    const key = (d) => { const k = mainKiller(d); return `${k.threat}:${k.type}`; };
    for (const d of deaths) counts[key(d)] = (counts[key(d)] || 0) + 1;
    // Most frequent killer; the latest death breaks ties.
    let best = deaths[deaths.length - 1];
    for (const d of deaths) if (counts[key(d)] > counts[key(best)]) best = d;
    const k = mainKiller(best);
    const n = counts[key(best)];
    const detailStat = k.type === 'physical' ? physLine(stats, k.biggestRaw, zone) : resLine(stats, k.type, state.zoneId);
    let message;
    if (k.hits <= 2 || k.biggestRaw >= best.maxLife * 0.4) {
      const what = best.isBig && k.threat === 'boss' ? "the boss's heavy blow" : threatLabel(k.threat);
      message = `Killed by a ${fmt(k.biggestRaw)} ${k.type} hit from ${what}. ${detailStat}`;
    } else {
      message = k.threat === 'boss'
        ? `Worn down by the boss: it dealt ${fmt(k.taken)} ${k.type} damage in your last ${RECENT_SECONDS} seconds (${k.hits} hits). ${detailStat}`
        : `Overwhelmed by ${threatPlural(k.threat)}: they dealt ${fmt(k.taken)} ${k.type} damage in your last ${RECENT_SECONDS} seconds (${k.hits} hits). ${detailStat}`;
    }
    causes.push({
      state: 'Dying',
      score: 100 + deaths.length * 10,
      damageType: k.type,
      message,
      detail: `${deaths.length} deaths in your last ${runs.length} runs here (${n} mainly from ${k.type} damage by ${k.threat === 'boss' ? 'the boss' : `${THREATS[k.threat].name}s`}).`,
      lookAt: lookAtFor(k.type),
    });
  }

  // Fragile: any single hit over 50% of max life.
  let worst = null;
  for (const r of runs) {
    for (const h of Object.values(r.worstHits)) {
      if (h.pct > 0.5 && (!worst || h.pct > worst.pct)) worst = h;
    }
  }
  if (worst) {
    const who = worst.threat === 'boss'
      ? (worst.isBig ? "The boss's heavy blows" : 'Boss hits')
      : `${THREATS[worst.threat].name} ${worst.type === 'physical' && worst.threat === 'brute' ? 'slams' : 'hits'}`;
    const tail = worst.type === 'physical'
      ? `More armour or life would help. ${physLine(stats, worst.raw, zone)}`
      : resLine(stats, worst.type, state.zoneId);
    causes.push({
      state: 'Fragile',
      score: 50 + worst.pct * 50,
      damageType: worst.type,
      message: `${who} take ${fmt(worst.pct * 100)}% of your life (${fmt(worst.taken)} ${worst.type} of ${fmt(worst.maxLife)}). ${tail}`,
      lookAt: lookAtFor(worst.type),
    });
  }

  // Slow: average pack clear time over 3x the zone's target.
  if (zone) {
    const byThreat = {};
    for (const r of runs) {
      for (const p of r.packs) (byThreat[p.threat] ||= []).push(p.seconds);
    }
    let slowest = null;
    for (const [threat, times] of Object.entries(byThreat)) {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const ratio = avg / zone.targetPackSeconds;
      if (ratio > 3 && (!slowest || ratio > slowest.ratio)) slowest = { threat, avg, ratio };
    }
    if (slowest) {
      const d = stats.damage;
      const hint = slowest.threat === 'swarm'
        ? `Your skill hits ${d.targets} targets per use.`
        : `You deal ${fmt(d.dps)} damage per second to each target.`;
      causes.push({
        state: 'Slow',
        score: 30 + slowest.ratio * 5,
        message: `${THREATS[slowest.threat].name} packs take ${fmt(slowest.avg)}s each (target ${zone.targetPackSeconds}s). ${hint}`,
        lookAt: slowest.threat === 'swarm' ? 'Targets hit, damage per hit' : 'Damage, attack speed, critical strikes',
      });
    }
  }

  // Starved: skill unable to fire over 20% of fight time.
  const fight = runs.reduce((a, r) => a + r.fightTime, 0);
  const starved = runs.reduce((a, r) => a + r.starvedTime, 0);
  if (fight > 5 && starved / fight > 0.2) {
    const d = stats.damage;
    causes.push({
      state: 'Starved',
      score: 40 + (starved / fight) * 100,
      message: `Out of mana ${fmt((starved / fight) * 100)}% of the time. Your skill uses ${d.manaPerSecond.toFixed(1)} mana per second; you regenerate ${stats.manaRegen.toFixed(1)}.`,
      lookAt: 'Maximum mana, mana regeneration',
    });
  }

  // Stuck on boss: fight over 60s, or the boss killed the player.
  const bossDeaths = deaths.filter((d) => d.atBoss).length;
  let longest = 0;
  let bossLife = null;
  for (const r of runs) {
    if (r.bossMaxLife) bossLife = r.bossMaxLife;
    const secs = r.bossSeconds ?? (r.bossStart != null ? (r.end ?? state.time) - r.bossStart : 0);
    longest = Math.max(longest, secs);
  }
  if (bossLife && (longest > 60 || bossDeaths > 0)) {
    const ttk = bossLife / Math.max(1, stats.damage.dps);
    const why = bossDeaths > 0 ? `It killed you ${bossDeaths} time${bossDeaths > 1 ? 's' : ''}. ` : '';
    causes.push({
      state: 'Stuck on boss',
      score: 60 + bossDeaths * 15,
      message: `${why}The boss has ${fmt(bossLife)} life. At your ${fmt(stats.damage.dps)} single-target DPS that takes ${fmt(ttk)}s.`,
      lookAt: bossDeaths > 0 ? 'Single-target damage, max hit taken' : 'Single-target damage',
    });
  }

  // Resisted: a threat in this zone shrugs off a big share of your damage.
  // Only reported when something is actually going wrong here.
  const struggling = deaths.length > 0 || causes.some((c) => c.state === 'Slow' || c.state === 'Stuck on boss');
  if (zone && struggling) {
    let worst = null;
    for (const { label, res, plural } of zoneResistances(zone)) {
      const f = damageFactorVs(stats.damage, res);
      if (f <= 0.75 && (!worst || f < worst.f)) worst = { label, res, f, plural };
    }
    if (worst) {
      const types = Object.entries(worst.res).filter(([, v]) => v > 0).map(([t, v]) => `${v}% ${t}`).join(' and ');
      const yours = stats.damage.parts.map((p) => p.type).join(' and ');
      causes.push({
        state: 'Resisted',
        score: 35 + (1 - worst.f) * 80,
        message: `${worst.label} ${worst.plural ? 'resist' : 'resists'} ${types} damage. Your ${yours} hits deal ${fmt((1 - worst.f) * 100)}% less to them.`,
        lookAt: 'Penetration, converting your damage, or a skill of another element',
      });
    }
  }

  causes.sort((a, b) => b.score - a.score);
  // Drop a Fragile that repeats the primary Dying cause's damage type.
  const primary = causes[0] || null;
  const rest = causes.slice(1).filter((c) => !(primary && primary.state === 'Dying' && c.state === 'Fragile' && c.damageType === primary.damageType));
  return {
    stalled: !!primary,
    primary,
    secondary: rest.slice(0, 2),
    runsConsidered: runs.length,
  };
}

// Who in this zone resists what.
export function zoneResistances(zone) {
  const out = [];
  for (const m of zone.mix) {
    const T = THREATS[m.threat];
    const res = { ...(T.res || {}) };
    if (m.threat === 'caster' && T.ownElementRes) res[m.element] = T.ownElementRes;
    if (Object.keys(res).length) out.push({ label: m.threat === 'caster' ? `${cap(m.element)} Casters` : `${T.name}s`, res, plural: true });
  }
  if (zone.boss.res) out.push({ label: zone.boss.name, res: zone.boss.res, plural: false });
  return out;
}
