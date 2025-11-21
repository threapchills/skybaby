/* THE CAST OF CHARACTERS (Entities)
   Now with proper Asset Loading and Tileset Slicing!
*/

// --- BASE ENTITY ---
export class Entity {
    constructor(x, y, w, h, imagePath) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.dead = false;
        
        this.image = null;
        if (imagePath) {
            this.image = new Image();
            this.image.src = imagePath;
            this.imageLoaded = false;
            this.image.onload = () => { this.imageLoaded = true; };
        }
    }

    draw(ctx, camera) {
        // Culling: Don't draw if off screen
        if (this.x + this.w < camera.x || this.x > camera.x + camera.w ||
            this.y + this.h < camera.y || this.y > camera.y + camera.h) return;

        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        if (this.image && this.imageLoaded) {
            ctx.drawImage(this.image, screenX, screenY, this.w, this.h);
        } else {
            // Fallback box
            ctx.fillStyle = '#ff00ff'; 
            ctx.fillRect(screenX, screenY, this.w, this.h);
        }
    }
}

// --- THE PLAYER ---
export class Player extends Entity {
    constructor(x, y, team) {
        super(x, y, 64, 64, `assets/sprites/player_${team}.png`);
        this.team = team; 
        this.vx = 0;
        this.vy = 0;
        this.speed = 400; 
        this.friction = 0.92;
    }

    update(dt, input, resources, worldWidth, worldHeight) {
        let moveSpeed = this.speed;
        
        // Only slow down if AIR is completely empty
        if (resources.air <= 0) moveSpeed *= 0.3;

        // Physics
        if (input.keys.w) this.vy -= 20 * dt;
        if (input.keys.s) this.vy += 20 * dt;
        if (input.keys.a) this.vx -= 20 * dt;
        if (input.keys.d) this.vx += 20 * dt;

        this.x += this.vx * moveSpeed * dt;
        this.y += this.vy * moveSpeed * dt;
        this.vx *= this.friction;
        this.vy *= this.friction;

        // World Bounds
        if (this.x < 0) { this.x = 0; this.vx = 0; }
        if (this.y < 0) { this.y = 0; this.vy = 0; }
        if (this.x > worldWidth - this.w) { this.x = worldWidth - this.w; this.vx = 0; }
        if (this.y > worldHeight - this.h) { this.y = worldHeight - this.h; this.vy = 0; }

        // Return movement state for AIR consumption
        const speedMagnitude = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
        return speedMagnitude > 0.1; 
    }

    draw(ctx, camera) {
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;
        
        if (this.image && this.imageLoaded) {
            // SCALE FIX: Draw smaller than hitbox to look correct relative to islands
            // Drawing at 48x48 centered inside the 64x64 box
            const drawSize = 48; 
            const offset = (64 - drawSize) / 2;
            ctx.drawImage(this.image, screenX + offset, screenY + offset, drawSize, drawSize);
        } else {
            ctx.fillStyle = this.team === 'green' ? '#0f0' : '#00f';
            ctx.fillRect(screenX, screenY, this.w, this.h);
        }
    }
}

// --- FLOATING ISLANDS (With Tileset Slicing) ---
export class Island extends Entity {
    constructor(x, y, w, h, team) {
        super(x, y, w, h, null);
        this.team = team;
        
        // TILES & ASSETS
        this.tileset = new Image();
        this.tileset.src = 'assets/environment/island_tileset.png';
        
        this.imgTeepee = new Image();
        // Specific asset names as requested
        this.imgTeepee.src = team === 'green' ? 'assets/environment/teepee_green.png' : 'assets/environment/teepee_blue.png';
        
        this.imgTree = new Image();
        this.imgTree.src = 'assets/environment/tree_variant1.png';
        
        this.imgFire = new Image();
        this.imgFire.src = 'assets/environment/fireplace_lit.png';

        // Randomize Contents
        this.hasTeepee = true;
        this.hasTree = true;
        this.hasFireplace = Math.random() > 0.4; // 60% chance of fire

        // Dragging State
        this.isBeingDragged = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
    }

    contains(mx, my, camera) {
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;
        return (mx >= screenX && mx <= screenX + this.w &&
                my >= screenY && my <= screenY + this.h);
    }

