// Browser entry point: runs the simulation clock, handles input, saves.

import {
  newGame, runTicks, serialize, deserialize, selectZone, setAutoAdvance, equip, unequip,
  salvage, salvageAll, toggleLock, craftItem, smithItem, convertCurrency, findItem, setSkill, setSupport, allocatePassive, refundPassive, passivePoints, passivesSpent,
} from '../game.js';
import { CURRENCY } from '../data/currency.js';
import { SKILLS } from '../data/skills.js';
import {
  renderZones, renderVitals, renderRun, renderLog, renderDiagnosis, renderGear, renderSheet, renderSkills, renderTree,
} from './render.js';

const SAVE_KEY = 'wallbreaker.save';
const UI_KEY = 'wallbreaker.ui';
const TICK_MS = 100;
const MAX_CATCHUP_MS = 60_000; // offline progress arrives in M9

let state;
const ui = { selectedNode: null, selectedUid: null, filter: 'all', tab: 'gear', speed: 1, message: '', messageKind: '', messageAt: 0, version: 0, confirmReset: false };

const $ = (id) => document.getElementById(id);

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

function save() {
  if (!state) return;
  if (storageSet(SAVE_KEY, serialize(state))) {
    $('save-status').textContent = 'Saved';
  } else {
    $('save-status').textContent = 'Progress isn’t being saved in this browser';
  }
  storageSet(UI_KEY, JSON.stringify({ tab: ui.tab, speed: ui.speed, filter: ui.filter, sort: ui.sort, rarity: ui.rarity }));
}

function notify(text, kind = '') {
  ui.message = text;
  ui.messageKind = kind;
  ui.messageAt = performance.now();
  bump();
}

function bump() {
  ui.version++;
}

// ---------- Rendering ----------

const cache = {};
function put(id, html) {
  if (cache[id] === html) return;
  cache[id] = html;
  $(id).innerHTML = html;
}

let lowerSig = '';
function render(force = false) {
  put('zones', renderZones(state));
  put('vitals', renderVitals(state));
  put('run', renderRun(state));
  put('log', renderLog(state));
  put('diagnosis', renderDiagnosis(state));
  $('auto-advance').checked = state.autoAdvance;
  for (const b of document.querySelectorAll('[data-speed]')) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === ui.speed));
  for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === ui.tab));
  for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== ui.tab;
  const free = passivePoints(state) - passivesSpent(state);
  put('tree-count', free > 0 ? String(free) : '');

  // The lower panels only re-render when something they show has changed,
  // so dropdowns and scroll positions aren't reset 10 times a second.
  const sig = `${ui.version}|${ui.tab}|${state.nextUid}|${state.inventory.length}|${state.scrap}|${Object.values(state.currency).join(',')}|${state.character.level}|${state.zoneId}|${JSON.stringify(state.character.skill)}|${state.ownedSupports.length}|${state.progress.cleared.length}|${state.character.passives.length}|${ui.selectedNode}`;
  if (!force && sig === lowerSig) return;
  lowerSig = sig;
  if (ui.tab === 'gear') {
    const sel = $('smith-select');
    const keepSmith = sel ? sel.value : null;
    const inv = document.querySelector('.inv');
    const scroll = inv ? inv.scrollTop : 0;
    const active = document.activeElement && document.activeElement.id;
    const caret = active === 'inv-search' ? document.activeElement.selectionStart : null;
    put('gear', renderGear(state, ui));
    if (active === 'inv-search') {
      const box = $('inv-search');
      box.focus();
      box.setSelectionRange(caret, caret);
    }
    const sel2 = $('smith-select');
    if (sel2 && keepSmith && [...sel2.options].some((o) => o.value === keepSmith)) sel2.value = keepSmith;
    const inv2 = document.querySelector('.inv');
    if (inv2) inv2.scrollTop = scroll;
  } else if (ui.tab === 'tree') {
    put('tree', renderTree(state, ui));
  } else if (ui.tab === 'skills') {
    put('skills', renderSkills(state));
  } else if (ui.tab === 'sheet') {
    put('sheet', renderSheet(state));
  }
  $('reset-confirm').hidden = !ui.confirmReset;
  const t = $('toast');
  t.hidden = !ui.message;
  t.className = `toast ${ui.messageKind || ''}`;
  t.textContent = ui.message;
}

