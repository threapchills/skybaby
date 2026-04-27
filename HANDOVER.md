# Handover

Snapshot for the next session. Update at the end of every working session.

**Last updated:** 2026-04-27 (steps 1, 2, 3, 4 complete)

## Current focus

Step 4 (Priests + Tokobus combat triangle) complete and pushed. Roadmap proper is now closed; the live backlog is **graphics + UX polish** (see "Polish backlog" below).

## Recent context

- Step 4 ships the full combat triangle: Priests, Tokobus, and the matrix that binds them.
- **Priest** (`hooded_mystic.png`): conversion specialist; aura range 240, ~4.5s of continuous exposure flips a Warrior or Tokobu. Cannot convert Peasants. Per-priest conversion timer map (multiple priests stack as separate timers — first to finish wins).
- **Tokobu** (`Tokobu-green-{1,2}.png`): MASSIVE 128×128 fireball-throwing heavy. Range 800, holds at ~420 idealRange, 2.6s cooldown. Cannot harm Priests or other Tokobus. Spawned with `source: 'tokobu'` on the Fireball, which `_handleCombat` checks so triangle-protected units are skipped.
- **Combat triangle in code:**
  - Warrior projectiles skip Priests/Tokobus (in `Warrior.updateLogic` targeting and in `_handleCombat` collision).
  - Player Fireballs (default `source: 'spell'`) override the triangle and kill anything.
  - Tokobu Fireballs (`source: 'tokobu'`) skip Priests and other Tokobus.
  - Quake (`spell === 2`) still hits all non-friendly: Priest hp 60 dies in one quake; Tokobu hp 280 takes ~6 quakes. Spells remain the player's god-mode override.
- **Population gating** in `_spawnSpecialUnits` (called every spawn cycle, alongside `_spawnVillagers`):
  - Priests: 1 per 50 humans per tribe, ramps in once pop ≥ 50.
  - Tokobus: 1 per 100 humans per tribe, gated above pop ≥ 100.
- Tokobu spawn position is `island.y - 150` so the 128px sprite has room to fall and trigger the landing check.
- **Hue shifts** for derived team variants (`PRIEST_TOKOBU_HUE`): blue +180°, yellow -55°, red +130°. Single green source for both unit types; everything else is tinted at runtime.
- **Sprite dispatch:** Tokobu extends Warrior so the existing `instanceof Warrior` dispatch in `main.js` flows unchanged; its `updateLogic` is a complete override. Priest extends Villager and gets a separate `applyConversion(dt, allUnits)` call right after `update()`.
- **Spawn callbacks:** changed warrior/tokobu signature from `spawnProjectile` to a `spawn` object with `{ projectile, fireball }`. `Game._unitSpawn` is built once in the constructor so per-frame dispatch isn't allocating arrow functions.
- **Minimap:** Tokobus render as a 3×3 square with a black notch (heavies); Priests render with a soft additive halo.
- Cache-bust now `?v=8` across `index.html`, `js/main.js` imports, and `js/world.js`.

## Polish backlog (Mike's 2026-04-27 feedback — next sprint)

Recorded mid-session and saved here so they survive into the fresh chat.

### Graphics bugs

- **Solid objects look glassy.** Tents, islands, trees, and units are rendering with too much transparency — they should be fully opaque. Audit anywhere `globalAlpha` or low-alpha fills are stacked on entity/island draws.
- **Foreground parallax should be particle-only.** Anything drawn in front of the foreground layer must be sparse particles (motes, dust), not full-bleed cloud bands. Whatever is full-bleed should also be at full opacity.
- **Ground visible too low.** The painted rock cross-section sits below where the rock-bottom collision actually engages. Raise the visible crust to match `getWorldGroundY(worldHeight)` so the floor reads as solid where it acts solid.
- **Sky seams.** Some sky backgrounds show straight horizontal seams. Make every sky layer either seamless tiles or full-bleed at any resolution; no visible joins.
- **Player off-centre on start.** Sometimes the player spawns locked to the top-left of the camera instead of being framed centrally. Investigate the camera initialisation timing (probably one frame of camera lag before first `world.update`).

### HUD / UX

- **Ditch the mana bar.** Mana is infinite by design — the bar is dead weight. Remove the mana row in `#bottom-bar` (and any code that updates it).
- **HUD shrink + four-tribe standings.** The current top bar only shows GREEN vs the lumped-rivals "RIVAL TRIBES" stat. We need a smaller, more elegant readout that surfaces all four tribes' standings (e.g. four compact pips with team colour, pop, tents). Lean into Mike's afrofuturist palette and minimal typography; treat the existing big stat boxes as a draft to replace, not extend.

## Step 4 notes

- Priest conversion uses a per-priest `Map<unit, seconds>`; cleaning up handled by a sweep at the top of `applyConversion` (drops dead/already-converted entries).
- Tokobu's `idealRange` lets them retreat from a target that closes too tight — keeps them in fireball arc rather than locking into a wrestling match they can't perform.
- Tokobu HP 280 with the spell-only kill rule means the player can chip them down with Quake (≈6 hits) or land 3 Fireballs to drop them. They're meant to be intimidating without being unkillable.
- Stomp dust is doubled (12 particles, 90px spread) on Tokobu landings to sell the weight.

## Performance follow-up (deferred, watch for jank)

- `Warrior.updateLogic` allocates `[player, enemyChief, ...villagers]` every frame for each warrior. With 90+ warriors this is ~hundreds of thousands of array elements per second. Replace with a single shared snapshot per frame.
- Separation and target-selection inside that loop are O(n²). At 250+ units expect frame-time pressure. A bucketed spatial grid (cell size ~600) keyed by world X would cut this to near-O(n).
- 120 islands × per-island grass/tree/render cost. Camera culling via `getScreenRect` already works, but verify drawing is short-circuited for off-screen islands.
- Step 4 now adds Priest aura passes and Tokobu fireballs — Priest's `applyConversion` is O(priests × villagers). At 4 tribes × ~10 priests × 800 villagers, that's 32k checks per frame. Bucketed grid would cover this too.

## Decisions locked 2026-04-27

- **World scale (step 2):** target ~8x area, roughly 2x–4x per axis. Per-axis split flexible; tune for feel.
- **Ground floor:** simple, elegant rock or soil cross-section; reads as solid. No villages on the ground; any unit that reaches the rock base hastens back up to the islands.
- **Top of world:** invisible hard ceiling. Looks like endless sky; clamped by a flat ceiling line, set high enough to leave a decent amount of sky above the highest islands.
- **Minimap projection:** simple radial polar mapping. Centre = rock base; outermost ring = sky ceiling (ozone/stratosphere band). Horizontal wrap maps to angular position; pivots so player is always "up" on screen.
- **Combat triangle (step 4):** Warriors shoot Warriors+Peasants; Tokobus throw fireballs at Warriors+Peasants; Priests convert Warriors+Tokobus. Player spells override the triangle.
- **Tokobu silhouette:** MASSIVE — 128×128 reads unmistakably at any zoom.

## Working agreements

- One step at a time _structurally_, but work autonomously across sub-steps. Don't check in between every sub-step; self-review and forge ahead. Mike wants long autonomous stretches.
- Foundation before features (see roadmap rationale).
- British English; no em dashes; no "not X but Y" reformulations.
- **Push to the online live repo once each roadmap step is complete.** Authorised in advance for the scope of "step done = git push". Do not push mid-step or for unrelated changes without confirming.
- **Long autonomous stretches.** If a step finishes with healthy context budget remaining, continue into the next step. If context is getting tight, flag it explicitly so Mike can start a fresh session rather than letting the chat auto-compact.
