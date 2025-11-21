/* THE CAST OF CHARACTERS (Entities)
   Now with Gravity, Jumping, Real Arrows, and Fixed Islands!
*/

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
        if (this.x + this.w < camera.x || this.x > camera.x + camera.w ||
            this.y + this.h < camera.y || this.y > camera.y + camera.h) return;

        const screenX = Math.floor(this.x - camera.x);
        const screenY = Math.floor(this.y - camera.y);

        if (this.image && this.imageLoaded) {
            ctx.drawImage(this.image, screenX, screenY, this.w, this.h);
        } else {
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
        
        // PHYSICS CONSTANTS
        this.speed = 300; 
        this.gravity = 800; // Pulls down
        this.jumpForce = -500; 
        this.flyForce = -400; // Jetpack feel
        this.friction = 0.8;
        this.isGrounded = false;
    }

    update(dt, input, resources, worldWidth, worldHeight, islands) {
        // 1. Horizontal Movement
        if (input.keys.a) this.vx -= 40 * dt; // Acceleration
        if (input.keys.d) this.vx += 40 * dt;
        
        // Apply Velocity to X
        this.x += this.vx * this.speed * dt;
        this.vx *= this.friction; // Drag

        // 2. Vertical Movement (Gravity vs Flight)
        // Default: Apply Gravity
        this.vy += this.gravity * dt;

        // Spacebar Logic
        if (input.keys.space) {
            if (this.isGrounded) {
                // JUMP!
                this.vy = this.jumpForce;
                this.isGrounded = false;
            } else if (resources.air > 0) {
                // FLY! (Jetpack)
                this.vy -= 1500 * dt; // Thrust upwards
                // Cap upward speed
                if (this.vy < this.flyForce) this.vy = this.flyForce;
                // Spend Air
                resources.air -= 30 * dt;
            }
        }

        // Apply Velocity to Y
        this.y += this.vy * dt;

        // 3. Collision Detection (Islands)
        this.isGrounded = false;
        // Bottom of world floor
        if (this.y > worldHeight - this.h) {
            this.y = worldHeight - this.h;
            this.vy = 0;
            this.isGrounded = true;
        }
        // Ceiling
        if (this.y < 0) { this.y = 0; this.vy = 0; }
        
        // Island Collisions
        // Simple AABB + Falling check (Only land if falling down onto it)
        if (this.vy >= 0) { // Only check if falling
            for (let island of islands) {
                // Check horizontal overlap
                if (this.x + this.w > island.x + 10 && this.x < island.x + island.w - 10) {
                    // Check vertical landing (feet touch top of island)
                    const feet = this.y + this.h;
                    // Give a little buffer (15px) for "close enough"
                    if (feet >= island.y && feet <= island.y + 20) {
                         this.y = island.y - this.h;
                         this.vy = 0;
                         this.isGrounded = true;
                    }
                }
            }
        }

        // World Bounds X
        if (this.x < 0) { this.x = 0; this.vx = 0; }
        if (this.x > worldWidth - this.w) { this.x = worldWidth - this.w; this.vx = 0; }

        return (Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1); 
    }

    draw(ctx, camera) {
        const screenX = Math.floor(this.x - camera.x);
        const screenY = Math.floor(this.y - camera.y);
        
        if (this.image && this.imageLoaded) {
            const drawSize = 48; 
            const offset = (64 - drawSize) / 2;
            ctx.drawImage(this.image, screenX + offset, screenY + offset, drawSize, drawSize);
        } else {
            ctx.fillStyle = this.team === 'green' ? '#0f0' : '#00f';
            ctx.fillRect(screenX, screenY, this.w, this.h);
        }
    }
}

