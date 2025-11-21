/* THE CAST OF CHARACTERS (Entities)
   Polished: Planted Assets, Player Indicators, and wrapping logic.
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

// --- PARTICLES ---
export class Particle extends Entity {
    constructor(x, y, color, speed, life) {
        super(x, y, 5, 5, null);
        this.color = color;
        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed - 100; 
        this.life = life;
        this.maxLife = life;
    }

    update(dt) {
        this.vy += 800 * dt; 
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
        // Reduced hitbox size for Shaman (was 64)
        super(x, y, 40, 40, `assets/sprites/player_${team}.png`);
        this.team = team; 
        this.vx = 0;
        this.vy = 0;
        this.hp = 100; 
        this.maxHp = 100;
        
        this.speed = 350; 
        this.gravity = 900; 
        this.jumpForce = -550; 
        this.flyForce = -450; 
        this.friction = 0.85;
        this.isGrounded = false;
        this.respawnTimer = 0; // For logic in main
        
        this.visitedIslands = new Set();
    }

    update(dt, input, resources, worldWidth, worldHeight, islands) {
        if (this.dead) return; // Don't move if dead

        // Horizontal
        if (input && input.keys) {
            if (input.keys.a) this.vx -= 50 * dt; 
            if (input.keys.d) this.vx += 50 * dt;
        }
        this.x += this.vx * this.speed * dt;
        this.vx *= this.friction; 

        // Vertical
        this.vy += this.gravity * dt;

        if (input && input.keys.space) {
            if (this.isGrounded) {
                this.vy = this.jumpForce;
                this.isGrounded = false;
            } else if (resources && resources.air > 0) {
                this.vy -= 1500 * dt; 
                if (this.vy < this.flyForce) this.vy = this.flyForce;
                resources.air -= 40 * dt; 
            }
        }
        this.y += this.vy * dt;

        // Collisions
        this.isGrounded = false;
        if (this.vy >= 0) { 
            for (let island of islands) {
                if (this.x + this.w > island.x + 5 && this.x < island.x + island.w - 5) {
                    const feet = this.y + this.h;
                    if (feet >= island.y && feet <= island.y + 30) {
                         this.y = island.y - this.h + 4; 
                         this.vy = 0;
                         this.isGrounded = true;
                         if (this.team === 'green') this.visitedIslands.add(island);
                    }
                }
            }
        }

        // WRAPPING
        if (this.y > worldHeight + 100) this.y = -100; 
        if (this.y < -200) this.y = worldHeight; 
        if (this.x > worldWidth) this.x = 0; 
        if (this.x < -this.w) this.x = worldWidth; 

        return (Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1); 
    }
    
    draw(ctx, camera) {
        if (this.dead) return;

        const screenX = Math.floor(this.x - camera.x);
        const screenY = Math.floor(this.y - camera.y);
        
        // 1. Draw HUD Marker (Triangle) for Player only
        if (this.team === 'green') {
            ctx.fillStyle = '#00ff00';
            ctx.beginPath();
            ctx.moveTo(screenX + this.w/2, screenY - 25);
            ctx.lineTo(screenX + this.w/2 - 10, screenY - 35);
            ctx.lineTo(screenX + this.w/2 + 10, screenY - 35);
            ctx.fill();
        }

        // 2. Draw Sprite (Scaled nicely)
        if (this.image && this.imageLoaded) {
            // Draw at 48x48 (Slightly bigger than hitbox 40x40)
            ctx.drawImage(this.image, screenX - 4, screenY - 4, 48, 48);
        } else {
            ctx.fillStyle = this.team === 'green' ? '#0f0' : '#00f';
            ctx.fillRect(screenX, screenY, this.w, this.h);
        }

        // 3. HP Bar
        ctx.fillStyle = 'red';
        ctx.fillRect(screenX, screenY - 10, this.w, 4);
        ctx.fillStyle = '#0f0';
        ctx.fillRect(screenX, screenY - 10, this.w * (this.hp / this.maxHp), 4);
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
        this.friction = 0.90; 
    }

    update(dt) {
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
            
            ctx.drawImage(this.tileset, 0, 0, sliceW, sliceH, screenX, screenY, sliceW, sliceH);
            const rightX = screenX + this.w - sliceW;
            const middleWidth = rightX - (screenX + sliceW);
            if (middleWidth > 0) {
                ctx.drawImage(this.tileset, sliceW, 0, sliceW, sliceH, screenX + sliceW, screenY, middleWidth + 2, sliceH);
            }
            ctx.drawImage(this.tileset, sliceW * 2, 0, sliceW, sliceH, rightX, screenY, sliceW, sliceH);
        } else {
            ctx.fillStyle = this.team === 'green' ? '#2E8B57' : '#4682B4';
            ctx.fillRect(screenX, screenY, this.w, this.h);
        }

        // 2. DRAW STRUCTURES (FIXED OFFSET)
        // We push them down (increase Y) so the bottom of the sprite sits in the grass.
        // Grass surface is roughly screenY.
        
        // Teepee: 96px tall. Draw at Y - 80 to sink 16px.
        if (this.hasTeepee && this.imgTeepee.complete) {
            ctx.drawImage(this.imgTeepee, screenX + 20, screenY - 80, 96, 96);
        }

        // Fireplace: 64px tall. Draw at Y - 50 to sink 14px.
        if (this.hasFireplace && this.imgFire.complete) {
            ctx.drawImage(this.imgFire, screenX + (this.w/2) - 32, screenY - 50, 64, 64);
        }

        // Tree: 150px tall. Draw at Y - 135 to sink 15px.
        if (this.hasTree && this.imgTree.complete) {
            ctx.drawImage(this.imgTree, screenX + this.w - 100, screenY - 135, 120, 150);
        }
    }
}

// --- VILLAGERS & WARRIORS ---
export class Villager extends Entity {
    constructor(x, y, team) {
        const variant = Math.floor(Math.random() * 4) + 1;
        super(x, y, 24, 24, `assets/sprites/villager_${team}_${variant}.png`); 
        this.team = team;
        this.hp = 20;
        this.homeIsland = null;
        this.vx = 0;
        this.vy = 0; 
        this.stateTimer = 0;
    }

    update(dt, islands, worldWidth, worldHeight) {
        this.vy += 900 * dt; // Gravity
        
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
            this.stateTimer = Math.random() * 2 + 1;
            this.vx = (Math.random() - 0.5) * 80; 
        }
        
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        if (this.vy >= 0) {
            for (let island of islands) {
                if (this.x + this.w > island.x && this.x < island.x + island.w) {
                     if (this.y + this.h >= island.y && this.y + this.h <= island.y + 25) {
                         this.y = island.y - this.h;
                         this.vy = 0;
                     }
                }
            }
        }
        
        // Wrap
        if (this.y > worldHeight) this.y = -50; // Wrap bottom to top
        if (this.x > worldWidth) this.x = 0;
        if (this.x < 0) this.x = worldWidth;
    }
}

export class Warrior extends Villager {
    constructor(x, y, team) {
        super(x, y, team);
        this.w = 32; this.h = 32; 
        this.image.src = `assets/sprites/warrior_${team}.png`;
        this.hp = 50; 
        this.attackCooldown = 0;
    }

    update(dt, islands, enemies, spawnProjectileCallback, worldWidth, worldHeight) {
        this.vy += 900 * dt;

        let target = null;
        let nearestDist = 1000; 

        if (enemies.length > 0) {
            enemies.forEach(e => {
                const dx = e.x - this.x;
                const dy = e.y - this.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    target = e;
                }
            });
        }

        if (target) {
            if (nearestDist < 400) {
                this.vx = 0; 
                if (this.attackCooldown <= 0) {
                    this.attackCooldown = 1.5;
                    const dx = target.x - this.x;
                    const dy = (target.y - 20) - this.y; 
                    const angle = Math.atan2(dy, dx);
                    spawnProjectileCallback(this.x, this.y, angle, this.team);
                }
            } else {
                const dir = target.x > this.x ? 1 : -1;
                this.vx = dir * 90; 
            }
        } else {
            this.stateTimer -= dt;
            if (this.stateTimer <= 0) {
                this.stateTimer = Math.random() * 2 + 1;
                this.vx = (Math.random() - 0.5) * 60;
            }
        }

        this.attackCooldown -= dt;

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        if (this.vy >= 0) {
            for (let island of islands) {
                if (this.x + this.w > island.x && this.x < island.x + island.w) {
                     if (this.y + this.h >= island.y && this.y + this.h <= island.y + 25) {
                         this.y = island.y - this.h;
                         this.vy = 0;
                     }
                }
            }
        }

        if (this.y > worldHeight) this.y = -50;
        if (this.x > worldWidth) this.x = 0;
        if (this.x < 0) this.x = worldWidth;
    }
}

export class Projectile extends Entity {
    constructor(x, y, angle, team) {
        super(x, y, 32, 10, 'assets/sprites/projectile_arrow.png'); 
        this.team = team;
        const speed = 600; 
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.angle = angle; 
        this.life = 3.0;
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
