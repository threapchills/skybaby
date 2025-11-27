/* THE HEART OF THE GAME
   Definitive V35.0: THE FIX (LEFT CLICK SHOOT, RIGHT CLICK SPELL) 🧙‍♂️🏹
   - FIXED: Left Click is now Arrows. Right Click is Spells.
   - FIXED: Enemy AI now uses Spells (Fire, Wall, Water).
   - FIXED: Mana Economy (Regen removed, replenish on kill).
   - FIXED: Audio for Spells.
*/

import { InputHandler } from './input.js';
import { ResourceManager } from './resources.js';
import { World } from './world.js';
import { 
    Player, Island, Villager, Warrior, Projectile, 
    Particle, Pig, Leaf, Snowflake, Assets,
    Fireball, StoneWall, RainCloud, VisualEffect
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

        this.season = Math.random() > 0.5 ? 'summer' : 'winter';
        console.log(`軸 Starting Season: ${this.season.toUpperCase()}`);

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
        this.islands.push(new Island(200, 1000, 600, 100, 'green')); 
        this.islands.push(new Island(5200, 1000, 600, 100, 'blue'));

        const maxAttempts = 50; 
        
        for (let i = 0; i < 25; i++) {
            let placed = false;
            for(let attempt = 0; attempt < maxAttempts; attempt++) {
                const rx = 800 + Math.random() * 4200; 
                const ry = 500 + Math.random() * 1500;
                const rw = 300 + Math.random() * 500;
                const rh = 100;

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
        
        this.pulseTime += dt * 5; 
        this._updateWeather(dt);

        if (this.audio.initialized) {
            const heightRatio = 1.0 + (Math.max(0, 2000 - this.player.y) / 4000);
            this.audio.setLoopPitch('music', heightRatio);
            if (this.player.vy > 300 && !this.player.isGrounded) {
                this.audio.setLoopVolume('fall', 0.6);
            } else {
                this.audio.setLoopVolume('fall', 0.0);
            }
        }

        const isMoving = this.player.update(dt, this.input, this.resources, this.worldWidth, this.worldHeight, this.islands, this.audio, this.enemyChief, this.walls);
        this.world.update(this.player, dt);

        if (!this.enemyChief.dead) {
            this.enemyChief.update(dt, null, null, this.worldWidth, this.worldHeight, this.islands, null, this.player, this.walls); 
            
            // AI SPELL CASTING
            this._updateEnemyAI(dt);

            if (this.enemyChief.shootRequest) {
                this.projectiles.push(new Projectile(this.enemyChief.shootRequest.x, this.enemyChief.shootRequest.y, this.enemyChief.shootRequest.angle, 'blue', 25));
                this.enemyChief.shootRequest = null; 
            }
        }

        this._checkWinConditions(dt);
        
        let greenTents = 0;
        let greenPop = this.villagers.filter(v => v.team === 'green').length;
        let blueTents = 0;
        let bluePop = this.villagers.filter(v => v.team === 'blue').length;

        let nearWater = false;
        let nearFire = false;
        
        for (let i = 0; i < this.islands.length; i++) {
            let islandA = this.islands[i];
            
            islandA.update(dt, this.player, this.enemyChief, this.audio); 
            
            if (islandA.team === 'green' && islandA.hasTeepee) greenTents++;
            if (islandA.team === 'blue' && islandA.hasTeepee) blueTents++;

            const dist = Math.sqrt((islandA.x - this.player.x)**2 + (islandA.y - this.player.y)**2);
            if (dist < 400) {
                nearWater = true; 
                if (islandA.hasFireplace) nearFire = true;
            }

            for (let j = i + 1; j < this.islands.length; j++) {
                let islandB = this.islands[j];
                
                if (islandA.x < islandB.x + islandB.w &&
                    islandA.x + islandA.w > islandB.x &&
                    islandA.y < islandB.y + islandB.h &&
                    islandA.y + islandA.h > islandB.y) {
                    
                    const vRel = Math.sqrt((islandA.vx - islandB.vx)**2 + (islandA.vy - islandB.vy)**2);
                    
                    if (vRel > 100) {
                        this.world.camera.shake = vRel / 20; 
                        this.audio.play('hit', 1.0, 0.5); 
                        
                        this.villagers.forEach(v => {
                             if (!v.dead && 
                                 v.x > Math.max(islandA.x, islandB.x) && 
                                 v.x < Math.min(islandA.x + islandA.w, islandB.x + islandB.w)) {
                                 v.dead = true;
                                 this._spawnBlood(v.x, v.y, '#cc0000', 50);
                             }
                        });

                        const cx = (Math.max(islandA.x, islandB.x) + Math.min(islandA.x+islandA.w, islandB.x+islandB.w)) / 2;
                        const cy = (Math.max(islandA.y, islandB.y) + Math.min(islandA.y+islandA.h, islandB.y+islandB.h)) / 2;
                        for(let k=0; k<20; k++) {
                            this.particles.push(new Particle(cx, cy, '#8B4513', Math.random()*500, 1.0, 10));
                        }
                    }

                    const tempVx = islandA.vx;
                    const tempVy = islandA.vy;
                    islandA.vx = islandB.vx * 0.5;
                    islandA.vy = islandB.vy * 0.5;
                    islandB.vx = tempVx * 0.5;
                    islandB.vy = tempVy * 0.5;

                    if (islandA.x < islandB.x) islandA.x -= 5; else islandA.x += 5;
                }
            }
        }
        
        this.resources.update(dt, isMoving, nearWater, nearFire);
        this.resources.updateStats(greenTents, greenPop, blueTents, bluePop);

        if (!this.player.dead) {
            // Left Click (Arrows)
            this._handleShooting(dt);
            
            // Right Click (Spells)
            this._handleSpellCasting(dt);
        }

        this.spawnTimer += dt;
        if (this.spawnTimer > 3.0) { 
            this._spawnVillagers(); 
            this._spawnPigs(); 
            this.spawnTimer = 0;
        }

        this._handleCombat(dt);
        this._handleConsumables(dt); 
        
        this.pigs.forEach(pig => pig.update(dt, this.islands, this.worldWidth, this.worldHeight));
        this.pigs = this.pigs.filter(p => !p.dead); 

        this.walls.forEach(w => w.update(dt, this.islands, this.worldHeight));
        this.walls = this.walls.filter(w => !w.dead);

        this.leaves.forEach(l => l.update(dt));
        this.leaves = this.leaves.filter(l => !l.dead);

        this.snowflakes.forEach(s => s.update(dt));
        this.snowflakes = this.snowflakes.filter(s => !s.dead);

        this.rainClouds.forEach(r => r.update(dt));
        this.rainClouds = this.rainClouds.filter(r => !r.dead);

        this.particles.forEach(p => p.update(dt));
        this.particles = this.particles.filter(p => !p.dead);

        this.visualEffects.forEach(e => e.update(dt));
        this.visualEffects = this.visualEffects.filter(e => !e.dead);
    }

    _updateEnemyAI(dt) {
        if (!this.enemyChief.dead) {
            this.enemyChief.aiSpellCooldown -= dt;
            if (this.enemyChief.aiSpellCooldown <= 0) {
                this.enemyChief.aiSpellCooldown = 6.0 + Math.random() * 8.0; // Cast every 6-14s

                const distToPlayer = Math.sqrt((this.player.x - this.enemyChief.x)**2 + (this.player.y - this.enemyChief.y)**2);
                const roll = Math.random();

                // 1. Defensive Heal (Water) if HP < 40
                if (this.enemyChief.hp < 40 && roll < 0.6) {
                    this.rainClouds.push(new RainCloud(this.enemyChief.x, this.enemyChief.y, 'blue'));
                    this._forceSpawnVillagers(this.enemyChief.x, this.enemyChief.y, 'blue');
                    this.audio.playSpell();
                }
                // 2. Aggressive Fireball if Player close
                else if (distToPlayer < 700 && roll < 0.7) {
                    const angle = Math.atan2(this.player.y - this.enemyChief.y, this.player.x - this.enemyChief.x);
                    this.fireballs.push(new Fireball(this.enemyChief.x, this.enemyChief.y, angle, 'blue'));
                    this.audio.playSpell();
                }
                // 3. Defensive Wall if being shot at (Simplified: Random chance when high HP)
                else if (this.enemyChief.hp > 80 && roll < 0.3) {
                     this.walls.push(new StoneWall(this.enemyChief.x + (Math.random()-0.5)*100, this.enemyChief.y));
                     this.audio.play('land', 0.8, 0.1); 
                }
            }
        }
    }

    _checkSeasonChange() {
        const cycleDay = this.dayCount % 6;
        const newSeason = (cycleDay >= 3) ? 'winter' : 'summer';
        
        if (newSeason !== this.season) {
            this.season = newSeason;
            console.log(`SEASON CHANGE: Now entering ${this.season.toUpperCase()}! 笶ｸ条沚Ａ`);
            
            const isWinter = (this.season === 'winter');
            this.islands.forEach(island => island.setSeason(isWinter));
            
            if (isWinter) this.leaves = []; 
            else this.snowflakes = []; 
        }
    }

    _handleConsumables(dt) {
        for (let i = this.pigs.length - 1; i >= 0; i--) {
            const pig = this.pigs[i];
            
            if (!this.player.dead && this._checkHit(this.player, pig)) {
                this._consumePig(pig, this.player);
                continue; 
            }

            if (!this.enemyChief.dead && this._checkHit(this.enemyChief, pig)) {
                this._consumePig(pig, this.enemyChief);
                continue;
            }
        }
    }

    _consumePig(pig, consumer) {
        pig.dead = true;
        consumer.hp = Math.min(consumer.hp + 10, consumer.maxHp);
        this.audio.play('munch', 0.6, 0.2); 
        this.world.camera.shake = 5; 
        this._spawnBlood(pig.x, pig.y, '#FF69B4', 15); 
    }

    _updateWeather(dt) {
        this.windTimer -= dt;
        if (this.windTimer <= 0) {
            this.windTimer = 0.1; 
            const cx = this.world.camera.x;
            const cy = this.world.camera.y;
            const px = cx + this.canvas.width + 50; 
            const py = cy + Math.random() * this.canvas.height;
            this.particles.push(new Particle(px, py, 'rgba(255,255,255,0.3)', -800 - Math.random()*400, 2.0, 5, 'wind'));
        }

        this.lightningTimer -= dt;
        if (this.season === 'summer' && this.lightningTimer <= 0) {
            if (Math.random() < 0.001) {
                this.lightningTimer = 0.2;
                this.visualEffects.push(new VisualEffect(this.world.camera.x + Math.random()*800, 0, 'lightning'));
                this.audio.play('shoot', 0.1, 0.5); 
            }
        }

        this.weatherTimer -= dt;
        if (this.weatherTimer <= 0) {
            const cx = this.world.camera.x;
            const cy = this.world.camera.y;
            const cw = this.world.camera.w;
            const ch = this.world.camera.h;
            
            if (this.season === 'summer') {
                this.weatherTimer = 0.1; 
                const buffer = 200;
                const lx = cx - buffer + Math.random() * (cw + buffer * 2);
                const ly = cy - 50 + Math.random() * (ch * 0.5); 
                this.leaves.push(new Leaf(lx, ly));
            } else {
                this.weatherTimer = 0.05; 
                for (let i=0; i<3; i++) {
                    const sx = cx - 100 + Math.random() * (cw + 200);
                    const sy = cy - 50 + Math.random() * (ch * 0.5);
                    this.snowflakes.push(new Snowflake(sx, sy));
                }
            }
        }
    }

    _checkWinConditions(dt) {
        const greenCount = this.villagers.filter(v => v.team === 'green').length;
        const blueCount = this.villagers.filter(v => v.team === 'blue').length;

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
                alert("DEFEAT! Your tribe has fallen.");
            }
        }

        if (this.enemyChief.dead) {
            if (blueCount > 0) {
                this.enemyChief.respawnTimer -= dt;
                if (this.enemyChief.respawnTimer <= 0) {
                    this.enemyChief.dead = false;
                    this.enemyChief.hp = 100;
                    this.enemyChief.x = this.islands[this.islands.length-1].x;
                    this.enemyChief.y = this.islands[this.islands.length-1].y - 100;
                }
            } else {
                this.gameOver = true;
                alert("VICTORY! You have conquered the skies!");
            }
        }
    }

    _handleSpellCasting(dt) {
        // RIGHT CLICK = CAST SPELL
        if (this.input.mouse.rightDown) {
            if (!this.player.fireCooldown) this.player.fireCooldown = 0; // Shared CD or separate?
            
            const mx = this.input.mouse.x + this.world.camera.x;
            const my = this.input.mouse.y + this.world.camera.y;
            const spell = this.resources.currentSpell;

            // 1: AIR (Hookshot)
            if (spell === 1) {
                if (this.resources.spendAir(dt)) {
                    this._doHookshotLogic(dt, mx, my);
                }
            } 
            else if (this.player.fireCooldown <= 0) {
                 // 0: FIREBALL
                if (spell === 0 && this.resources.spendFire()) {
                    this.player.fireCooldown = 0.5; 
                    const angle = Math.atan2(my - (this.player.y+20), mx - (this.player.x+20));
                    this.fireballs.push(new Fireball(this.player.x + 20, this.player.y + 20, angle, 'green'));
                    this.audio.playSpell();
                }
                // 2: EARTH WALL
                else if (spell === 2 && this.resources.spendEarth()) {
                    this.player.fireCooldown = 1.0;
                    this.walls.push(new StoneWall(mx, my));
                    this.audio.play('land', 0.8, 0.1); 
                    this.world.camera.shake = 5;
                }
                // 3: WATER (SPAWN)
                else if (spell === 3 && this.resources.spendWater()) {
                    this.player.fireCooldown = 1.0;
                    this.rainClouds.push(new RainCloud(mx, my, 'green'));
                    this._forceSpawnVillagers(mx, my, 'green');
                    this.audio.playSpell();
                }
            }
        } else {
            this.hookTarget = null;
        }
    }

    _doHookshotLogic(dt, mx, my) {
        let hit = false;
        for (let island of this.islands) {
            if (mx >= island.x && mx <= island.x + island.w &&
                my >= island.y && my <= island.y + island.h) {
                
                hit = true;
                const dx = this.player.x - island.x;
                const dy = this.player.y - island.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                island.vx += (dx / dist) * 1200 * dt;
                island.vy += (dy / dist) * 1200 * dt;
                break;
            }
        }
        this.hookTarget = {x: mx, y: my, hit: hit};
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
                if(this._checkHit(f, w)) {
                    w.hp -= 200 * dt; 
                    f.dead = true;
                    hit = true;
                    break;
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
                }
            });

            // Decorate Trees (Visual Only)
            this.islands.forEach(island => {
                if (f.x > island.x && f.x < island.x + island.w && Math.abs(f.y - island.y) < 100) {
                    island.trees.forEach(t => {
                        if (Math.abs((island.x + t.x) - f.x) < 50) t.burnt = true;
                    });
                }
            });
            
            if (f.dead) this.fireballs.splice(i, 1);
        }

        this.villagers.forEach(v => {
            if (v instanceof Warrior) {
                const enemies = this.villagers.filter(e => e.team !== v.team && !e.dead);
                if (v.team === 'green' && !this.enemyChief.dead) enemies.push(this.enemyChief);
                if (v.team === 'blue' && !this.player.dead) enemies.push(this.player);
                
                const friendlyLeader = (v.team === 'green') ? this.player : this.enemyChief;

                v.update(dt, this.islands, enemies, (x, y, angle, team, damage) => {
                    this.projectiles.push(new Projectile(x, y, angle, team, damage));
                }, this.worldWidth, this.worldHeight, this.audio, friendlyLeader, this.villagers, this.walls); 
            } else {
                v.update(dt, this.islands, this.worldWidth, this.worldHeight, this.pigs, this.walls);
            }
        });
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
        this.visualEffects.push(new VisualEffect(0,0,'impact'));

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

    _spawnBlood(x, y, color='#cc0000', count=25) {
        for (let i=0; i<count; i++) {
            const size = 5 + Math.random() * 7;
            this.particles.push(new Particle(x, y, color, Math.random()*150, 0.5 + Math.random()*0.5, size, 'normal'));
        }
    }

    _handleShooting(dt) {
        // LEFT CLICK = ALWAYS ARROWS
        if (this.input.mouse.leftDown) {
            if (!this.player.fireCooldown) this.player.fireCooldown = 0;
            this.player.fireCooldown -= dt;

            if (this.player.fireCooldown <= 0) {
                this.player.fireCooldown = 0.2; // Fast fire for arrows
                const mx = this.input.mouse.x + this.world.camera.x;
                const my = this.input.mouse.y + this.world.camera.y;
                const angle = Math.atan2(my - (this.player.y+20), mx - (this.player.x+20));

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
                const d = Math.sqrt((island.x - x)**2 + (island.y - y)**2);
                if (d < bestDist) {
                    bestDist = d;
                    bestIsland = island;
                }
            }
        });

        if (bestIsland && bestDist < 1000) {
            const count = 3 + Math.floor(Math.random() * 3);
            for(let i=0; i<count; i++) {
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
            if (this.titleImg.complete) {
                this.ctx.drawImage(this.titleImg, 0, 0, this.canvas.width, this.canvas.height);
            } else {
                this.ctx.fillStyle = 'black'; this.ctx.fillRect(0,0,this.canvas.width, this.canvas.height);
            }
            return; 
        }

        if (this.uiState === 'TOOLTIP') {
            if (this.tooltipImg.complete) {
                this.ctx.drawImage(this.tooltipImg, 0, 0, this.canvas.width, this.canvas.height);
            }
            return;
        }
        // --------------------------

        const sunHeight = Math.sin(this.dayTime); 
        let darkness = 0;
        
        if (sunHeight < 0.2) {
            darkness = Math.abs(sunHeight - 0.2) * 0.8; 
            if (darkness > 0.8) darkness = 0.8;
        }
        
        this.ctx.save();
        if (this.world.camera.shake > 0) {
            // Camera shake handled in world.draw/camera.follow
        }

        const isImpactFrame = (this.impactFrameTimer > 0);
        this.world.draw(this.ctx, this.season, isImpactFrame);

        this.leaves.forEach(l => l.draw(this.ctx, this.world.camera));
        this.snowflakes.forEach(s => s.draw(this.ctx, this.world.camera));
        this.rainClouds.forEach(r => r.draw(this.ctx, this.world.camera));

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
            this.ctx.moveTo(this.player.x - this.world.camera.x + 20, this.player.y - this.world.camera.y + 20);
            this.ctx.lineTo(this.hookTarget.x - this.world.camera.x, this.hookTarget.y - this.world.camera.y);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        this.ctx.restore(); 

        if (darkness > 0.05) {
            this.ctx.fillStyle = `rgba(0, 0, 30, ${darkness})`;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        
        this.resources.drawUI(this.ctx);
        
        const mx = this.input.mouse.x;
        const my = this.input.mouse.y;
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(mx, my, 10, 0, Math.PI*2);
        this.ctx.stroke();

        if (this.player.dead) {
            this.ctx.fillStyle = 'red';
            this.ctx.font = '30px Arial';
            this.ctx.fillText(`RESPAWNING IN ${Math.ceil(this.player.respawnTimer)}...`, this.canvas.width/2 - 100, this.canvas.height/2);
        }
    }
}

window.onload = () => { new Game(); };