// ---------- Clock ----------

let last = performance.now();
let acc = 0;
function loop() {
  const now = performance.now();
  const elapsed = Math.min(now - last, MAX_CATCHUP_MS);
  last = now;
  if (ui.speed > 0) {
    acc += elapsed * ui.speed;
    const n = Math.floor(acc / TICK_MS);
    acc -= n * TICK_MS;
    if (n > 0) runTicks(state, n);
  }
  if (ui.message && now - ui.messageAt > 5000) {
    ui.message = '';
    bump();
  }
  render();
}

// ---------- Input ----------

function handle(action, el) {
  const uid = el.dataset.uid ? Number(el.dataset.uid) : null;
  let res;
  switch (action) {
    case 'zone':
      res = selectZone(state, Number(el.dataset.zone));
      break;
    case 'speed':
      ui.speed = Number(el.dataset.speed);
      break;
    case 'tab':
      ui.tab = el.dataset.tab;
      break;
    case 'select':
      ui.selectedUid = uid;
      ui.compareSlot = null;
      ui.message = '';
      break;
    case 'filter':
      ui.filter = el.dataset.filter;
      break;
    case 'rarity':
      ui.rarity = el.value;
      break;
    case 'sort':
      ui.sort = el.value;
      break;
    case 'compare-slot':
      ui.compareSlot = el.dataset.slot;
      break;
    case 'equip':
      res = equip(state, uid, el.dataset.slot || null);
      if (res.ok) notify('Equipped.', 'good');
      break;
    case 'unequip':
      res = unequip(state, el.dataset.slot);
      if (res.ok) notify('Moved to inventory.');
      break;
    case 'salvage':
      res = salvage(state, uid);
      if (res.ok) {
        ui.selectedUid = null;
        notify(`Salvaged for ${res.scrap} Scrap.`, 'good');
      }
      break;
    case 'salvage-all': {
      res = salvageAll(state, el.dataset.rarity);
      if (ui.selectedUid != null && !findItem(state, ui.selectedUid)) ui.selectedUid = null;
      notify(res.count ? `Salvaged ${res.count} items for ${res.scrap} Scrap.` : 'Nothing to salvage. Locked items are skipped.');
      break;
    }
    case 'lock':
      res = toggleLock(state, uid);
      break;
    case 'craft': {
      const cur = el.dataset.cur;
      res = craftItem(state, cur, uid);
      if (res.ok) notify(`Used ${CURRENCY[cur].name}.`, 'good');
      break;
    }
    case 'smith': {
      const fam = $('smith-select').value;
      res = smithItem(state, uid, fam);
      if (res.ok) notify(`The Smith added the mod for ${res.cost} Scrap.`, 'good');
      break;
    }
    case 'convert':
      res = convertCurrency(state, Number(el.dataset.idx));
      if (res.ok) notify('Converted.', 'good');
      break;
    case 'skill':
      res = setSkill(state, el.dataset.skill);
      if (res.ok) notify(`Now using ${SKILLS[el.dataset.skill].name}.`, 'good');
      break;
    case 'support':
      res = setSupport(state, Number(el.dataset.slot), el.value || null);
      break;
    case 'node':
      if (ui.dragged) return;
      ui.selectedNode = el.dataset.node;
      break;
    case 'tree-zoom': {
      const svg = $('tree-svg');
      if (el.dataset.dir === 'fit') ui.treeView = null;
      else {
        const [x, y, w, h] = currentView(svg);
        zoomTree(svg, el.dataset.dir === 'in' ? 0.75 : 1 / 0.75, x + w / 2, y + h / 2);
      }
      break;
    }
    case 'allocate':
      res = allocatePassive(state, el.dataset.node);
      if (res.ok) notify('Passive allocated.', 'good');
      break;
    case 'refund':
      res = refundPassive(state, el.dataset.node);
      if (res.ok) notify(`Refunded for ${res.cost} Scrap.`, 'good');
      break;
    case 'reset-ask':
      ui.confirmReset = true;
      break;
    case 'reset-cancel':
      ui.confirmReset = false;
      break;
    case 'reset-confirm':
      ui.confirmReset = false;
      state = newGame();
      ui.selectedUid = null;
      save();
      notify('Started a new character.');
      break;
    default:
      return;
  }
  if (res && !res.ok && res.reason) notify(res.reason, 'neg');
  bump();
  render(true);
}

