/* THE HEART OF THE GAME (Main Entry Point)
   This is where the magic happens. It ties the Input, World, Entities,
   and Resources together into one glorious, infinite loop of chaos.
*/

import { InputHandler } from './input.js';
import { ResourceManager } from './resources.js';
import { World } from './world.js';
import { Player, Island, Villager, Warrior, Projectile } from './entities.js';

class Game {
    constructor() {
        // 1. Setup the Canvas
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // 2. Define the Universe Limits
        this.worldWidth = 4000;
        this.worldHeight = 2000;

        // 3. Initialize Systems
        this.input = new InputHandler();
        this.resources = new ResourceManager();
        this.world = new World(this.worldWidth, this.worldHeight);

        // 4. Create the Actors
        // The Player (Green Tribe) starts near the left
        this.player = new Player(400, 400, 'green');
        
        // The Enemy AI (Blue Tribe) starts near the right
        this.enemyChief = new Player(3600, 400, 'blue');

        // Arrays to hold our chaotic children
        this.islands = [];
        this.villagers = [];
        this.projectiles = [];
        this.particles = []; // For death effects (future expansion)

        // 5. Generate the World (Procedural Generation... sort of)
        this._generateWorld();

        // 6. Game State Variables
        this.lastTime = 0;
        this.spawnTimer = 0;
        this.dragTarget = null; // The island we are currently hauling across the sky

        // Start the engines!
        requestAnimationFrame((ts) => this.loop(ts));
    }

    _generateWorld() {
        // Create Green Islands (Player) on the left
        this.islands.push(new Island(300, 600, 400, 100, 'green'));
        this.islands.push(new Island(800, 500, 300, 80, 'green'));

        // Create Blue Islands (Enemy) on the right
        this.islands.push(new Island(3200, 600, 400, 100, 'blue'));
        this.islands.push(new Island(2800, 500, 300, 80, 'blue'));

        // Create some neutral/wild islands in the middle
        this.islands.push(new Island(1800, 800, 500, 120, 'neutral'));
        
        // Update Earth Resource count initially
        this.resources.earth = this.islands.filter(i => i.team === 'green').length;
    }

    loop(timestamp) {
        // Calculate Delta Time (seconds since last frame)
        // If we don't use this, the game runs faster on gaming PCs and slower on toasters.
        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        // Skip huge lag spikes (e.g. user switched tabs)
        if (dt > 0.1) {
            requestAnimationFrame((ts) => this.loop(ts));
            return;
        }

        this.update(dt);
        this.draw();

        // The snake eats its own tail - recurse!
        requestAnimationFrame((ts) => this.loop(ts));
    }

