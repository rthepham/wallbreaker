# Wallbreaker: Game Design Document (as built)

An idle action RPG inspired by Path of Exile's systems. All names, art and setting are original.

This revision describes the game as it is built, with the real numbers from `src/data/`.
It replaces the original design doc. `NOTES.md` records why numbers moved away from that doc.
Section 15 lists what comes next.

---

## 1. Overview

**Pitch:** You're the build planner, not the player. Your character fights on its own. You make
it stronger by choosing its skill and supports, spending passive points and crafting gear. The core
experience is hitting a wall, understanding why, fixing the build, and breaking through.

**Design pillars**

- **Every wall has a readable cause.** When progress stops, the Diagnosis panel says why in plain
  terms, with your number next to the threat's.
- **Builds hit different walls.** Damage types, element effects and monster resistances mean a fire
  build, a lightning build and a physical build get stuck in different places for different reasons.
- **Numbers stay readable.** Values stay in the hundreds to hundreds of thousands. Growth comes from
  mechanics, not ever-larger exponents.
- **Tedium becomes automation.** Repetitive tasks unlock automation as you progress.

**Platform:** a single web page that runs in the browser and saves locally. No server, no accounts.

**Architecture rule:** the simulation (combat, loot, crafting, stats, diagnosis) is pure logic with no
UI code. It is tested headlessly, offline progress reuses it, and all balance numbers live in data files.

**Presentation:** text and bars only (no sprites). Damage types are colour-coded throughout.

---

## 2. Core loops

| Time scale | Loop | Feeling |
|---|---|---|
| Seconds–minutes | Watch packs die → loot drops → inspect, craft, equip | Small upgrades, slot machine |
| Hours | Spend passive points → link supports → push the next zone or map tier | Real build decisions |
| Days | Clear a tier 8 map → start a new league with Legacy points and a new mechanic | Fresh start, faster climb |

**Stall loop (the heart of the game):** the character stalls → Diagnosis names the cause → the
player changes gear, tree or skill → the character pushes through.

---

## 3. Combat model

### Simulation

- Fixed timestep of 10 ticks per second. Speed control: Pause, 1×, 3×, 10×.
- A zone or map is 10 packs then a boss. Between packs the character walks for 1.5 s and recovers
  25% of max life per second; energy shield refills at double speed.
- Each tick: element effects tick on monsters → the player's skill fires if ready and affordable →
  monsters attack on their own timers → damage over time on the player → regeneration.
- Every hit taken is recorded with its source, type, raw amount and amount taken. Diagnosis reads this.

### Player stats

| Stat | Base | Notes |
|---|---|---|
| Life | 50 + 12 × level | Regenerates 1.5% of max per second (plus flat regen) |
| Mana | 40 + 6 × level | Regenerates 12% of max per second |
| Energy shield | 0 | Takes hits before life (not chaos). Refills 20%/s after 2 s without damage |
| Armour | 0 | Reduces physical hits |
| Evasion | 0 | Chance to avoid physical attacks entirely |
| Fire / Cold / Lightning / Chaos res | 0% | Max 75% (raisable by keystones and the Atlas) |
| Crit multiplier | 150% | |

### Mitigation

- **Armour:** reduction = Armour ÷ (Armour + 5 × Hit), capped at 90%. Strong against small hits,
  weak against big ones.
- **Evasion:** chance = Evasion ÷ (Evasion + 100 + 10 × monster level), capped at 75%. Physical only.
- **Resistances:** damage × (1 − effective res). Effective res = min(raw − area penalty, max res).
  Penalty: 0 in zones 1–5, 20 in zones 6–10, 30 in maps. The "Exposed" map mod lowers max res by 15.
- **Damage taken less** (from Iron Will) multiplies the result.

### Player damage

Damage per hit = (base + added) × (1 + sum of increased) × product of more multipliers,
computed separately for each damage type the hit carries.

- **Attacks** (Cleave) use the weapon's damage and speed.
- **Spells** use the skill's base damage × 1.065^level and its cast rate.
- **Conversion** (Searing Edge, Ember Heart) moves physical into fire. Converted damage benefits from
  bonuses to both types.
