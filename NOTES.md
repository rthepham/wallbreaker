# Wallbreaker – prototype notes

Built: milestones M0–M6 (stat sheet, auto-combat, fire casters + death + Diagnosis,
drops/inventory/equipping, crafting, skills & supports, passive tree), plus extras:
all six currencies, salvage + the Smith, item comparison, browser save with migrations.

## Commands
- `npm test` – 56 automated tests (formulas, crafting, skills, supports, passives, keystones, save/load, milestone criteria)
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
| Monster life / hit growth per level | 1.11 / 1.075 | 1.14 / 1.10 | Keeps walls after supports + passives |
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

## Next
Prototype check (20 minutes of play), then M7: zones 6–10 with cold/lightning casters and Blight.
