/* GAME ENGINE - REMASTERED
   Optimized core with time dilation, spatial awareness,
   2.5D rendering pipeline, and Populous-inspired gameplay.
*/

import { InputHandler } from './input.js?v=6';
import { ResourceManager } from './resources.js?v=6';
import { World, getBackgroundProgress, getSkyVariantImage, pickRandomSkyVariant } from './world.js?v=6';
import {
    Player, Island, Villager, Warrior, Projectile,
    Pig, Leaf, Snowflake, Assets, Fireball, StoneWall,
    RainCloud, VisualEffect, Totem,
    spawnBlood, spawnParticle, updateParticles, drawParticles,
    getAssetProgress,
    WORLD_CEILING_Y, getWorldGroundY
} from './entities.js?v=6';
import { AudioManager } from './audio.js?v=6';

/* DYNAMIC DIFFICULTY MANAGER (v3 — invisible)
   Design constraints learnt the hard way:
     1. Adjustments must be invisible to the player. No toasts, no auras,
        no tier label. The system breathes silently.
     2. Default is a wide DEADBAND around equilibrium where nothing happens.
        Tent delta within ±2 → no modulation at all.
     3. Modulation only HELPS the underdog. The dominant side gets a tiny
        nudge at most. We never compound buffs that create runaway loops.
     4. Hard cap on every lever (±15% from baseline). Multiple subtle levers
        beat one big lever, but each one stays gentle.
     5. Single primary signal (tent delta) — the cleanest, slowest-moving
        measure of "who is winning". Avoids twitchy reactions to fight RNG.
*/
class DifficultyManager {
    constructor() {
        // score in [-1, +1]: negative = player struggling, positive = dominating.
        this.score = 0;
        this.targetScore = 0;

        this._t = 0;
        this._evalTimer = 0;
        this._evalInterval = 3.0;
        this._lastTents = { green: -1, blue: -1 };
        this.captureEvents = [];
        this.lossEvents = [];
        this.deathEvents = [];
        this.windowSec = 20;

        // Deadband — within ±N tent delta the system is fully neutral
        this.deadbandTents = 2;
        this.fullSwingTents = 6; // |tent delta| of 6 → |score| of 1.0
    }

    notePlayerKill()  { /* noise — not used in v3 */ }
    notePlayerDeath() { this.deathEvents.push(this._t); }

    update(dt, greenTents, blueTents, _playerHp) {
        this._t += dt;

        // Track tent transitions for momentum (small influence only)
        if (this._lastTents.green >= 0) {
            const dG = greenTents - this._lastTents.green;
            const dB = blueTents - this._lastTents.blue;
            if (dG > 0) for (let i = 0; i < dG; i++) this.captureEvents.push(this._t);
            if (dG < 0 && dB > 0) for (let i = 0; i < dB; i++) this.lossEvents.push(this._t);
        }
        this._lastTents.green = greenTents;
        this._lastTents.blue = blueTents;

        const cutoff = this._t - this.windowSec;
        this.captureEvents = this.captureEvents.filter(t => t > cutoff);
        this.lossEvents    = this.lossEvents.filter(t => t > cutoff);
        this.deathEvents   = this.deathEvents.filter(t => t > cutoff);

        this._evalTimer += dt;
        if (this._evalTimer >= this._evalInterval) {
            this._evalTimer = 0;
            this._recomputeTarget(greenTents, blueTents);
        }

        // Slow lerp — score traverses its band over ~5s
        this.score += (this.targetScore - this.score) * 0.20 * dt;
    }

    _recomputeTarget(greenTents, blueTents) {
        const tentDelta = greenTents - blueTents;
        const absDelta = Math.abs(tentDelta);

        // DEADBAND: well-balanced game → fully neutral
        if (absDelta <= this.deadbandTents) {
            // Slight pull from death events (let recently-dying player breathe)
            this.targetScore = -Math.min(0.4, this.deathEvents.length * 0.18);
            return;
        }

        // Outside deadband: scale by how far we are past it
        const past = absDelta - this.deadbandTents;
        const range = this.fullSwingTents - this.deadbandTents;
        const mag = Math.min(1, past / range);
        let s = Math.sign(tentDelta) * mag;

        // Tiny momentum adjustment from recent flips (10% influence max)
        const flipMomentum = (this.captureEvents.length - this.lossEvents.length) * 0.04;
        s += flipMomentum;

        // Recent player deaths bias the system toward easing up
        s -= this.deathEvents.length * 0.12;

        if (s > 1) s = 1;
        if (s < -1) s = -1;
        this.targetScore = s;
    }

    // === LEVERS — invisible to the player, hard-capped ===
    // Player support (>=1.0). Boosts kick in only when score < -0.3.
    playerSupport() {
        const s = -this.score;          // positive when player struggling
        if (s < 0.3) return 1.0;
        return 1.0 + Math.min(0.20, (s - 0.3) * 0.40);
    }
    // Enemy aggression (>=1.0). Tiny boost only when player is clearly ahead.
    enemyAggression() {
        const s = this.score;            // positive when player dominant
        if (s < 0.3) return 1.0;
        return 1.0 + Math.min(0.15, (s - 0.3) * 0.30);
    }
    // Boolean: should green islands spawn an extra unit this batch?
    shouldBoostPlayerSpawn() { return this.score < -0.45; }
    // Boolean: should blue islands spawn an extra unit this batch?
    shouldBoostEnemySpawn()  { return this.score > 0.55; }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // World scale v2 — ~8x area (was 6000 × 3000 = 18M; now 18000 × 8000 = 144M).
        // Roughly 3x wider, 2.67x taller, aspect 2.25:1. Plenty of room for
        // four-tribe warfare without breaking horizontal-cylinder semantics.
        this.worldWidth = 18000;
        this.worldHeight = 8000;
        this.uiState = 'LOADING';

        this.titleImg = new Image(); this.titleImg.src = 'assets/title.png';
        this.tooltipImg = new Image(); this.tooltipImg.src = 'assets/tooltip.png';

        // Pick a sky variant up-front so the loading screen can use it.
        this.loadingSkyMeta = pickRandomSkyVariant();
        this.loadingSkyImg = getSkyVariantImage(this.loadingSkyMeta.path);

        this.uiLayer = document.getElementById('ui-layer');
        this.uiLayer.style.display = 'none';
        // Hide the legacy "Loading..." DOM element — we draw our own scene.
        const lt = document.getElementById('loading-text');
        if (lt) lt.style.display = 'none';

        this.input = new InputHandler();
        this.resources = new ResourceManager();
        this.world = new World(this.worldWidth, this.worldHeight);
        this.audio = new AudioManager();
        this.audioReady = false;
        this.audio.loadAll().then(() => { this.audioReady = true; });

        // Loading-screen state
        this._loadStart = performance.now();
        this._loadProgress = 0;
        this._loadDone = false;
        this._loadDoneTime = 0;
        this._loadingMotes = [];
        for (let i = 0; i < 60; i++) {
            this._loadingMotes.push({
                x: Math.random(),
                y: Math.random(),
                z: 0.3 + Math.random() * 1.4,
                phase: Math.random() * Math.PI * 2,
                speed: 4 + Math.random() * 14,
                size: 0.6 + Math.random() * 2.0
            });
        }

        this.input.onScroll((delta) => this.resources.cycleSpell(delta > 0 ? 1 : -1));

        // Spawn the chiefs just above their home islands so the camera frames
        // a populated archipelago from the very first frame.
        this.player = new Player(1200, 2200, 'green');
        this.enemyChief = new Player(16500, 2200, 'blue');
        this.enemyChief.mana = 100;
        this.enemyChief.maxMana = 100;

        this.islands = [];
        this.villagers = [];
        this.projectiles = [];
        this.fireballs = [];
        this.walls = [];
        this.visualEffects = [];
        this.pigs = [];
        this.leaves = [];
        this.snowflakes = [];
        this.rainClouds = [];
        this.totems = [];

        this.season = Math.random() > 0.5 ? 'summer' : 'winter';
        this._generateWorld();
        this.islands.forEach(island => island.setSeason(this.season === 'winter'));

        this.lastTime = 0;
        this.spawnTimer = 0;
        this.hookTarget = null;
        this.gameOver = false;
        this.impactFrameTimer = 0;

        // Day/night cycle
        this.dayCycleTimer = 0;
        this.dayTime = 0;
        this.dayCount = 0;

