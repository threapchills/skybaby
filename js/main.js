/* THE HEART OF THE GAME
   Polished Edition: Varied Islands, Win/Respawn Logic, and No Crashes.
*/

import { InputHandler } from './input.js';
import { ResourceManager } from './resources.js';
import { World } from './world.js';
import { Player, Island, Villager, Warrior, Projectile, Particle } from './entities.js';

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        this.worldWidth = 6000; 
        this.worldHeight = 3000;

        this.input = new InputHandler();
        this.resources = new ResourceManager();
        this.world = new World(this.worldWidth, this.worldHeight);
        
        this.player = new Player(400, 200, 'green'); 
        this.enemyChief = new Player(5500, 200, 'blue');

        this.islands = [];
        this.villagers = [];
        this.projectiles = [];
        this.particles = [];

        this._generateWorld();

        this.lastTime = 0;
        this.spawnTimer = 0;
        this.hookTarget = null;
        this.gameOver = false;

        requestAnimationFrame((ts) => this.loop(ts));
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
        // 1. GREEN BASE (Varied Sizes)
        this.islands.push(new Island(200, 1000, 600, 100, 'green')); // Big Home
        this.islands.push(new Island(900, 800, 300, 100, 'green'));
        this.islands.push(new Island(400, 1400, 400, 100, 'green'));

        // 2. NEUTRAL WILDS (Scattered)
        this.islands.push(new Island(1500, 1000, 300, 100, 'neutral'));
        this.islands.push(new Island(2000, 700, 500, 100, 'neutral')); // High ground
        this.islands.push(new Island(2400, 1200, 400, 100, 'neutral'));
        this.islands.push(new Island(3000, 900, 800, 100, 'neutral')); // The Bridge

        // 3. BLUE BASE (Right)
        this.islands.push(new Island(4500, 1000, 600, 100, 'blue'));
        this.islands.push(new Island(5200, 800, 300, 100, 'blue'));
        this.islands.push(new Island(4800, 1400, 400, 100, 'blue'));

        this.player.visitedIslands.add(this.islands[0]);
    }

    loop(timestamp) {
        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        if (dt > 0.1) { requestAnimationFrame((ts) => this.loop(ts)); return; }

        this.update(dt);
        this.draw();
        requestAnimationFrame((ts) => this.loop(ts));
    }

    update(dt) {
        if (this.gameOver) return;

        // 1. UPDATE PLAYER
        const isMoving = this.player.update(dt, this.input, this.resources, this.worldWidth, this.worldHeight, this.islands);
        this.world.update(this.player);

        // 2. UPDATE ENEMY SHAMAN (AI)
        if (!this.enemyChief.dead) {
            const dx = this.player.x - this.enemyChief.x;
            const dy = this.player.y - this.enemyChief.y;
            this.enemyChief.x += (dx * 0.15) * dt;
            this.enemyChief.y += (dy * 0.15) * dt;
            this.enemyChief.update(dt, null, null, this.worldWidth, this.worldHeight, this.islands); 
        }

        // 3. RESPAWN LOGIC & WIN CONDITIONS
        this._checkWinConditions(dt);

        // 4. RESOURCES & PHYSICS
        this.resources.earth = Math.max(1, this.player.visitedIslands.size);
        
        let nearWater = false;
        let nearFire = false;
        this.islands.forEach(island => {
            island.update(dt); 
            // Check proximity for Regen
            const dist = Math.sqrt((island.x - this.player.x)**2 + (island.y - this.player.y)**2);
            if (dist < 400 && (island.team === 'green' || island.team === 'neutral')) {
                nearWater = true; 
                if (island.hasFireplace) nearFire = true;
            }
        });
        this.resources.update(dt, isMoving, nearWater, nearFire);

        // 5. ACTIONS
        if (!this.player.dead) {
            this._handleShooting(dt);
            this._handleHookshot(dt);
        }

        // 6. SPAWNING
        this.spawnTimer += dt;
        if (this.spawnTimer > 4.0) { 
            this._spawnVillagers(); 
            this.spawnTimer = 0;
        }

        // 7. COMBAT & PARTICLES
        this._handleCombat(dt);
        this.particles.forEach(p => p.update(dt));
        this.particles = this.particles.filter(p => !p.dead);
    }

    _checkWinConditions(dt) {
        const greenCount = this.villagers.filter(v => v.team === 'green').length;
        const blueCount = this.villagers.filter(v => v.team === 'blue').length;

        // PLAYER RESPAWN
        if (this.player.dead) {
            if (greenCount > 0) {
                this.player.respawnTimer -= dt;
                if (this.player.respawnTimer <= 0) {
                    this.player.dead = false;
                    this.player.hp = 100;
                    this.player.x = this.islands[0].x; // Respawn at home
                    this.player.y = this.islands[0].y - 100;
                    this._spawnBlood(this.player.x, this.player.y, '#00ff00'); // Spawn effect
                }
            } else {
                this.gameOver = true;
                alert("DEFEAT! Your tribe has fallen.");
            }
        }

        // ENEMY RESPAWN
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
            // Convert to World Coordinates
            const mx = this.input.mouse.x + this.world.camera.x;
            const my = this.input.mouse.y + this.world.camera.y;

            let hit = false;
            for (let island of this.islands) {
                // CRASH FIX: Ensure we check contains against WORLD coordinates properly
                // Island.contains expects WORLD coords now, which we fixed in Entity logic
                if (mx >= island.x && mx <= island.x + island.w &&
                    my >= island.y && my <= island.y + island.h) {
                    
                    hit = true;
                    if (this.resources.spendWater(25 * dt)) {
                        const dx = this.player.x - island.x;
                        const dy = this.player.y - island.y;
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        island.vx += (dx / dist) * 600 * dt;
                        island.vy += (dy / dist) * 600 * dt;
                    }
                    break;
                }
            }
            this.hookTarget = {x: mx, y: my, hit: hit};
        } else {
            this.hookTarget = null;
        }
    }

    _handleCombat(dt) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.update(dt);
            let hitSomething = false;

            if (p.team === 'green' && !this.enemyChief.dead && this._checkHit(p, this.enemyChief)) {
                this._spawnBlood(p.x, p.y);
                this.enemyChief.hp -= 5;
                hitSomething = true;
                if (this.enemyChief.hp <= 0) {
                    this.enemyChief.dead = true;
                    this.enemyChief.respawnTimer = 5.0;
                    this._spawnBlood(p.x, p.y);
                }
            }
            
            if (p.team === 'blue' && !this.player.dead && this._checkHit(p, this.player)) {
                this._spawnBlood(p.x, p.y);
                this.player.hp -= 5;
                hitSomething = true;
                if (this.player.hp <= 0) {
                    this.player.dead = true;
                    this.player.respawnTimer = 5.0;
                }
            }
            
            for (let v of this.villagers) {
                if (v.team !== p.team && !v.dead && this._checkHit(p, v)) {
                    this._spawnBlood(v.x, v.y);
                    v.hp -= 10;
                    hitSomething = true;
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

                v.update(dt, this.islands, enemies, (x, y, angle, team) => {
                    this.projectiles.push(new Projectile(x, y, angle, team));
                }, this.worldWidth, this.worldHeight);
            } else {
                v.update(dt, this.islands, this.worldWidth, this.worldHeight);
            }
        });
        this.villagers = this.villagers.filter(v => !v.dead);
    }

    _checkHit(proj, entity) {
        return (proj.x > entity.x && proj.x < entity.x + entity.w &&
                proj.y > entity.y && proj.y < entity.y + entity.h);
    }

    _spawnBlood(x, y, color='#cc0000') {
        for (let i=0; i<8; i++) {
            this.particles.push(new Particle(x, y, color, Math.random()*150, 0.5 + Math.random()*0.5));
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
                this.projectiles.push(new Projectile(this.player.x + 20, this.player.y + 20, angle, 'green'));
            }
        }
    }

    _spawnVillagers() {
        // Green
        const greenPop = this.villagers.filter(v => v.team === 'green').length;
        const greenCap = this.resources.earth * 5; 
        if (greenPop < greenCap) {
            const myIslands = this.islands.filter(i => i.team === 'green' || this.player.visitedIslands.has(i));
            if (myIslands.length > 0) {
                const island = myIslands[Math.floor(Math.random() * myIslands.length)];
                const unit = (Math.random() < 0.4) ? 
                    new Warrior(island.x + 50, island.y - 40, 'green') :
                    new Villager(island.x + 50, island.y - 40, 'green');
                unit.homeIsland = island;
                this.villagers.push(unit);
            }
        }
        // Blue
        if (this.villagers.filter(v => v.team === 'blue').length < 30) {
            const enemyIslands = this.islands.filter(i => i.team === 'blue');
             if (enemyIslands.length > 0) {
                const island = enemyIslands[Math.floor(Math.random() * enemyIslands.length)];
                const unit = (Math.random() < 0.5) ? 
                    new Warrior(island.x + 50, island.y - 40, 'blue') :
                    new Villager(island.x + 50, island.y - 40, 'blue');
                unit.homeIsland = island;
                this.villagers.push(unit);
            }
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.world.draw(this.ctx);
        this.islands.forEach(i => i.draw(this.ctx, this.world.camera));
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

        this.resources.drawUI(this.ctx);
        
        // Cursor
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