    update(dt) {
        // --- 1. PLAYER LOGIC ---
        // Returns true if moving, which costs AIR
        const isMoving = this.player.update(dt, this.input, this.resources, this.worldWidth, this.worldHeight);
        
        // Update Camera to look at Player
        this.world.update(this.player);

        // --- 2. PROXIMITY CHECKS (For Resource Regen) ---
        let nearWater = false;
        let nearFire = false;
        
        // Check if player is near any friendly structures
        // Simple distance check to center of islands
        for (let island of this.islands) {
            // We only get mana from OUR islands or Neutral ones
            if (island.team === 'green' || island.team === 'neutral') {
                const dx = (island.x + island.w/2) - (this.player.x + this.player.w/2);
                const dy = (island.y + island.h/2) - (this.player.y + this.player.h/2);
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                // If within 300 pixels of an island center, we recover mana
                if (dist < 300) nearWater = true;
                if (dist < 300 && island.hasFireplace) nearFire = true;
            }
        }

        // --- 3. RESOURCE UPDATE ---
        this.resources.update(dt, isMoving, nearWater, nearFire);

        // --- 4. INTERACTION: SHOOTING (Fireball) ---
        if (this.input.mouse.leftDown) {
            // Simple cooldown hack: check if we have ammo and if we clicked "just now"
            // For a real game we'd add a 'fireCooldown' timer to the player
            if (this.resources.spendFire()) {
                // Calculate angle to mouse (Mouse is screen space, need World space)
                const mouseWorldX = this.input.mouse.x + this.world.camera.x;
                const mouseWorldY = this.input.mouse.y + this.world.camera.y;
                
                const dx = mouseWorldX - (this.player.x + 32);
                const dy = mouseWorldY - (this.player.y + 32);
                const angle = Math.atan2(dy, dx);

                this.projectiles.push(new Projectile(this.player.x + 32, this.player.y + 32, angle, 'green'));
                
                // Reset click so we don't stream fire like a hose (unless we want to!)
                this.input.mouse.leftDown = false; 
            }
        }

        // --- 5. INTERACTION: DRAGGING ISLANDS ---
        this._handleIslandDragging(dt);

        // --- 6. AI CHIEFTAIN (Blue Team) ---
        // He just flies back and forth menacingly
        this.enemyChief.vx = Math.sin(Date.now() / 1000) * 0.5; // Bobbing left/right
        this.enemyChief.vy = Math.cos(Date.now() / 1500) * 0.5; // Bobbing up/down
        // Manually apply movement since he doesn't have an InputHandler
        this.enemyChief.x += this.enemyChief.vx * this.enemyChief.speed * dt;
        this.enemyChief.y += this.enemyChief.vy * this.enemyChief.speed * dt;

        // --- 7. SPAWNING LOGIC ---
        this.spawnTimer += dt;
        if (this.spawnTimer > 5.0) { // Every 5 seconds
            this.spawnTimer = 0;
            this._spawnVillagers();
        }

        // --- 8. UPDATE ENTITIES ---
        // Islands (Dragging logic update inside them if needed?)
        // Villagers
        this.villagers.forEach(v => {
            // If it's a warrior, he needs the enemy list
            if (v instanceof Warrior) {
                // Get enemies (Villagers of opposite team)
                const enemies = this.villagers.filter(e => e.team !== v.team);
                v.update(dt, enemies, (x, y, angle, team) => {
                    // Callback to spawn projectile
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
            
            // Collision Check against Villagers
            // We iterate backwards so we can splice safely
            for (let v of this.villagers) {
                if (v.team !== p.team && !v.dead) {
                    // Simple point-in-rect check for projectile
                    if (p.x > v.x && p.x < v.x + v.w &&
                        p.y > v.y && p.y < v.y + v.h) {
                        
                        v.hp -= 10;
                        p.dead = true;
                        if (v.hp <= 0) v.dead = true;
                    }
                }
            }

            if (p.dead) this.projectiles.splice(i, 1);
        }

        // Cleanup dead villagers
        this.villagers = this.villagers.filter(v => !v.dead);
    }

    _handleIslandDragging(dt) {
        const mouseWorldX = this.input.mouse.x + this.world.camera.x;
        const mouseWorldY = this.input.mouse.y + this.world.camera.y;

        if (this.input.mouse.rightDown) {
            if (!this.dragTarget) {
                // Try to pick up an island
                for (let island of this.islands) {
                    // Can only drag OWN islands
                    if (island.team === 'green' && island.contains(mouseWorldX, mouseWorldY, this.world.camera)) {
                        this.dragTarget = island;
                        island.isBeingDragged = true;
                        // Calculate offset so it doesn't snap to center
                        island.dragOffsetX = mouseWorldX - island.x;
                        island.dragOffsetY = mouseWorldY - island.y;
                        break;
                    }
                }
            } else {
                // We are holding an island!
                // Cost Mana to move it
                const moveCost = 10 * dt;
                if (this.resources.spendWater(moveCost)) {
                    this.dragTarget.x = mouseWorldX - this.dragTarget.dragOffsetX;
                    this.dragTarget.y = mouseWorldY - this.dragTarget.dragOffsetY;
                } else {
                    // Out of mana! Drop it!
                    this.dragTarget.isBeingDragged = false;
                    this.dragTarget = null;
                }
            }
        } else {
            // Released mouse button
            if (this.dragTarget) {
                this.dragTarget.isBeingDragged = false;
                this.dragTarget = null;
            }
        }
    }

    _spawnVillagers() {
        // Spawn for Green
        const greenPop = this.villagers.filter(v => v.team === 'green').length;
        // Max population = Earth * 5
        if (greenPop < this.resources.earth * 5) {
            // Pick random Green island
            const myIslands = this.islands.filter(i => i.team === 'green');
            if (myIslands.length > 0) {
                const island = myIslands[Math.floor(Math.random() * myIslands.length)];
                
                // 20% chance to be a warrior
                let newUnit;
                if (Math.random() < 0.2) {
                    newUnit = new Warrior(island.x + island.w/2, island.y + island.h - 30, 'green');
                } else {
                    newUnit = new Villager(island.x + island.w/2, island.y + island.h - 30, 'green');
                }
                newUnit.homeIsland = island;
                this.villagers.push(newUnit);
            }
        }

        // Spawn for Blue (Cheating AI just spawns based on timer)
        const bluePop = this.villagers.filter(v => v.team === 'blue').length;
        if (bluePop < 10) { // Cap at 10 for now
             const enemyIslands = this.islands.filter(i => i.team === 'blue');
             if (enemyIslands.length > 0) {
                const island = enemyIslands[Math.floor(Math.random() * enemyIslands.length)];
                const isWarrior = Math.random() < 0.3; // AI likes war more
                const unit = isWarrior ? 
                    new Warrior(island.x + island.w/2, island.y, 'blue') : 
                    new Villager(island.x + island.w/2, island.y, 'blue');
                unit.homeIsland = island;
                this.villagers.push(unit);
             }
        }
    }

    draw() {
        // 1. Clear Screen
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 2. Draw World (Parallax Backgrounds)
        this.world.draw(this.ctx);

        // 3. Draw Entities (Order matters for layering!)
        // Draw Islands first (behind people)
        this.islands.forEach(i => i.draw(this.ctx, this.world.camera));
        
        // Draw Villagers/Warriors
        this.villagers.forEach(v => v.draw(this.ctx, this.world.camera));

        // Draw Projectiles
        this.projectiles.forEach(p => p.draw(this.ctx, this.world.camera));

        // Draw Player
        this.player.draw(this.ctx, this.world.camera);
        this.enemyChief.draw(this.ctx, this.world.camera);

        // 4. Draw UI (Resources)
        this.resources.drawUI(this.ctx);

        // 5. Draw Custom Mouse Cursor
        this.ctx.drawImage(
            // If we had an image, we'd use it. For now, let's draw a crosshair manually
            // or just trust the user will add 'cursor_crosshair.png'
            // We'll draw a simple crosshair
            this._getCrosshairCanvas(), 
            this.input.mouse.x - 16, 
            this.input.mouse.y - 16
        );
    }

    // A little helper to generate a crosshair graphic on the fly
    // so you can see where you are aiming even without the asset!
    _getCrosshairCanvas() {
        if (!this.crosshairCanvas) {
            const c = document.createElement('canvas');
            c.width = 32;
            c.height = 32;
            const x = c.getContext('2d');
            x.strokeStyle = 'white';
            x.lineWidth = 2;
            x.beginPath();
            x.moveTo(16, 0); x.lineTo(16, 32);
            x.moveTo(0, 16); x.lineTo(32, 16);
            x.stroke();
            x.beginPath();
            x.arc(16, 16, 10, 0, Math.PI*2);
            x.stroke();
            this.crosshairCanvas = c;
        }
        return this.crosshairCanvas;
    }
}

// Ignite the spark!
window.onload = () => {
    const game = new Game();
};