- DPS = average hit × uses per second × crit factor, where crit factor = 1 + crit chance × (multi − 1).
- Each hit is reduced by the monster's resistance to each part, after penetration.
- The UI shows increased (additive) versus more (multiplicative) clearly on the Character sheet.

### Element effects

| Effect | From | Rule |
|---|---|---|
| **Burning** | Fire | 10% base chance. Burns for 30% of the fire hit per second for 4 s. Strongest on bosses |
| **Shock** | Lightning | 10% base chance. Target takes 25% more damage for 4 s |
| **Chill** | Cold | Always applies. Target attacks 30% slower for 3 s (max 60%) |
| **Stun** | Physical | A hit dealing 15% of the target's max life (×3 for bosses) pauses it for 0.8 s |

Skills, supports, the tree and helmets raise these chances and effects.

### Monsters

- Life = 15 × 1.14^level. Hit = 5 × 1.08^level × 0.46, ±20%.
- Pack of 5–8 (Swarm: 15). 12% chance per monster to be Magic (2× life), 5% to be Rare (4× life
  and a random trait: Hulking +50% life, Savage +40% damage, Swift +30% speed), at most one Rare a pack.
- Brutes resist 30% physical. Casters resist their own element by 40%. Bosses have per-area resistances.
  Zones 8–10 add 10% to all elements; maps add 10–30% by tier.

### Death

The run ends, loot from the current pack is lost, and the player loses 10% of the XP for their level
(never a level). Respawn after 5 s in the same zone. A map is used up either way.

### XP

XP to next level = 100 × 1.15^level. XP per monster = 2 × 1.13^monster level × rarity bonus.
−10% per level the monster is below the player, beyond a 5-level grace. Level cap 90.

---

## 4. Threat types and Diagnosis

### Threat types

| Threat | Behaviour | Tests |
|---|---|---|
| **Swarm** | 15 monsters at 0.3× life, weak hits every 1.8 s | Targets per use, clear speed |
| **Brute** | Slow, heavy physical hits every 2 s (2.5×), 1.2× life, resists 30% physical | Armour, life, damage type |
| **Caster** | Fire, cold or lightning bolts every 1 s (1.5×), resists its own element | Resistances, damage type |
| **Blight** | Each attack adds a chaos stack (0.4× hit per second for 4 s, max 5) | Chaos resistance, regeneration |
| **Boss** | 20× life, hits every 1.5 s, a telegraphed 4× blow every 6 s | Single-target damage, max hit |

### Diagnosis states

Diagnosis looks at the last 5 runs in the current area (or the last 3 minutes, whichever is longer).

| State | Trigger | Example |
|---|---|---|
| **Dying** | 2+ deaths | "Overwhelmed by Casters: they dealt 232 fire damage in your last 8 seconds. Your fire resistance is 0% (max 75%)." |
| **Fragile** | Any hit over 50% of life + energy shield | "Brute slams take 70% of your life. More armour or life would help." |
| **Slow** | Packs take over 3× the zone's target time | "Swarm packs take 14s each. Your skill hits 3 targets per use." |
| **Starved** | Skill can't fire over 20% of the time | "Out of mana 34% of the time." |
| **Stuck on boss** | Boss fight over 60 s, or the boss killed you | "The boss has 180,000 life. At your 900 DPS that takes 200s." |
| **Resisted** | Something is going wrong and a threat here resists 25%+ of your damage | "Brutes resist 30% physical damage. Your physical hits deal 30% less to them." |

Rules: one primary cause plus up to two secondary ones. Name a stat category, never a specific item
or node. Always show the player's value next to the threat's.

The Character panel shows **max hit you can survive** per damage type and **time to kill** the
current boss, which makes most messages directly actionable.

---

## 5. Items, crafting and loot

### Slots and bases

Eight slots: Weapon, Helmet, Body Armour, Gloves, Boots, Amulet, Ring 1, Ring 2. 58 bases across
7 item types, gated by item level. Each base has an implicit (armour, evasion, energy shield, life,
resistance, spell damage, cast or attack speed, damage, mana regen, life regen).

