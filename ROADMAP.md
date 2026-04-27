# Skybaby roadmap

Living document. Foundation-first ordering, agreed 2026-04-27.

Guiding principle: time is irrelevant; only fun and polish matter. Plumbing before pleasure.

## Order of work

### 1. World topology and minimap

Reshape the world before anything else lives inside it.

**Topology**
- Remove vertical wraparound (currently torus on both axes; becoming cylinder).
- Add a ground floor at the bottom: simple, elegant rock or soil cross-section. Should read as solid; no villages live there.
- AI behaviour at the floor: any unit that reaches the rock base layer hastens back up to the islands.
- Top of world: invisible hard ceiling. Looks like endless sky; movement clamped by an invisible flat ceiling line, set high enough that there is a decent amount of sky above the highest islands.
- Update AI, projectiles, and camera to reason about the new bounds (turn-around or clamp at top/bottom rather than wrap).

**Minimap (Godstone-style, simple radial polar mapping)**
- Game world is flat land; minimap renders it as concentric circles (planet illusion).
- Radial mapping: rock base layer = centre of the circle; sky ceiling = outermost ring (ozone / stratosphere band).
- Angular mapping: horizontal world position wraps around the disc (existing horizontal wraparound becomes "going around the planet" for free).
- Pivots so the player's position is always "up" on screen (rotation offset on the angular component).

### 2. World scale to 8x area

Stretch the canvas once topology is settled.

- Target ~8x area, which works out to roughly 2x–4x per axis. Final per-axis split is flexible; pick whatever feels best (e.g. wider than tall, or roughly square) and tune from there.
- Re-balance spawn density and starting positions for the larger space.
- Performance work: culling, spatial partitioning, pathfinding cost, LOD where needed.
- Re-tune camera defaults and minimap radial/angular scale against the new size.

### 3. Four teams

Refactor team logic from binary to quaternary.

- Add Yellow and Red alongside existing Blue and Green.
- Hue-shift the existing unit sprites rather than authoring new art.
- Generalise team IDs, spawn allocation, and the alliance/enmity matrix for N teams.
- Verify all combat, conversion, and AI targeting logic handles four-way conflict.

### 4. Priests and Tokobus

The new combat triangle, last because it is the most balance-sensitive.

**Units**
- Priests (witchdoctors / shamans, Populous: The Beginning lineage).
- Tokobus: tanky monster units. Roughly 1 per 100 normal humans per tribe, gated on population ≥ 100.

**Combat matrix (the inherent balance)**
- Priests can convert Warriors and Tokobus. Cannot convert Peasants.
- Tokobus can kill Warriors and Peasants. Cannot harm Priests or other Tokobus (TBD).
- Warriors can shoot Peasants and other Warriors. Cannot harm Tokobus or Priests.
- Peasants: non-combatant (current behaviour).

**Tuning surface**
- Conversion rates and ranges for Priests.
- Tokobu spawn cadence and population gate.
- Combat coverage matrix tested across all four teams.

## Notes

Each step closes the door on the next; we do not start step N+1 until step N is solid and feels right.
