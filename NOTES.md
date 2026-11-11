# Wallbreaker – prototype notes

Built: milestones M0–M4 (stat sheet, auto-combat, fire casters + death + Diagnosis,
drops/inventory/equipping, crafting), plus a few cheap extras: all six currencies,
salvage + the Smith, item comparison, basic browser save.

## Commands
- `npm test` – 23 automated tests (formulas, crafting rules, determinism, save/load, M1–M4 criteria)
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
| Caster hit | 1.0× | 1.2× | Makes zone 4 a real fire wall |
| Zone monster levels | ~5/zone | 1, 4, 8, 13, 18 | Smoother early curve |

## Balance snapshot (bot, 5 seeds)
Zones 1–2 cleared by ~4 min, zone 3 (Brutes) by ~8 min, zone 4 (fire) 11–20 min with
most deaths from fire, zone 5 ~20–28 min.

## Next
Prototype check (20 minutes of play), then M5 skills & supports.