- **Weapons:** blades, axes, mauls and rapiers (damage range, speed, crit) up to item level 40.
  **Wands** have weak hits but implicit increased spell damage.
- **Armour pieces** come in armour, evasion, hybrid and energy shield versions.

### Rarity and mods

- Normal 0 mods, Magic 1–2 (max 1 prefix + 1 suffix), Rare 3–6 (max 3 + 3). Rares get a generated name.
- 29 mod families, each with up to 8 tiers. Tier item levels: 1, 10, 20, 30, 40, 55, 70, 80.
  The tier is picked evenly from those the item level allows.
- Families: life; armour, evasion and energy shield (body and smaller piece versions); increased
  energy shield; mana; increased physical damage; added physical (weapon, and "to attacks" on rings,
  gloves and amulets); increased spell, elemental and general damage; cast and attack speed; fire,
  cold, lightning and chaos resistance (chaos from item level 22); life and mana regeneration;
  crit chance and multiplier; +1/+2 targets (item level 40/80); ignite chance, shock chance and
  chill effect (helmets, boots).

### Crafting currencies

| Currency | Effect | Drop weight |
|---|---|---|
| Kindling | Normal → Magic | 40 |
| Tempest | Reroll a Magic item | 25 |
| Forge | Normal → Rare | 12 |
| Ash | Any → Normal | 10 |
| Wildfire | Reroll a Rare | 8 |
| Crown | Add a mod to a Rare | 1 |

Conversions: 5 Kindling → 1 Tempest, 4 Tempest → 1 Forge, 6 Wildfire → 1 Crown.

**Scrap and the Smith:** salvaging gives Scrap (Normal 1, Magic 2, Rare 5). The Smith adds one chosen
mod family at the best tier up to tier 3, for 6 + 6 × tier Scrap. A Normal item becomes Magic.
This guarantees players can always patch a resistance hole.

### Drops

- Per monster: 8% item (Normal 70, Magic 25, Rare 5) and 3% currency, scaled by rarity
  (Magic 1.5×, Rare 3×) and by threat (Swarm 0.35×, Brute 1.2×).
- Bosses drop 3 items (at least one Rare) and 2 currency.
- Loot waits in the pack until it is cleared, then is picked up. Inventory holds 120 items.

### Inventory

Filter by type and rarity, search mod text, sort by newest, best upgrade, rarity, item level or type.
Every item shows **change chips** ("+44% DPS · −20 life"). Comparisons show absolute and percentage
change. Lock protects an item. Ctrl/Cmd+click salvages. Bulk: salvage all Normal, all Magic, all
(with confirmation).

---

## 6. Skills and support gems

### Active skills (one equipped)

| Skill | Type | Damage | Speed | Mana | Targets | Identity |
|---|---|---|---|---|---|---|
| **Cleave** | Physical attack | Weapon × 1.2 | Weapon | 4 | 3 | Cheap, stuns, scales with gear |
| **Fireball** | Fire spell | 6–9 × 1.065^lvl | 1.25/s | 4 | 1 + 2 splash (50%) | Burns bosses down |
| **Arc** | Lightning spell | 1–10 × 1.065^lvl | 1.4/s | 5 | 4 (chain) | Fast clear, shocks, mana-hungry |
| **Ice Nova** | Cold spell | 3–6 × 1.065^lvl | 1.1/s | 4.5 | 5 | Always chills, defensive |

### Support gems (20)

Each support multiplies mana cost. "Needs" means it only does something with that damage type.

