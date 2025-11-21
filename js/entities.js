/* THE CAST OF CHARACTERS (Entities)
   Now with Particles, World Wrapping, and Connected Islands!
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
        // Wrapping Logic for Drawing (Draw copies if near edge? For now, simple culling)
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

// --- PARTICLES (BLOOD & EXPLOSIONS) ---
export class Particle extends Entity {
    constructor(x, y, color, speed, life) {
        super(x, y, 4, 4, null);
        this.color = color;
        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = life;
        this.maxLife = life;
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
        ctx.globalAlpha = this.life / this.maxLife;
        ctx.fillStyle = this.color;
        ctx.fillRect(screenX, screenY, this.w, this.h);
        ctx.globalAlpha = 1.0;
    }
}

// --- THE PLAYER ---
export class Player extends Entity {
    constructor(x, y, team) {
        super(x, y, 64, 64, `assets/sprites/player_${team}.png`);
        this.team = team; 
        this.vx = 0;
        this.vy = 0;
        this.hp = 100; // Player HP!
        
        // PHYSICS
        this.speed = 300; 
        this.gravity = 800; 
        this.jumpForce = -500; 
        this.flyForce = -400; 
        this.friction = 0.8;
        this.isGrounded = false;
        
        // EARTH TRACKING
        this.visitedIslands = new Set();
    }

    update(dt, input, resources, worldWidth, worldHeight, islands) {
        // 1. Horizontal Movement
        if (input && input.keys) { // AI might pass null input
            if (input.keys.a) this.vx -= 40 * dt; 
            if (input.keys.d) this.vx += 40 * dt;
        }
        
        this.x += this.vx * this.speed * dt;
        this.vx *= this.friction; 

        // 2. Vertical Movement
        this.vy += this.gravity * dt;

        if (input && input.keys.space) {
            if (this.isGrounded) {
                this.vy = this.jumpForce;
                this.isGrounded = false;
            } else if (resources && resources.air > 0) {
                this.vy -= 1500 * dt; 
                if (this.vy < this.flyForce) this.vy = this.flyForce;
                resources.air -= 30 * dt;
            }
        }

        this.y += this.vy * dt;

        // 3. Collision & Landing
        this.isGrounded = false;
        
        // Island Collision
        if (this.vy >= 0) { 
            for (let island of islands) {
                // Hitbox check
                if (this.x + this.w > island.x + 10 && this.x < island.x + island.w - 10) {
                    const feet = this.y + this.h;
                    if (feet >= island.y && feet <= island.y + 25) {
                         this.y = island.y - this.h;
                         this.vy = 0;
                         this.isGrounded = true;
                         
                         // Add to Visited List (Earth Resource Logic)
                         if (this.team === 'green') {
                            this.visitedIslands.add(island);
                         }
                    }
                }
            }
        }

        // 4. WORLD WRAPPING (The Graceful Fall)
        if (this.y > worldHeight) this.y = -this.h; // Fall bottom -> Top
        if (this.y < -this.h * 2) this.y = worldHeight; // Fly too high -> Bottom
        
        if (this.x > worldWidth) this.x = 0; // Wrap Right -> Left
        if (this.x < -this.w) this.x = worldWidth; // Wrap Left -> Right

        return (Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1); 
    }
    
    draw(ctx, camera) {
        super.draw(ctx, camera);
        // Draw HP Bar
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;
        ctx.fillStyle = 'red';
        ctx.fillRect(screenX, screenY - 10, 64, 5);
        ctx.fillStyle = 'lime';
        ctx.fillRect(screenX, screenY - 10, 64 * (this.hp / 100), 5);
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

        this.vx = 0;
        this.vy = 0;
        this.friction = 0.95; // Islands stop slowly
    }

    update(dt) {
        // Physics for Hookshot
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx *= this.friction;
        this.vy *= this.friction;
    }

    draw(ctx, camera) {
        if (this.x + this.w < camera.x || this.x > camera.x + camera.w) return;

        const screenX = Math.floor(this.x - camera.x);
        const screenY = Math.floor(this.y - camera.y);

        // 1. DRAW ISLAND BODY
        if (this.tileset.complete && this.tileset.naturalWidth > 0) {
            const sliceW = Math.floor(this.tileset.width / 3);
            const sliceH = this.tileset.height;
            
            // Left
            ctx.drawImage(this.tileset, 0, 0, sliceW, sliceH, screenX, screenY, sliceW, sliceH);
            // Right
            const rightX = screenX + this.w - sliceW;
            ctx.drawImage(this.tileset, sliceW * 2, 0, sliceW, sliceH, rightX, screenY, sliceW, sliceH);
            // Middle
            const middleWidth = (rightX - (screenX + sliceW));
            if (middleWidth > 0) {
                ctx.drawImage(this.tileset, sliceW, 0, sliceW, sliceH, screenX + sliceW, screenY, middleWidth + 2, sliceH);
            }
        } else {
            ctx.fillStyle = this.team === 'green' ? '#2E8B57' : '#4682B4';
            ctx.fillRect(screenX, screenY, this.w, this.h);
        }

        // 2. DRAW STRUCTURES
        const groundY = screenY - 40; 
        if (this.hasTeepee && this.imgTeepee.complete) ctx.drawImage(this.imgTeepee, screenX + 20, groundY, 64, 64);
        if (this.hasFireplace && this.imgFire.complete) ctx.drawImage(this.imgFire, screenX + (this.w/2) - 16, groundY + 20, 32, 32);
        if (this.hasTree && this.imgTree.complete) ctx.drawImage(this.imgTree, screenX + this.w - 70, groundY - 20, 64, 80);
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
        this.vy = 0; 
        this.stateTimer = 0;
    }

    update(dt, islands, worldWidth, worldHeight) {
        // Gravity
        this.vy += 800 * dt;
        
        // Random Wander
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
            this.stateTimer = Math.random() * 2 + 1;
            this.vx = (Math.random() - 0.5) * 60; 
        }
        
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Platform Collision (Walk on ANY island)
        let onGround = false;
        if (this.vy >= 0) {
            for (let island of islands) {
                // Adjacency Logic: If islands overlap or are super close, treat as one floor
                if (this.x + this.w > island.x && this.x < island.x + island.w) {
                     if (this.y + this.h >= island.y && this.y + this.h <= island.y + 20) {
                         this.y = island.y - this.h;
                         this.vy = 0;
                         onGround = true;
                     }
                }
            }
        }
        
        // World Wrapping
        if (this.y > worldHeight) this.y = 0;
        if (this.x > worldWidth) this.x = 0;
        if (this.x < 0) this.x = worldWidth;
    }
}

export class Warrior extends Villager {
    constructor(x, y, team) {
        super(x, y, team);
        this.w = 32; this.h = 32; 
        this.image.src = `assets/sprites/warrior_${team}.png`;
        this.hp = 30;
        this.attackCooldown = 0;
    }

    update(dt, islands, enemies, spawnProjectileCallback, worldWidth, worldHeight) {
        super.update(dt, islands, worldWidth, worldHeight);
        
        if (this.attackCooldown > 0) this.attackCooldown -= dt;

        if (this.attackCooldown <= 0 && enemies.length > 0) {
            let nearestDist = 600; 
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
                // Aim slightly up to arc over things
                const dx = target.x - this.x;
                const dy = (target.y - 20) - this.y;
                const angle = Math.atan2(dy, dx);
                spawnProjectileCallback(this.x, this.y, angle, this.team);
            }
        }
    }
}

export class Projectile extends Entity {
    constructor(x, y, angle, team) {
        super(x, y, 32, 10, 'assets/sprites/projectile_arrow.png'); 
        this.team = team;
        const speed = 500;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.angle = angle; 
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