// --- FLOATING ISLANDS ---
export class Island extends Entity {
    constructor(x, y, w, h, team) {
        super(x, y, w, h, null);
        this.team = team;
        
        this.tileset = new Image();
        this.tileset.src = 'assets/environment/island_tileset.png';
        
        this.imgTeepee = new Image();
        this.imgTeepee.src = team === 'green' ? 'assets/environment/teepee_green.png' : 'assets/environment/teepee_blue.png';
        
        this.imgTree = new Image();
        this.imgTree.src = 'assets/environment/tree_variant1.png';
        
        this.imgFire = new Image();
        this.imgFire.src = 'assets/environment/fireplace_lit.png';

        this.hasTeepee = true;
        this.hasTree = true;
        this.hasFireplace = Math.random() > 0.4; 

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

        const screenX = Math.floor(this.x - camera.x);
        const screenY = Math.floor(this.y - camera.y);

        // 1. DRAW ISLAND BODY
        if (this.tileset.complete && this.tileset.naturalWidth > 0) {
            const sliceW = Math.floor(this.tileset.width / 3);
            const sliceH = this.tileset.height;

            // Left Cap
            ctx.drawImage(this.tileset, 0, 0, sliceW, sliceH, screenX, screenY, sliceW, sliceH);

            // Right Cap (Draw this second to determine where it ends)
            const rightX = screenX + this.w - sliceW;
            ctx.drawImage(this.tileset, sliceW * 2, 0, sliceW, sliceH, rightX, screenY, sliceW, sliceH);

            // Middle Body (Fill the gap)
            // Math.ceil ensures we overlap by a pixel if needed to avoid gaps
            const middleWidth = (rightX - (screenX + sliceW));
            if (middleWidth > 0) {
                // We stretch the middle tile to fit perfectly
                ctx.drawImage(this.tileset, sliceW, 0, sliceW, sliceH, screenX + sliceW, screenY, middleWidth + 1, sliceH);
            }

        } else {
            ctx.fillStyle = this.team === 'green' ? '#2E8B57' : '#4682B4';
            ctx.fillRect(screenX, screenY, this.w, this.h);
        }

        // 2. DRAW STRUCTURES
        const groundY = screenY - 40; 

        if (this.hasTeepee && this.imgTeepee.complete) {
            ctx.drawImage(this.imgTeepee, screenX + 20, groundY, 64, 64);
        }

        if (this.hasFireplace && this.imgFire.complete) {
            ctx.drawImage(this.imgFire, screenX + (this.w/2) - 16, groundY + 20, 32, 32);
        }

        if (this.hasTree && this.imgTree.complete) {
            ctx.drawImage(this.imgTree, screenX + this.w - 70, groundY - 20, 64, 80);
        }

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
        this.vy = 0; // Gravity for villagers too!
        this.stateTimer = 0;
    }

    update(dt, islands) {
        // Gravity
        this.vy += 800 * dt;
        
        // Move
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
            this.stateTimer = Math.random() * 2 + 1;
            this.vx = (Math.random() - 0.5) * 40; 
        }
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Collision with Home Island
        if (this.homeIsland) {
            // Floor check
            if (this.y + this.h > this.homeIsland.y + 10) {
                this.y = this.homeIsland.y - this.h + 10;
                this.vy = 0;
            }
            // Bounds check
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
        this.h = 32; 
        this.image.src = `assets/sprites/warrior_${team}.png`;
        this.hp = 30;
        this.attackCooldown = 0;
    }

    update(dt, islands, enemies, spawnProjectileCallback) {
        super.update(dt, islands); // Keep walking/gravity
        
        if (this.attackCooldown > 0) this.attackCooldown -= dt;

        if (this.attackCooldown <= 0 && enemies.length > 0) {
            let nearestDist = 500; // Increased range
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
                this.attackCooldown = 1.5; 
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
        // USE THE ARROW ASSET for arrows (Blue/Red team warriors)
        // Player uses fireball logic (drawn or fallback)
        let asset = 'assets/sprites/projectile_arrow.png';
        
        super(x, y, 32, 10, asset); 
        this.team = team;
        const speed = 400;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.angle = angle; // Store for rotation
        this.life = 2.0;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        if (this.life <= 0) this.dead = true;
    }

    draw(ctx, camera) {
        if (this.x + this.w < camera.x || this.x > camera.x + camera.w) return;

        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(this.angle);
        
        if (this.image && this.imageLoaded) {
            ctx.drawImage(this.image, 0, 0, this.w, this.h);
        } else {
            ctx.fillStyle = 'yellow';
            ctx.fillRect(0, 0, this.w, this.h);
        }
        ctx.restore();
    }
}