| Support | Effect | Mana × | Restriction |
|---|---|---|---|
| Brutality | 40% more damage | 1.4 | – |
| Wide Arc | +2 targets, 15% less damage | 1.3 | Area, Chain |
| Searing Edge | Convert 50% of physical to fire | 1.2 | Attack |
| Precision | +3% base crit, +30% crit multiplier | 1.3 | – |
| Bloodthirst | Recover 2% of damage dealt as life | 1.2 | – |
| Echo | 25% more uses per second | 1.5 | Spell |
| Pierce | Ignore 25% of enemy elemental resistance | 1.3 | Fire, Lightning, Cold |
| Focused Strike | 60% more damage, one target only | 1.4 | – |
| Kindle | +25% ignite chance, burning 40% stronger | 1.2 | Needs fire |
| Overcharge | +25% shock chance, shocks 40% stronger | 1.2 | Needs lightning |
| Frostbite | Chill 50% stronger, 20% more cold damage | 1.2 | Needs cold |
| Concussive Force | Stun twice as easily, 20% more physical | 1.3 | Needs physical |
| Elemental Fury | 30% more elemental damage | 1.4 | Needs elemental |
| Controlled Destruction | 35% more spell damage, no crits | 1.3 | Spell |
| Swift Assault | 25% more attack speed | 1.4 | Attack |
| Scatter | +2 splash targets, splash +25% of the hit | 1.3 | Projectile |
| Executioner | 60% more damage to enemies below 35% life | 1.3 | – |
| Efficacy | 30% lower mana cost, 10% less damage | 0.7 | – |
| Iron Will | +30% armour, take 10% less damage | 1.3 | – |
| Lifetap | Recover 3% of max life per kill | 1.2 | – |

**Links:** 1 support at the start; 2 after zone 3; 3 after zone 5; 4 after zone 8.
**Getting supports:** start with Brutality. Every zone's first clear and every new map tier's first
clear grants one; repeat boss kills have a 35% chance.

---

## 7. Passive tree

- **149 nodes** (112 small, 26 notables, 10 keystones) around a free starting node, in three
  regions: **Might** (life, armour, physical, fire), **Finesse** (speed, crit, evasion, lightning),
  **Mind** (spells, mana, resistances, cold, energy shield).
- Each region has a gate and five branches of 8 nodes (3 small, a notable, 3 small, a notable or
  keystone). Three branches extend further. Bridges of 5 nodes join neighbouring regions for hybrid builds.
- **Start region:** the first gate is free. Other regions are reached through the bridges.
- **Points:** 1 per level after the first, +2 for first clears of zones 5 and 10 and map tiers 4, 8 and 12.
- **Refunds** cost 1 + level ÷ 4 Scrap. A node can only be refunded if the rest stays connected.
- **UI:** zoom, pan, before/after preview with percentages, Ctrl/Cmd+click to allocate.

### Keystones

| Keystone | Rule |
|---|---|
| Iron Hide | Can't evade. Armour also reduces elemental hits at half effect |
| Ember Heart | All damage becomes fire. Ignore 15% fire resistance. +15% ignite chance |
| Colossus | 40% more life. 25% less attack and cast speed |
| Reckless Tempo | 35% more attack and cast speed. 20% less life |
| Spread Thin | Double targets. 25% less damage |
| Thunderstruck | Lightning hits always shock. 15% less damage |
| Blood Price | Skills cost life instead of mana. 25% more damage |
| Bulwark of Will | +5% to all max resistances, +20% elemental resistances. 15% less life |
| Deep Winter | Chills slow twice as much (up to 60%). 20% less damage |
| Hollow Vessel | Immune to chaos. Life becomes 1. Gain energy shield equal to twice your life |

---

## 8. Zones and maps

### Zones

Each zone is 10 packs plus a boss. A first clear opens the next zone. The last zone's boss starts the
endgame by dropping a tier 1 map.

| Zone | Level | Threats | Boss (resists) |
|---|---|---|---|
| 1 The Sunken Yard | 1 | Swarm | Yard Matron |
| 2 Mirefield | 4 | Swarm | The Bloated Reeve |
| 3 Broken Quarry | 8 | Swarm, Brute | Foreman Gath (phys 30) |
| 4 Emberwatch | 13 | Fire Caster, Swarm, Brute | The Pyre Warden, fire (fire 40) |
| 5 The Ashen Steps | 18 | Brute, Fire + Lightning Casters, Swarm | Ashborn Colossus (phys 30, fire 30) |
| 6 Frostmere Shallows | 23 | Cold + Lightning Casters, Swarm, Brute | Rimeheart Herald, cold (cold 40) |
| 7 The Rotting Halls | 28 | Blight, Swarm, Brute | The Mire Mother, chaos (phys 20) |
| 8 Stormspire | 33 | Lightning + Cold Casters, Blight, Brute | Stormcaller Vex, lightning (lightning 40) |
| 9 The Gravefields | 38 | Brute, Swarm, Blight | The Gravewarden (phys 40) |
| 10 The Last Wall | 42 | Everything | The Last Wall (all 20) |

