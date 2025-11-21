/* THE HEART OF THE GAME (Main Entry Point)
   Full Screen, Big World, Lots of Islands!
*/

import { InputHandler } from './input.js';
import { ResourceManager } from './resources.js';
import { World } from './world.js';
import { Player, Island, Villager, Warrior, Projectile } from './entities.js';

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // --- FULL SCREEN SETUP ---
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // --- BIG WORLD SETUP ---
        this.worldWidth = 6000; 
        this.worldHeight = 3000;

        this.input = new InputHandler();
        this.resources = new ResourceManager();
        this.world = new World(this.worldWidth, this.worldHeight);
        
        // Entities
        this.player = new Player(400, 400, 'green');
        this.enemyChief = new Player(5000, 400, 'blue'); // Far right start

        this.islands = [];
        this.villagers = [];
        this.projectiles = [];

        this._generateWorld();

        this.lastTime = 0;
        this.spawnTimer = 0;
        this.dragTarget = null;

        // Start Loop
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
        // --- GENERATE A RICH WORLD ---
        // We need enough islands for a proper war!
        
        // 1. GREEN EMPIRE (Left side)
        this.islands.push(new Island(200, 1000, 400, 100, 'green')); // Base
        this.islands.push(new Island(700, 800, 300, 100, 'green'));
        this.islands.push(new Island(300, 1500, 350, 100, 'green'));
        this.islands.push(new Island(900, 1300, 300, 100, 'green'));

        // 2. NEUTRAL ZONE (Middle - Contestable)
        this.islands.push(new Island(1800, 1000, 300, 100, 'neutral'));
        this.islands.push(new Island(2400, 600, 400, 100, 'neutral'));
        this.islands.push(new Island(2200, 1600, 350, 100, 'neutral'));
        this.islands.push(new Island(3000, 1200, 500, 100, 'neutral')); // Big central island

        // 3. BLUE EMPIRE (Right side - Enemies)
        this.islands.push(new Island(4500, 1000, 400, 100, 'blue')); // Base
        this.islands.push(new Island(4000, 800, 300, 100, 'blue'));
        this.islands.push(new Island(4800, 1500, 350, 100, 'blue'));
        this.islands.push(new Island(4200, 1300, 300, 100, 'blue'));

        // Initial earth count update
        this.resources.earth = this.islands.filter(i => i.team === 'green').length;
    }

    loop(timestamp) {
        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        // Prevent crazy jumps if tab is inactive
        if (dt > 0.1) { 
            requestAnimationFrame((ts) => this.loop(ts)); 
            return; 
        }

        this.update(dt);
        this.draw();
        requestAnimationFrame((ts) => this.loop(ts));
    }

    update(dt) {
        // 1. PLAYER
        const isMoving = this.player.update(dt, this.input, this.resources, this.worldWidth, this.worldHeight);
        this.world.update(this.player);

        // 2. ENEMY AI (Simple wander patrol)
        this.enemyChief.x += Math.sin(Date.now()/1000) * 2; 
        this.enemyChief.y += Math.cos(Date.now()/1500) * 2;

        // 3. RESOURCE REGEN CHECKS
        let nearWater = false;
        let nearFire = false;
        
        // Check proximity to Friendly/Neutral islands
        this.islands.forEach(island => {
            if (island.team === 'green' || island.team === 'neutral') {
                // Distance to center of island
                const dx = (island.x + island.w/2) - (this.player.x + 32);
                const dy = (island.y + island.h/2) - (this.player.y + 32);
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                // Recovery Radius
                if (dist < 350) {
                    nearWater = true; // Standing near island refills water
                    if (island.hasFireplace) nearFire = true; // Fire refills ammo
                }
            }
        });
        this.resources.update(dt, isMoving, nearWater, nearFire);

        // 4. SHOOTING
        this._handleShooting(dt);

        // 5. DRAGGING
        this._handleIslandDragging(dt);

        // 6. SPAWNING
        this.spawnTimer += dt;
        if (this.spawnTimer > 4.0) { // Spawn wave every 4 seconds
            this._spawnVillagers(); 
            this.spawnTimer = 0;
        }

        // 7. UPDATE ENTITIES & COMBAT
        // Villagers & Warriors
        this.villagers.forEach(v => {
            if (v instanceof Warrior) {
                // Warriors need list of alive enemies
                const enemies = this.villagers.filter(e => e.team !== v.team && !e.dead);
                v.update(dt, enemies, (x, y, angle, team) => {
                    // Spawn projectile callback
                    this.projectiles.push(new Projectile(x, y, angle, team));
                });
            } else {
                v.update(dt);
            }
        });

        // Projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.update(dt);
            
            // Check collision with Villagers
            for (let v of this.villagers) {
                if (v.team !== p.team && !v.dead) {
                    // AABB Hit Test
                    if (p.x > v.x && p.x < v.x + v.w &&
                        p.y > v.y && p.y < v.y + v.h) {
                        
                        v.hp -= 10;
                        p.dead = true;
                        if (v.hp <= 0) v.dead = true;
                    }
                }
            }
            // Remove dead projectiles
            if (p.dead) this.projectiles.splice(i, 1);
        }

        // Cleanup dead bodies
        this.villagers = this.villagers.filter(v => !v.dead);
    }

    _handleShooting(dt) {
        if (this.input.mouse.leftDown) {
            // Basic cooldown
            if (!this.player.fireCooldown) this.player.fireCooldown = 0;
            this.player.fireCooldown -= dt;

            if (this.player.fireCooldown <= 0 && this.resources.spendFire()) {
                this.player.fireCooldown = 0.5; // Fire rate
                
                // Aiming Logic
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
                // Try grab
                for (let island of this.islands) {
                    // Can only drag GREEN islands
                    if (island.team === 'green' && island.contains(mouseWorldX, mouseWorldY, this.world.camera)) {
                        this.dragTarget = island;
                        island.isBeingDragged = true;
                        island.dragOffsetX = mouseWorldX - island.x;
                        island.dragOffsetY = mouseWorldY - island.y;
                        break;
                    }
                }
            } else {
                // Dragging...
                const moveCost = 10 * dt;
                if (this.resources.spendWater(moveCost)) {
                    this.dragTarget.x = mouseWorldX - this.dragTarget.dragOffsetX;
                    this.dragTarget.y = mouseWorldY - this.dragTarget.dragOffsetY;
                } else {
                    // Dropped due to lack of mana
                    this.dragTarget.isBeingDragged = false;
                    this.dragTarget = null;
                }
            }
        } else {
            // Released
            if (this.dragTarget) {
                this.dragTarget.isBeingDragged = false;
                this.dragTarget = null;
            }
        }
    }

    _spawnVillagers() {
        // GREEN TEAM SPAWN
        const greenPop = this.villagers.filter(v => v.team === 'green').length;
        const greenCap = this.resources.earth * 5; // Pop limit based on islands
        
        if (greenPop < greenCap) {
            const myIslands = this.islands.filter(i => i.team === 'green');
            if (myIslands.length > 0) {
                const island = myIslands[Math.floor(Math.random() * myIslands.length)];
                // 30% Warrior Chance
                const unit = (Math.random() < 0.3) ? 
                    new Warrior(island.x + 50, island.y, 'green') :
                    new Villager(island.x + 50, island.y, 'green');
                unit.homeIsland = island;
                this.villagers.push(unit);
            }
        }

        // BLUE TEAM SPAWN (AI)
        const bluePop = this.villagers.filter(v => v.team === 'blue').length;
        if (bluePop < 20) { // AI gets flat cap for now
            const enemyIslands = this.islands.filter(i => i.team === 'blue');
            if (enemyIslands.length > 0) {
                const island = enemyIslands[Math.floor(Math.random() * enemyIslands.length)];
                // AI prefers Warriors (50% chance)
                const unit = (Math.random() < 0.5) ?
                    new Warrior(island.x + 50, island.y, 'blue') :
                    new Villager(island.x + 50, island.y, 'blue');
                unit.homeIsland = island;
                this.villagers.push(unit);
            }
        }
    }

    draw() {
        // Clear
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // World
        this.world.draw(this.ctx);

        // Entities (Islands -> Projectiles -> Units -> Players)
        this.islands.forEach(i => i.draw(this.ctx, this.world.camera));
        this.projectiles.forEach(p => p.draw(this.ctx, this.world.camera));
        this.villagers.forEach(v => v.draw(this.ctx, this.world.camera));
        
        this.enemyChief.draw(this.ctx, this.world.camera);
        this.player.draw(this.ctx, this.world.camera);

        // UI
        this.resources.drawUI(this.ctx);

        // Cursor
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
