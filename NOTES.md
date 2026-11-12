# Wallbreaker – prototype notes

Built: milestones M0–M12 in prototype form.
- Zones 1–10 (Swarm, Brute, fire/cold/lightning Casters, Blight), resistance penalty from zone 6.
- 8 gear slots, 7 item types, wands, ~30 mod families; inventory filters, sort, search, change chips.
- 4 skills, 20 supports, element effects (ignite, shock, chill, stun), monster resistances.
- Passive tree: 139 nodes, 9 keystones, region bridges, zoom/pan.
- Maps: 16 tiers, 5 layouts, 6 map mods, map crafting, sustain, map runner.
- Offline progress (50%, 8h cap), save export/import.
- Automation: auto-salvage, loot filter, map runner, craft rules, upgrade advisor.
- Leagues: reset with Legacy points, 6 Legacy upgrades, 12 challenges, heirlooms,
  4 rotating mechanics (Shards, Rifts, Bounties, Echoes).

## Commands
- `npm test` – 86 automated tests (formulas, crafting, skills, supports, passives, keystones, save/load, milestone criteria)
- `npm run balance -- 40 <seed> naive|smart` – headless bot plays 40 sim-minutes and reports per-zone deaths
- `npm run build` – writes `dist/wallbreaker.html` (published page) and `dist/play-local.html`

## Changes from the design doc (all in `src/data/`)
| Value | Doc | Now | Why |
|---|---|---|---|
| Mana regen | 2%/s | 12%/s | Base skill ran dry in seconds; mana became the first wall |
| Cleave mana cost | 6 | 4 | Same |
| Base life regen | 0 | 1.5%/s | With none, every zone kills you by attrition |
| Between-pack recovery | – | 25% life/s while walking | Each pack becomes a fair, diagnosable test |
| Monster damage | ×1 | ×0.4 | Whole pack attacks at once |
| Swarm hit / interval | 0.5× / – | 0.35× / 1.8s | 15 attackers out-damaged every other threat |
| Brute life | – | 1.2× | Brute packs were too tanky for early DPS |
| Zone monster levels | ~5/zone | 1, 4, 8, 13, 18 | Smoother early curve |
| Monster life / hit growth per level | 1.11 / 1.075 | 1.14 / 1.08 (damage scale 0.46) | Keeps walls after supports + passives without zone 8+ one-shotting |
| Zone levels 6–10 | ~5/zone to 50 | 23, 28, 33, 38, 42 | Pacing |
| Chaos res tiers | from ilvl 40 | from ilvl 22 | Blight arrives in zone 7 |
| Map level | 52 + 2×tier | 40 + 1×tier | Tier 1 matches zone 10; 2/tier outran gear by tier 3–4 in playtest |
| Map tier of drops | – | 15% lower / 55% same / 30% higher | Playtest: tier-ups too rare |
| Map resistance penalty | −40% | −30% | Keeps the cap reachable |
| Link slots | 3rd zone 6, 4th map T1, 5th map T8 | zone 3 / 5 / 8 | Earlier build depth |
| Inventory | – | 120 slots | 8 slots of drops |
| Offline XP | – | applies the over-level penalty per run | Prevented +13 levels from farming zone 2 |
| Caster hit | 1.0× | 1.5× | Zone 4 stays a fire wall with a full build |
| Fireball / Arc base damage | 12–18 / 4–30 | 6–9 / 1–10 | Spells outclassed Cleave |
| Spell growth per level | 1.09 | 1.065 | Outgrew weapons ~5× by level 20 |
| Spell mana costs | 10 / 12 | Fireball 4, Arc 5, Ice Nova 4.5 | Matches the mana regen change; Arc stays the hungry one |
| 3rd / 4th link | zone 6 / map T1 | zone 3 / zone 5 | Prototype only has 5 zones |
| Passive tree | ~150 nodes, 8 keystones | 58 nodes, 6 keystones | Prototype scope |
| Keystones | Steady Hand, Last Stand, Ember Heart… | Iron Hide, Ember Heart, Reckless Tempo, Spread Thin, Blood Price (+25% more dmg), Bulwark (+20% res) | Playtest: old ones didn't solve any wall you hit |
| Ailments | not in doc | Fire ignites, lightning shocks, cold chills, heavy physical stuns | Playtest: skills felt identical |
| Monster resistances | zone 8+ only | Brutes 30% phys, casters 40% own element, bosses per zone | Each skill hits a different wall |
| New content | – | Ice Nova skill, Pierce support, lightning casters in zone 5 | Defensive cold build; an answer to resists |
| Last Stand regen | disabled | disabled in fights only | Walking recovery still works |

## Balance snapshot (older; before ailments/resists)
Zones 1–2 by ~4–6 min, zone 3 by ~7–11 min, zone 4 (fire wall, 4–19 runs, nearly all
deaths to fire) by 10–21 min, zone 5 by 16–32 min.
`SKILL=fireball npm run balance -- 35 1 smart` to rerun one.

## Per-skill walls (bot, after ailments/resists)
Fireball: zone 4 (fire casters + fire-resistant boss), done ~18–21 min.
Arc: zone 5 (lightning casters resist it), 33–50 tries.
Ice Nova: zone 5 (low boss damage, lightning casters).
Cleave: steadiest; Brutes resist it, Ember Heart / Searing Edge get around that.

## Bot pacing (latest)
Zone 10 reached in 60–120 min for all skills; first clear ~135 min (Cleave) to ~230 min (Fireball).
Maps: tier 1–2 sustain well (56/66 cleared), but the bot climbs tiers slowly. Tier pacing needs human play.

## Next
Human playtest. Known gaps: tree is ~139 nodes (doc ~150), no start-region choice, no Atlas,
Hollow Vessel / energy shield not built, map tier pacing unverified past tier 2.
