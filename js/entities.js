/* THE CAST OF CHARACTERS (Entities)
   Here lives the logic for everything that moves, breathes, or floats.
   Includes: Player, Islands, Villagers, Warriors, and Projectiles.
*/

// A simple helper for rectangle collision (Axis-Aligned Bounding Box)
function checkAABB(rect1, rect2) {
    return (rect1.x < rect2.x + rect2.w &&
            rect1.x + rect1.w > rect2.x &&
            rect1.y < rect2.y + rect2.h &&
            rect1.y + rect1.h > rect2.y);
}

// --- BASE ENTITY CLASS ---
class Entity {
    constructor(x, y, w, h, imagePath) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.dead = false; // If true, garbage collector eats it
        
        // Image handling
        this.image = null;
        if (imagePath) {
            this.image = new Image();
            this.image.src = imagePath;
            this.imageLoaded = false;
            this.image.onload = () => { this.imageLoaded = true; };
        }
    }

    draw(ctx, camera) {
        // Don't draw if off-screen (Culling optimization)
        if (this.x + this.w < camera.x || this.x > camera.x + camera.w ||
            this.y + this.h < camera.y || this.y > camera.y + camera.h) {
            return;
        }

        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        if (this.image && this.imageLoaded) {
            ctx.drawImage(this.image, screenX, screenY, this.w, this.h);
        } else {
            // Fallback rectangle if image is missing
            ctx.fillStyle = '#ff00ff'; // Magenta error color
            ctx.fillRect(screenX, screenY, this.w, this.h);
        }
    }
}

// --- THE PLAYER (YOU!) ---
export class Player extends Entity {
    constructor(x, y, team) {
        // Standard size 64x64 for the Chieftain
        super(x, y, 64, 64, `assets/sprites/player_${team}.png`);
        this.team = team; // 'green' or 'blue'
        
        this.vx = 0;
        this.vy = 0;
        this.speed = 300; // Pixels per second
        this.friction = 0.9; // Air resistance
    }

    update(dt, input, resources, worldWidth, worldHeight) {
        // 1. MOVEMENT (WASD)
        // Only process input if we have AIR (Stamina)
        let moveSpeed = this.speed;
        
        // If out of breath, move sluggishly
        if (resources.air <= 0) moveSpeed *= 0.2;

        if (input.keys.w) this.vy -= 20 * dt; // Acceleration
        if (input.keys.s) this.vy += 20 * dt;
        if (input.keys.a) this.vx -= 20 * dt;
        if (input.keys.d) this.vx += 20 * dt;

        // Apply Velocity
        this.x += this.vx * moveSpeed * dt;
        this.y += this.vy * moveSpeed * dt;

        // Apply Friction (Drag)
        this.vx *= this.friction;
        this.vy *= this.friction;

        // Clamp to World Boundaries
        if (this.x < 0) { this.x = 0; this.vx = 0; }
        if (this.y < 0) { this.y = 0; this.vy = 0; }
        if (this.x > worldWidth - this.w) { this.x = worldWidth - this.w; this.vx = 0; }
        if (this.y > worldHeight - this.h) { this.y = worldHeight - this.h; this.vy = 0; }

        // 2. RESOURCE DRAIN
        // Calculate total speed to see if we are flying fast
        const speedMagnitude = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
        const isMoving = speedMagnitude > 0.1;
        
        // We pass this state back to the resource manager via the main loop usually,
        // but for now, let's return the state so Main can handle it.
        return isMoving; 
    }
}

// --- FLOATING ISLANDS ---
export class Island extends Entity {
    constructor(x, y, w, h, team) {
        // Use the tileset eventually, but basic setup for now
        super(x, y, w, h, null); 
        this.team = team;
        
        // Structure Logic
        this.hasTeepee = true;
        this.hasFireplace = Math.random() > 0.5; // 50% chance
        this.hasTree = true;

        // Dragging Logic
        this.isBeingDragged = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
    }

    // Check if mouse is over this island
    contains(mx, my, camera) {
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;
        return (mx >= screenX && mx <= screenX + this.w &&
                my >= screenY && my <= screenY + this.h);
    }