    draw(ctx, camera) {
        if (this.x + this.w < camera.x || this.x > camera.x + camera.w) return;

        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        // 1. DRAW ISLAND BODY (Sliced Tileset)
        if (this.tileset.complete && this.tileset.naturalWidth > 0) {
            // Assume tileset is 3 equal slices horizontally
            const sliceW = this.tileset.width / 3;
            const sliceH = this.tileset.height;

            // Left Cap
            ctx.drawImage(this.tileset, 0, 0, sliceW, sliceH, screenX, screenY, sliceW, sliceH);

            // Middle Body (Stretch to fill gap)
            const middleWidth = this.w - (sliceW * 2);
            if (middleWidth > 0) {
                ctx.drawImage(this.tileset, sliceW, 0, sliceW, sliceH, screenX + sliceW, screenY, middleWidth, sliceH);
            }

            // Right Cap
            ctx.drawImage(this.tileset, sliceW * 2, 0, sliceW, sliceH, screenX + this.w - sliceW, screenY, sliceW, sliceH);
        } else {
            // Fallback Green Box
            ctx.fillStyle = this.team === 'green' ? '#2E8B57' : '#4682B4';
            ctx.fillRect(screenX, screenY, this.w, this.h);
        }

        // 2. DRAW STRUCTURES (Spaced out nicely!)
        // We place them relative to the island surface.
        // Adjust Y so they sit ON the grass, not float above or sink in.
        const groundY = screenY - 40; 

        // Teepee: Left-ish
        if (this.hasTeepee && this.imgTeepee.complete) {
            ctx.drawImage(this.imgTeepee, screenX + 20, groundY, 64, 64);
        }

        // Fireplace: Middle (if exists) - No overlap with tent!
        if (this.hasFireplace && this.imgFire.complete) {
             // Center of island
            ctx.drawImage(this.imgFire, screenX + (this.w/2) - 16, groundY + 20, 32, 32);
        }

        // Tree: Right-ish
        if (this.hasTree && this.imgTree.complete) {
            ctx.drawImage(this.imgTree, screenX + this.w - 70, groundY - 20, 64, 80);
        }

        // Drag Highlight
        if (this.isBeingDragged) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.setLineDash([10, 5]);
            ctx.strokeRect(screenX, screenY, this.w, this.h);
            ctx.setLineDash([]);
        }
    }
}

// --- VILLAGERS & WARRIORS ---
export class Villager extends Entity {
    constructor(x, y, team) {
        const variant = Math.floor(Math.random() * 4) + 1;
        super(x, y, 24, 24, `assets/sprites/villager_${team}_${variant}.png`); 
        this.team = team;
        this.hp = 10;
        this.homeIsland = null;
        
        this.vx = 0;
        this.stateTimer = 0;
    }

    update(dt) {
        // Wander AI
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
            this.stateTimer = Math.random() * 2 + 1;
            // Random move left or right
            this.vx = (Math.random() - 0.5) * 40; 
        }
        this.x += this.vx * dt;

        // Stay on Island
        if (this.homeIsland) {
            if (this.x < this.homeIsland.x) { 
                this.x = this.homeIsland.x; 
                this.vx *= -1; 
            }
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
        this.w = 32; 
        this.h = 32; // Warriors slightly bigger/tougher looking
        this.image.src = `assets/sprites/warrior_${team}.png`;
        this.hp = 30;
        this.attackCooldown = 0;
    }

    update(dt, enemies, spawnProjectileCallback) {
        super.update(dt); // Keep walking
        
        if (this.attackCooldown > 0) this.attackCooldown -= dt;

        if (this.attackCooldown <= 0 && enemies.length > 0) {
            // Find nearest enemy
            let nearestDist = 400; // Attack range
            let target = null;

            enemies.forEach(e => {
                const dx = e.x - this.x;
                const dy = e.y - this.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    target = e;
                }
            });

            if (target) {
                // Attack!
                this.attackCooldown = 2.0; // Time between throws
                const dx = target.x - this.x;
                const dy = target.y - this.y;
                const angle = Math.atan2(dy, dx);
                spawnProjectileCallback(this.x, this.y, angle, this.team);
            }
        }
    }
}

// --- PROJECTILES ---
export class Projectile extends Entity {
    constructor(x, y, angle, team) {
        super(x, y, 16, 16, team === 'green' ? 'assets/sprites/projectile_fire.png' : 'assets/sprites/projectile_arrow.png');
        this.team = team;
        const speed = 350;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 2.0; // Seconds before disappearing
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        if (this.life <= 0) this.dead = true;
    }
}
