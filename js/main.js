/* GAME ENGINE - REMASTERED
   Optimized core with time dilation, spatial awareness,
   2.5D rendering pipeline, and Populous-inspired gameplay.
*/

import { InputHandler } from './input.js';
import { ResourceManager } from './resources.js';
import { World, getBackgroundProgress, getSkyVariantImage, pickRandomSkyVariant } from './world.js';
import {
    Player, Island, Villager, Warrior, Projectile,
    Pig, Leaf, Snowflake, Assets, Fireball, StoneWall,
    RainCloud, VisualEffect, Totem,
    spawnBlood, spawnParticle, updateParticles, drawParticles,
    getAssetProgress
} from './entities.js';
import { AudioManager } from './audio.js';

/* DYNAMIC DIFFICULTY MANAGER
   Watches recent player performance and gently scales enemy aggression so the
   game tends toward equilibrium without ever swinging into "impossible".
   Key idea: track rolling rates of player kills, deaths, captures, and
   territory loss, fold them into a single performance score, and lerp a
   global difficulty multiplier toward a target derived from that score.
   The multiplier modulates enemy-chief attack cadence, spawn batch size,
   warrior attack speed, and a slight projectile-damage bonus. Cap at
   [0.55, 1.6] to keep both win and loss reachable.
*/
class DifficultyManager {
    constructor() {
        this.difficulty = 1.0;
        this.targetDifficulty = 1.0;
        this.minDiff = 0.40;
        this.maxDiff = 2.40;

        this.windowSec = 18;            // shorter window — responds faster
        this.killEvents = [];           // enemy units killed by player team
        this.deathEvents = [];          // player chief deaths
        this.captureEvents = [];        // player tent gains
        this.lossEvents = [];           // player tent losses
        this.damageEvents = [];         // player HP-loss spikes (each event = 10 hp lost)

        this._evalTimer = 0;
        this._evalInterval = 2.5;       // re-target every 2.5s
        this._lastTents = { green: -1, blue: -1 };
        this._lastPlayerHp = 100;

        // Surface-able tier transitions for in-game messages
        this._lastShownTier = null;
        this._t = 0;
    }

    notePlayerKill()  { this.killEvents.push(this._t); }
    notePlayerDeath() {
        this.deathEvents.push(this._t);
        // A chief death is a strong signal — pad the queue so the manager
        // really feels it without having to wait for the next eval cycle.
        for (let i = 0; i < 4; i++) this.damageEvents.push(this._t);
    }

    update(dt, greenTents, blueTents, playerHp) {
        this._t += dt;

        // Tent transitions
        if (this._lastTents.green >= 0) {
            const dG = greenTents - this._lastTents.green;
            const dB = blueTents - this._lastTents.blue;
            if (dG > 0) for (let i = 0; i < dG; i++) this.captureEvents.push(this._t);
            if (dG < 0 && dB > 0) for (let i = 0; i < dB; i++) this.lossEvents.push(this._t);
        }
        this._lastTents.green = greenTents;
        this._lastTents.blue = blueTents;

        // Damage taken — every 10hp lost is one damage event
        if (playerHp != null) {
            const lost = this._lastPlayerHp - playerHp;
            if (lost > 0) {
                const ticks = Math.min(8, Math.floor(lost / 10));
                for (let i = 0; i < ticks; i++) this.damageEvents.push(this._t);
            }
            // Don't track HP regen as positive — only acute loss
            if (playerHp < this._lastPlayerHp || playerHp >= 100) this._lastPlayerHp = playerHp;
            else this._lastPlayerHp += (playerHp - this._lastPlayerHp) * 0.5;
        }

        // Prune
        const cutoff = this._t - this.windowSec;
        this.killEvents = this.killEvents.filter(t => t > cutoff);
        this.deathEvents = this.deathEvents.filter(t => t > cutoff);
        this.captureEvents = this.captureEvents.filter(t => t > cutoff);
        this.lossEvents = this.lossEvents.filter(t => t > cutoff);
        this.damageEvents = this.damageEvents.filter(t => t > cutoff);

        this._evalTimer += dt;
        if (this._evalTimer >= this._evalInterval) {
            this._evalTimer = 0;
            this._recomputeTarget(greenTents, blueTents);
        }

        // Faster lerp — full band in ~3s
        this.difficulty += (this.targetDifficulty - this.difficulty) * 0.4 * dt;
    }

