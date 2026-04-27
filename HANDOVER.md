# Handover

Snapshot for the next session. Update at the end of every working session.

**Last updated:** 2026-04-27 (steps 1, 2, 3 complete)

## Current focus

Steps 1, 2, 3 all complete and pushed. Step 4 (Priests + Tokobus combat triangle) is next.

## Recent context

- Step 1 (cylinder world + minimap) and step 2 (~8x area) both pushed 2026-04-27.
- World dims now 18000 × 8000 (was 6000 × 3000). Aspect 2.25:1, area 144M (8x). Per-axis: 3x wider, ~2.67x taller.
- Topology: vertical wrap removed; invisible ceiling at y=-300; rock cross-section at the bottom whose thickness scales with worldH (≈12% of height); hasten-band above ground (≈7%) where units gain upward impulse and steer to the nearest island above. Stone walls crumble at the rock floor.
- Helpers in `entities.js`: `WORLD_CEILING_Y`, `getWorldGroundThickness`, `getWorldHastenBand`, `getWorldGroundY`, `getWorldHastenY`. World drawing in `world.js` imports these.
- Procedural islands: 120 (was 30) distributed in x ∈ [2400, 15600], y ∈ [1200, 5800]. Home green at (600, 2700) and home blue at (15900, 2700). Tribe affiliation by horizontal proximity (green if x<4500, blue if x>13500).
- Starting populations: 60 villagers + 30 warriors per tribe (was 20 + 10). Pigs: 18-32 (was 5-11). Steady-state cap 500 villagers / 50 pigs unchanged.
- Player and enemy chiefs spawn just above their home islands (y=2200) so the camera frames a populated archipelago immediately.
- Godstone-style radial polar minimap (bottom-right of HUD): rock crust at centre, ozone halo at rim, horizontal wrap → angular position, rotates so the player is always at "up". Concentric atmosphere bands plus team-coloured dots for islands and tiny pixels for units.
- Trees now plant by sprite bottom with a fixed 6px overlap so large trees no longer poke through island undersides regardless of scale.
- Restored `villager_green_1.png` / `villager_blue_1.png` from HEAD (their absence was stalling the loader).
- Cache-bust query strings now `?v=6` across `index.html` and module imports.

## Next action

Begin step 4: Priests and Tokobus.

**Combat triangle (per Mike's brief):**
- Priests can convert Warriors and Tokobus. Cannot convert Peasants.
- Tokobus can kill Warriors and Peasants. Cannot harm Priests or other Tokobus.
- Warriors can shoot Peasants and other Warriors. Cannot harm Tokobus or Priests.
- Peasants are non-combatant.

**Tokobu population gating:** roughly 1 Tokobu per 100 humans per tribe, only above population ≥ 100.

**Sprite assets staged in `assets/sprites/`:** `Tokobu-green-1.png`, `Tokobu-green-2.png`, `hooded_mystic.png`, etc. Hue-shift the green Tokobu variants for yellow + red just like step 3 did with villagers.

## Step 3 notes

- Yellow is hue-rotated -55° from green; red is hue-rotated +130° from blue. Empirical, can be tuned in `entities.js` `TEAM_HUE_FROM`.
- AI chiefs (blue, yellow, red) all run the same wandering pickup-and-target AI; only the blue chief gets aim-and-fire shooting (in `_updateEnemyAI`). Yellow and red are passive contributors for now — bumping them to active shooting is a follow-up.
- HUD aggregates blue+yellow+red into the existing "RIVAL TRIBES" stat box; the minimap is the place to read the four-tribe picture at a glance.
- Cache-bust now `?v=7`.

## Performance follow-up (mostly addressed in step 3)

- ✅ Per-frame `enemiesSnapshot` array now built once per tick rather than per warrior.
- Still O(n²) inside warrior separation/targeting; bucket spatial grid is the next lever if we see jank at 400+ units.
- 120 islands × per-island grass/tree/render cost. Camera culling already skips off-screen islands.

## Performance follow-up (deferred, watch for jank)

- `Warrior.updateLogic` allocates `[player, enemyChief, ...villagers]` every frame for each warrior. With 90+ warriors this is ~hundreds of thousands of array elements per second. Replace with a single shared snapshot per frame.
- Separation and target-selection inside that loop are O(n²). At 250+ units expect frame-time pressure. A bucketed spatial grid (cell size ~600) keyed by world X would cut this to near-O(n).
- 120 islands × per-island grass/tree/render cost. Camera culling via `getScreenRect` already works, but verify drawing is short-circuited for off-screen islands.

## Decisions locked 2026-04-27

- **World scale (step 2):** target ~8x area, roughly 2x–4x per axis. Per-axis split flexible; tune for feel.
- **Ground floor:** simple, elegant rock or soil cross-section; reads as solid. No villages on the ground; any unit that reaches the rock base hastens back up to the islands.
- **Top of world:** invisible hard ceiling. Looks like endless sky; clamped by a flat ceiling line, set high enough to leave a decent amount of sky above the highest islands.
- **Minimap projection:** simple radial polar mapping. Centre = rock base; outermost ring = sky ceiling (ozone/stratosphere band). Horizontal wrap maps to angular position; pivots so player is always "up" on screen.

## Working agreements

- One step at a time _structurally_, but work autonomously across sub-steps. Don't check in between every sub-step; self-review and forge ahead. Mike wants long autonomous stretches.
- Foundation before features (see roadmap rationale).
- British English; no em dashes; no "not X but Y" reformulations.
- **Push to the online live repo once each roadmap step is complete.** Authorised in advance for the scope of "step done = git push". Do not push mid-step or for unrelated changes without confirming.
- **Long autonomous stretches.** If a step finishes with healthy context budget remaining, continue into the next step. If context is getting tight, flag it explicitly so Mike can start a fresh session rather than letting the chat auto-compact.
