/* THE HEART OF THE GAME
   Definitive V33.1: THE TYPO SLAYER UPDATE 蒔
   - Fixed a critical syntax error (missing backtick) that caused the Black Screen of Doom.
   - Game assets load in background while player admires the title.
   - Input logic updated to handle menu navigation.
*/

import { InputHandler } from './input.js';
import { ResourceManager } from './resources.js';
import { World } from './world.js';
// IMPORT EVERYTHING EXPLICITLY TO PREVENT MISSING MODULE ERRORS
import { 
    Player, Island, Villager, Warrior, Projectile, 
    Particle, Pig, Leaf, Snowflake, Assets 
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

        // --- NEW: UI STATE MANAGEMENT ---
        this.uiState = 'TITLE'; // States: 'TITLE' -> 'TOOLTIP' -> 'PLAYING'
        
        // Load UI Images immediately
        this.titleImg = new Image();
        this.titleImg.src = 'assets/title.png';
        
        this.tooltipImg = new Image();
        this.tooltipImg.src = 'assets/tooltip.png';

        this.input = new InputHandler();
        this.resources = new ResourceManager();
        this.world = new World(this.worldWidth, this.worldHeight);
        
        this.audio = new AudioManager(); 
        this.audio.loadAll(); 
        
        this.player = new Player(400, 200, 'green'); 
        this.enemyChief = new Player(5500, 200, 'blue');

        this.islands = [];
        this.villagers = [];
        this.projectiles = [];
        this.particles = [];
        this.pigs = []; 
        this.leaves = []; 
        this.snowflakes = []; 

        // RANDOM SEASON START (50/50)
        this.season = Math.random() > 0.5 ? 'summer' : 'winter';
        console.log(`軸 Starting Season: ${this.season.toUpperCase()}`);

        this._generateWorld();

        // Apply season immediately
        const isWinter = (this.season === 'winter');
        this.islands.forEach(island => island.setSeason(isWinter));

        this.lastTime = 0;
        this.spawnTimer = 0;
        this.hookTarget = null;
        this.gameOver = false;
        
        this.shake = 0;
        
        this.dayCycleTimer = 0; 
        this.dayTime = 0; 
        this.dayCount = 0; 
        
        this.windTimer = 0;
        this.weatherTimer = 0; 
        this.pulseTime = 0; 

        // Audio starts on first interaction, which also handles screen nav
        window.addEventListener('click', () => this._startAudio(), { once: true });
        window.addEventListener('keydown', () => this._startAudio(), { once: true });

        // Screen Navigation Listener
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
            // Simple debounce to prevent clicking through both screens instantly
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
        
        // Clamp dt to prevent spirals
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
        // --- UI BLOCKER ---
        if (this.uiState !== 'PLAYING') return;

        if (this.gameOver) return;

        if (this.shake > 0) this.shake -= 15 * dt; 
        if (this.shake < 0) this.shake = 0;
        
        // --- DAY/NIGHT CYCLE (20s Day, 10s Night) ---
        this.dayCycleTimer += dt;

        if (this.dayCycleTimer < 20) {
            // DAY: 0 to PI over 20 seconds
            this.dayTime = (this.dayCycleTimer / 20) * Math.PI;
        } else if (this.dayCycleTimer < 30) {
            // NIGHT: PI to 2PI over 10 seconds
            const nightProgress = (this.dayCycleTimer - 20) / 10;
            this.dayTime = Math.PI + (nightProgress * Math.PI);
        } else {
            // RESET
            this.dayCycleTimer = 0;
            this.dayTime = 0;
            this.dayCount++;
            console.log(`捲 Day ${this.dayCount} begins!`);
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

        const isMoving = this.player.update(dt, this.input, this.resources, this.worldWidth, this.worldHeight, this.islands, this.audio, this.enemyChief);
        this.world.update(this.player);

        if (!this.enemyChief.dead) {
            this.enemyChief.update(dt, null, null, this.worldWidth, this.worldHeight, this.islands, null, this.player); 
            
            if (this.enemyChief.shootRequest) {
                // ENEMY SHAMAN SHOOTS: 25 Damage
                this.projectiles.push(new Projectile(this.enemyChief.shootRequest.x, this.enemyChief.shootRequest.y, this.enemyChief.shootRequest.angle, 'blue', 25));
                this.enemyChief.shootRequest = null; 
            }

            this.villagers.forEach(v => {
                if (v.team === 'green' && !v.dead) {
                    if (this._checkHit(this.enemyChief, v)) {
                        v.dead = true;
                        this._spawnBlood(v.x, v.y, '#00ff00', 30); 
                        this.audio.play('hit', 0.5, 0.2); 
                        this.shake = 5; 
                    }
                }
            });
        }

        this._checkWinConditions(dt);
        
        let greenTents = 0;
        let greenPop = this.villagers.filter(v => v.team === 'green').length;
        let blueTents = 0;
        let bluePop = this.villagers.filter(v => v.team === 'blue').length;

        let nearWater = false;
        let nearFire = false;
        this.islands.forEach(island => {
            island.update(dt, this.player, this.enemyChief, this.audio); 
            
            if (island.team === 'green' && island.hasTeepee) greenTents++;
            if (island.team === 'blue' && island.hasTeepee) blueTents++;

            const dist = Math.sqrt((island.x - this.player.x)**2 + (island.y - this.player.y)**2);
            if (dist < 400) {
                nearWater = true; 
                if (island.hasFireplace) nearFire = true;
            }
        });
        
        this.resources.update(dt, isMoving, nearWater, nearFire);
        this.resources.updateStats(greenTents, greenPop, blueTents, bluePop);

        if (!this.player.dead) {
            this._handleShooting(dt);
            this._handleHookshot(dt);
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

        this.leaves.forEach(l => l.update(dt));
        this.leaves = this.leaves.filter(l => !l.dead);

        this.snowflakes.forEach(s => s.update(dt));
        this.snowflakes = this.snowflakes.filter(s => !s.dead);

        this.particles.forEach(p => p.update(dt));
        this.particles = this.particles.filter(p => !p.dead);
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
        this.shake = 5; 
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

    _handleHookshot(dt) {
        if (this.input.mouse.rightDown) {
            const mx = this.input.mouse.x + this.world.camera.x;
            const my = this.input.mouse.y + this.world.camera.y;

            let hit = false;
            for (let island of this.islands) {
                if (mx >= island.x && mx <= island.x + island.w &&
                    my >= island.y && my <= island.y + island.h) {
                    
                    hit = true;
                    this.selectedIsland = island;
                    
                    const dx = this.player.x - island.x;
                    const dy = this.player.y - island.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    island.vx += (dx / dist) * 1200 * dt;
                    island.vy += (dy / dist) * 1200 * dt;
                    
                    break;
                }
            }
            this.hookTarget = {x: mx, y: my, hit: hit};
        } else {
            this.hookTarget = null;
            this.selectedIsland = null;
        }
    }

    _handleCombat(dt) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            
            p.update(dt, (x, y, color) => {
                this.particles.push(new Particle(x, y, color, 0, 0.4, 3, 'trail'));
            });
            
            let hitSomething = false;

            // Hit Enemy Chief
            if (p.team === 'green' && !this.enemyChief.dead && this._checkHit(p, this.enemyChief)) {
                this._spawnBlood(p.x, p.y);
                this.enemyChief.hp -= p.damage; // Use dynamic damage from projectile
                hitSomething = true;
                this.audio.play('hit', 0.4, 0.3);
                if (this.enemyChief.hp <= 0) {
                    this.enemyChief.dead = true;
                    this.enemyChief.respawnTimer = 8.0; 
                    this._spawnBlood(p.x, p.y, '#cc0000', 100); 
                    this.shake = 80; 
                    this.audio.play('death', 0.8, 0.1); 
                }
            }
            
            // Hit Player
            if (p.team === 'blue' && !this.player.dead && this._checkHit(p, this.player)) {
                this._spawnBlood(p.x, p.y);
                this.player.hp -= p.damage; // Use dynamic damage from projectile
                hitSomething = true;
                this.audio.play('hit', 0.4, 0.3);
                if (this.player.hp <= 0) {
                    this.player.dead = true;
                    this.player.respawnTimer = 8.0;
                    this.shake = 80; 
                    this.audio.play('death', 0.8, 0.1); 
                }
            }
            
            // Hit Villagers/Warriors
            for (let v of this.villagers) {
                if (v.team !== p.team && !v.dead && this._checkHit(p, v)) {
                    this._spawnBlood(v.x, v.y);
                    
                    // APPLY DAMAGE
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

        this.villagers.forEach(v => {
            if (v instanceof Warrior) {
                const enemies = this.villagers.filter(e => e.team !== v.team && !e.dead);
                if (v.team === 'green' && !this.enemyChief.dead) enemies.push(this.enemyChief);
                if (v.team === 'blue' && !this.player.dead) enemies.push(this.player);
                
                // --- NEW: PASS FRIENDLY LEADER ---
                const friendlyLeader = (v.team === 'green') ? this.player : this.enemyChief;

                // Pass the callback to spawn projectiles with correct damage
                v.update(dt, this.islands, enemies, (x, y, angle, team, damage) => {
                    this.projectiles.push(new Projectile(x, y, angle, team, damage));
                }, this.worldWidth, this.worldHeight, this.audio, friendlyLeader); 
            } else {
                // Pass pigs list for milling behavior
                v.update(dt, this.islands, this.worldWidth, this.worldHeight, this.pigs);
            }
        });
        this.villagers = this.villagers.filter(v => !v.dead);
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
        if (this.input.mouse.leftDown) {
            if (!this.player.fireCooldown) this.player.fireCooldown = 0;
            this.player.fireCooldown -= dt;

            if (this.player.fireCooldown <= 0 && this.resources.spendFire()) {
                this.player.fireCooldown = 0.2; 
                const mx = this.input.mouse.x + this.world.camera.x;
                const my = this.input.mouse.y + this.world.camera.y;
                const angle = Math.atan2(my - (this.player.y+20), mx - (this.player.x+20));
                
                // PLAYER SHOOTS: 25 DAMAGE
                this.projectiles.push(new Projectile(this.player.x + 20, this.player.y + 20, angle, 'green', 25));
                this.audio.play('shoot', 0.4, 0.0);
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
        if (this.shake > 0) {
            const dx = (Math.random() - 0.5) * this.shake;
            const dy = (Math.random() - 0.5) * this.shake;
            this.ctx.translate(dx, dy);
        }

        this.world.draw(this.ctx, this.season);

        this.leaves.forEach(l => l.draw(this.ctx, this.world.camera));
        this.snowflakes.forEach(s => s.draw(this.ctx, this.world.camera));

        this.islands.forEach(i => i.draw(this.ctx, this.world.camera));
        
        this.pigs.forEach(p => p.draw(this.ctx, this.world.camera));
        
        this.villagers.forEach(v => v.draw(this.ctx, this.world.camera));
        this.projectiles.forEach(p => p.draw(this.ctx, this.world.camera));
        if (!this.enemyChief.dead) this.enemyChief.draw(this.ctx, this.world.camera);
        if (!this.player.dead) this.player.draw(this.ctx, this.world.camera);
        this.particles.forEach(p => p.draw(this.ctx, this.world.camera));
        
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
