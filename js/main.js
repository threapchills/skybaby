/* THE HEART OF THE GAME
   Orchestrates Physics, Battles, and Moving Islands!
*/

import { InputHandler } from './input.js';
import { ResourceManager } from './resources.js';
import { World } from './world.js';
import { Player, Island, Villager, Warrior, Projectile } from './entities.js';

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        this.worldWidth = 6000; 
        this.worldHeight = 2000;

        this.input = new InputHandler();
        this.resources = new ResourceManager();
        this.world = new World(this.worldWidth, this.worldHeight);
        
        this.player = new Player(400, 200, 'green'); // Start in air
        this.enemyChief = new Player(5000, 200, 'blue');

        this.islands = [];
        this.villagers = [];
        this.projectiles = [];

        this._generateWorld();

        this.lastTime = 0;
        this.spawnTimer = 0;
        this.dragTarget = null;

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
        // GENERATE BATTLEFIELD
        // 1. GREEN (Left)
        this.islands.push(new Island(200, 1000, 400, 100, 'green'));
        this.islands.push(new Island(700, 900, 300, 100, 'green'));
        
        // 2. NEUTRAL BATTLEGROUND (Middle)
        // Place them close so units can shoot each other!
        this.islands.push(new Island(1500, 1000, 400, 100, 'neutral'));
        this.islands.push(new Island(2000, 1000, 400, 100, 'neutral'));
        this.islands.push(new Island(2500, 900, 500, 100, 'neutral'));

        // 3. BLUE (Right)
        this.islands.push(new Island(4000, 1000, 400, 100, 'blue'));
        this.islands.push(new Island(4500, 900, 300, 100, 'blue'));

        this.resources.earth = this.islands.filter(i => i.team === 'green').length;
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
        // 1. PLAYER PHYSICS
        // We pass 'this.islands' so the player can land on them!
        const isMoving = this.player.update(dt, this.input, this.resources, this.worldWidth, this.worldHeight, this.islands);
        this.world.update(this.player);

        // 2. ENEMY AI (Cheats: Flies to player)
        const dx = this.player.x - this.enemyChief.x;
        const dy = this.player.y - this.enemyChief.y;
        this.enemyChief.x += (dx * 0.05) * dt; // drift towards player
        this.enemyChief.y += (dy * 0.05) * dt;

        // 3. RESOURCES
        let nearWater = false;
        let nearFire = false;
        
        this.islands.forEach(island => {
            if (island.team === 'green' || island.team === 'neutral') {
                const idx = (island.x + island.w/2) - (this.player.x + 32);
                const idy = (island.y + island.h/2) - (this.player.y + 32);
                const dist = Math.sqrt(idx*idx + idy*idy);
                
                if (dist < 350) {
                    nearWater = true; 
                    if (island.hasFireplace) nearFire = true;
                }
            }
        });
        this.resources.update(dt, isMoving, nearWater, nearFire);

        // 4. SHOOTING
        this._handleShooting(dt);

        // 5. MOVING ISLANDS (Drag Logic)
        this._handleIslandDragging(dt);

        // 6. SPAWNING
        this.spawnTimer += dt;
        if (this.spawnTimer > 3.0) { 
            this._spawnVillagers(); 
            this.spawnTimer = 0;
        }

        // 7. ENTITIES & COMBAT
        this.villagers.forEach(v => {
            if (v instanceof Warrior) {
                const enemies = this.villagers.filter(e => e.team !== v.team && !e.dead);
                // Pass 'islands' to update for gravity
                v.update(dt, this.islands, enemies, (x, y, angle, team) => {
                    this.projectiles.push(new Projectile(x, y, angle, team));
                });
            } else {
                v.update(dt, this.islands);
            }
        });

        // Projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.update(dt);
            
            for (let v of this.villagers) {
                if (v.team !== p.team && !v.dead) {
                    // Hitbox check
                    if (p.x > v.x && p.x < v.x + v.w && p.y > v.y && p.y < v.y + v.h) {
                        v.hp -= 10;
                        p.dead = true;
                        if (v.hp <= 0) v.dead = true;
                    }
                }
            }
            if (p.dead) this.projectiles.splice(i, 1);
        }

        this.villagers = this.villagers.filter(v => !v.dead);
    }

    _handleShooting(dt) {
        if (this.input.mouse.leftDown) {
            if (!this.player.fireCooldown) this.player.fireCooldown = 0;
            this.player.fireCooldown -= dt;

            if (this.player.fireCooldown <= 0 && this.resources.spendFire()) {
                this.player.fireCooldown = 0.5; 
                
                const mouseWorldX = this.input.mouse.x + this.world.camera.x;
                const mouseWorldY = this.input.mouse.y + this.world.camera.y;
                const dx = mouseWorldX - (this.player.x + 32);
                const dy = mouseWorldY - (this.player.y + 32);
                const angle = Math.atan2(dy, dx);

                this.projectiles.push(new Projectile(this.player.x + 32, this.player.y + 32, angle, 'green'));
            }
        }
    }

    _handleIslandDragging(dt) {
        const mouseWorldX = this.input.mouse.x + this.world.camera.x;
        const mouseWorldY = this.input.mouse.y + this.world.camera.y;

        if (this.input.mouse.rightDown) {
            if (!this.dragTarget) {
                for (let island of this.islands) {
                    if (island.team === 'green' && island.contains(mouseWorldX, mouseWorldY, this.world.camera)) {
                        this.dragTarget = island;
                        island.isBeingDragged = true;
                        island.dragOffsetX = mouseWorldX - island.x;
                        island.dragOffsetY = mouseWorldY - island.y;
                        break;
                    }
                }
            } else {
                const moveCost = 10 * dt;
                if (this.resources.spendWater(moveCost)) {
                    this.dragTarget.x = mouseWorldX - this.dragTarget.dragOffsetX;
                    this.dragTarget.y = mouseWorldY - this.dragTarget.dragOffsetY;
                } else {
                    this.dragTarget.isBeingDragged = false;
                    this.dragTarget = null;
                }
            }
        } else {
            if (this.dragTarget) {
                this.dragTarget.isBeingDragged = false;
                this.dragTarget = null;
            }
        }
    }

    _spawnVillagers() {
        const greenPop = this.villagers.filter(v => v.team === 'green').length;
        const greenCap = this.resources.earth * 5; 
        
        // Spawn Green
        if (greenPop < greenCap) {
            const myIslands = this.islands.filter(i => i.team === 'green');
            if (myIslands.length > 0) {
                const island = myIslands[Math.floor(Math.random() * myIslands.length)];
                const unit = (Math.random() < 0.4) ? // 40% Warriors
                    new Warrior(island.x + 50, island.y - 40, 'green') :
                    new Villager(island.x + 50, island.y - 40, 'green');
                unit.homeIsland = island;
                this.villagers.push(unit);
            }
        }

        // Spawn Blue
        const bluePop = this.villagers.filter(v => v.team === 'blue').length;
        if (bluePop < 30) { 
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
        this.projectiles.forEach(p => p.draw(this.ctx, this.world.camera));
        this.villagers.forEach(v => v.draw(this.ctx, this.world.camera));
        
        this.enemyChief.draw(this.ctx, this.world.camera);
        this.player.draw(this.ctx, this.world.camera);

        this.resources.drawUI(this.ctx);
        this._drawCursor();
    }

    _drawCursor() {
        const mx = this.input.mouse.x;
        const my = this.input.mouse.y;
        
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(mx, my, 10, 0, Math.PI*2);
        this.ctx.moveTo(mx - 15, my); this.ctx.lineTo(mx + 15, my);
        this.ctx.moveTo(mx, my - 15); this.ctx.lineTo(mx, my + 15);
        this.ctx.stroke();
    }
}

window.onload = () => { new Game(); };
