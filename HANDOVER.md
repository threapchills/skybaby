# Handover

Snapshot for the next session. Update at the end of every working session.

**Last updated:** 2026-04-27 (steps 1–4 + polish + balance sprint complete)

## Current focus

The full roadmap (steps 1–4) is closed. Two follow-up sprints have landed: a graphics/UX polish pass and a four-team balance pass. Cache-bust is now `?v=10`. Live repo is in sync.

## Balance sprint (DifficultyManager v4 + four-team AI)

Symptom Mike reported: "I literally did nothing, just stood there and ended up winning massively." Pip standings showed green at 655 pop while blue/yellow/red sat at 69/2/68.

Three root causes, all fixed:

### 1. DifficultyManager only watched green vs blue
- v3 scored `tentDelta = greenTents - blueTents` and ignored yellow + red entirely. When a rival tribe other than blue was leading, the system saw "blue is even with green" and concluded the game was balanced.
- v4 scores against the **strongest current rival**: `tentDelta = greenTents - max(blueTents, yellowTents, redTents)`. In two-team play this is identical to v3 (blue WAS the max rival), so the original calibration is preserved.
- v4 also blends in a **population signal** (60% tents, 40% pop). When a tribe's pop is wildly out of sync with their tent count (the failure mode Mike caught), the score reflects ground truth instead of stale territory data.
- `update(dt, greenTents, teamTents, greenPop, teamPops, ...)` — full team dictionaries passed in.

### 2. Yellow + red chiefs were passive
- v3 only ran active shooting AI for the blue chief. Yellow + red wandered but never engaged. Their tribes were missing 75% of their chief-level offensive presence.
- New `Game._updateChiefAI(dt, chief)` runs the full shooting AI for any chief. Each rival picks the **closest hostile chief** (player or another rival) within range, fires arrows at the v3 cooldown, and fireballs at the same probability. Each chief has its own independent `fireCooldown`.
- Projectile and Fireball team is `chief.team` (not hardcoded `'blue'`), so every projectile carries the right colour and triggers the right team's spawn-on-hit logic.

### 3. Every rival warrior was ganging up on green
- In ATTACK phase, warriors picked their target via `enemies.find(e => e instanceof Player && e.team !== this.team)`. Because the player chief sits at index 0 of the enemies snapshot, `.find` returned the player FIRST for every rival warrior. Yellow warriors hunted green; red warriors hunted green; blue warriors hunted green. Rivals never fought each other, so green absorbed all the attention while rival populations bled out.
- Now warriors pick the **closest** non-friendly chief — could be the player or another rival. A red warrior near a yellow village will attack yellow, not trek across the map to attack green. Real four-way melee with no allies.

### Verification
After 30s of idle play under v4 (player did nothing): blue 342/14, green 256/9, red 93/7, yellow 81/6. Blue was leading the player on both pop and tents. The "stand there and win" failure mode is gone.

## What changed in the polish sprint

### Solids no longer look glassy
- Foreground trees and foreground grass on `Island.drawForeground` now draw at FULL opacity. The old "permanent translucent scrim" alpha (0.35–0.42) is gone; instead, each FG prop is skipped entirely when its centre is within 110px on-screen of the player. So solids read as solids at distance, and never occlude the player up close.
- Burnt FG trees keep a 0.4 alpha — that one transparency is intentional (scorched silhouette).

### Foreground parallax: particles only
- `World.drawForeground` no longer paints the front cloud bank or the bottom volumetric fog. Only the rock crust (a true world feature) and bright additive motes (true particles) cross in front of entities now.
- Motes were upgraded to a brighter additive core + soft halo so they read as luminous specks, not haze.

### Sky seams killed
- `ParallaxLayer` now pre-renders a "feathered" copy of its source image into an offscreen canvas, with the top and bottom 12% (min 24px) gradient-erased. That kills any visible horizontal seam from cloud-band tile edges, no matter the viewport size.
- The feather is built once on image load and re-used.

### Ground crust = collision plane
- `WORLD_HASTEN_FRACTION` was 0.07 (≈560px on an 8000-tall world). Now 0.012 (≈100px). The hasten band still brakes fast-falling units, but its top sits right at the visible rock surface — no more phantom floor hundreds of pixels above the painted crust.
- Visible top of the crust now coincides with where collision actually pushes back.

### Player centred on game start
- `Camera.snapTo(target)` warps the camera to centre the target instantly, zeros the look-ahead, and respects the same vertical clamps as `follow`. It's called both at the end of `Game._generateWorld` (so the very first paint frames the player centrally) and again on the LOADING/TITLE/TOOLTIP → PLAYING transition.