        // Weather caps
        this.maxLeaves = 40;
        this.maxSnowflakes = 50;
        this.weatherTimer = 0;

        // War Director
        this.warState = 'BUILD';
        this.warTimer = 40;

        // Dynamic difficulty
        this.difficulty = new DifficultyManager();

        // Performance: track FPS
        this._frameCount = 0;
        this._fpsTimer = 0;
        this.fps = 60;

        window.addEventListener('click', () => this._startAudio(), { once: true });
        window.addEventListener('keydown', () => this._startAudio(), { once: true });
        this._bindNavigation();

        requestAnimationFrame((ts) => this.loop(ts));
    }

    _bindNavigation() {
        const handler = () => this._handleScreenNav();
        window.addEventListener('mousedown', handler);
        window.addEventListener('keydown', handler);
    }

    _handleScreenNav() {
        if (this.uiState === 'LOADING') {
            // Only advance from LOADING once everything is ready
            if (this._loadDone) {
                this.uiState = 'TITLE';
                this.navCooldown = true;
                setTimeout(() => { this.navCooldown = false; }, 200);
            }
        } else if (this.uiState === 'TITLE' && !this.navCooldown) {
            this.uiState = 'TOOLTIP';
            this.navCooldown = true;
            setTimeout(() => { this.navCooldown = false; }, 200);
        } else if (this.uiState === 'TOOLTIP' && !this.navCooldown) {
            this.uiState = 'PLAYING';
            const lt = document.getElementById('loading-text');
            if (lt) lt.style.display = 'none';
        }
    }

    _startAudio() {
        if (this.audioStarted) return;
        this.audioStarted = true;
        this.audio.resume();
        this.audio.startLoop('ambience', 0.5);
        this.audio.startLoop('music', 0.4);
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        if (this.world) {
            this.world.camera.w = this.canvas.width;
            this.world.camera.h = this.canvas.height;
        }
    }

    _generateWorld() {
        // Home islands — anchors of the green and blue tribes. Scaled larger to
        // suit the wider world. People still look like specks against them.
        this.islands.push(new Island(600, 2700, 1500, 100, 'green'));
        this.islands.push(new Island(15900, 2700, 1500, 100, 'blue'));

        // Procedural archipelago. Target density: ~120 islands across the
        // 18000-wide world (was 30 across 6000-wide, so similar per-pixel
        // density). Procedural altitude band sits between the home islands'
        // altitude and the rock floor's hasten-band.
        const PROC_ISLAND_COUNT = 120;
        const minX = 2400;
        const maxX = 15600;
        const minY = 1200;
        const maxY = 5800;
        for (let i = 0; i < PROC_ISLAND_COUNT; i++) {
            for (let attempt = 0; attempt < 80; attempt++) {
                const rx = minX + Math.random() * (maxX - minX);
                const ry = minY + Math.random() * (maxY - minY);
                const rw = 600 + Math.random() * 600;
                const rh = 90;

                let ok = true;
                for (let j = 0; j < this.islands.length; j++) {
                    const e = this.islands[j];
                    if (rx < e.x + e.w + 400 && rx + rw + 400 > e.x &&
                        ry < e.y + e.h + 400 && ry + rh + 400 > e.y) {
                        ok = false; break;
                    }
                }

                if (ok) {
                    // Tribe affiliation by horizontal proximity to a home island.
                    let team = 'neutral';
                    if (rx < 4500) team = 'green';
                    else if (rx > 13500) team = 'blue';
                    this.islands.push(new Island(rx, ry, rw, rh, team));
                    break;
                }
            }
        }

        // Pigs — herds scattered among the islands. Density tracks the larger
        // archipelago so wildlife still feels alive but never crowded.
        const pigCount = 18 + Math.floor(Math.random() * 14);
        for (let i = 0; i < pigCount; i++) {
            const home = this.islands[Math.floor(Math.random() * this.islands.length)];
            const pig = new Pig(home.x + Math.random() * (home.w - 50), home.y - 60);
            pig.homeIsland = home;
            this.pigs.push(pig);
        }

        this.player.visitedIslands.add(this.islands[0]);
        this._spawnInitialUnits();
    }

    _spawnInitialUnits() {
        // Tripled starting populations to suit the 8x-area world. Each tribe
        // begins with enough citizenry that the archipelago feels populated
        // without trivialising the warrior cap.
        const VILLAGERS_PER_TRIBE = 60;
        const WARRIORS_PER_TRIBE  = 30;
        ['green', 'blue'].forEach(team => {
            const validIslands = this.islands.filter(i => i.team === team || i.team === 'neutral');
            let cV = 0, cW = 0;
            while (cV < VILLAGERS_PER_TRIBE || cW < WARRIORS_PER_TRIBE) {
                const island = validIslands[Math.floor(Math.random() * validIslands.length)];
                if (!island) continue;
                const x = island.x + 30 + Math.random() * (island.w - 60);
                const y = island.y - 50;
                if (cV < VILLAGERS_PER_TRIBE) {
                    const v = new Villager(x, y, team);
                    v.homeIsland = island;
                    this.villagers.push(v);
                    cV++;
                } else {
                    const w = new Warrior(x, y, team);
                    w.homeIsland = island;
                    this.villagers.push(w);
                    cW++;
                }
            }
        });
    }

    loop(timestamp) {
        const dtRaw = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        const realDt = Math.min(dtRaw, 0.05);

        // Time dilation: game dt is scaled by camera's time dilation
        const gameDt = realDt * this.world.camera.timeDilation;

        // FPS tracking
        this._frameCount++;
        this._fpsTimer += realDt;
        if (this._fpsTimer >= 1) {
            this.fps = this._frameCount;
            this._frameCount = 0;
            this._fpsTimer = 0;
        }

        try {
            this.update(gameDt, realDt);
            this.draw(realDt);
        } catch (e) {
            console.error("GAME CRASH PREVENTED:", e);
        }

        requestAnimationFrame((ts) => this.loop(ts));
    }

    update(dt, realDt) {
        if (this.uiState !== 'PLAYING' || this.gameOver) return;

        // Spell keys
        if (this.input.keys.digit1) this.resources.setSpell(0);
        if (this.input.keys.digit2) this.resources.setSpell(1);
        if (this.input.keys.digit3) this.resources.setSpell(2);
        if (this.input.keys.digit4) this.resources.setSpell(3);

        this._updateTotemLogic(dt);
        this._updateIslandDynamics(dt);

        // Impact frame pause
        if (this.impactFrameTimer > 0) {
            this.impactFrameTimer -= realDt;
            if (this.impactFrameTimer > 0.08) return;
        }

        // Day/night cycle
        this.dayCycleTimer += dt;
        if (this.dayCycleTimer < 20) {
            this.dayTime = (this.dayCycleTimer / 20) * Math.PI;
        } else if (this.dayCycleTimer < 30) {
            this.dayTime = Math.PI + ((this.dayCycleTimer - 20) / 10) * Math.PI;
        } else {
            this.dayCycleTimer = 0;
            this.dayTime = 0;
            this.dayCount++;
            this._checkSeasonChange();
        }

        // Player update
        this.player.update(dt, this.input, this.resources, this.worldWidth, this.worldHeight, this.islands, this.audio, this.enemyChief, this.walls);
        this.world.update(this.player, realDt);

        // Weather
        this._updateWeather(dt);

        // Villagers
        for (let i = 0; i < this.villagers.length; i++) {
            const v = this.villagers[i];
            if (v.dead) continue;
            if (v instanceof Warrior) {
                v.updateLogic(dt, this.islands, [this.player, this.enemyChief, ...this.villagers],
                    (x, y, a, t, d) => this.projectiles.push(new Projectile(x, y, a, t, d)),
                    this.worldWidth, this.worldHeight, this.audio,
                    v.team === 'green' ? this.player : this.enemyChief,
                    this.villagers, this.walls, this.warState
                );
            } else {
                v.update(dt, this.islands, this.worldWidth, this.worldHeight, this.pigs, this.walls, this.warState);
            }
        }

        // Pigs
        for (let i = 0; i < this.pigs.length; i++) {
            this.pigs[i].update(dt, this.islands, this.worldWidth, this.worldHeight);
        }

        this._handleSpellCasting(dt);
        this._checkCollisions(dt);
        this._handleCombat(dt);
        this._handleShooting(dt);

        // Spawning
        this.spawnTimer += dt;
        if (this.spawnTimer > 3) {
            this._spawnVillagers();
            this._spawnPigs();
            this.spawnTimer = 0;
        }

        // Enemy chief
        if (!this.enemyChief.dead) {
            this.enemyChief.update(dt, null, null, this.worldWidth, this.worldHeight, this.islands, null, this.player, this.walls);
            this._updateEnemyAI(dt);
        }

        // War Director
        this._updateWarDirector(dt);

        // Particles (pooled)
        updateParticles(dt);

        // Stats
        const greenCount = this.villagers.filter(v => v.team === 'green' && !v.dead).length;
        const blueCount = this.villagers.filter(v => v.team === 'blue' && !v.dead).length;
        const greenTents = this.islands.filter(i => i.hasTeepee && i.team === 'green').length;
        const blueTents = this.islands.filter(i => i.hasTeepee && i.team === 'blue').length;

        this.resources.updateStats(greenTents, greenCount, blueTents, blueCount);
        this.resources.updateUI(this.player.hp, this.player.maxHp, this.enemyChief.hp, this.enemyChief.maxHp, dt);

        // Dynamic difficulty — invisible to the player. Updates only the
        // tent-tracking state; effect functions are queried where needed.
        this.difficulty.update(dt, greenTents, blueTents, this.player.hp);

        // Invisible support heal — when the system reads "player struggling",
        // gently top up the chief's HP. Capped, slow, never visible as a
        // notification. Combined with regular regen this keeps the player
        // alive long enough to recover, without trivialising fights.
        const support = this.difficulty.playerSupport();
        if (support > 1.05 && !this.player.dead && this.player.hp < this.player.maxHp) {
            this._supportHealTimer = (this._supportHealTimer || 0) + dt;
            if (this._supportHealTimer >= 1.5) {
                this._supportHealTimer = 0;
                this.player.hp = Math.min(this.player.maxHp, this.player.hp + 2);
            }
        } else {
            this._supportHealTimer = 0;
        }

        // Victory / Defeat
        this._checkWinConditions(greenCount, blueCount);

        // Gradually restore time dilation
        if (this.world.camera.targetTimeDilation < 1.0) {
            this._dilationResetTimer = (this._dilationResetTimer || 0) + dt;
            if (this._dilationResetTimer > 0.8) {
                this.world.camera.resetTimeDilation();
                this.world.camera.resetZoom();
                this._dilationResetTimer = 0;
            }
        }
    }

    _checkWinConditions(greenCount, blueCount) {
        if (this.player.dead) {
            if (greenCount > 0) {
                this.player.respawnTimer -= 0.016;
                if (this.player.respawnTimer <= 0) {
                    this.player.dead = false;
                    this.player.hp = 100;
                    this.player.x = this.islands[0].x;
                    this.player.y = this.islands[0].y - 100;
                    spawnBlood(this.player.x, this.player.y, '#00ff00', 15);
                }
            } else {
                this.gameOver = true;
                this.resources.showMessage("DEFEAT! Your tribe has fallen.", "#FF0000");
                setTimeout(() => location.reload(), 4000);
            }
        }

        if (this.enemyChief.dead) {
            if (blueCount > 0) {
                this.enemyChief.respawnTimer -= 0.016;
                if (this.enemyChief.respawnTimer <= 0) {
                    this.enemyChief.dead = false;
                    this.enemyChief.hp = 100;
                    const lastIsland = this.islands[this.islands.length - 1];
                    this.enemyChief.x = lastIsland.x;
                    this.enemyChief.y = lastIsland.y - 100;
                }
            } else {
                this.gameOver = true;
                this.resources.showMessage("VICTORY! You have conquered the skies!", "#FFD700");
                setTimeout(() => location.reload(), 4000);
            }
        }
    }

    _updateTotemLogic(dt) {
        // Reset counts
        for (let i = 0; i < this.islands.length; i++) {
            this.islands[i].greenCount = 0;
            this.islands[i].blueCount = 0;
        }

        // Census
        for (let i = 0; i < this.villagers.length; i++) {
            const v = this.villagers[i];
            if (v.dead) continue;

            // Check which island they're on
            for (let j = 0; j < this.islands.length; j++) {
                const isl = this.islands[j];
                if (v.x >= isl.x && v.x <= isl.x + isl.w &&
                    v.y >= isl.y - 120 && v.y <= isl.y + isl.h) {
                    v.homeIsland = isl;
                    break;
                }
            }

            if (v.homeIsland && this.islands.includes(v.homeIsland)) {
                if (v.team === 'green') v.homeIsland.greenCount++;
                else if (v.team === 'blue') v.homeIsland.blueCount++;
            }
        }

        // Spawn totems
        for (let i = 0; i < this.islands.length; i++) {
            const island = this.islands[i];
            for (let t = 0; t < 2; t++) {
                const team = t === 0 ? 'green' : 'blue';
                const count = team === 'green' ? island.greenCount : island.blueCount;
                if (count > 10) {
                    const hasTotem = this.totems.some(tot =>
                        tot.team === team &&
                        Math.abs(tot.x - (island.x + island.w * 0.5)) < 200 &&
                        Math.abs(tot.y - (island.y - 10)) < 200
                    );
                    if (!hasTotem) {
                        this.totems.push(new Totem(island.x + island.w * 0.5, island.y - 10, team));
                        this.audio.play('teepee');
                    }
                }
            }
        }

        // Collapse totems
        for (let i = this.totems.length - 1; i >= 0; i--) {
            const t = this.totems[i];
            const island = this.islands.find(isl =>
                t.x >= isl.x - 50 && t.x <= isl.x + isl.w + 50 &&
                t.y >= isl.y - 150 && t.y <= isl.y + isl.h + 50
            );
            if (island) {
                const count = t.team === 'green' ? island.greenCount : island.blueCount;
                if (count < 5) { t.active = false; this.totems.splice(i, 1); }
            } else {
                this.totems.splice(i, 1);
            }
        }

        // Update totems
        for (let i = 0; i < this.totems.length; i++) {
            this.totems[i].update(dt, this.villagers);
        }
    }

    _checkSeasonChange() {
        if (Math.random() < 0.3) {
            this.season = this.season === 'summer' ? 'winter' : 'summer';
            this.islands.forEach(island => island.setSeason(this.season === 'winter'));
            this.resources.showMessage(`SEASON: ${this.season.toUpperCase()}`, "#FFFFFF");
        }
    }

    _updateWeather(dt) {
        this.weatherTimer -= dt;
        if (this.weatherTimer <= 0) {
            this.weatherTimer = 0.15;
            const cam = this.world.camera;
            const x = cam.x + Math.random() * cam.effectiveW;
            const y = cam.y - 100;

            if (this.season === 'winter' && this.snowflakes.length < this.maxSnowflakes) {
                this.snowflakes.push(new Snowflake(x, y, Math.random() > 0.5 ? 'fg' : 'bg'));
            } else if (this.season === 'summer' && this.leaves.length < this.maxLeaves) {
                this.leaves.push(new Leaf(x, y, Math.random() > 0.5 ? 'fg' : 'bg'));
            }
        }

        // Update visual effects
        for (let i = this.visualEffects.length - 1; i >= 0; i--) {
            this.visualEffects[i].update(dt);
            if (this.visualEffects[i].dead) this.visualEffects.splice(i, 1);
        }

        // Update weather particles
        for (let i = this.leaves.length - 1; i >= 0; i--) {
            this.leaves[i].update(dt);
            if (this.leaves[i].dead || this.leaves[i].y > this.world.camera.y + this.world.camera.effectiveH + 100) {
                this.leaves.splice(i, 1);
            }
        }
        for (let i = this.snowflakes.length - 1; i >= 0; i--) {
            this.snowflakes[i].update(dt);
            if (this.snowflakes[i].dead || this.snowflakes[i].y > this.world.camera.y + this.world.camera.effectiveH + 100) {
                this.snowflakes.splice(i, 1);
            }
        }

        // Rain clouds
        for (let i = this.rainClouds.length - 1; i >= 0; i--) {
            this.rainClouds[i].update(dt);
            if (this.rainClouds[i].dead) this.rainClouds.splice(i, 1);
        }
    }

    _updateIslandDynamics(dt) {
        for (let i = 0; i < this.islands.length; i++) {
            const island = this.islands[i];

            if (!island.driftTarget) island.driftTimer = 0;
            island.driftTimer -= dt;
            if (island.driftTimer <= 0) {
                island.driftTarget = {
                    vx: (Math.random() - 0.5) * 10,
                    vy: (Math.random() - 0.5) * 5
                };
                island.driftTimer = 5 + Math.random() * 10;
            }

            if (!island.joinedWith) {
                island.vx += (island.driftTarget.vx - island.vx) * 0.5 * dt;
                island.vy += (island.driftTarget.vy - island.vy) * 0.5 * dt;
            }

            if (island.joinedWith) {
                island.joinTimer -= dt;
                if (island.joinTimer <= 0) {
                    if (island.joinedWith) island.joinedWith.joinedWith = null;
                    island.joinedWith = null;
                }
            }

            // Collision with other islands
            for (let j = i + 1; j < this.islands.length; j++) {
                this._resolveIslandCollision(island, this.islands[j], dt);
            }

            island.update(dt, this.player, this.enemyChief, this.audio);
        }
    }

    _resolveIslandCollision(a, b, dt) {
        if (a.x < b.x + b.w && a.x + a.w > b.x &&
            a.y < b.y + b.h && a.y + a.h > b.y) {

            const dy = (a.y + a.h * 0.5) - (b.y + b.h * 0.5);
            const dist = Math.abs(dy);
            const minced = (a.h + b.h) * 0.5;

            if (dist < minced * 0.9) {
                const force = (minced - dist) * 10;
                if (dy > 0) a.vy += force * dt;
                else a.vy -= force * dt;
            }

            const vRel = Math.sqrt((a.vx - b.vx) ** 2 + (a.vy - b.vy) ** 2);
            if (vRel < 50 && !a.joinedWith && !b.joinedWith) {
                a.joinedWith = b;
                b.joinedWith = a;
                a.joinTimer = 10 + Math.random() * 10;
                const avgVx = (a.vx + b.vx) * 0.5;
                const avgVy = (a.vy + b.vy) * 0.5;
                a.vx = avgVx; b.vx = avgVx;
                a.vy = avgVy; b.vy = avgVy;
            } else if (vRel > 100) {
                a.vx *= -0.8;
                b.vx *= -0.8;
            }
        }
    }

    _updateWarDirector(dt) {
        this.warTimer += dt;

        if (this.warState === 'BUILD') {
            if (this.warTimer > 60) {
                this.warState = 'GATHER';
                this.warTimer = 0;
                this.resources.showMessage("WAR DRUMS SOUND!", "#FF4500");
                this.audio.play('drum_loop', 0.5);
            }
        } else if (this.warState === 'GATHER') {
            if (this.warTimer > 15) {
                this.warState = 'ATTACK';
                this.warTimer = 0;
                this.resources.showMessage("CHARGE!", "#FF0000");
                this.audio.play('horn');

                // Epic zoom out for battle
                this.world.camera.setZoom(0.6);
            }
        } else if (this.warState === 'ATTACK') {
            const gc = this.villagers.filter(v => v.team === 'green' && !v.dead).length;
            const bc = this.villagers.filter(v => v.team === 'blue' && !v.dead).length;

            if (this.warTimer > 60 || gc < 3 || bc < 3) {
                this.warState = 'BUILD';
                this.warTimer = 0;
                this.resources.showMessage("RETREAT & REBUILD", "#00FF00");
                this.world.camera.resetZoom();
            }
        }
    }

    _checkCollisions(dt) {

        // Eat pigs
        for (let i = this.pigs.length - 1; i >= 0; i--) {
            const p = this.pigs[i];
            if (p.dead) continue;
            const dx = this.player.x - p.x;
            const dy = this.player.y - p.y;
            if (dx * dx + dy * dy < 2500) {
                p.dead = true;
                this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20);
                this.audio.play('hit', 1.0, 1.5);
                spawnBlood(p.x, p.y, '#FFC0CB', 8);
                this.pigs.splice(i, 1);
            }
        }
    }

    _updateEnemyAI(dt) {
        const dx = this.player.x - this.enemyChief.x;
        const dy = this.player.y - this.enemyChief.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Baselines are the original game values. The only difficulty lever
        // here is enemyAggression(), which can shorten the chief's shoot
        // cooldown by up to 15% when the player is clearly dominating.
        const aggro = this.difficulty.enemyAggression();      // 1.00 .. 1.15
        const detectRange = 800;
        const shootCD = 1.5 / aggro;
        const burstCD = 3.0 / aggro;
        const fireballChance = 0.01;
        const projDmg = 15;

        if (dist < detectRange && this.enemyChief.fireCooldown <= 0) {
            this.enemyChief.fireCooldown = shootCD;
            const angle = Math.atan2(dy, dx);
            this.projectiles.push(new Projectile(this.enemyChief.x + 20, this.enemyChief.y + 20, angle, 'blue', projDmg));
        }

        if (this.enemyChief.fireCooldown <= 0 && Math.random() < fireballChance) {
            this.enemyChief.fireCooldown = burstCD;
            const angle = Math.atan2(dy, dx);
            this.fireballs.push(new Fireball(this.enemyChief.x + 20, this.enemyChief.y + 20, angle, 'blue'));
        }
    }

    _handleSpellCasting(dt) {
        if (!this.input.mouse.rightDown) {
            this.hookTarget = null;
            return;
        }

        const wm = this.input.getWorldMouse(this.world.camera);
        const mx = wm.x;
        const my = wm.y;
        const spell = this.resources.currentSpell;

        // AIR: Hookshot (continuous)
        if (spell === 1) {
            if (this.resources.spendAir(dt)) {
                this._doHookshot(dt, mx, my);
                if (Math.random() < 0.1) this.audio.play('air', 0.12);
            }
        } else if (this.player.fireCooldown <= 0) {
            // FIREBALL
            if (spell === 0 && this.resources.spendMana(80)) {
                this.player.fireCooldown = 0.5;
                const angle = Math.atan2(my - (this.player.y + 20), mx - (this.player.x + 20));
                this.fireballs.push(new Fireball(this.player.x + 20, this.player.y + 20, angle, 'green'));
                this.audio.play('fire', 0.25);

                // Time dilation on fireball cast
                this.world.camera.setTimeDilation(0.3, 6);
                this.world.camera.setZoom(0.9);
                this.world.camera.addTrauma(0.2);
            }
            // EARTHQUAKE
            else if (spell === 2 && this.resources.spendMana(40)) {
                this.player.fireCooldown = 2.0;
                this.world.camera.addTrauma(0.7);
                this.audio.play('earth', 0.2);

                // Epic time dilation
                this.world.camera.setTimeDilation(0.15, 3);
                this.world.camera.setZoom(0.65);

                for (let i = 0; i < this.villagers.length; i++) {
                    const v = this.villagers[i];
                    if (v.team !== 'green' && !v.dead && v.onGround) {
                        v.vy = -1000;
                        v.hp -= 50;
                        spawnBlood(v.x, v.y, '#8B4513', 8);
                        if (v.hp <= 0) {
                            v.dead = true;
                            spawnBlood(v.x, v.y);
                            this.difficulty.notePlayerKill();
                        }
                    }
                }

                if (!this.enemyChief.dead && this.enemyChief.isGrounded) {
                    this.enemyChief.vy = -1000;
                    this.enemyChief.hp -= 20;
                    spawnBlood(this.enemyChief.x, this.enemyChief.y, '#cc0000', 15);
                }

                // Ground debris
                for (let k = 0; k < 15; k++) {
                    spawnParticle(
                        this.world.camera.x + Math.random() * this.world.camera.effectiveW,
                        this.world.camera.y + this.world.camera.effectiveH,
                        '#8B4513', 0, 1.0, 10 + Math.random() * 15, 'normal'
                    );
                }
            }
            // TIDE OF LIFE
            else if (spell === 3 && this.resources.spendMana(80)) {
                this.player.fireCooldown = 1.0;
                this.rainClouds.push(new RainCloud(mx, my, 'green'));
                this._forceSpawnVillagers(mx, my, 'green');
                this.audio.play('water', 0.25);

                // Gentle time dilation
                this.world.camera.setTimeDilation(0.5, 5);
            }
        }
    }

    _doHookshot(dt, mx, my) {
        let hit = false;
        for (let i = 0; i < this.islands.length; i++) {
            const island = this.islands[i];
            if (mx >= island.x - 20 && mx <= island.x + island.w + 20 &&
                my >= island.y - 20 && my <= island.y + island.h + 20) {
                hit = true;
                const dx = this.player.x - island.x;
                const targetY = (this.player.y + this.player.h) - 10;
                const dy = targetY - island.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                island.vx += (dx / (dist + 1)) * 1500 * dt;
                if (Math.abs(dy) > 10) island.vy += dy * 5 * dt;
                else island.vy *= 0.8;
                break;
            }
        }
        const prevHit = this.hookTarget && this.hookTarget.hit;
        this.hookTarget = { x: mx, y: my, hit };
        // Whoosh on initial connect for that satisfying yank
        if (hit && !prevHit) this.audio.playWhoosh(1.0);
    }

    _handleCombat(dt) {
        // Projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.update(dt, this.walls);
            let hitSomething = false;

            // Hit enemy chief
            if (p.team === 'green' && !this.enemyChief.dead && this._checkHit(p, this.enemyChief)) {
                spawnBlood(p.x, p.y);
                this.enemyChief.hp -= p.damage;
                hitSomething = true;
                this.audio.play('hit', 0.4, 0.3);
                if (this.enemyChief.hp <= 0) this._killChief(this.enemyChief);
            }

            // Hit player
            if (p.team === 'blue' && !this.player.dead && this._checkHit(p, this.player)) {
                spawnBlood(p.x, p.y);
                this.player.hp -= p.damage;
                hitSomething = true;
                this.audio.play('hit', 0.4, 0.3);
                if (this.player.hp <= 0) this._killChief(this.player);
            }

            // Hit villagers
            for (let j = 0; j < this.villagers.length; j++) {
                const v = this.villagers[j];
                if (v.team !== p.team && !v.dead && this._checkHit(p, v)) {
                    spawnBlood(v.x, v.y);
                    v.hp -= p.damage;
                    hitSomething = true;
                    this.audio.play('hit', 0.3, 0.3);
                    if (v.hp <= 0) {
                        v.dead = true;
                        spawnBlood(v.x, v.y);
                        if (p.team === 'green') this.difficulty.notePlayerKill();
                    }
                }
            }

            if (hitSomething) p.dead = true;
            if (p.dead) this.projectiles.splice(i, 1);
        }

        // Fireballs
        for (let i = this.fireballs.length - 1; i >= 0; i--) {
            const f = this.fireballs[i];
            f.update(dt);
            let hit = false;

            // Island collision
            for (let j = 0; j < this.islands.length; j++) {
                const island = this.islands[j];
                if (f.x > island.x && f.x < island.x + island.w &&
                    f.y > island.y && f.y < island.y + island.h) {
                    f.dead = true;
                    hit = true;
                    spawnBlood(f.x, f.y, '#FF4500', 12);
                    this.audio.play('hit', 0.5, 0.1);

                    // Scorch trees
                    for (let t = 0; t < island.trees.length; t++) {
                        if (Math.abs((island.x + island.trees[t].x) - f.x) < 80) {
                            island.trees[t].burnt = true;
                            island.trees[t].burntTimer = 15;
                        }
                    }
                    break;
                }
            }

            // Hit chiefs
            if (f.team === 'green' && !this.enemyChief.dead && this._checkHit(f, this.enemyChief)) {
                this.enemyChief.hp -= 40 * dt;
            }
            if (f.team === 'blue' && !this.player.dead && this._checkHit(f, this.player)) {
                this.player.hp -= 40 * dt;
            }

            // Insta-kill villagers
            for (let j = 0; j < this.villagers.length; j++) {
                const v = this.villagers[j];
                if (!v.dead && v.team !== f.team && this._checkHit(f, v)) {
                    v.dead = true;
                    spawnBlood(v.x, v.y, '#FF4500', 15);
                    if (f.team === 'green') {
                        this.resources.addSouls(5);
                        this.difficulty.notePlayerKill();
                    }
                }
            }

            if (f.dead) this.fireballs.splice(i, 1);
        }

        // Clean dead villagers
        for (let i = this.villagers.length - 1; i >= 0; i--) {
            if (this.villagers[i].dead) this.villagers.splice(i, 1);
        }
    }

    _killChief(chief) {
        chief.dead = true;
        chief.respawnTimer = 8.0;
        spawnBlood(chief.x, chief.y, '#cc0000', 40);
        this.world.camera.addTrauma(0.9);
        this.audio.play('death', 0.8, 0.1);

        // EPIC KILL: Time dilation + zoom
        this.world.camera.setTimeDilation(0.08, 2);
        this.world.camera.setZoom(1.2);
        this.impactFrameTimer = 0.15;

        if (chief === this.enemyChief) {
            this.resources.replenishAll();
            // Felling the chief is a strong dominance signal
            this.difficulty.notePlayerKill();
            this.difficulty.notePlayerKill();
            this.difficulty.notePlayerKill();
        } else {
            // Player chief fell — bias the system toward easing up
            this.difficulty.notePlayerDeath();
        }
    }

    _checkHit(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x &&
            a.y < b.y + b.h && a.y + a.h > b.y;
    }

    _handleShooting(dt) {
        if (!this.input.mouse.leftDown || this.player.fireCooldown > 0) return;

        this.player.fireCooldown = 0.1;
        const wm = this.input.getWorldMouse(this.world.camera);
        const angle = Math.atan2(wm.y - (this.player.y + 20), wm.x - (this.player.x + 20));
        const spread = (Math.random() - 0.5) * 0.1;

        this.projectiles.push(new Projectile(this.player.x + 20, this.player.y + 20, angle + spread, 'green', 20));

        // Recoil
        this.player.vx -= Math.cos(angle) * 80;
        this.player.vy -= Math.sin(angle) * 40;

        this.audio.play('shoot', 0.5, 0.3);
    }

    _forceSpawnVillagers(x, y, team) {
        let bestDist = Infinity;
        let bestIsland = null;

        for (let i = 0; i < this.islands.length; i++) {
            const island = this.islands[i];
            if (island.team === team && island.hasTeepee) {
                const d = Math.sqrt((island.x - x) ** 2 + (island.y - y) ** 2);
                if (d < bestDist) { bestDist = d; bestIsland = island; }
            }
        }

        if (bestIsland && bestDist < 1000) {
            const count = 5 + Math.floor(Math.random() * 4);
            for (let i = 0; i < count && this.villagers.length < 500; i++) {
                const unit = Math.random() < 0.4
                    ? new Warrior(bestIsland.x + 50, bestIsland.y - 40, team)
                    : new Villager(bestIsland.x + 50, bestIsland.y - 40, team);
                unit.homeIsland = bestIsland;
                unit.vx = (Math.random() - 0.5) * 200;
                unit.vy = -300;
                this.villagers.push(unit);
            }
        }
    }

    _spawnVillagers() {
        if (this.villagers.length >= 500) return;
        // Spawn batch is at the original baseline. The only nudges are:
        //   - +1 to PLAYER batch when the player is clearly struggling.
        //   - +1 to ENEMY batch only when the player is clearly dominating.
        // Both gated by deadband — equilibrium games are completely untouched.
        const helpPlayer = this.difficulty.shouldBoostPlayerSpawn();
        const helpEnemy  = this.difficulty.shouldBoostEnemySpawn();

        for (let i = 0; i < this.islands.length; i++) {
            const island = this.islands[i];
            if (island.hasTeepee && (island.team === 'green' || island.team === 'blue') && Math.random() < 0.6) {
                let batchSize = 3 + Math.floor(Math.random() * 3);
                if (island.team === 'green' && helpPlayer) batchSize += 1;
                if (island.team === 'blue'  && helpEnemy)  batchSize += 1;
                for (let b = 0; b < batchSize && this.villagers.length < 500; b++) {
                    const spawnX = island.x + 30 + Math.random() * (island.w - 60);
                    const unit = Math.random() < 0.4
                        ? new Warrior(spawnX, island.y - 40, island.team)
                        : new Villager(spawnX, island.y - 40, island.team);
                    unit.homeIsland = island;
                    this.villagers.push(unit);
                }
                if (this.villagers.length >= 500) break;
            }
        }
    }

    _spawnPigs() {
        if (this.pigs.length >= 50) return;
        for (let i = 0; i < this.islands.length; i++) {
            if (Math.random() < 0.08) {
                const island = this.islands[i];
                const pig = new Pig(island.x + Math.random() * (island.w - 50), island.y - 60);
                pig.homeIsland = island;
                this.pigs.push(pig);
                if (this.pigs.length >= 50) break;
            }
        }
    }

    // === LOADING SCREEN ===
    _updateLoadProgress(realDt) {
        const ap = getAssetProgress();
        const bp = getBackgroundProgress();
        // Treat audio as one bundle worth ~10 image-equivalents so it weighs in
        const audioWeight = 10;
        const audioReady = this.audioReady ? audioWeight : 0;
        const titleReady = (this.titleImg.complete ? 1 : 0) + (this.tooltipImg.complete ? 1 : 0);
        const totalReady = ap.ready + bp.ready + audioReady + titleReady;
        const totalNeed  = ap.total + bp.total + audioWeight + 2;
        const target = totalNeed > 0 ? totalReady / totalNeed : 1;

        // Smooth the progress bar so it doesn't jitter or jump
        this._loadProgress += (target - this._loadProgress) * Math.min(1, realDt * 6);

        // Don't claim "done" until target is essentially 1 AND a brief
        // settle window has passed so the user can see 100%.
        if (!this._loadDone && target >= 0.999) {
            this._loadDoneTime += realDt;
            if (this._loadDoneTime > 0.4) this._loadDone = true;
        }
    }

    _drawLoadingScreen(ctx, realDt) {
        const W = this.canvas.width;
        const H = this.canvas.height;

        // 1. Painted sky as backdrop (covers the full canvas, gracefully scales).
        if (this.loadingSkyImg && this.loadingSkyImg.complete && this.loadingSkyImg.naturalWidth > 0) {
            const ih = this.loadingSkyImg.naturalHeight;
            const iw = this.loadingSkyImg.naturalWidth;
            const scale = Math.max(W / iw, H / ih);
            const sw = iw * scale, sh = ih * scale;
            ctx.drawImage(this.loadingSkyImg, (W - sw) * 0.5, (H - sh) * 0.5, sw, sh);
        } else {
            // Pre-image fallback: deep gradient using the chosen sky's tint
            const t = this.loadingSkyMeta.tint;
            const g = ctx.createLinearGradient(0, 0, 0, H);
            g.addColorStop(0, `rgb(${Math.floor(t.r*0.4)},${Math.floor(t.g*0.4)},${Math.floor(t.b*0.5)})`);
            g.addColorStop(1, `rgb(${t.r},${t.g},${t.b})`);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
        }

        // 2. Atmospheric darkening + chromatic vignette so the type pops
        const vGrad = ctx.createLinearGradient(0, 0, 0, H);
        vGrad.addColorStop(0, 'rgba(0,0,0,0.35)');
        vGrad.addColorStop(0.5, 'rgba(0,0,0,0.20)');
        vGrad.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = vGrad;
        ctx.fillRect(0, 0, W, H);

        // 3. Drifting motes (warm pollen / dust) — adds life to the still scene
        const time = (performance.now() - this._loadStart) / 1000;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < this._loadingMotes.length; i++) {
            const m = this._loadingMotes[i];
            m.phase += realDt * (0.6 + m.z * 0.4);
            m.x -= (m.speed * m.z * realDt) / W;
            if (m.x < -0.05) m.x = 1.05;
            const px = m.x * W + Math.sin(m.phase) * 8;
            const py = m.y * H + Math.cos(m.phase * 0.7) * 6;
            const a = (0.18 + Math.sin(m.phase) * 0.12) * m.z;
            ctx.fillStyle = `rgba(255,235,200,${Math.max(0.05, a)})`;
            ctx.beginPath();
            ctx.arc(px, py, m.size * m.z, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // 4. Title block — large display type with subtle bloom
        ctx.save();
        ctx.textAlign = 'center';
        const titleY = H * 0.42;

        // Soft glow pass
        ctx.fillStyle = 'rgba(255,210,150,0.18)';
        ctx.font = 'bold 72px "Segoe UI", Tahoma, sans-serif';
        ctx.fillText('SOAR', W * 0.5, titleY);

        ctx.fillStyle = '#FFE6C2';
        ctx.shadowColor = 'rgba(255,180,120,0.6)';
        ctx.shadowBlur = 18;
        ctx.fillText('SOAR', W * 0.5, titleY);

        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '300 22px "Segoe UI", Tahoma, sans-serif';
        ctx.fillText('M Y S T I K   S K I E S', W * 0.5, titleY + 40);
        ctx.restore();

        // 5. Progress bar — copper/labradorite palette, glassy
        const barW = Math.min(560, W * 0.52);
        const barH = 8;
        const barX = (W - barW) * 0.5;
        const barY = H * 0.62;

        // Track
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        this._roundRect(ctx, barX, barY, barW, barH, 4);
        ctx.fill();

        // Fill — animated gradient
        const p = Math.min(1, Math.max(0, this._loadProgress));
        if (p > 0.001) {
            const fillW = barW * p;
            const fg = ctx.createLinearGradient(barX, 0, barX + barW, 0);
            fg.addColorStop(0, '#C97A3D');     // copper
            fg.addColorStop(0.5, '#E8B872');   // warm highlight
            fg.addColorStop(1, '#7CD0C2');     // labradorite teal
            ctx.fillStyle = fg;
            this._roundRect(ctx, barX, barY, fillW, barH, 4);
            ctx.fill();

            // Highlight scan
            const scanX = barX + ((time * 220) % (fillW + 80)) - 40;
            const scanGrad = ctx.createLinearGradient(scanX - 30, 0, scanX + 30, 0);
            scanGrad.addColorStop(0, 'rgba(255,255,255,0)');
            scanGrad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
            scanGrad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.save();
            ctx.beginPath();
            this._roundRect(ctx, barX, barY, fillW, barH, 4);
            ctx.clip();
            ctx.fillStyle = scanGrad;
            ctx.fillRect(scanX - 30, barY, 60, barH);
            ctx.restore();
        }

        // 6. Caption: percentage + status text
        ctx.textAlign = 'center';
        ctx.font = '500 12px "Segoe UI", Tahoma, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        const pct = Math.floor(p * 100);
        const verb = this._loadDone ? 'READY' : (pct < 35 ? 'GATHERING WINDS' : pct < 70 ? 'PAINTING SKIES' : pct < 95 ? 'AWAKENING SPIRITS' : 'KINDLING THE EMBERS');
        ctx.fillText(`${verb}   ·   ${pct}%`, W * 0.5, barY + 32);

        // 7. Click hint (only when ready)
        if (this._loadDone) {
            const pulse = 0.55 + Math.sin(time * 3.2) * 0.35;
            ctx.font = '600 16px "Segoe UI", Tahoma, sans-serif';
            ctx.fillStyle = `rgba(255,255,255,${pulse})`;
            ctx.fillText('CLICK OR PRESS ANY KEY TO BEGIN', W * 0.5, H * 0.78);
        } else {
            // Tiny moodline / variant name
            ctx.font = '300 11px "Segoe UI", Tahoma, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.fillText(this.loadingSkyMeta.name, W * 0.5, H * 0.78);
        }

        // 8. Author crest at the bottom
        ctx.font = '300 10px "Segoe UI", Tahoma, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.30)';
        ctx.fillText('A WHYLE GAME', W * 0.5, H - 18);
    }

    _roundRect(ctx, x, y, w, h, r) {
        if (w < r * 2) r = w * 0.5;
        if (h < r * 2) r = h * 0.5;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y,     x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x,     y + h, r);
        ctx.arcTo(x,     y + h, x,     y,     r);
        ctx.arcTo(x,     y,     x + w, y,     r);
        ctx.closePath();
    }

    // === RENDER PIPELINE ===
    draw(realDt) {
        const ctx = this.ctx;
        const cam = this.world.camera;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Loading screen — drawn until every asset is decoded
        if (this.uiState === 'LOADING') {
            this._updateLoadProgress(realDt);
            this._drawLoadingScreen(ctx, realDt);
            return;
        }

        // Title / Tooltip screens
        if (this.uiState === 'TITLE') {
            this.uiLayer.style.display = 'none';
            if (this.titleImg.complete) {
                ctx.drawImage(this.titleImg, 0, 0, this.canvas.width, this.canvas.height);
            } else {
                ctx.fillStyle = '#0a0a1a';
                ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 40px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText("SOAR: MYSTIK SKIES", this.canvas.width * 0.5, this.canvas.height * 0.5);
                ctx.font = '18px sans-serif';
                ctx.fillStyle = '#888';
                ctx.fillText("Click to begin", this.canvas.width * 0.5, this.canvas.height * 0.5 + 50);
            }
            return;
        }

        if (this.uiState === 'TOOLTIP') {
            this.uiLayer.style.display = 'none';
            if (this.tooltipImg && this.tooltipImg.complete) {
                ctx.drawImage(this.tooltipImg, 0, 0, this.canvas.width, this.canvas.height);
            }
            return;
        }

        this.uiLayer.style.display = 'flex';

        // Reset any inherited canvas filter (legacy code used CSS invert; we now do
        // it as a clean overlay below so the rest of the frame isn't mangled).
        if (this.canvas.style.filter && this.canvas.style.filter !== 'none') {
            this.canvas.style.filter = 'none';
        }
        const isImpact = this.impactFrameTimer > 0;

        ctx.save();

        // Apply zoom
        const z = cam.zoom;
        ctx.scale(z, z);

        // Apply camera rotation (from shake)
        if (cam.shakeAngle !== 0) {
            const cx = cam.effectiveW * 0.5;
            const cy = cam.effectiveH * 0.5;
            ctx.translate(cx, cy);
            ctx.rotate(cam.shakeAngle);
            ctx.translate(-cx, -cy);
        }

        // Sky + parallax backgrounds (back pass)
        this.world.drawBackground(ctx, this.season, this.dayTime);

        // Weather BG layer
        for (let i = 0; i < this.leaves.length; i++) { if (this.leaves[i].layer === 'bg') this.leaves[i].draw(ctx, cam); }
        for (let i = 0; i < this.snowflakes.length; i++) { if (this.snowflakes[i].layer === 'bg') this.snowflakes[i].draw(ctx, cam); }

        // Rain clouds
        for (let i = 0; i < this.rainClouds.length; i++) this.rainClouds[i].draw(ctx, cam);

        // 2.5D Islands (depth-sorted by Y)
        const sortedIslands = this.islands.slice().sort((a, b) => a.y - b.y);
        for (let i = 0; i < sortedIslands.length; i++) sortedIslands[i].draw(ctx, cam);

        // Walls
        for (let i = 0; i < this.walls.length; i++) this.walls[i].draw(ctx, cam);

        // Totems
        for (let i = 0; i < this.totems.length; i++) this.totems[i].draw(ctx, cam);

        // Pigs
        for (let i = 0; i < this.pigs.length; i++) this.pigs[i].draw(ctx, cam);

        // Villagers
        for (let i = 0; i < this.villagers.length; i++) this.villagers[i].draw(ctx, cam);

        // Projectiles
        for (let i = 0; i < this.projectiles.length; i++) this.projectiles[i].draw(ctx, cam);

        // Fireballs
        for (let i = 0; i < this.fireballs.length; i++) this.fireballs[i].draw(ctx, cam);

        // Chiefs
        if (!this.enemyChief.dead) this.enemyChief.draw(ctx, cam);
        if (!this.player.dead) this.player.draw(ctx, cam);

        // Volumetric warm fire-light pass — only at night.
        // Drawn after chiefs so warriors / villagers near the fire bask in it.
        const sunHeight = Math.sin(this.dayTime);
        const nightI = Math.max(0, Math.min(1, -sunHeight * 1.0 + 0.05));
        if (nightI > 0.05) {
            for (let i = 0; i < this.islands.length; i++) {
                this.islands[i].drawFireGlow(ctx, cam, nightI);
            }
        }

        // Aim indicator — restrained, glowy, snappy crosshair
        if (!this.player.dead) {
            const pRect = cam.getScreenRect(this.player.x + 20, this.player.y + 20, 0, 0);
            const mx = this.input.mouse.x / z;
            const my = this.input.mouse.y / z;
            const canFire = this.player.fireCooldown <= 0;
            const pulse = 0.55 + Math.sin(Date.now() * 0.008) * 0.25;

            // Aim line — short tracer near the mouse, fading toward the player
            const dx = mx - pRect.x;
            const dy = my - pRect.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 30) {
                const ux = dx / len, uy = dy / len;
                const a = canFire ? 0.55 : 0.25;
                const lineGrad = ctx.createLinearGradient(pRect.x, pRect.y, mx, my);
                const col = canFire ? '124,255,149' : '255,140,140';
                lineGrad.addColorStop(0, `rgba(${col},0)`);
                lineGrad.addColorStop(0.7, `rgba(${col},${a * 0.4})`);
                lineGrad.addColorStop(1, `rgba(${col},${a})`);
                ctx.strokeStyle = lineGrad;
                ctx.lineWidth = canFire ? 1.6 : 1.2;
                ctx.setLineDash(canFire ? [] : [5, 5]);
                ctx.beginPath();
                ctx.moveTo(pRect.x + ux * 28, pRect.y + uy * 28);
                ctx.lineTo(mx - ux * 8, my - uy * 8);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Crosshair: outer ring + inner dot + tick marks
            const ringR = canFire ? 9 : 6;
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = canFire ? `rgba(124,255,149,${pulse})` : `rgba(255,140,140,${pulse * 0.6})`;
            ctx.beginPath();
            ctx.arc(mx, my, ringR, 0, Math.PI * 2);
            ctx.stroke();
            // Inner dot
            ctx.fillStyle = canFire ? `rgba(255,255,255,${pulse})` : `rgba(255,180,180,0.5)`;
            ctx.beginPath();
            ctx.arc(mx, my, 1.5, 0, Math.PI * 2);
            ctx.fill();
            // Tick marks
            if (canFire) {
                ctx.beginPath();
                ctx.moveTo(mx - 14, my); ctx.lineTo(mx - 11, my);
                ctx.moveTo(mx + 11, my); ctx.lineTo(mx + 14, my);
                ctx.moveTo(mx, my - 14); ctx.lineTo(mx, my - 11);
                ctx.moveTo(mx, my + 11); ctx.lineTo(mx, my + 14);
                ctx.stroke();
            }
        }

        // Pooled particles
        drawParticles(ctx, cam);

        // Visual effects
        for (let i = 0; i < this.visualEffects.length; i++) this.visualEffects[i].draw(ctx, cam);

        // Hookshot line — energy ribbon with crackle when connected
        if (this.hookTarget) {
            const pRect = cam.getScreenRect(this.player.x + 20, this.player.y + 20, 0, 0);
            const tRect = cam.getScreenRect(this.hookTarget.x, this.hookTarget.y, 0, 0);
            const hit = this.hookTarget.hit;

            ctx.save();
            if (hit) {
                ctx.globalCompositeOperation = 'lighter';
                // Outer halo line
                ctx.strokeStyle = 'rgba(120,220,255,0.35)';
                ctx.lineWidth = 7;
                ctx.beginPath();
                ctx.moveTo(pRect.x, pRect.y);
                ctx.lineTo(tRect.x, tRect.y);
                ctx.stroke();
                // Bright core
                ctx.strokeStyle = 'rgba(220,250,255,0.95)';
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.moveTo(pRect.x, pRect.y);
                ctx.lineTo(tRect.x, tRect.y);
                ctx.stroke();
                // Crackle: a few jittered short segments
                const segs = 3;
                for (let s = 0; s < segs; s++) {
                    const t1 = (s / segs) + Math.random() * 0.1;
                    const t2 = t1 + 0.04;
                    const jitter = (Math.random() - 0.5) * 6;
                    const x1 = pRect.x + (tRect.x - pRect.x) * t1;
                    const y1 = pRect.y + (tRect.y - pRect.y) * t1 + jitter;
                    const x2 = pRect.x + (tRect.x - pRect.x) * t2;
                    const y2 = pRect.y + (tRect.y - pRect.y) * t2 + (Math.random() - 0.5) * 6;
                    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
                // Anchor pulse
                const ap = 0.5 + Math.sin(Date.now() * 0.02) * 0.3;
                ctx.fillStyle = `rgba(180,240,255,${ap})`;
                ctx.beginPath();
                ctx.arc(tRect.x, tRect.y, 6 + ap * 4, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.strokeStyle = 'rgba(160,160,180,0.45)';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([6, 6]);
                ctx.beginPath();
                ctx.moveTo(pRect.x, pRect.y);
                ctx.lineTo(tRect.x, tRect.y);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            ctx.restore();
        }

        // Silksong-style foreground layer: trees & grass that overlap entities
        // with smart transparency near the player
        {
            const pRect = cam.getScreenRect(
                this.player.x + this.player.w * 0.5,
                this.player.y + this.player.h * 0.5, 0, 0
            );
            for (let i = 0; i < sortedIslands.length; i++) {
                sortedIslands[i].drawForeground(ctx, cam, pRect.x, pRect.y);
            }
        }

        // Weather FG layer
        for (let i = 0; i < this.leaves.length; i++) { if (this.leaves[i].layer !== 'bg') this.leaves[i].draw(ctx, cam); }
        for (let i = 0; i < this.snowflakes.length; i++) { if (this.snowflakes[i].layer !== 'bg') this.snowflakes[i].draw(ctx, cam); }

        // Silksong-style true foreground: cloud bank, fog, motes drift in
        // front of the player layer for atmospheric depth.
        this.world.drawForeground(ctx);

        ctx.restore(); // End zoom + rotation

        // Darkness overlay (unscaled). Capped a touch lower than before and
        // tinted with a warmer indigo so fires read brighter against it; also
        // graded so the upper sky stays deep while the lower scene (where the
        // fires live) gets a softer wash.
        const sunHeightO = Math.sin(this.dayTime);
        if (sunHeightO < 0.2) {
            const darkness = Math.min(0.48, Math.abs(sunHeightO - 0.2) * 0.62);
            const dGrad = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
            dGrad.addColorStop(0, `rgba(8,6,28,${darkness})`);
            dGrad.addColorStop(1, `rgba(20,10,30,${darkness * 0.78})`);
            ctx.fillStyle = dGrad;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        // Cinematic vignette — oval shape, deeper corners
        const vGrad = ctx.createRadialGradient(
            this.canvas.width * 0.5, this.canvas.height * 0.55,
            this.canvas.width * 0.18,
            this.canvas.width * 0.5, this.canvas.height * 0.5,
            this.canvas.width * 0.85
        );
        vGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vGrad.addColorStop(0.7, 'rgba(0,0,0,0.18)');
        vGrad.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = vGrad;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Time dilation chromatic + warm cast
        if (this.world.camera.timeDilation < 0.7) {
            const td = (1 - this.world.camera.timeDilation);
            ctx.fillStyle = `rgba(255,180,80,${td * 0.10})`;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        // Impact white-flash (cleaner than CSS invert filter)
        if (isImpact) {
            const a = Math.min(1, this.impactFrameTimer / 0.15);
            ctx.fillStyle = `rgba(255,255,255,${a * 0.85})`;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        // Respawn text
        if (this.player.dead) {
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.fillStyle = '#ff4444';
            ctx.font = 'bold 30px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`RESPAWNING IN ${Math.ceil(this.player.respawnTimer)}...`, this.canvas.width * 0.5, this.canvas.height * 0.5);
        }

        // Godstone-style radial polar minimap — flat world projected as a
        // rounded planet. Player sits at the top of the disc, world rotates
        // around them; rock crust at the centre, ozone band at the rim.
        this._drawMinimap(ctx);

        // FPS / debug strip — kept minimal; difficulty intentionally hidden.
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(
            `${this.fps} FPS | ${this.villagers.length} units | TD ${this.world.camera.timeDilation.toFixed(2)}`,
            8, this.canvas.height - 8
        );
    }

    // Project a world coordinate onto the minimap disc.
    // Vertical axis: ceilingY → outer rim (sky), groundY → centre (rock).
    // Horizontal axis: angular position around the disc, with the player
    // always at the top (-PI/2), east going clockwise to the right.
    _projectMinimap(worldX, worldY, cx, cy, radius) {
        const ceilingY = WORLD_CEILING_Y;
        const groundY = getWorldGroundY(this.worldHeight);
        let t = (worldY - ceilingY) / (groundY - ceilingY);
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const r = radius * (1 - t);

        let dx = worldX - this.player.x;
        const half = this.worldWidth / 2;
        if (dx > half) dx -= this.worldWidth;
        if (dx < -half) dx += this.worldWidth;
        const angle = -Math.PI * 0.5 + (dx / this.worldWidth) * Math.PI * 2;

        return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
    }

    _drawMinimap(ctx) {
        if (this.uiState !== 'PLAYING') return;

        // Anchor: bottom-right corner. Sized to read well on phones too.
        const margin = 18;
        const radius = Math.max(82, Math.min(140, this.canvas.width * 0.085));
        const cx = this.canvas.width - margin - radius;
        const cy = this.canvas.height - margin - radius;

        ctx.save();

        // Outer halo — soft ozone bloom that hints at atmosphere.
        const haloR = radius + 12;
        const halo = ctx.createRadialGradient(cx, cy, radius * 0.85, cx, cy, haloR);
        halo.addColorStop(0, 'rgba(140, 200, 255, 0.18)');
        halo.addColorStop(1, 'rgba(140, 200, 255, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
        ctx.fill();

        // Disc gradient — rock at centre fading up through atmosphere to ozone.
        const disc = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        disc.addColorStop(0.00, '#3a2418');   // crust core
        disc.addColorStop(0.14, '#5a3a26');   // upper crust
        disc.addColorStop(0.18, '#3e2c20');   // lithosphere shadow
        disc.addColorStop(0.28, '#1a1830');   // troposphere base
        disc.addColorStop(0.55, '#22305a');   // mid sky
        disc.addColorStop(0.82, '#345070');   // stratosphere
        disc.addColorStop(0.96, '#5e88b8');   // ozone band
        disc.addColorStop(1.00, '#0a0a18');   // void rim
        ctx.fillStyle = disc;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        // Rim stroke
        ctx.strokeStyle = 'rgba(180, 210, 255, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Clip everything below to the disc
        ctx.beginPath();
        ctx.arc(cx, cy, radius - 0.5, 0, Math.PI * 2);
        ctx.clip();

        // Islands — small dots at their canonical altitude.
        for (let i = 0; i < this.islands.length; i++) {
            const island = this.islands[i];
            const p = this._projectMinimap(island.x + island.w * 0.5, island.y, cx, cy, radius);
            const teamColor =
                island.team === 'green' ? 'rgba(120, 220, 130, 0.95)' :
                island.team === 'blue'  ? 'rgba(120, 180, 230, 0.95)' :
                                          'rgba(180, 180, 190, 0.75)';
            ctx.fillStyle = teamColor;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
            ctx.fill();
        }

        // Units — tiny pixels coloured by team.
        ctx.globalAlpha = 0.85;
        for (let i = 0; i < this.villagers.length; i++) {
            const v = this.villagers[i];
            if (v.dead) continue;
            const p = this._projectMinimap(v.x, v.y, cx, cy, radius);
            ctx.fillStyle = v.team === 'green' ? '#9ce088' : '#9cc8ee';
            ctx.fillRect(p.x - 0.7, p.y - 0.7, 1.6, 1.6);
        }
        ctx.globalAlpha = 1;

        // Enemy chief — small but distinct ruby pip.
        if (this.enemyChief && !this.enemyChief.dead) {
            const ep = this._projectMinimap(this.enemyChief.x, this.enemyChief.y, cx, cy, radius);
            ctx.fillStyle = '#ff6868';
            ctx.beginPath();
            ctx.arc(ep.x, ep.y, 3.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Player — bright golden sun, always at the top.
        const pp = this._projectMinimap(this.player.x, this.player.y, cx, cy, radius);
        // soft halo
        const pHalo = ctx.createRadialGradient(pp.x, pp.y, 1, pp.x, pp.y, 9);
        pHalo.addColorStop(0, 'rgba(255, 240, 150, 0.85)');
        pHalo.addColorStop(1, 'rgba(255, 200, 80, 0)');
        ctx.fillStyle = pHalo;
        ctx.beginPath();
        ctx.arc(pp.x, pp.y, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff5cc';
        ctx.beginPath();
        ctx.arc(pp.x, pp.y, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(40, 30, 0, 0.7)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
    }
}

window.onload = () => { new Game(); };