    _recomputeTarget(greenTents, blueTents) {
        const w = this.windowSec;
        const killRate = this.killEvents.length / w;
        const captureRate = this.captureEvents.length / w;
        const deathRate = this.deathEvents.length / w;
        const lossRate = this.lossEvents.length / w;
        const damageRate = this.damageEvents.length / w;
        const tentDelta = greenTents - blueTents;

        // Score: positive when player is dominant, negative when struggling.
        // Coefficients tuned aggressively so 30s of clear dominance reaches FIERCE
        // and 20s of getting curb-stomped reaches CALM.
        let score = 0;
        score += (killRate - 0.4) * 2.2;     // baseline ~0.4/sec
        score += captureRate * 55;           // captures dominate the score
        score -= lossRate * 50;
        score += tentDelta * 0.55;           // territorial control
        score -= deathRate * 8.0;
        score -= damageRate * 1.2;           // taking sustained damage eases AI

        // Map roughly [-7 .. +7] into [0.4 .. 2.4]
        let target = 1.0 + score * 0.20;
        if (target < this.minDiff) target = this.minDiff;
        if (target > this.maxDiff) target = this.maxDiff;
        this.targetDifficulty = target;
    }

    tier() {
        const d = this.difficulty;
        if (d < 0.65) return 'CALM';
        if (d < 0.90) return 'STEADY';
        if (d < 1.20) return 'BALANCED';
        if (d < 1.60) return 'FIERCE';
        if (d < 2.00) return 'RELENTLESS';
        return 'WRATHFUL';
    }

    // Returns tier name if it changed this frame (for UI toast), else null.
    pollTierChange() {
        const t = this.tier();
        if (this._lastShownTier !== t) {
            this._lastShownTier = t;
            return t;
        }
        return null;
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        this.worldWidth = 6000;
        this.worldHeight = 3000;
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

        this.player = new Player(400, 200, 'green');
        this.enemyChief = new Player(5500, 200, 'blue');
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
        // Home islands (MASSIVE - people are tiny specks on these)
        this.islands.push(new Island(200, 1000, 1000, 90, 'green'));
        this.islands.push(new Island(5200, 1000, 1000, 90, 'blue'));

        // Generate world islands (big, dramatic floating rocks)
        for (let i = 0; i < 30; i++) {
            for (let attempt = 0; attempt < 80; attempt++) {
                const rx = 800 + Math.random() * 4200;
                const ry = 500 + Math.random() * 1500;
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
                    let team = 'neutral';
                    if (rx < 1500) team = 'green';
                    if (rx > 4500) team = 'blue';
                    this.islands.push(new Island(rx, ry, rw, rh, team));
                    break;
                }
            }
        }