    draw(ctx, camera) {
        // Override draw to build the island from parts
        if (this.x + this.w < camera.x || this.x > camera.x + camera.w) return;

        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        // 1. Draw Soil/Grass Base
        ctx.fillStyle = this.team === 'green' ? '#2E8B57' : '#4682B4'; // SeaGreen vs SteelBlue debug colors
        ctx.fillRect(screenX, screenY, this.w, this.h);
        
        // Draw Rocky Bottom
        ctx.fillStyle = '#696969';
        ctx.beginPath();
        ctx.moveTo(screenX, screenY + this.h);
        ctx.lineTo(screenX + this.w / 2, screenY + this.h + 20); // Spike
        ctx.lineTo(screenX + this.w, screenY + this.h);
        ctx.fill();

        // 2. Draw Structures (Simple placeholders or images if we had them loaded here)
        // We'll draw simple emojis for now if images aren't ready, just to see them!
        ctx.font = '20px Arial';
        
        // Teepee
        if (this.hasTeepee) ctx.fillText('⛺', screenX + 10, screenY - 5);
        // Tree
        if (this.hasTree) ctx.fillText('🌲', screenX + this.w - 30, screenY - 5);
        // Fire
        if (this.hasFireplace) ctx.fillText('🔥', screenX + (this.w/2) - 10, screenY - 5);
        
        // Drag Highlight
        if (this.isBeingDragged) {
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.strokeRect(screenX, screenY, this.w, this.h);
        }
    }
}

// --- VILLAGERS & WARRIORS ---
export class Villager extends Entity {
    constructor(x, y, team) {
        // Tiny people! 16x16 (4x smaller than standard 64px tiles)
        // Random variant 1-4
        const variant = Math.floor(Math.random() * 4) + 1;
        super(x, y, 16, 16, `assets/sprites/villager_${team}_${variant}.png`);
        
        this.team = team;
        this.hp = 10;
        this.homeIsland = null; // Assigned on spawn
        
        // AI State
        this.state = 'IDLE'; // IDLE, WALK
        this.stateTimer = 0;
        this.vx = 0;
        this.walkSpeed = 20;
    }

    update(dt) {
        // Simple Random Walk AI
        this.stateTimer -= dt;

        if (this.stateTimer <= 0) {
            // Pick new state
            this.stateTimer = Math.random() * 2 + 1; // 1-3 seconds
            if (Math.random() > 0.5) {
                this.state = 'IDLE';
                this.vx = 0;
            } else {
                this.state = 'WALK';
                this.vx = (Math.random() > 0.5 ? 1 : -1) * this.walkSpeed;
            }
        }

        // Move
        this.x += this.vx * dt;

        // Stay on Island (Simple bounds check if we knew the island)
        if (this.homeIsland) {
            if (this.x < this.homeIsland.x) { this.x = this.homeIsland.x; this.vx *= -1; }
            if (this.x > this.homeIsland.x + this.homeIsland.w - this.w) {
                this.x = this.homeIsland.x + this.homeIsland.w - this.w;
                this.vx *= -1;
            }
        }
    }
}

export class Warrior extends Villager {
    constructor(x, y, team) {
        super(x, y, team);
        this.image = new Image();
        this.image.src = `assets/sprites/warrior_${team}.png`;
        this.hp = 30; // Tougher
        this.attackRange = 150;
        this.attackCooldown = 0;
    }

    update(dt, enemies, spawnProjectileCallback) {
        super.update(dt); // Keep walking logic

        // Combat Logic
        if (this.attackCooldown > 0) this.attackCooldown -= dt;

        if (this.attackCooldown <= 0) {
            // Look for enemies
            for (let enemy of enemies) {
                // Check distance
                const dx = enemy.x - this.x;
                const dy = enemy.y - this.y;
                const dist = Math.sqrt(dx*dx + dy*dy);

                if (dist < this.attackRange) {
                    // ATTACK!
                    this.attackCooldown = 2.0; // 2 seconds between throws
                    
                    // Create Projectile
                    // Calculate angle
                    const angle = Math.atan2(dy, dx);
                    spawnProjectileCallback(this.x, this.y, angle, this.team);
                    break; // Attack one at a time
                }
            }
        }
    }
}

// --- PROJECTILES ---
export class Projectile extends Entity {
    constructor(x, y, angle, team) {
        super(x, y, 8, 8, null); // 8x8 dot
        this.team = team;
        this.speed = 200;
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
        this.life = 2.0; // Dies after 2 seconds
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        if (this.life <= 0) this.dead = true;
    }

    draw(ctx, camera) {
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;
        
        ctx.fillStyle = this.team === 'green' ? 'orange' : 'red'; // Fireball vs Enemy Spear color
        ctx.beginPath();
        ctx.arc(screenX + 4, screenY + 4, 4, 0, Math.PI*2);
        ctx.fill();
    }
}
