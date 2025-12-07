/* THE HEART OF THE GAME
   Definitive V39.0: THE "EARTHQUAKE" UPDATE 🌍
   - Restored full spell logic.
   - Implemented Earthquake (Spell 2).
   - Fixed file corruption.
*/

import { InputHandler } from './input.js';
import { ResourceManager } from './resources.js';
import { World } from './world.js';
import {
    Player, Island, Villager, Warrior, Projectile,
    Particle, Pig, Leaf, Snowflake, Assets,
    Fireball, StoneWall, RainCloud, VisualEffect, Totem
} from './entities.js';
import { AudioManager } from './audio.js';

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        this.worldWidth = 6000;
        this.worldHeight = 3000;

        this.uiState = 'TITLE';

        this.titleImg = new Image(); this.titleImg.src = 'assets/title.png';
        this.tooltipImg = new Image(); this.tooltipImg.src = 'assets/tooltip.png';

        this.uiLayer = document.getElementById('ui-layer');
        this.uiLayer.style.display = 'none'; // Start hidden

        this.input = new InputHandler();

        // Bind Spell Wheel
        this.input.onScroll((delta) => {
            this.resources.cycleSpell(delta > 0 ? 1 : -1);
        });

        this.resources = new ResourceManager();
        this.world = new World(this.worldWidth, this.worldHeight);

        this.audio = new AudioManager();
        this.audio.loadAll();

        this.player = new Player(400, 200, 'green');
        this.enemyChief = new Player(5500, 200, 'blue');
        this.enemyChief.mana = 100; // Enemy Mana Tracking
        this.enemyChief.maxMana = 100;

        this.islands = [];
        this.villagers = [];
        this.projectiles = [];
        this.fireballs = [];
        this.walls = [];
        this.particles = [];
        this.visualEffects = [];
        this.pigs = [];
        this.leaves = [];
        this.snowflakes = [];
        this.rainClouds = [];
        this.totems = [];

        this.season = Math.random() > 0.5 ? 'summer' : 'winter';
        console.log(`SEASON START: ${this.season.toUpperCase()}`);

        this._generateWorld();

        const isWinter = (this.season === 'winter');
        this.islands.forEach(island => island.setSeason(isWinter));

        this.lastTime = 0;
        this.spawnTimer = 0;
        this.hookTarget = null;
        this.gameOver = false;

        this.impactFrameTimer = 0;

        this.dayCycleTimer = 0;
        this.dayTime = 0;
        this.dayCount = 0;

        this.windTimer = 0;
        this.weatherTimer = 0;
        this.pulseTime = 0;
        this.lightningTimer = 0;

        // WAR DIRECTOR
        this.warState = 'BUILD'; // BUILD -> GATHER -> ATTACK
        this.warTimer = 40.0;
        console.log("WAR DIRECTOR STARTED: BUILD PHASE");

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
        if (this.uiState === 'TITLE') {
            this.uiState = 'TOOLTIP';
            this.navCooldown = true;
            setTimeout(() => { this.navCooldown = false; }, 200);
        } else if (this.uiState === 'TOOLTIP' && !this.navCooldown) {
            this.uiState = 'PLAYING';
        }
    }

    _startAudio() {
        if (this.audioStarted) return;
        this.audioStarted = true;
        this.audio.resume();
        this.audio.startLoop('ambience', 0.5);
        this.audio.startLoop('music', 0.4);
        this.audio.startLoop('fall', 0.0);
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
        this.islands.push(new Island(200, 1000, 600, 60, 'green')); // Squashed
        this.islands.push(new Island(5200, 1000, 600, 60, 'blue')); // Squashed

        const maxAttempts = 100;

        for (let i = 0; i < 40; i++) { // INCREASED DENSITY
            let placed = false;
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const rx = 800 + Math.random() * 4200;
                const ry = 500 + Math.random() * 1500;
                const rw = 300 + Math.random() * 500;
                const rh = 60; // SQUASHED HEIGHT

                let overlaps = false;
                for (let existing of this.islands) {
                    if (rx < existing.x + existing.w + 300 &&
                        rx + rw + 300 > existing.x &&
                        ry < existing.y + existing.h + 300 &&
                        ry + rh + 300 > existing.y) {
                        overlaps = true;
                        break;
                    }
                }

                if (!overlaps) {
                    let team = 'neutral';
                    if (rx < 1500) team = 'green';
                    if (rx > 4500) team = 'blue';
                    const newIsland = new Island(rx, ry, rw, rh, team);
                    this.islands.push(newIsland);
                    placed = true;
                    break;
                }
            }
        }

        const pigCount = 5 + Math.floor(Math.random() * 6);
        for (let i = 0; i < pigCount; i++) {
            const home = this.islands[Math.floor(Math.random() * this.islands.length)];
            const px = home.x + Math.random() * (home.w - 50);
            const py = home.y - 60;
            const piggy = new Pig(px, py);
            piggy.homeIsland = home;
            this.pigs.push(piggy);
        }

        this.player.visitedIslands.add(this.islands[0]);
        this._spawnInitialUnits();
    }

    _spawnInitialUnits() {
        // Spawn 3 Villagers + 2 Warriors per team
        const teams = ['green', 'blue'];
        teams.forEach(team => {
            let countV = 0;
            let countW = 0;
            const validIslands = this.islands.filter(i => i.team === team || i.team === 'neutral');

            while (countV < 3 || countW < 2) {
                const island = validIslands[Math.floor(Math.random() * validIslands.length)];
                if (!island) continue;

                const x = island.x + 50 + Math.random() * 100;
                const y = island.y - 50;

                if (countV < 3) {
                    const v = new Villager(x, y, team);
                    v.homeIsland = island;
                    this.villagers.push(v);
                    countV++;
                } else if (countW < 2) {
                    const w = new Warrior(x, y, team);
                    w.homeIsland = island;
                    this.villagers.push(w);
                    countW++;
                }
            }
        });
        console.log("INITIAL UNITS SPAWNED: 5 Green, 5 Blue");
    }

    loop(timestamp) {
        const dtRaw = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        const dt = Math.min(dtRaw, 0.05);

        try {
            this.update(dt);
            this.draw();
        } catch (e) {
            console.error("GAME CRASH PREVENTED:", e);
        }

        requestAnimationFrame((ts) => this.loop(ts));
    }

    update(dt) {
        if (this.uiState !== 'PLAYING') return;
        if (this.gameOver) return;

        // Spell Key Shortcuts
        if (this.input.keys.digit1) this.resources.setSpell(0);
        if (this.input.keys.digit2) this.resources.setSpell(1);
        if (this.input.keys.digit3) this.resources.setSpell(2);
        if (this.input.keys.digit4) this.resources.setSpell(3);

        this._updateTotemLogic(dt);
        this._updateIslandDynamics(dt);

        if (this.impactFrameTimer > 0) {
            this.impactFrameTimer -= dt;
            if (this.impactFrameTimer > 0.1) return;
        }

        this.dayCycleTimer += dt;
        if (this.dayCycleTimer < 20) {
            this.dayTime = (this.dayCycleTimer / 20) * Math.PI;
        } else if (this.dayCycleTimer < 30) {
            const nightProgress = (this.dayCycleTimer - 20) / 10;
            this.dayTime = Math.PI + (nightProgress * Math.PI);
        } else {
            this.dayCycleTimer = 0;
            this.dayTime = 0;
            this.dayCount++;
            this._checkSeasonChange();
        }

        const isMoving = this.player.update(dt, this.input, this.resources, this.worldWidth, this.worldHeight, this.islands, this.audio, this.enemyChief, this.walls);
        this.world.update(this.player, dt);
        this._handleShooting(dt);

        this._updateWeather(dt);

        // Update Villagers (and Warriors)
        this.villagers.forEach(v => {
            if (!v.dead) {
                if (v instanceof Warrior) {
                    // Warrior needs combat context
                    v.updateLogic(dt, this.islands, [this.player, this.enemyChief, ...this.villagers],
                        (x, y, a, t, d) => this.projectiles.push(new Projectile(x, y, a, t, d)),
                        this.worldWidth, this.worldHeight, this.audio,
                        (v.team === 'green' ? this.player : this.enemyChief),
                        this.villagers, this.walls, this.warState
                    );
                } else {
                    // Villager needs simpler context (passing pigs for milling behavior)
                    v.update(dt, this.islands, this.worldWidth, this.worldHeight, this.pigs, this.walls, this.warState);
                }
            }
        });

        // Update Pigs
        this.pigs.forEach(p => p.update(dt, this.islands, this.worldWidth, this.worldHeight));

        this._handleSpellCasting(dt);
        this._checkCollisions(dt);
        this._handleCombat(dt);
        this._handleShooting(dt);

        // Spawn/Respawn Logic
        this.spawnTimer += dt;
        if (this.spawnTimer > 10.0) {
            this._spawnVillagers();
            this._spawnPigs();
            this.spawnTimer = 0;
        }

        if (!this.enemyChief.dead) {
            this.enemyChief.update(dt, null, null, this.worldWidth, this.worldHeight, this.islands, null, this.player, this.walls);
            this._updateEnemyAI(dt);
        }

        // --- VICTORY / DEFEAT CONDITIONS ---
        const greenCount = this.villagers.filter(v => v.team === 'green' && !v.dead).length;
        const blueCount = this.villagers.filter(v => v.team === 'blue' && !v.dead).length;

        // PLAYER DEATH & RESPAWN CHECK
        if (this.player.dead) {
            if (greenCount > 0) {
                this.player.respawnTimer -= dt;
                if (this.player.respawnTimer <= 0) {
                    this.player.dead = false;
                    this.player.hp = 100;
                    this.player.x = this.islands[0].x;
                    this.player.y = this.islands[0].y - 100;
                    this._spawnBlood(this.player.x, this.player.y, '#00ff00');
                }
            } else {
                this.gameOver = true;
                this.resources.showFloatingMessage("DEFEAT! Your tribe has fallen.", "#FF0000");
                setTimeout(() => location.reload(), 4000);
            }
        }

        // ENEMY DEATH & RESPAWN CHECK
        if (this.enemyChief.dead) {
            if (blueCount > 0) {
                this.enemyChief.respawnTimer -= dt;
                if (this.enemyChief.respawnTimer <= 0) {
                    this.enemyChief.dead = false;
                    this.enemyChief.hp = 100;
                    this.enemyChief.x = this.islands[this.islands.length - 1].x;
                    this.enemyChief.y = this.islands[this.islands.length - 1].y - 100;
                }
            } else {
                this.gameOver = true;
                this.resources.showFloatingMessage("VICTORY! You have conquered the skies!", "#FFD700");
                setTimeout(() => location.reload(), 4000);
            }
        }
    }

    _updateTotemLogic(dt) {
        // Reset island counts
        this.islands.forEach(i => { i.greenCount = 0; i.blueCount = 0; });

        // Count villagers per island (Spatial check)
        this.villagers.forEach(v => {
            if (!v.dead) {
                const island = this.islands.find(i =>
                    v.x >= i.x && v.x <= i.x + i.w &&
                    v.y >= i.y - 100 && v.y <= i.y + i.h
                );
                if (island) {
                    if (v.team === 'green') island.greenCount++;
                    if (v.team === 'blue') island.blueCount++;
                }
            }
        });

        // 1. Spawn Logic
        this.islands.forEach(island => {
            ['green', 'blue'].forEach(team => {
                const count = (team === 'green') ? island.greenCount : island.blueCount;
                if (count > 12) {
                    // Spawn totem if not present on this island for this team
                    const hasTotem = this.totems.some(t => t.team === team && Math.abs(t.x - (island.x + island.w / 2)) < 200 && Math.abs(t.y - (island.y - 80)) < 200);

                    if (!hasTotem) {
                        const tx = island.x + island.w / 2;
                        const ty = island.y - 80;
                        this.totems.push(new Totem(tx, ty, team));
                        this.audio.play('teepee');
                    }
                }
            });
        });

        // 2. Collapse Logic
        for (let i = this.totems.length - 1; i >= 0; i--) {
            const t = this.totems[i];
            const island = this.islands.find(isl =>
                t.x >= isl.x - 50 && t.x <= isl.x + isl.w + 50 &&
                t.y >= isl.y - 150 && t.y <= isl.y + isl.h + 50
            );

            if (island) {
                const count = (t.team === 'green') ? island.greenCount : island.blueCount;
                if (count < 5) {
                    t.active = false;
                    this.totems.splice(i, 1);
                    // Optional: Play collapse sound (reuse stone break?)
                    // this.audio.play('hit', 0.2); 
                }
            } else {
                this.totems.splice(i, 1);
            }
        }

        // Update Totems
        this.totems.forEach(t => t.update(dt, this.villagers));
    }

    _checkSeasonChange() {
        if (Math.random() < 0.3) {
            this.season = (this.season === 'summer') ? 'winter' : 'summer';
            const isWinter = (this.season === 'winter');
            this.islands.forEach(island => island.setSeason(isWinter));
            this.resources.showFloatingMessage(`SEASON CHANGED TO ${this.season.toUpperCase()}!`, "#FFFFFF");
        }
    }

    _updateWeather(dt) {
        this.weatherTimer -= dt;
        if (this.weatherTimer <= 0) {
            this.weatherTimer = 0.1; // Spawn rate
            const cam = this.world.camera;
            const x = cam.x + Math.random() * cam.w;
            const y = cam.y - 100;

            if (this.season === 'winter') {
                this.snowflakes.push(new Snowflake(x, y, Math.random() > 0.5 ? 'fg' : 'bg'));
            } else {
                // Autumn Leaves
                this.leaves.push(new Leaf(x, y, Math.random() > 0.5 ? 'fg' : 'bg'));
            }
        }

        // Update Particles
        this.particles.forEach(p => p.update(dt));
        this.particles = this.particles.filter(p => p.life > 0);

        this.visualEffects.forEach(e => e.update(dt));
        this.visualEffects = this.visualEffects.filter(e => !e.dead);

        this.leaves.forEach(l => l.update(dt, this.world.camera.y + this.world.camera.h));
        this.leaves = this.leaves.filter(l => l.y < this.world.camera.y + this.world.camera.h + 100);

        this.snowflakes.forEach(s => s.update(dt, this.world.camera.y + this.world.camera.h));
        this.snowflakes = this.snowflakes.filter(s => s.y < this.world.camera.y + this.world.camera.h + 100);

        this.rainClouds.forEach(r => r.update(dt));
        this.rainClouds = this.rainClouds.filter(r => r.life > 0);
    }

    _updateIslandDynamics(dt) {
        this.islands.forEach(island => {
            // 1. DRIFT INIT & UPDATE
            if (!island.driftTarget) {
                island.driftTimer = 0;
            }
            island.driftTimer -= dt;
            if (island.driftTimer <= 0) {
                island.driftTarget = {
                    vx: (Math.random() - 0.5) * 10,
                    vy: (Math.random() - 0.5) * 5
                };
                island.driftTimer = 5 + Math.random() * 10;
            }

            // Apply Drift Force (if not joined heavily)
            if (!island.joinedWith) {
                island.vx += (island.driftTarget.vx - island.vx) * 0.5 * dt;
                island.vy += (island.driftTarget.vy - island.vy) * 0.5 * dt;
            }

            // Decrement join timer
            if (island.joinedWith) {
                island.joinTimer -= dt;
                if (island.joinTimer <= 0) {
                    island.joinedWith.joinedWith = null; // Unstick other
                    island.joinedWith = null; // Unstick self
                }
            }

            // 2. VERTICAL SEPARATION (Repulsion)
            this.islands.forEach(other => {
                if (island !== other) {
                    this._resolveIslandCollisions(island, other, dt);
                }
            });

            // Integrate
            island.update(dt, this.player, this.enemyChief, this.audio);
        });
    }

    _resolveIslandCollisions(islandA, islandB, dt) {
        // Simple AABB overlap check + separating force
        if (islandA.x < islandB.x + islandB.w &&
            islandA.x + islandA.w > islandB.x &&
            islandA.y < islandB.y + islandB.h &&
            islandA.y + islandA.h > islandB.y) {

            const dy = (islandA.y + islandA.h / 2) - (islandB.y + islandB.h / 2);
            const dist = Math.abs(dy);
            const minced = (islandA.h + islandB.h) / 2;

            // If stacking vertically
            if (dist < minced * 0.9) {
                const force = (minced - dist) * 10.0;
                if (dy > 0) islandA.vy += force * dt;
                else islandA.vy -= force * dt;
            }

            // Stick/Bounce Logic
            const vRel = Math.sqrt((islandA.vx - islandB.vx) ** 2 + (islandA.vy - islandB.vy) ** 2);
            if (vRel < 50 && !islandA.joinedWith && !islandB.joinedWith) {
                // STICK
                islandA.joinedWith = islandB;
                islandB.joinedWith = islandA;
                islandA.joinTimer = 10 + Math.random() * 10;
                // Sync velocities
                const avgVx = (islandA.vx + islandB.vx) / 2;
                const avgVy = (islandA.vy + islandB.vy) / 2;
                islandA.vx = avgVx; islandB.vx = avgVx;
                islandA.vy = avgVy; islandB.vy = avgVy;
            } else if (vRel > 100) {
                // BOUNCE
                islandA.vx *= -0.8;
                islandB.vx *= -0.8;
            }
        }
    }


    _checkCollisions(dt) {
        // 1. MANA RECHARGE (Campfire/Teepee)
        this.islands.forEach(island => {
            if (island.hasTeepee && island.team === 'green') {
                const tx = island.x + island.w / 2;
                const ty = island.y - 80;
                const dist = Math.sqrt((this.player.x - tx) ** 2 + (this.player.y - ty) ** 2);

                if (dist < 150) {
                    this.resources.addMana(30 * dt); // Recharge rate
                }
            }
        });

        // 2. EAT PIGS (Health)
        this.pigs.forEach(p => {
            if (!p.dead) {
                const dist = Math.sqrt((this.player.x - p.x) ** 2 + (this.player.y - p.y) ** 2);
                if (dist < 50) {
                    p.dead = true;
                    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20);
                    this.audio.play('hit', 1.0, 1.5); // High pitch hit as 'eat' sound
                    this._spawnBlood(p.x, p.y, '#FFC0CB', 10); // Pink particles
                }
            }
        });
    }

    _updateEnemyAI(dt) {
        const dist = Math.sqrt((this.player.x - this.enemyChief.x) ** 2 + (this.player.y - this.enemyChief.y) ** 2);

        // Mana Regen
        this.enemyChief.mana = Math.min(this.enemyChief.maxMana, this.enemyChief.mana + 5 * dt);

        if (dist < 800) {
            // Shoot arrows if close
            if (this.enemyChief.fireCooldown <= 0) {
                this.enemyChief.fireCooldown = 1.5;
                const angle = Math.atan2(this.player.y - this.enemyChief.y, this.player.x - this.enemyChief.x);
                this.projectiles.push(new Projectile(this.enemyChief.x + 20, this.enemyChief.y + 20, angle, 'blue', 15));
            }
        }

        // Cast Spells
        if (this.enemyChief.mana > 80 && Math.random() < 0.01) {
            // Cast Fireball
            this.enemyChief.mana -= 80;
            const angle = Math.atan2(this.player.y - this.enemyChief.y, this.player.x - this.enemyChief.x);
            this.fireballs.push(new Fireball(this.enemyChief.x + 20, this.enemyChief.y + 20, angle, 'blue'));
        }
    }

    _handleSpellCasting(dt) {
        if (this.input.mouse.rightDown) {
            const mx = this.input.mouse.x + this.world.camera.x;
            const my = this.input.mouse.y + this.world.camera.y;
            const spell = this.resources.currentSpell;

            // 1: AIR (Hookshot) - Low Cost
            if (spell === 1) {
                if (this.resources.spendMana(5)) { // Very Low Cost
                    this._doHookshotLogic(dt, mx, my);
                    if (Math.random() < 0.1) this.audio.play('air', 0.5); // Loop-like effect
                }
            }
            // OTHER SPELLS
            else if (this.player.fireCooldown <= 0) {
                // 0: FIREBALL - High Cost
                if (spell === 0 && this.resources.spendMana(80)) {
                    this.player.fireCooldown = 0.5;
                    const angle = Math.atan2(my - (this.player.y + 20), mx - (this.player.x + 20));
                    this.fireballs.push(new Fireball(this.player.x + 20, this.player.y + 20, angle, 'green'));
                    this.audio.play('fire');
                }
                // 2: EARTHQUAKE - Medium Cost
                else if (spell === 2 && this.resources.spendMana(40)) {
                    this.player.fireCooldown = 2.0;
                    this.world.camera.shake = 30;
                    this.audio.play('earth', 0.8);

                    // ... (Code continues unchanged for earthquake logic)
                    this.villagers.forEach(v => {
                        if (v.team !== 'green' && !v.dead && v.onGround) {
                            v.vy = -1000;
                            v.hp -= 50;
                            this._spawnBlood(v.x, v.y, '#8B4513', 10);
                            if (v.hp <= 0) {
                                v.dead = true;
                                this._spawnBlood(v.x, v.y);
                            }
                        }
                    });

                    if (!this.enemyChief.dead && this.enemyChief.isGrounded) {
                        this.enemyChief.vy = -1000;
                        this.enemyChief.hp -= 20;
                        this._spawnBlood(this.enemyChief.x, this.enemyChief.y, '#cc0000', 20);
                    }

                    for (let k = 0; k < 20; k++) {
                        const px = this.world.camera.x + Math.random() * this.world.camera.w;
                        const py = this.world.camera.y + this.world.camera.h;
                        this.particles.push(new Particle(px, py, '#8B4513', 0, 1.0, 10 + Math.random() * 20));
                    }
                }
                // 3: WATER (SPAWN) - High Cost
                else if (spell === 3 && this.resources.spendMana(80)) {
                    this.player.fireCooldown = 1.0;
                    this.rainClouds.push(new RainCloud(mx, my, 'green'));
                    this._forceSpawnVillagers(mx, my, 'green');
                    this.audio.play('water');
                }
            }
        } else {
            this.hookTarget = null;
        }
    }

    _doHookshotLogic(dt, mx, my) {
        let hit = false;
        for (let island of this.islands) {
            // Expanded hit box for ease of use
            if (mx >= island.x - 20 && mx <= island.x + island.w + 20 &&
                my >= island.y - 20 && my <= island.y + island.h + 20) {

                hit = true;
                const dx = this.player.x - island.x; // Pull towards player X

                // VERTICAL ALIGNMENT for Traversal
                // Target Y: Player feet should match Island Top
                const targetY = (this.player.y + this.player.h) - 10;
                const dy = targetY - island.y;

                const dist = Math.sqrt(dx * dx + dy * dy);

                // Stronger Pull
                island.vx += (dx / (dist + 1)) * 1500 * dt;

                // Vertical Snap Force (Stronger than horizontal to align)
                if (Math.abs(dy) > 10) {
                    island.vy += (dy * 5.0) * dt;
                } else {
                    island.vy *= 0.8; // Dampen if aligned
                }

                break;
            }
        }
        this.hookTarget = { x: mx, y: my, hit: hit };
    }

    _handleCombat(dt) {
        // --- 1. PROJECTILES ---
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];

            p.update(dt, (x, y, color) => {
                this.particles.push(new Particle(x, y, color, 0, 0.4, 3, 'trail'));
            }, this.walls);

            let hitSomething = false;

            // Hit Enemy Chief
            if (p.team === 'green' && !this.enemyChief.dead && this._checkHit(p, this.enemyChief)) {
                this._spawnBlood(p.x, p.y);
                this.enemyChief.hp -= p.damage;
                hitSomething = true;
                this.audio.play('hit', 0.4, 0.3);
                if (this.enemyChief.hp <= 0) {
                    this._killChief(this.enemyChief);
                }
            }

            // Hit Player
            if (p.team === 'blue' && !this.player.dead && this._checkHit(p, this.player)) {
                this._spawnBlood(p.x, p.y);
                this.player.hp -= p.damage;
                hitSomething = true;
                this.audio.play('hit', 0.4, 0.3);
                if (this.player.hp <= 0) {
                    this._killChief(this.player);
                }
            }

            // Hit Villagers/Warriors
            for (let v of this.villagers) {
                if (v.team !== p.team && !v.dead && this._checkHit(p, v)) {
                    this._spawnBlood(v.x, v.y);
                    v.hp -= p.damage;
                    hitSomething = true;
                    this.audio.play('hit', 0.3, 0.3);
                    if (v.hp <= 0) {
                        v.dead = true;
                        this._spawnBlood(v.x, v.y);

                        if (p.team === 'green') {
                            this.resources.addWater(5);
                        }
                    }
                }
            }

            if (hitSomething) p.dead = true;
            if (p.dead) this.projectiles.splice(i, 1);
        }

        // --- 2. FIREBALLS ---
        for (let i = this.fireballs.length - 1; i >= 0; i--) {
            const f = this.fireballs[i];
            f.update(dt);

            let hit = false;

            // Wall Hit
            for (let w of this.walls) {
                if (this._checkHit(f, w)) {
                    w.hp -= 200 * dt;
                    f.dead = true;
                    hit = true;
                    this._spawnBlood(f.x, f.y, '#FF4500', 10); // Sparks
                    break;
                }
            }

            // ISLAND COLLISION (New)
            if (!hit) {
                for (let island of this.islands) {
                    if (f.x > island.x && f.x < island.x + island.w &&
                        f.y > island.y && f.y < island.y + island.h) {

                        f.dead = true;
                        hit = true;
                        this._spawnBlood(f.x, f.y, '#FF4500', 15); // Explosion
                        this.audio.play('hit', 0.5, 0.1);

                        // Scorch Tree if close
                        island.trees.forEach(t => {
                            if (Math.abs((island.x + t.x) - f.x) < 80) {
                                t.burnt = true;
                                t.burntTimer = 15.0;
                            }
                        });
                        break;
                    }
                }
            }

            // Burn Enemy Chief (if Green fireball)
            if (f.team === 'green' && !this.enemyChief.dead && this._checkHit(f, this.enemyChief)) {
                this.enemyChief.hp -= 40 * dt;
            }
            // Burn Player (if Blue fireball)
            if (f.team === 'blue' && !this.player.dead && this._checkHit(f, this.player)) {
                this.player.hp -= 40 * dt;
            }

            // INSTA-KILL Villagers of opposite team
            this.villagers.forEach(v => {
                if (!v.dead && v.team !== f.team && this._checkHit(f, v)) {
                    v.dead = true;
                    this._spawnBlood(v.x, v.y, '#FF4500', 20);

                    if (f.team === 'green') {
                        this.resources.addWater(5);
                    }
                }
            });

            // Decorate Trees (Visual Only)
            this.islands.forEach(island => {
                if (f.x > island.x && f.x < island.x + island.w && Math.abs(f.y - island.y) < 100) {
                    island.trees.forEach(t => {
                        if (Math.abs((island.x + t.x) - f.x) < 50) {
                            t.burnt = true;
                            t.burntTimer = 10.0; // Heal in 10s
                        }
                    });
                }
            });

            if (f.dead) this.fireballs.splice(i, 1);
        }

        this.villagers = this.villagers.filter(v => !v.dead);
    }

    _killChief(chief) {
        chief.dead = true;
        chief.respawnTimer = 8.0;
        this._spawnBlood(chief.x, chief.y, '#cc0000', 100);
        this.world.camera.shake = 80;
        this.audio.play('death', 0.8, 0.1);

        // ANIME IMPACT
        this.impactFrameTimer = 0.2;
        this.visualEffects.push(new VisualEffect(0, 0, 'impact'));

        // REPLENISH MANA ON KILL
        if (chief === this.enemyChief) {
            this.resources.replenishAll();
        }
    }

    _checkHit(entity1, entity2) {
        return (entity1.x < entity2.x + entity2.w &&
            entity1.x + entity1.w > entity2.x &&
            entity1.y < entity2.y + entity2.h &&
            entity1.y + entity1.h > entity2.y);
    }

    _spawnBlood(x, y, color = '#cc0000', count = 25) {
        for (let i = 0; i < count; i++) {
            const size = 5 + Math.random() * 7;
            this.particles.push(new Particle(x, y, color, Math.random() * 150, 0.5 + Math.random() * 0.5, size, 'normal'));
        }
    }

    _handleShooting(dt) {
        // LEFT CLICK = ALWAYS ARROWS
        if (this.input.mouse.leftDown) {
            if (this.player.fireCooldown <= 0) {
                this.player.fireCooldown = 0.2; // Fast fire for arrows
                const mx = this.input.mouse.x + this.world.camera.x;
                const my = this.input.mouse.y + this.world.camera.y;
                const angle = Math.atan2(my - (this.player.y + 20), mx - (this.player.x + 20));

                this.projectiles.push(new Projectile(this.player.x + 20, this.player.y + 20, angle, 'green', 25));
                this.audio.play('shoot', 0.4, 0.0);
            }
        }
    }

    _forceSpawnVillagers(x, y, team) {
        // Find nearest friendly hut to cursor
        let bestDist = Infinity;
        let bestIsland = null;

        this.islands.forEach(island => {
            if (island.team === team && island.hasTeepee) {
                const d = Math.sqrt((island.x - x) ** 2 + (island.y - y) ** 2);
                if (d < bestDist) {
                    bestDist = d;
                    bestIsland = island;
                }
            }
        });

        if (bestIsland && bestDist < 1000) {
            const count = 3 + Math.floor(Math.random() * 3);
            for (let i = 0; i < count; i++) {
                if (this.villagers.length >= 200) break;

                const unit = (Math.random() < 0.4) ?
                    new Warrior(bestIsland.x + 50, bestIsland.y - 40, team) :
                    new Villager(bestIsland.x + 50, bestIsland.y - 40, team);
                unit.homeIsland = bestIsland;
                unit.vx = (Math.random() - 0.5) * 200;
                unit.vy = -300; // Pop out!
                this.villagers.push(unit);
            }
        }
    }

    _spawnVillagers() {
        if (this.villagers.length >= 200) return;

        const shuffledIslands = [...this.islands].sort(() => 0.5 - Math.random());

        for (let island of shuffledIslands) {
            if (island.hasTeepee && (island.team === 'green' || island.team === 'blue')) {
                if (Math.random() < 0.3) {
                    const unit = (Math.random() < 0.4) ?
                        new Warrior(island.x + 50, island.y - 40, island.team) :
                        new Villager(island.x + 50, island.y - 40, island.team);
                    unit.homeIsland = island;
                    this.villagers.push(unit);

                    if (this.villagers.length >= 200) break;
                }
            }
        }
    }

    _spawnPigs() {
        if (this.pigs.length >= 77) return;

        const shuffledIslands = [...this.islands].sort(() => 0.5 - Math.random());

        for (let island of shuffledIslands) {
            if (Math.random() < 0.1) {
                const px = island.x + Math.random() * (island.w - 50);
                const py = island.y - 60;
                const piggy = new Pig(px, py);
                piggy.homeIsland = island;
                this.pigs.push(piggy);
                if (this.pigs.length >= 77) break;
            }
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // --- SPECIAL UI DRAWING ---
        if (this.uiState === 'TITLE') {
            this.uiLayer.style.display = 'none';
            if (this.titleImg && this.titleImg.complete) {
                this.ctx.drawImage(this.titleImg, 0, 0, this.canvas.width, this.canvas.height);
            } else {
                this.ctx.fillStyle = 'black'; this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.fillStyle = 'white'; this.ctx.font = '40px Arial'; this.ctx.textAlign = 'center';
                this.ctx.fillText("SKYBABY: EPIC WAR", this.canvas.width / 2, this.canvas.height / 2);
            }
            return;
        }

        if (this.uiState === 'TOOLTIP') {
            this.uiLayer.style.display = 'none';
            if (this.tooltipImg && this.tooltipImg.complete) {
                this.ctx.drawImage(this.tooltipImg, 0, 0, this.canvas.width, this.canvas.height);
            }
            return;
        }

        // Show UI when playing
        this.uiLayer.style.display = 'flex';
        // --------------------------

        const sunHeight = Math.sin(this.dayTime);
        let darkness = 0;
        if (sunHeight < 0.2) {
            darkness = Math.abs(sunHeight - 0.2) * 0.8;
            if (darkness > 0.8) darkness = 0.8;
        }

        this.ctx.save();

        // IMPACT FRAME (Global Filter)
        const isImpactFrame = (this.impactFrameTimer > 0);
        this.canvas.style.filter = isImpactFrame ? 'invert(1) contrast(1.5)' : 'none';

        // ZOOM SCALE
        const z = this.world.camera.zoom;
        this.ctx.scale(z, z);

        // BACKGROUNDS
        this.world.draw(this.ctx, this.season);

        // WEATHER BEHIND (BG)
        this.leaves.forEach(l => { if (l.layer === 'bg') l.draw(this.ctx, this.world.camera); });
        this.snowflakes.forEach(s => { if (s.layer === 'bg') s.draw(this.ctx, this.world.camera); });
        this.rainClouds.forEach(r => r.draw(this.ctx, this.world.camera)); // Clouds usually behind or mid? Let's keep them here.

        // ENTITIES
        this.islands.forEach(i => i.draw(this.ctx, this.world.camera));
        this.walls.forEach(w => w.draw(this.ctx, this.world.camera));

        this.pigs.forEach(p => p.draw(this.ctx, this.world.camera));

        this.villagers.forEach(v => v.draw(this.ctx, this.world.camera));
        this.projectiles.forEach(p => p.draw(this.ctx, this.world.camera));
        this.fireballs.forEach(f => f.draw(this.ctx, this.world.camera));

        if (!this.enemyChief.dead) this.enemyChief.draw(this.ctx, this.world.camera);
        if (!this.player.dead) this.player.draw(this.ctx, this.world.camera);

        this.particles.forEach(p => p.draw(this.ctx, this.world.camera));
        this.visualEffects.forEach(e => e.draw(this.ctx, this.world.camera));

        if (this.hookTarget) {
            this.ctx.strokeStyle = this.hookTarget.hit ? 'cyan' : 'gray';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            // Adjust hook draw for camera logic? 
            // Player and target X are moving. 
            // Simple approach: Use player screen pos and target screen pos.
            // But Entity.draw handles wrapping internally now (or will).
            // For hook, we might see lag if entities wrap. 
            // Let's rely on standard coordinate space for the hook line (might look weird if wrapped).
            const pRect = this.world.camera.getScreenRect(this.player.x + 20, this.player.y + 20, 0, 0);
            const tRect = this.world.camera.getScreenRect(this.hookTarget.x, this.hookTarget.y, 0, 0);
            this.ctx.moveTo(pRect.x, pRect.y);
            this.ctx.lineTo(tRect.x, tRect.y);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        // WEATHER FRONT (FG)
        this.leaves.forEach(l => { if (l.layer !== 'bg') l.draw(this.ctx, this.world.camera); });
        this.snowflakes.forEach(s => { if (s.layer !== 'bg') s.draw(this.ctx, this.world.camera); });

        this.ctx.restore(); // END ZOOM

        // DARKNESS OVERLAY (Unscaled)
        if (darkness > 0.05) {
            this.ctx.fillStyle = `rgba(0, 0, 30, ${darkness})`;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        // IMPACT FLASH (Canvas fill fallback)
        if (isImpactFrame && this.canvas.style.filter === 'none') {
            // Fallback if CSS filter not supported/working
            this.ctx.fillStyle = 'white';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        // UI Updates
        this.resources.updateUI(this.player.hp, this.player.maxHp, this.enemyChief.hp, this.enemyChief.maxHp);

        if (this.player.dead) {
            this.ctx.fillStyle = 'red';
            this.ctx.font = '30px Arial';
            this.ctx.fillText(`RESPAWNING IN ${Math.ceil(this.player.respawnTimer)}...`, this.canvas.width / 2 - 100, this.canvas.height / 2);
        }
    }

}

window.onload = () => { new Game(); };