        // Pigs
        const pigCount = 5 + Math.floor(Math.random() * 6);
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
        ['green', 'blue'].forEach(team => {
            const validIslands = this.islands.filter(i => i.team === team || i.team === 'neutral');
            let cV = 0, cW = 0;
            while (cV < 20 || cW < 10) {
                const island = validIslands[Math.floor(Math.random() * validIslands.length)];
                if (!island) continue;
                const x = island.x + 30 + Math.random() * (island.w - 60);
                const y = island.y - 50;
                if (cV < 20) {
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

        // Dynamic difficulty — sees the same tent stats the HUD uses
        this.difficulty.update(dt, greenTents, blueTents, this.player.hp);

        // Propagate difficulty to live enemy warriors so changes apply
        // immediately, not just to newly spawned units.
        const _d = this.difficulty.difficulty;
        for (let i = 0; i < this.villagers.length; i++) {
            const v = this.villagers[i];
            if (v.team === 'blue' && v instanceof Warrior) v.difficultyScale = _d;
        }

        // Extra enemy spawn pulse whose interval scales with difficulty.
        // High difficulty → enemy reinforcements arrive almost twice as fast.
        this._enemySpawnTimer = (this._enemySpawnTimer || 0) + dt;
        const enemyInterval = 4.0 / Math.max(0.5, _d);   // 10s easy → 1.7s hard
        if (this._enemySpawnTimer >= enemyInterval) {
            this._enemySpawnTimer = 0;
            this._spawnEnemyOnly();
        }

        // Surface tier changes as a brief message — keeps the player aware
        // that the world is responding to them.
        const tierChange = this.difficulty.pollTierChange();
        if (tierChange && this.uiState === 'PLAYING') {
            const tones = {
                CALM:       '#9CFFB5',
                STEADY:     '#B0E5FF',
                BALANCED:   '#FFFFFF',
                FIERCE:     '#FFB070',
                RELENTLESS: '#FF8060',
                WRATHFUL:   '#FF4848'
            };
            this.resources.showMessage(`THE TIDE TURNS · ${tierChange}`, tones[tierChange] || '#FFFFFF');
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

        // Difficulty modulates: detection range, cooldown speed, fireball chance.
        const d = this.difficulty.difficulty;
        const detectRange = 700 + 200 * d;          // 805 .. 1020
        const baseShootCD = 1.5 / d;                // 2.7 (easy) .. 0.94 (hard)
        const baseBurstCD = 3.0 / d;
        const fireballChance = 0.005 + 0.012 * d;   // 0.011 .. 0.024
        const projDmg = Math.round(12 + 6 * d);     // 16 .. 22

        if (dist < detectRange && this.enemyChief.fireCooldown <= 0) {
            this.enemyChief.fireCooldown = baseShootCD;
            const angle = Math.atan2(dy, dx);
            this.projectiles.push(new Projectile(this.enemyChief.x + 20, this.enemyChief.y + 20, angle, 'blue', projDmg));
        }

        // Burst fireball — chance scales with difficulty
        if (this.enemyChief.fireCooldown <= 0 && Math.random() < fireballChance) {
            this.enemyChief.fireCooldown = baseBurstCD;
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
        const d = this.difficulty.difficulty;
        const enemyBatchBonus = Math.round((d - 1.0) * 3.0);   // wider swing
        const playerBatchBonus = Math.round((1.0 - d) * 1.5);  // ally help when struggling

        for (let i = 0; i < this.islands.length; i++) {
            const island = this.islands[i];
            if (island.hasTeepee && (island.team === 'green' || island.team === 'blue') && Math.random() < 0.6) {
                let batchSize = 3 + Math.floor(Math.random() * 3);
                if (island.team === 'blue') {
                    batchSize = Math.max(1, batchSize + enemyBatchBonus);
                } else if (island.team === 'green') {
                    batchSize = Math.max(1, batchSize + Math.max(0, playerBatchBonus));
                }
                for (let b = 0; b < batchSize && this.villagers.length < 500; b++) {
                    const spawnX = island.x + 30 + Math.random() * (island.w - 60);
                    // Higher warrior ratio for the dominant side via difficulty
                    const warriorChance = island.team === 'blue' ? Math.min(0.7, 0.4 + (d - 1.0) * 0.3) : 0.4;
                    const unit = Math.random() < warriorChance
                        ? new Warrior(spawnX, island.y - 40, island.team)
                        : new Villager(spawnX, island.y - 40, island.team);
                    unit.homeIsland = island;
                    if (island.team === 'blue') {
                        unit.difficultyScale = d;
                        if (unit instanceof Warrior) unit.hp = Math.round(10 * (0.7 + 0.3 * d));
                    }
                    this.villagers.push(unit);
                }
                if (this.villagers.length >= 500) break;
            }
        }
    }

    // Difficulty-driven extra enemy reinforcement pulse.
    _spawnEnemyOnly() {
        if (this.villagers.length >= 500) return;
        const d = this.difficulty.difficulty;
        if (d < 0.7) return; // don't reinforce when player is struggling
        const islands = this.islands.filter(i => i.team === 'blue' && i.hasTeepee);
        if (islands.length === 0) return;
        const island = islands[Math.floor(Math.random() * islands.length)];
        const batch = 1 + Math.round((d - 0.8) * 2.5); // 1..5
        for (let b = 0; b < batch && this.villagers.length < 500; b++) {
            const spawnX = island.x + 30 + Math.random() * (island.w - 60);
            const warriorChance = Math.min(0.8, 0.5 + (d - 1.0) * 0.3);
            const unit = Math.random() < warriorChance
                ? new Warrior(spawnX, island.y - 40, 'blue')
                : new Villager(spawnX, island.y - 40, 'blue');
            unit.homeIsland = island;
            unit.difficultyScale = d;
            if (unit instanceof Warrior) unit.hp = Math.round(10 * (0.7 + 0.3 * d));
            // give them a launch boost so they pop out dramatically
            unit.vy = -200 - Math.random() * 150;
            unit.vx = (Math.random() - 0.5) * 120;
            this.villagers.push(unit);
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

        // FPS / debug strip
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(
            `${this.fps} FPS | ${this.villagers.length} units | TD ${this.world.camera.timeDilation.toFixed(2)} | DIFF ${this.difficulty.difficulty.toFixed(2)} (${this.difficulty.tier()})`,
            8, this.canvas.height - 8
        );
    }
}

window.onload = () => { new Game(); };
