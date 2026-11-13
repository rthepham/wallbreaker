# Wallbreaker

An idle action RPG that runs in the browser. Your character fights on its own; you make it
stronger by planning its build (skills, support gems, passive tree, gear and crafting). When
progress stalls, the Diagnosis panel tells you why in plain terms, and fixing the build breaks
through the wall.

## Play

Open `dist/play-local.html` in a browser. Progress saves in that browser.

## Develop

Requires Node.js 18+.

```bash
npm install
npm test          # automated tests
npm run build     # writes dist/wallbreaker.html and dist/play-local.html
npm run balance -- 40 1 smart   # a bot plays 40 simulated minutes and reports where it got stuck
```

Pick the bot's skill with `SKILL=fireball` (or `cleave`, `arc`, `ice_nova`).

## Layout

- `src/data/` – all balance numbers (zones, monsters, items, mods, skills, passives, maps, leagues)
- `src/` – game logic: stats, combat, loot, crafting, diagnosis, maps, the game loop
- `src/ui/` – the browser screen
- `tests/` – automated tests
- `tools/` – build script and the balance bot

The game logic has no UI code in it, so it can be tested and simulated on its own.
The design as built is in `docs/GDD.md`. `NOTES.md` records where and why the numbers moved away from the original design doc.