### Mana bar removed
- `#resources-container` and the mana row gone from `index.html`.
- `ResourceManager` now exposes `mana = Infinity` permanently. `spendMana`, `addMana`, `addSouls`, `spendAir`, `replenishAll` are all kept as no-op shims so existing call sites in `main.js` (fireball, quake, hookshot, etc.) keep flowing.

### HUD redesigned for four tribes
- Replaced the two big stats-boxes with `#tribe-strip`: a single compact strip of four pips (one per team), showing pop · tents. The player's tribe gets a subtle highlight (`is-player`); a wiped-out tribe gets `is-dead` styling (struck-through name, faded numbers).
- Player HP is now a slim 5px bar pinned top-right (`#player-hp` + `#player-hp-fill`). No portrait, no enemy mirror.
- Spell slots shrank from 56×56 to 46×46. Bouncy keyframe animation removed; active-state is now a calm scale + glow rim.
- Type sizes pulled in across the board for a more elegant minimal feel.

## Step 4 — Combat triangle (intact)

- **Priests** (`hooded_mystic.png`, 40×48): conversion aura 240, ~4.5s exposure, runic ground ring, halo arc, hovering bob, glowing wisp + spark trail. Per-priest target Map; cleanup sweep on each frame.
- **Tokobus** (`Tokobu-green-{1,2}.png`, 128×128 — MASSIVE): fireball range 800, ideal-range 420, 2.6s cooldown. Drama: double shadow, rotating infernal sigil, breathing silhouette, twin eye-embers, ember emission, recoil shudder + bigger muzzle flash, smoke trail.
- **Combat triangle** wired in `entities.js` + `main.js`. Warrior arrows skip Priests/Tokobus; Tokobu fireballs are tagged `source: 'tokobu'` and respect the triangle; player spells override it (god-mode kept intact).
- **Population gating** in `_spawnSpecialUnits`: 1 Priest per 50 humans (≥50 pop), 1 Tokobu per 100 humans (≥100 pop), per tribe.
- **Hue rotations** for blue/yellow/red derivations from the green source: `+180/−55/+130`.

## Performance follow-up (still deferred — watch for jank)

- `Warrior.updateLogic` allocates `[player, enemyChief, ...villagers]` every frame for each warrior. With 90+ warriors this is hundreds of thousands of array elements per second. Replace with a single shared snapshot per frame.
- Separation and target-selection inside that loop are O(n²). At 250+ units expect frame-time pressure. A bucketed spatial grid (cell size ~600) keyed by world X would cut this to near-O(n).
- 120 islands × per-island grass/tree/render cost. Camera culling via `getScreenRect` already works, but verify drawing is short-circuited for off-screen islands.
- Priest's `applyConversion` is O(priests × villagers). At 4 tribes × ~10 priests × 800 villagers, that's 32k checks per frame. Bucketed grid would cover this too.
- Step 4 polish adds per-frame phase advances and constant ember/smoke particle emission for Tokobus. Cosmetic only, but watch the active-particle count when 20+ Tokobus are on screen at once.

## Decisions locked 2026-04-27

- **World scale (step 2):** target ~8x area, roughly 2x–4x per axis. 18000×8000 chosen.
- **Ground floor:** simple rock cross-section, visible top = collision plane. Hasten band ~100px (was 560).
- **Top of world:** invisible hard ceiling, room above the highest islands.
- **Minimap projection:** simple radial polar mapping.
- **Combat triangle (step 4):** Warriors shoot Warriors+Peasants; Tokobus throw fireballs at Warriors+Peasants; Priests convert Warriors+Tokobus. Player spells override the triangle.
- **Tokobu silhouette:** MASSIVE — 128×128.
- **Mana:** infinite by design. No bar surfaces it.
- **HUD:** four-tribe pip strip, slim HP, smaller spells. No portraits, no enemy mirror.
- **Foreground layers:** anything drawn after entities must be PARTICLES (no full-bleed bands). Solids must be opaque.

## Working agreements

- One step at a time _structurally_, but work autonomously across sub-steps. Don't check in between every sub-step; self-review and forge ahead. Mike wants long autonomous stretches.
- Foundation before features (see roadmap rationale).
- British English; no em dashes; no "not X but Y" reformulations.
- **Push to the online live repo once each roadmap step is complete.** Authorised in advance for the scope of "step done = git push". Do not push mid-step or for unrelated changes without confirming.
- **Long autonomous stretches.** If a step finishes with healthy context budget remaining, continue into the next step. If context is getting tight, flag it explicitly so Mike can start a fresh session rather than letting the chat auto-compact.