Zones 6–10: −20% elemental resistances. Zones 8–10: monsters +10% to all elements.

### Maps

- 16 tiers. Monster level = 40 + tier. Resistance penalty 30%. Monsters resist all elements 10% at
  tier 1, rising to 30% at tier 16.
- Five layouts, each with its own threat mix and boss: Sunken Bastion, Glacier Vault, Storm Crag,
  Plague Warrens, Bone Orchard.
- **Map mods** (harder, more loot): Fiery (+40% of hits as extra fire, +15%), Hardened (+40% monster
  life, +15%), Exposed (−15% max res, +20%), Teeming (all Swarm, +20%), Withering (all monsters apply
  Blight, +20%), Champion (boss +50% life and damage, +25%). Normal 0, Magic 1–2, Rare 3–4 mods.
- Map crafting: Kindling, Forge, Tempest, Wildfire, Crown and Ash work on maps.
- **Drops:** the zone 10 boss gives a tier 1 map on first clear, then 15% per clear. A map boss drops
  0/1/2 maps (30/50/20%) plus an extra map at a chance equal to the map's item quantity. Rare
  monsters in maps have an 8% chance (raised by quantity). Tier: 15% one lower, 55% same, 30% one
  higher, never more than one past the best clear. A plain map returns ~1.15 maps per clear, a Rare
  ~1.9–2.0.
- **Atlas:** the first clear of each tier gives a league-long bonus (item quantity at tiers 1, 5, 11
  and 15; resistances at 2, 6 and 13; life at 3 and 9; damage at 4, 10 and 16; speed at 7; +1% max
  resistances at 8 and 14; defences at 12).

---

## 9. Leagues (prestige)

- **When:** after the first tier 8 map clear. Never forced.
- **Resets:** level, tree, items, currency, Scrap, zone and map progress, supports, Atlas.
- **Keeps:** Legacy points and upgrades, unlocked automation and its settings, and heirlooms. An
  heirloom keeps its base and mods, but every mod drops to its lowest tier.
- **Legacy points:** highest map tier cleared + challenges completed.

| Legacy upgrade | Effect | Cost × max |
|---|---|---|
| Head Start | +1 support link | 5 × 1 |
| Fortune | +5% item quantity per rank | 3 × 5 |
| Smith's Favor | Smith 15% cheaper per rank | 3 × 3 |
| Long Absence | +2 hours offline cap per rank | 2 × 4 |
| Second Heirloom | Carry 2 items | 6 × 1 |
| Quick Study | +20% XP in zones 1–10 per rank | 3 × 3 |

**Challenges (12 per league):** reach level 30 / 50; clear zone 5 within 30 minutes; clear zone 10;
clear zone 10 without dying there; clear tier 4 / tier 12 maps; clear tier 8 with a keystone; clear
a Withering map; clear a Rare map; own every support; equip an item with 6 mods.

**League mechanics** (each new league gets one; the first has none):

| League | Mechanic |
|---|---|
| Shards | Monsters drop shards. 10 make a Rare with a chosen mod family at the best tier available |
| Rifts | 20% of runs open a 12-monster rift wave with double drops |
| Bounties | Each run has a marked rare carrying 3–6 currency |
| Echoes | A cleared map has a 15% chance to come back |

---

## 10. Automation and offline progress

| Unlock | Earned at | What it does |
|---|---|---|
| Auto-salvage | Zone 3 first clear | Salvages Normal items as they drop |
| Loot filter | Zone 8 first clear | Salvages Magic/Rare items without a mod on your keep-list; keep chosen item types |
| Map runner | Tier 4 map first clear | Runs maps from the stash, highest or lowest tier first |
| Craft rules | First league reset | Repeat a currency until a chosen mod appears, with a spend limit |
| Upgrade advisor | Second league reset | Marks items that would make you stronger |

