/* THE HEART OF THE GAME
   With Hookshots, Blood, and Earth Logic fixed!
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
        this.enemyChief = new Player(5000, 200, 'blue');

        this.islands = [];
        this.villagers = [];
        this.projectiles = [];
        this.particles = [];

        this._generateWorld();

        this.lastTime = 0;
        this.spawnTimer = 0;

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
        // BATTLEFIELD SETUP
        this.islands.push(new Island(200, 1000, 400, 100, 'green'));
        this.islands.push(new Island(700, 900, 300, 100, 'green'));
        
        this.islands.push(new Island(1500, 1000, 400, 100, 'neutral'));
        this.islands.push(new Island(2000, 1000, 400, 100, 'neutral'));
        this.islands.push(new Island(2500, 900, 500, 100, 'neutral'));

        this.islands.push(new Island(4000, 1000, 400, 100, 'blue'));
        this.islands.push(new Island(4500, 900, 300, 100, 'blue'));
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
        // 1. ENTITY UPDATES
        const isMoving = this.player.update(dt, this.input, this.resources, this.worldWidth, this.worldHeight, this.islands);
        this.world.update(this.player);

        // AI Shaman (Cheat: Floats towards player to fight)
        const dx = this.player.x - this.enemyChief.x;
        const dy = this.player.y - this.enemyChief.y;
        this.enemyChief.x += (dx * 0.1) * dt;
        this.enemyChief.y += (dy * 0.1) * dt;
        this.enemyChief.update(dt, null, null, this.worldWidth, this.worldHeight, this.islands); // Physics for enemy too

        // 2. EARTH RESOURCE (Based on visited islands)
        this.resources.earth = Math.max(1, this.player.visitedIslands.size);

        // 3. MANA/FIRE REGEN
        let nearWater = false;
        let nearFire = false;
        this.islands.forEach(island => {
            island.update(dt); // Physics for islands
            
            if (island.team === 'green' || island.team === 'neutral') {
                const dist = Math.sqrt((island.x - this.player.x)**2 + (island.y - this.player.y)**2);
                if (dist < 400) {
                    nearWater = true; 
                    if (island.hasFireplace) nearFire = true;
                }
            }
        });
        this.resources.update(dt, isMoving, nearWater, nearFire);

        // 4. ACTIONS
        this._handleShooting(dt);
        this._handleHookshot(dt); // NEW MECHANIC

        // 5. SPAWNING
        this.spawnTimer += dt;
        if (this.spawnTimer > 3.0) { 
            this._spawnVillagers(); 
            this.spawnTimer = 0;
        }

        // 6. COMBAT LOOP
        this._handleCombat(dt);

        // 7. PARTICLES
        this.particles.forEach(p => p.update(dt));
        this.particles = this.particles.filter(p => !p.dead);
    }

    _handleHookshot(dt) {
        // Right click to PULL islands
        if (this.input.mouse.rightDown) {
            const mx = this.input.mouse.x + this.world.camera.x;
            const my = this.input.mouse.y + this.world.camera.y;

            // Find island under mouse
            for (let island of this.islands) {
                if (island.contains(mx, my, this.world.camera)) {
                    // Found target! Pull it towards player!
                    if (this.resources.spendWater(20 * dt)) {
                        const dx = this.player.x - island.x;
                        const dy = this.player.y - island.y;
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        
                        // Normalize and apply force
                        island.vx += (dx / dist) * 500 * dt;
                        island.vy += (dy / dist) * 500 * dt;
                        
                        // Visual Line
                        this.hookTarget = {x: mx, y: my, hit: true};
                    }
                    return;
                }
            }
            // Missed
            this.hookTarget = {x: mx, y: my, hit: false};
        } else {
            this.hookTarget = null;
        }
    }

    _handleCombat(dt) {
        // Update Projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.update(dt);
            
            // Hit Enemy Shaman?
            if (p.team === 'green' && this._checkHit(p, this.enemyChief)) {
                this._spawnBlood(this.enemyChief.x, this.enemyChief.y);
                this.enemyChief.hp -= 5;
                p.dead = true;
            }
            // Hit Player?
            if (p.team === 'blue' && this._checkHit(p, this.player)) {
                this._spawnBlood(this.player.x, this.player.y);
                this.player.hp -= 5;
                p.dead = true;
            }

            // Hit Villagers?
            for (let v of this.villagers) {
                if (v.team !== p.team && !v.dead && this._checkHit(p, v)) {
                    this._spawnBlood(v.x, v.y);
                    v.hp -= 10;
                    p.dead = true;
                    if (v.hp <= 0) v.dead = true;
                }
            }
            if (p.dead) this.projectiles.splice(i, 1);
        }

        // Update Villagers
        this.villagers.forEach(v => {
            if (v instanceof Warrior) {
                const enemies = this.villagers.filter(e => e.team !== v.team && !e.dead);
                // Also target Enemy Shaman
                if (v.team === 'green') enemies.push(this.enemyChief);
                if (v.team === 'blue') enemies.push(this.player);

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

    _spawnBlood(x, y) {
        for (let i=0; i<10; i++) {
            this.particles.push(new Particle(x, y, 'red', Math.random()*100, 0.5));
        }
    }

    _handleShooting(dt) {
        if (this.input.mouse.leftDown) {
            if (!this.player.fireCooldown) this.player.fireCooldown = 0;
            this.player.fireCooldown -= dt;

            if (this.player.fireCooldown <= 0 && this.resources.spendFire()) {
                this.player.fireCooldown = 0.2; // Fast fire rate
                const mx = this.input.mouse.x + this.world.camera.x;
                const my = this.input.mouse.y + this.world.camera.y;
                const angle = Math.atan2(my - (this.player.y+32), mx - (this.player.x+32));
                this.projectiles.push(new Projectile(this.player.x + 32, this.player.y + 32, angle, 'green'));
            }
        }
    }

    _spawnVillagers() {
        // Spawn Green (Based on Earth Count)
        const greenPop = this.villagers.filter(v => v.team === 'green').length;
        const greenCap = this.resources.earth * 5; 
        if (greenPop < greenCap) {
            const myIslands = this.islands.filter(i => i.team === 'green' || this.player.visitedIslands.has(i));
            if (myIslands.length > 0) {
                const island = myIslands[Math.floor(Math.random() * myIslands.length)];
                const unit = (Math.random() < 0.5) ? 
                    new Warrior(island.x + 50, island.y - 40, 'green') :
                    new Villager(island.x + 50, island.y - 40, 'green');
                unit.homeIsland = island;
                this.villagers.push(unit);
            }
        }
        // Spawn Blue
        if (this.villagers.filter(v => v.team === 'blue').length < 20) {
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
        this.enemyChief.draw(this.ctx, this.world.camera);
        this.player.draw(this.ctx, this.world.camera);
        this.particles.forEach(p => p.draw(this.ctx, this.world.camera));

        // Draw Hook Line
        if (this.hookTarget) {
            this.ctx.strokeStyle = this.hookTarget.hit ? 'cyan' : 'gray';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(this.player.x - this.world.camera.x + 32, this.player.y - this.world.camera.y + 32);
            this.ctx.lineTo(this.hookTarget.x - this.world.camera.x, this.hookTarget.y - this.world.camera.y);
            this.ctx.stroke();
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
    }
}

window.onload = () => { new Game(); };
