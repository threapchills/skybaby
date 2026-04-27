# Handover

Snapshot for the next session. Update at the end of every working session.

**Last updated:** 2026-04-27 (step 1 complete)

## Current focus

Step 1 (world topology + minimap) is complete and pushed. Step 2 (~8x area scaling) is next.

## Recent context

- Step 1 done 2026-04-27. World is now a horizontal cylinder: vertical wrap removed, invisible ceiling at y=-300, rock cross-section at the world bottom (y = worldH-350 down). Units that sink toward the floor get a hasten-home upward impulse and steer to the nearest island above. Stone walls crumble at the rock floor. New `WORLD_CEILING_Y`, `WORLD_GROUND_THICKNESS`, `WORLD_HASTEN_BAND` constants exported from `entities.js`.
- Godstone-style minimap added (bottom-right of HUD): radial polar projection, rock at centre, ozone halo at the rim, player always at "up", concentric atmosphere bands and tiny team-coloured dots for islands and units.
- Trees now plant by their sprite bottom plus a fixed 6px overlap so they sit cleanly on the island surface regardless of scale; previously large trees poked roots through the island underside.
- Restored deleted `villager_green_1.png` / `villager_blue_1.png` from HEAD so the loading screen can finish.
- Cache-bust query strings bumped from `?v=4` to `?v=5` across `index.html` and module imports.
- Difficulty system v3, painted skies, foreground parallax, fire glow remain.

## Next action

Begin step 2: scale world to ~8x area. Likely involves: bumping `worldWidth` / `worldHeight` in `main.js` (currently 6000 × 3000); generalising spawn density in `_generateWorld` and `_spawnInitialUnits`; checking projectile lifetimes and AI travel times against the larger space; and adding spatial partitioning where needed for performance. The minimap and rock floor scale with `this.height` automatically; verify nothing else is hard-coded against the small world.

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