**Offline progress:** on return, time away (from 60 s, capped at 8 hours) is converted to runs at
50% of the active rate, using the average of the last 10 runs in the current zone. XP (with the
over-level penalty applied per run), real rolled items (overflow is salvaged) and currency are
granted, and a summary appears. Time in another browser tab beyond 60 s counts the same way.

---

## 11. Screens

- **Header:** game speed, "push to newest zone", save status. Zone strip with all 10 zones.
- **Character panel:** level, XP, life, energy shield and mana bars, Blight stacks, offence (DPS, hit,
  speed, targets, element effect chances, crit, mana), defence (armour, evasion, energy shield, regen,
  resistances in this area), max hit by type, boss time to kill.
- **Run panel:** area and threat mix with resistances, the resistance penalty, the live pack with life
  bars and status tags (Burning, Shocked, Chilled, Stunned), boss wind-up warnings, combat log.
- **Diagnosis panel:** Progressing or Stalled badge, causes, recent runs, totals.
- **Tabs:** Gear & crafting · Skills · Passive tree · Maps · Automation · League · Character sheet ·
  How to play (including save backup and reset).
- **Offline summary** on return.

---

## 12. Data and saves

- **Data files:** `player.js`, `monsters.js`, `zones.js`, `items.js`, `currency.js`, `skills.js`,
  `passives.js`, `ailments.js`, `maps.js`, `automation.js`, `league.js`.
- **Stat pipeline:** collect modifiers (level, gear, implicits, skill, supports, passives, keystones,
  Atlas, Legacy) → group by stat and kind → flat → increased → more → caps and rules. Cached and
  recomputed when the build changes.
- **Saves:** one versioned JSON object in browser storage, saved every 30 s and on leaving the page.
  A migration for every version bump. Export and import as text. Seeded random numbers make any game
  reproducible.

---

## 13. Build status and testing

All twelve milestones from the original plan are built: stat sheet, combat, Diagnosis, loot,
crafting, skills and supports, passive tree, zones 1–10, maps, saving and offline progress,
automation, leagues and league mechanics.

**Testing:**
- 100 automated tests (`npm test`) cover formulas, crafting, skills, supports, keystones, maps,
  leagues, offline progress and save migrations.
- `npm run balance` runs a bot through the game.
- `npm run lategame` runs well-geared generated characters through every map tier.

**Measured pacing:**
- Every skill reaches zone 10 in about 1–2 hours.
- With well-crafted gear, map tiers 1–11 are near-certain clears, tier 12 14/15, and tiers 13–16
  6–9/15.
- A real level 56 Cleave character hit a wall at tiers 4–6. Gear and tree each accounted for about
  half the gap to the generated character, which led to the per-tier level change and the crafting
  work in section 15.

---

## 14. Out of scope

- Trading, multiplayer, accounts, servers.
- Manual movement or dodging.
- Sprites and art.
- Any names, art or lore from Path of Exile.

---

## 15. Next

### Crafting: from luck to plans

Players fall far short of well-crafted gear because high-tier rolls are pure luck.
Planned additions, in order:

1. **Reroll one mod** instead of the whole item.
2. **Lock a mod**, then reroll the rest.
3. **Essences:** drops that guarantee one chosen mod family, with the rest random.

Under consideration:

- **Pick 1 of 3:** a currency that offers three mods to choose from.
- **Corruption:** an endgame gamble.

### Tree depth

The tree's shape stays fixed and readable (the planner identity). The depth comes from:

- **Conditional notables**, e.g. "stunned enemies take 20% more damage", "+3% damage per Blight
  stack on you".
- **Jewel sockets:** about three, filled with crafted jewels.
- **A small rule per start region.**

### Other candidates

- More skills (a bow, a damage-over-time spell, minions).
- Unique items.
- More map layouts and bosses.
- A first-time walkthrough.
- Human playtesting of tiers 5+ and league 2.
