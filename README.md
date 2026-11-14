# Ferro Yard — a three.js tactical FPS

A round-based tactical shooter in the style Counter-Strike made famous — with its
own map, art, sounds and names. Vanguard (you + 3 bots) attacks; Rustjackals
(4 bots) defend two bomb sites in an industrial container yard.

## How to play

```sh
node serve.ts   # then open http://localhost:8080
```

- **W A S D** move, **mouse** look (click to lock the pointer), **click** fire,
  **R** reload, **Ctrl** crouch, **Space** jump
- **B** buy menu (buy phase only), **1–4** switch weapon, **G** throw grenade,
  **E** hold to plant / defuse the charge
- Win a round by eliminating the other team, by the charge exploding, or by
  defusing it. Earn money per kill and per round; spend it between rounds.
  First to 5 rounds takes the match.

## The game

- **Map:** Ferro Yard — a 44×30 m container yard with three lanes, two bomb
  sites (A west, B east), crates and stacked containers for cover.
- **Gunplay:** four guns (P9 Sidearm, VK-7 Carbine, Kestrel-9 SMG, Longbow DMR)
  plus a Spark Grenade; hitscan against bodies with headshot multipliers, recoil
  and spread that punish firing on the move, acceleration-based movement with
  crouching and collision.
- **Tactics:** bomb plant/defuse objective, round economy, a buy menu, and bots
  that follow waypoint routes, hold positions, react to what they see and hear,
  and strafe while firing in bursts.
- **Presentation:** original palette and geometry, procedural WebAudio sounds
  (no audio files), HUD with health, ammo, money, round timer, score, team
  counts, kill feed and plant progress.

## Layout

- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to `/output`
  and writes `dossier.json` with the vendored make.fun library.
- `game/` — the playable game, static files, no build step. three.js 0.187.0
  is vendored under `game/vendor/three/`.
- `screenshots/` — real renders of the game's own code, taken in headless
  Chrome with `?shot=…&seed=1`.
- `vendor/makefun-threejs.ts` — the kit's dossier library, unchanged.