// ---------- Passive tree pan & zoom ----------

function currentView(svg) {
  return (ui.treeView || svg.getAttribute('viewBox').split(' ').map(Number)).slice();
}

function zoomTree(svg, factor, cx, cy) {
  const full = svg.dataset.full.split(' ').map(Number);
  const [x, y, w, h] = currentView(svg);
  const nw = Math.max(full[2] * 0.15, Math.min(full[2], w * factor));
  const nh = (nw / w) * h;
  ui.treeView = [cx - ((cx - x) * nw) / w, cy - ((cy - y) * nh) / h, nw, nh];
  svg.setAttribute('viewBox', ui.treeView.join(' '));
}

function wireTreePanZoom() {
  let drag = null;
  document.addEventListener('pointerdown', (e) => {
    const svg = e.target.closest('#tree-svg');
    if (!svg) return;
    drag = { svg, x: e.clientX, y: e.clientY, view: currentView(svg), moved: false };
    ui.dragged = false;
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    ui.dragged = true;
    const rect = drag.svg.getBoundingClientRect();
    const [x, y, w, h] = drag.view;
    const scale = Math.max(w / rect.width, h / rect.height);
    ui.treeView = [x - dx * scale, y - dy * scale, w, h];
    drag.svg.setAttribute('viewBox', ui.treeView.join(' '));
  });
  document.addEventListener('pointerup', () => {
    drag = null;
    // Let the click that ends a drag be ignored, then reset.
    setTimeout(() => { ui.dragged = false; }, 0);
  });
  document.addEventListener('wheel', (e) => {
    const svg = e.target.closest('#tree-svg');
    if (!svg) return;
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    const [x, y, w, h] = currentView(svg);
    const scale = Math.max(w / rect.width, h / rect.height);
    // Point under the cursor, in tree units (the svg keeps its aspect ratio, centred).
    const cx = x + (e.clientX - rect.left - (rect.width - w / scale) / 2) * scale;
    const cy = y + (e.clientY - rect.top - (rect.height - h / scale) / 2) * scale;
    zoomTree(svg, e.deltaY < 0 ? 0.85 : 1 / 0.85, cx, cy);
  }, { passive: false });
}

function wire() {
  wireTreePanZoom();
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    handle(el.dataset.action, el);
  });
  // Tree nodes are SVG groups, so make Enter and Space work like a click.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('g[data-action]');
    if (!el) return;
    e.preventDefault();
    handle(el.dataset.action, el);
  });
  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-input]');
    if (!el) return;
    ui[el.dataset.input] = el.value;
    bump();
    render(true);
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (el) handle(el.dataset.change, el);
  });
  $('auto-advance').addEventListener('change', (e) => {
    setAutoAdvance(state, e.target.checked);
    if (e.target.checked && state.zoneId !== state.progress.unlocked) selectZone(state, state.progress.unlocked);
    bump();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);
  setInterval(save, 30_000);
}

function boot(data) {
  let notice = '';
  const text = (data && data.save) || storageGet(SAVE_KEY);
  if (text) {
    try {
      state = deserialize(text);
    } catch {
      notice = 'Your saved game could not be read, so a new character was started.';
    }
  }
  if (!state) state = newGame();
  try {
    const u = JSON.parse((data && data.ui) || storageGet(UI_KEY) || '{}');
    if (u.tab) ui.tab = u.tab;
    if (typeof u.speed === 'number') ui.speed = u.speed;
    if (u.filter) ui.filter = u.filter;
    if (u.sort) ui.sort = u.sort;
    if (u.rarity) ui.rarity = u.rarity;
  } catch { /* ignore */ }
  wire();
  if (state.notice) {
    notice = notice || state.notice;
    delete state.notice;
  }
  if (notice) notify(notice, 'neg');
  render(true);
  last = performance.now();
  setInterval(loop, TICK_MS);
  window.claude?.hot?.snapshot?.(() => ({ save: serialize(state), ui: JSON.stringify({ tab: ui.tab, speed: ui.speed, filter: ui.filter }) }));
}

const hot = window.claude?.hot;
if (hot?.ready) hot.ready(boot);
else boot(hot?.data ?? null);
