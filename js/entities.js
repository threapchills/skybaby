/* THE CAST OF CHARACTERS (Entities)
   Definitive V36.0: THE "TOTEM POLES" UPDATE 🪵
   - Fixed duplicate Projectile class definition.
   - Added Totem class for island conversion.
*/

// --- GLOBAL ASSET LOADER ---
export const Assets = {
    // Environment
    tilesetNormal: new Image(),
    tilesetWinter: new Image(),
    treeNormal: new Image(),
    treeWinter: new Image(),
    grass: new Image(),
    teepeeGreen: new Image(),
    teepeeBlue: new Image(),
    fire: new Image(),
    leaf: new Image(),

    // Characters
    playerGreen: new Image(),
    playerBlue: new Image(),
    pig: new Image(),
    villagerGreen: [],
    villagerBlue: [],
    warriorGreen: new Image(),
    warriorBlue: new Image(),
    projectile: new Image(),
    totem: new Image()
};

// --- SOURCE ASSIGNMENT ---
Assets.tilesetNormal.src = 'assets/environment/island_tileset.png';
Assets.tilesetWinter.src = 'assets/environment/island_tileset_winter.png';
Assets.treeNormal.src = 'assets/environment/tree_variant1.png';
Assets.treeWinter.src = 'assets/environment/tree_variant1_winter.png';
Assets.grass.src = 'assets/environment/grass.png';
Assets.teepeeGreen.src = 'assets/environment/teepee_green.png';
Assets.teepeeBlue.src = 'assets/environment/teepee_blue.png';
Assets.fire.src = 'assets/environment/fireplace_lit.png';
Assets.leaf.src = 'assets/environment/leaf.png';
Assets.totem.src = 'assets/environment/totem.png';

Assets.playerGreen.src = 'assets/sprites/player_green.png';
Assets.playerBlue.src = 'assets/sprites/player_blue.png';
Assets.pig.src = 'assets/sprites/pig.png';
Assets.warriorGreen.src = 'assets/sprites/warrior_green.png';
Assets.warriorBlue.src = 'assets/sprites/warrior_blue.png';
Assets.projectile.src = 'assets/sprites/projectile_arrow.png';

for (let i = 1; i <= 4; i++) {
    let vGreen = new Image(); vGreen.src = `assets/sprites/villager_green_${i}.png`;
    Assets.villagerGreen.push(vGreen);

    let vBlue = new Image(); vBlue.src = `assets/sprites/villager_blue_${i}.png`;
    Assets.villagerBlue.push(vBlue);
}

// --- BASE CLASS ---
export class Entity {
    constructor(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.dead = false;
    }

    drawSprite(ctx, img, screenX, screenY, width, height) {
        if (img && img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, screenX, screenY, width, height);
        }
    }
}

// --- NEW ELEMENTAL ENTITIES ---

export class StoneWall extends Entity {
    constructor(x, y) {
        super(x, y, 40, 120);
        this.hp = 250;
        this.maxHp = 250;
        this.vx = 0;
        this.vy = 0;
        this.onGround = false;
        // Wall is neutral physics object really, but let's say it blocks everyone
    }

    update(dt, islands, worldHeight) {
        this.vy += 1000 * dt;
        this.y += this.vy * dt;

        this.onGround = false;
        if (this.vy >= 0) {
            for (let island of islands) {
                if (this.x + this.w > island.x && this.x < island.x + island.w) {
                    const threshold = 10 + (this.vy * dt * 2);
                    if (this.y + this.h >= island.y && this.y + this.h <= island.y + threshold) {
                        this.y = island.y - this.h;
                        this.vy = 0;
                        this.onGround = true;
                        this.x += island.vx * dt;
                        this.y += island.vy * dt;
                    }
                }
            }
        }

        if (this.y > worldHeight) this.dead = true;
        if (this.hp <= 0) this.dead = true;
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;
        const screenX = Math.floor(rect.x);
        const screenY = Math.floor(rect.y);

        ctx.fillStyle = '#696969';
        ctx.fillRect(screenX, screenY, this.w, this.h);

        ctx.strokeStyle = '#2f2f2f';
        ctx.lineWidth = 3;
        ctx.strokeRect(screenX, screenY, this.w, this.h);

        const damage = 1.0 - (this.hp / this.maxHp);
        if (damage > 0.2) {
            ctx.beginPath();
            ctx.moveTo(screenX + 5, screenY + 10);
            ctx.lineTo(screenX + 20, screenY + 40);
            ctx.stroke();
        }
        if (damage > 0.5) {
            ctx.beginPath();
            ctx.moveTo(screenX + 35, screenY + 80);
            ctx.lineTo(screenX + 10, screenY + 100);
            ctx.stroke();
        }
    }
}

export class Fireball extends Entity {
    constructor(x, y, angle, team) {
        super(x, y, 60, 60);
        this.team = team; // 'green' or 'blue'
        const speed = 400;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.angle = angle;
        this.life = 4.0;
        this.particles = [];
        this.damage = 100;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        if (this.life <= 0) this.dead = true;

        for (let i = 0; i < 3; i++) {
            this.particles.push({
                x: this.x + Math.random() * 40 - 20,
                y: this.y + Math.random() * 40 - 20,
                vx: (Math.random() - 0.5) * 50,
                vy: (Math.random() - 0.5) * 50,
                life: 0.3 + Math.random() * 0.4,
                size: 10 + Math.random() * 20,
                color: this.team === 'green' ? '#FF4500' : '#8A2BE2' // Orange for player, Purple for enemy
            });
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            let p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen && !this.particles.length) return; // Keep drawing if particles exist? 
        // Actually for fireball, main body is most important.

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // Calculate shift for particles
        const shiftX = rect.x - this.x;
        const shiftY = rect.y - this.y;

        this.particles.forEach(p => {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life;
            ctx.beginPath();
            // Wrap particles relative to fireball's wrapped position
            ctx.arc(p.x + shiftX, p.y + shiftY, p.size, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }
}

export class RainCloud extends Entity {
    constructor(x, y, team) {
        super(x, y, 100, 50);
        this.team = team;
        this.life = 2.0;
        this.drops = [];
    }

    update(dt) {
        this.life -= dt;
        if (this.life <= 0) this.dead = true;

        for (let i = 0; i < 5; i++) {
            this.drops.push({
                x: this.x + (Math.random() - 0.5) * 150,
                y: this.y + (Math.random() * 20),
                vy: 300 + Math.random() * 200,
                life: 0.8
            });
        }

        for (let i = this.drops.length - 1; i >= 0; i--) {
            let d = this.drops[i];
            d.y += d.vy * dt;
            d.life -= dt;
            if (d.life <= 0) this.drops.splice(i, 1);
        }
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;
        const screenX = rect.x;
        const screenY = rect.y;

        ctx.fillStyle = this.team === 'green' ? 'rgba(200, 200, 255, 0.4)' : 'rgba(100, 0, 100, 0.4)';
        ctx.beginPath();
        ctx.arc(screenX, screenY, 40, 0, Math.PI * 2);
        ctx.arc(screenX + 30, screenY - 10, 50, 0, Math.PI * 2);
        ctx.arc(screenX - 30, screenY - 10, 50, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#87CEEB';
        ctx.lineWidth = 2;
        ctx.beginPath();

        const shiftX = screenX - this.x;
        const shiftY = screenY - this.y;

        this.drops.forEach(d => {
            const dx = d.x + shiftX;
            const dy = d.y + shiftY;
            ctx.moveTo(dx, dy);
            ctx.lineTo(dx, dy + 10);
        });
        ctx.stroke();
    }
}

export class VisualEffect extends Entity {
    constructor(x, y, type) {
        super(x, y, 0, 0);
        this.type = type; // 'lightning', 'impact'
        this.life = (type === 'impact') ? 0.2 : 0.5;
        this.flashing = true;
    }

    update(dt) {
        this.life -= dt;
        if (this.life <= 0) this.dead = true;
    }

    draw(ctx, camera) {
        if (this.type === 'lightning') {
            const rect = camera.getScreenRect(this.x, this.y, 0, 0);
            if (!rect.onScreen) return;

            const startX = rect.x;
            const startY = 0;
            const endY = camera.h;

            ctx.save();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 3;
            ctx.shadowBlur = 20;
            ctx.shadowColor = 'cyan';

            ctx.beginPath();
            ctx.moveTo(startX, startY);
            let cx = startX;
            for (let cy = 0; cy < endY; cy += 20) {
                cx += (Math.random() - 0.5) * 60;
                ctx.lineTo(cx, cy);
            }
            ctx.stroke();
            ctx.restore();

            if (Math.random() > 0.5) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                ctx.fillRect(0, 0, camera.w, camera.h);
            }
        }
    }
}

// --- STANDARD ENTITIES ---

export class Leaf extends Entity {
    constructor(x, y, layer = 'fg') {
        super(x, y, 32, 32);
        this.layer = layer; // 'fg' or 'bg'
        this.life = 5.0 + Math.random() * 5.0;

        if (this.layer === 'fg') {
            this.scale = 1.0 + Math.random() * 0.5; // Larger
            this.vx = 200 + Math.random() * 300; // Faster
            this.vy = 50 + Math.random() * 100;
            this.rotationSpeed = (Math.random() - 0.5) * 6.0;
        } else {
            this.scale = 0.4 + Math.random() * 0.4; // Smaller
            this.vx = 50 + Math.random() * 100; // Slower
            this.vy = 10 + Math.random() * 30;
            this.rotationSpeed = (Math.random() - 0.5) * 2.0;
        }

        this.angle = Math.random() * Math.PI * 2;

        // Random Hue for variety (Greenish/Yellowish/Reddish)
        // Base is red? If base is red, hue-rotate can shift to orange/yellow.
        // Assuming base asset is Red/Autumn:
        // - Rotate -30 to +30 for Red-Orange-Yellowish
        this.hueRotate = (Math.random() - 0.5) * 60;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.angle += this.rotationSpeed * dt;
        this.life -= dt;
        if (this.life <= 0) this.dead = true;
    }

    draw(ctx, camera) {
        // Optimization: Don't draw if off-screen (already checked by some callers but good to have)
        const rect = camera.getScreenRect(this.x, this.y, 32 * this.scale, 32 * this.scale);
        if (!rect.onScreen) return;

        const screenX = rect.x;
        const screenY = rect.y;

        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(this.angle);
        ctx.scale(this.scale, this.scale);
        ctx.filter = `hue-rotate(${this.hueRotate}deg)`; // Apply Hue Shift
        this.drawSprite(ctx, Assets.leaf, -16, -16, 32, 32);
        ctx.restore();
    }
}

export class Snowflake {
    constructor(x, y, layer = 'fg') {
        this.x = x;
        this.y = y;
        this.layer = layer;
        this.life = 8.0;
        this.dead = false;
        this.sway = Math.random() * Math.PI;

        if (this.layer === 'fg') {
            this.size = 6 + Math.random() * 6; // Big blobs
            this.vx = -100 + Math.random() * 200; // More wind variation
            this.vy = 200 + Math.random() * 200; // Faster
            this.swaySpeed = 3.0 + Math.random() * 4.0;
        } else {
            this.size = 2 + Math.random() * 3; // Small dots
            this.vx = -20 + Math.random() * 40;
            this.vy = 80 + Math.random() * 50; // Slower
            this.swaySpeed = 1.0 + Math.random() * 2.0;
        }
    }

    update(dt) {
        this.sway += dt * this.swaySpeed;
        this.x += (this.vx + Math.sin(this.sway) * (this.layer === 'fg' ? 80 : 20)) * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        if (this.life <= 0) this.dead = true;
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.size, this.size);
        if (!rect.onScreen) return;

        const screenX = rect.x;
        const screenY = rect.y;

        ctx.fillStyle = 'white';
        // Removed globalAlpha 0.8 to remove "blur" perception, distinct blobs requested
        // But maybe slight transparency is okay? User said "white blob".
        ctx.beginPath();
        ctx.arc(screenX, screenY, this.size / 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

export class Particle extends Entity {
    constructor(x, y, color, speed, life, size = 5, type = 'normal') {
        let finalSize = size * 1.5;
        let w = finalSize;
        let h = finalSize;
        if (type === 'wind') { w = 60 + Math.random() * 60; h = 2; }

        super(x, y, w, h);

        this.color = color;
        this.type = type;
        this.maxLife = life;
        this.life = life;

        if (this.type === 'wind') {
            this.vx = speed;
            this.vy = (Math.random() - 0.5) * 20;
        } else if (this.type === 'trail') {
            this.vx = (Math.random() - 0.5) * 10;
            this.vy = (Math.random() - 0.5) * 10;
            this.w = 6; this.h = 6;
        } else {
            const angle = Math.random() * Math.PI * 2;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed - 50;
        }
    }

    update(dt) {
        if (this.type === 'normal') {
            this.vy += 500 * dt;
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        if (this.life <= 0) this.dead = true;
    }

    draw(ctx, camera) {
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        if (screenX < -100 || screenX > camera.w + 100) return;

        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
        ctx.fillStyle = this.color;
        ctx.fillRect(screenX, screenY, this.w, this.h);
        ctx.globalAlpha = 1.0;
        ctx.restore();
    }
}

export class Pig extends Entity {
    constructor(x, y) {
        super(x, y, 32, 24);
        this.hp = 10;
        this.vx = 0;
        this.vy = 0;
        this.stateTimer = 0;
        this.onGround = false;
        this.maxFallSpeed = 800;
        this.homeIsland = null;
    }

    update(dt, islands, worldWidth, worldHeight) {
        this.vy += 800 * dt;
        if (this.vy > this.maxFallSpeed) this.vy = this.maxFallSpeed;

        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
            this.stateTimer = Math.random() * 3 + 2;
            this.vx = (Math.random() - 0.5) * 40;
        }

        if (this.onGround && this.homeIsland) {
            if (this.x < this.homeIsland.x) this.vx = Math.abs(this.vx);
            if (this.x > this.homeIsland.x + this.homeIsland.w) this.vx = -Math.abs(this.vx);
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        this.onGround = false;
        if (this.vy >= 0) {
            for (let island of islands) {
                if (this.x < island.x + island.w && this.x + this.w > island.x) {
                    const collisionThreshold = island.y + 30 + (this.vy * dt);
                    if (this.y + this.h >= island.y && this.y + this.h <= collisionThreshold) {
                        this.y = island.y - this.h;
                        this.vy = 0;
                        this.onGround = true;
                        this.homeIsland = island;
                    }
                }
            }
        }

        if (this.y > worldHeight) this.y = -50;
        if (this.x > worldWidth) this.x = 0;
        if (this.x < 0) this.x = worldWidth;
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;

        const screenX = Math.floor(rect.x);
        const screenY = Math.floor(rect.y);
        this.drawSprite(ctx, Assets.pig, screenX, screenY, this.w, this.h);
    }
}

export class Player extends Entity {
    constructor(x, y, team) {
        super(x, y, 40, 40);
        this.team = team;
        this.vx = 0;
        this.vy = 0;
        this.hp = 100;
        this.maxHp = 100;

        this.speed = 450;
        this.acceleration = 3000;
        this.friction = 0.85;
        this.gravity = 800;
        this.maxFallSpeed = 1000;
        this.jumpForce = -600;
        this.flyForce = -500;

        this.isGrounded = false;
        this.hpRegenTimer = 0;
        this.fireCooldown = 0;
        this.visitedIslands = new Set();

        this.aiTargetIsland = null;
        this.aiStateTimer = 0;
        this.aiJump = false;

        // AI Spell Stats
        this.aiSpellCooldown = 5.0;
    }

    update(dt, input, resources, worldWidth, worldHeight, islands, audio, enemy, walls) {
        if (this.dead) return;
        if (dt <= 0) return;

        if (this.hp < this.maxHp) {
            this.hpRegenTimer += dt;
            if (this.hpRegenTimer > 2.0) {
                this.hp++;
                this.hpRegenTimer = 0;
            }
        }

        if (this.team === 'blue' && enemy) {
            // Standard Arrow Shooting (Legacy)
            this.fireCooldown -= dt;
            const dx = enemy.x - this.x;
            const dy = enemy.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 600 && this.fireCooldown <= 0) {
                this.fireCooldown = 0.8;
                const angle = Math.atan2(dy, dx);
                this.shootRequest = { x: this.x, y: this.y, angle: angle };
            }
        }

        let moving = false;
        let wantJump = false;

        if (this.team === 'green') {
            if (input && input.keys) {
                if (input.keys.a) { this.vx -= this.acceleration * dt; moving = true; }
                if (input.keys.d) { this.vx += this.acceleration * dt; moving = true; }
                if (input.keys.space) wantJump = true;
            }
        } else {
            moving = true;
            if (!this.aiTargetIsland || this.aiTargetIsland.team === 'blue' || this.aiStateTimer <= 0) {
                this.aiStateTimer = 5.0 + Math.random() * 5.0;
                const targets = islands.filter(i => i.team !== 'blue');
                if (targets.length > 0) {
                    this.aiTargetIsland = targets[Math.floor(Math.random() * targets.length)];
                } else {
                    this.aiTargetIsland = islands[Math.floor(Math.random() * islands.length)];
                }
            }
            this.aiStateTimer -= dt;

            if (this.aiTargetIsland) {
                const targetX = this.aiTargetIsland.x + (this.aiTargetIsland.w / 2);
                if (this.x < targetX - 50) {
                    this.vx += this.acceleration * dt;
                } else if (this.x > targetX + 50) {
                    this.vx -= this.acceleration * dt;
                } else {
                    if (Math.random() < 0.05) this.vx *= -1;
                }

                if (this.isGrounded) {
                    if (Math.abs(this.vx) < 50 || Math.random() < 0.015) {
                        wantJump = true;
                    }
                }
            }
        }

        if (!moving) {
            this.vx *= this.friction;
            if (Math.abs(this.vx) < 10) this.vx = 0;
        }

        if (this.vx > this.speed) this.vx = this.speed;
        if (this.vx < -this.speed) this.vx = -this.speed;

        // --- WALL COLLISION (X-AXIS) ---
        if (walls) {
            for (let wall of walls) {
                if (!wall.dead &&
                    this.x + this.vx * dt < wall.x + wall.w &&
                    this.x + this.w + this.vx * dt > wall.x &&
                    this.y < wall.y + wall.h &&
                    this.y + this.h > wall.y) {
                    this.vx = 0;
                }
            }
        }

        this.x += this.vx * dt;
        this.vy += this.gravity * dt;
        if (this.vy > this.maxFallSpeed) this.vy = this.maxFallSpeed;

        if (wantJump) {
            if (this.isGrounded) {
                this.vy = this.jumpForce;
                this.isGrounded = false;
                if (audio) audio.play('jump', 0.4, 0.1);
            } else if (this.team === 'green') {
                // RESTORED UNRESTRICTED FLIGHT
                // Flying is now free and unrestricted as per user request
                this.vy -= 1500 * dt;
                if (this.vy < this.flyForce) this.vy = this.flyForce;
                // Visual effect for flying? (Optional, maybe particles later)
            } else if (this.team === 'blue') {
                this.vy -= 100 * dt;
            }
        }
        this.y += this.vy * dt;

        this.isGrounded = false;

        if (this.vy >= 0) {
            for (let island of islands) {
                if (this.x < island.x + island.w && this.x + this.w > island.x) {
                    const collisionThreshold = island.y + 30 + (this.vy * dt);
                    if (this.y + this.h >= island.y && this.y + this.h <= collisionThreshold) {
                        this.y = island.y - this.h + 1;
                        this.vy = 0;
                        this.isGrounded = true;

                        // Sticky Island friction (moving platforms)
                        this.x += island.vx * dt;

                        if (this.team === 'green' && resources) {
                            if (!this.visitedIslands.has(island)) {
                                this.visitedIslands.add(island);
                                // resources.addEarth(20); // REMOVED
                            }
                            if (Math.abs(this.vx) > 10) {
                                // resources.addPassiveEarth(10 * dt); // REMOVED
                            }
                        }
                    }
                }
            }
        }

        if (this.y > worldHeight + 100) this.y = -100;
        if (this.y < -200) this.y = worldHeight;
        if (this.x > worldWidth) this.x = 0;
        if (this.x < -this.w) this.x = worldWidth;

        return (Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1);
    }

    draw(ctx, camera) {
        if (this.dead) return;

        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;

        const screenX = Math.floor(rect.x);
        const screenY = Math.floor(rect.y);

        if (this.team === 'green') {
            ctx.fillStyle = '#00ff00';
            ctx.beginPath();
            ctx.moveTo(screenX + this.w / 2, screenY - 25);
            ctx.lineTo(screenX + this.w / 2 - 10, screenY - 35);
            ctx.lineTo(screenX + this.w / 2 + 10, screenY - 35);
            ctx.fill();
        }

        const img = (this.team === 'green') ? Assets.playerGreen : Assets.playerBlue;
        this.drawSprite(ctx, img, screenX - 4, screenY - 4, 48, 48);

        ctx.fillStyle = 'red';
        ctx.fillRect(screenX, screenY - 10, this.w, 4);
        ctx.fillStyle = '#0f0';
        ctx.fillRect(screenX, screenY - 10, this.w * (this.hp / this.maxHp), 4);
    }
}

export class Island extends Entity {
    constructor(x, y, w, h, team) {
        super(x, y, w, h);
        this.team = team;

        this.activeTileset = Assets.tilesetNormal;
        this.activeTree = Assets.treeNormal;

        this.hasTeepee = true;
        this.hasFireplace = Math.random() > 0.4;
        this.conversionTimer = 0;

        this.trees = [];
        const numTrees = 1 + Math.floor(Math.random() * (w / 70));
        for (let i = 0; i < numTrees; i++) {
            this.trees.push({
                x: Math.random() * (w - 100),
                scale: 0.8 + Math.random() * 1.7,
                hueRotate: Math.floor(Math.random() * 40) - 20,
                burnt: false, // Visual state
                burntTimer: 0 // New: Heal timer
            });
        }

        this.grass = [];
        const numGrass = 2 + Math.floor(Math.random() * (w / 40));
        for (let i = 0; i < numGrass; i++) {
            this.grass.push({
                x: Math.random() * (w - 30),
                scale: 0.8 + Math.random() * 0.6,
                hueRotate: Math.floor(Math.random() * 60) - 30
            });
        }

        this.vx = 0;
        this.vy = 0;
        this.friction = 0.90;

        this.mass = w * h; // For collision Physics
    }

    setSeason(isWinter) {
        if (isWinter) {
            this.activeTileset = Assets.tilesetWinter;
            this.activeTree = Assets.treeWinter;
        } else {
            this.activeTileset = Assets.tilesetNormal;
            this.activeTree = Assets.treeNormal;
        }
    }

    update(dt, player, enemyChief, audio) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx *= this.friction;
        this.vy *= this.friction;

        // HEAL BURNT TREES
        this.trees.forEach(tree => {
            if (tree.burnt) {
                tree.burntTimer -= dt;
                if (tree.burntTimer <= 0) {
                    tree.burnt = false;
                }
            }
        });

        if (this.conversionTimer > 0) {
            this.conversionTimer -= dt;
            return;
        }

        if (this.hasTeepee) {
            const range = 150;

            if (player && !player.dead) {
                const tentX = this.x + 20 + 48;
                const tentY = this.y - 20;
                const dx = (player.x + player.w / 2) - tentX;
                const dy = (player.y + player.h / 2) - tentY;
                if (Math.sqrt(dx * dx + dy * dy) < range) {
                    if (this.team !== 'green') {
                        this.team = 'green';
                        this.conversionTimer = 2.0;
                        if (audio) audio.play('teepee', 0.6, 0.1);
                    }
                }
            }

            if (enemyChief && !enemyChief.dead) {
                const tentX = this.x + 20 + 48;
                const tentY = this.y - 20;
                const dx = (enemyChief.x + enemyChief.w / 2) - tentX;
                const dy = (enemyChief.y + enemyChief.h / 2) - tentY;
                if (Math.sqrt(dx * dx + dy * dy) < range) {
                    if (this.team !== 'blue') {
                        this.team = 'blue';
                        this.conversionTimer = 2.0;
                        if (audio) audio.play('teepee', 0.6, 0.1);
                    }
                }
            }
        }
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;

        const screenX = Math.floor(rect.x);
        const screenY = Math.floor(rect.y);

        // 1. Tileset (Bottom)
        if (this.activeTileset.complete && this.activeTileset.naturalWidth > 0) {
            const sliceW = Math.floor(this.activeTileset.width / 3);
            const sliceH = this.activeTileset.height;

            // SCALE HEIGHT to this.h
            const drawH = this.h;

            ctx.drawImage(this.activeTileset, 0, 0, sliceW, sliceH, screenX, screenY, sliceW, drawH);
            const rightX = screenX + this.w - sliceW;
            const middleWidth = rightX - (screenX + sliceW);
            if (middleWidth > 0) {
                ctx.drawImage(this.activeTileset, sliceW, 0, sliceW, sliceH, screenX + sliceW, screenY, middleWidth + 2, drawH);
            }
            ctx.drawImage(this.activeTileset, sliceW * 2, 0, sliceW, sliceH, rightX, screenY, sliceW, drawH);
        } else {
            ctx.fillStyle = this.team === 'green' ? '#2E8B57' : '#4682B4';
            ctx.fillRect(screenX, screenY, this.w, this.h);
        }

        // 2. Grass
        if (Assets.grass.complete) {
            this.grass.forEach(g => {
                ctx.save();
                ctx.filter = `hue-rotate(${g.hueRotate}deg)`;
                const grassW = 32 * g.scale;
                const grassH = 32 * g.scale;
                const grassY = screenY - (25 * g.scale);
                ctx.drawImage(Assets.grass, screenX + g.x, grassY, grassW, grassH);
                ctx.restore();
            });
        }

        // 3. Trees (BEHIND Tent)
        if (this.activeTree.complete) {
            this.trees.forEach(tree => {
                ctx.save();

                // Burnt Effect
                if (tree.burnt) {
                    ctx.filter = `sepia(100%) brightness(50%)`;
                } else {
                    ctx.filter = `hue-rotate(${tree.hueRotate}deg)`;
                }

                const treeW = 120 * tree.scale;
                const treeH = 150 * tree.scale;
                const treeY = screenY - (110 * tree.scale);
                ctx.drawImage(this.activeTree, screenX + tree.x, treeY, treeW, treeH);
                ctx.restore();
            });
        }

        // 4. Teepee (FRONT)
        const teepeeImg = (this.team === 'green') ? Assets.teepeeGreen : Assets.teepeeBlue;
        this.drawSprite(ctx, teepeeImg, screenX + 20, screenY - 66, 96, 96);

        // 5. Fire
        if (this.hasFireplace) {
            this.drawSprite(ctx, Assets.fire, screenX + (this.w / 2) - 40, screenY - 54, 80, 80);
        }
    }
}

export class Villager extends Entity {
    constructor(x, y, team) {
        super(x, y, 24, 24);
        this.team = team;
        this.hp = 10;
        this.homeIsland = null;
        this.vx = 0;
        this.vy = 0;
        this.stateTimer = 0;
        this.onGround = false;
        this.maxFallSpeed = 800;

        this.variantIndex = Math.floor(Math.random() * 4);
        this.attractorX = null; // New: Milling about target
    }

    update(dt, islands, worldWidth, worldHeight, pigs, walls, warState = 'BUILD') {
        this.vy += 500 * dt;
        if (this.vy > this.maxFallSpeed) this.vy = this.maxFallSpeed;

        // --- NEW MILLING BEHAVIOR ---
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
            this.stateTimer = Math.random() * 3 + 2;

            let interestX = null;

            if (this.homeIsland) {
                // REPAIR MODE during ATTACK
                if (warState === 'ATTACK' && this.homeIsland.hasTeepee && Math.random() < 0.7) {
                    interestX = this.homeIsland.x + 80; // Stand by tent
                }
                else if (Math.random() < 0.5 && pigs) {
                    const localPigs = pigs.filter(p => p.homeIsland === this.homeIsland);
                    if (localPigs.length > 0) {
                        const targetPig = localPigs[Math.floor(Math.random() * localPigs.length)];
                        interestX = targetPig.x;
                    }
                }

                if (interestX === null && this.homeIsland.hasTeepee && this.homeIsland.team === this.team) {
                    interestX = this.homeIsland.x + 80;
                }

                if (interestX === null) {
                    interestX = this.homeIsland.x + Math.random() * this.homeIsland.w;
                }
            }

            this.attractorX = interestX;

            if (this.attractorX !== null) {
                if (Math.abs(this.x - this.attractorX) > 40) {
                    this.vx = (this.attractorX > this.x) ? 60 : -60;
                } else {
                    this.vx = (Math.random() - 0.5) * 40;
                }
            } else {
                this.vx = (Math.random() - 0.5) * 60;
            }
        }

        // --- WALL COLLISION (X-AXIS) ---
        if (walls) {
            for (let wall of walls) {
                if (!wall.dead &&
                    this.x + this.vx * dt < wall.x + wall.w &&
                    this.x + this.w + this.vx * dt > wall.x &&
                    this.y < wall.y + wall.h &&
                    this.y + this.h > wall.y) {
                    this.vx *= -1; // Bounce
                }
            }
        }

        if (Math.abs(this.vx) > 10 && this.onGround && this.stateTimer < 1.0) {
            if (Math.random() < 0.01) {
                this.vy = -300;
                this.onGround = false;
            }
        }

        if (this.onGround && this.homeIsland) {
            // Apply Island Velocity (Sticky)
            this.x += this.homeIsland.vx * dt;

            const lookAhead = this.vx > 0 ? 10 : -10;
            const nextX = this.x + this.w / 2 + lookAhead;
            if (nextX < this.homeIsland.x || nextX > this.homeIsland.x + this.homeIsland.w) {
                this.vx *= -1;
            }
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        this.onGround = false;
        if (this.vy >= 0) {
            for (let island of islands) {
                if (this.x + this.w > island.x && this.x < island.x + island.w) {
                    const threshold = 10 + (this.vy * dt * 2);
                    if (this.y + this.h >= island.y - 5 && this.y + this.h <= island.y + threshold) {
                        this.y = island.y - this.h;
                        this.vy = 0;
                        this.onGround = true;
                        this.homeIsland = island;
                    }
                }
            }
        }

        // DEATH BOUNDARY (Prevents infinite falling loops)
        if (this.y > worldHeight) this.dead = true;
        if (this.x > worldWidth) this.x = 0;
        if (this.x < 0) this.x = worldWidth;
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;
        const screenX = Math.floor(rect.x);
        const screenY = Math.floor(rect.y);

        const variants = (this.team === 'green') ? Assets.villagerGreen : Assets.villagerBlue;
        const img = variants[this.variantIndex];
        this.drawSprite(ctx, img, screenX, screenY, this.w, this.h);
    }
}

export class Warrior extends Villager {
    constructor(x, y, team) {
        super(x, y, team);
        this.w = 32; this.h = 32;
        this.hp = 10;
        this.attackCooldown = 0;
        this.role = Math.random() < 0.5 ? 'bodyguard' : 'raider';
        this.maxFallSpeed = 1000;
        this.patrolTargetX = null;
        this.patrolTimer = 0;
        this.roleTimer = 0;
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;
        const screenX = Math.floor(rect.x);
        const screenY = Math.floor(rect.y);

        const img = (this.team === 'green') ? Assets.warriorGreen : Assets.warriorBlue;
        this.drawSprite(ctx, img, screenX, screenY, this.w, this.h);
    }

    update(dt, islands, enemies, spawnProjectileCallback, worldWidth, worldHeight, audio, friendlyLeader, allVillagers, walls, warState = 'BUILD') {
        this.vy += 500 * dt;
        if (this.vy > this.maxFallSpeed) this.vy = this.maxFallSpeed;

        this.attackCooldown -= dt;

        // --- SEPARATION (Keep apart) ---
        if (allVillagers) {
            allVillagers.forEach(v => {
                if (v !== this && !v.dead) {
                    const dx = this.x - v.x;
                    const dy = this.y - v.y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq < 400) {
                        const dist = Math.sqrt(distSq);
                        if (dist < 1) return;
                        const pushForce = (20 - dist) * 10;
                        const nx = dx / dist;
                        this.vx += nx * pushForce * 5;
                        this.x += nx * 2;
                    }
                }
            });
        }

        // --- WAR STATE LOGIC ---
        let moveTargetX = null;
        let moveTargetY = null;
        let targetEnemy = null;
        let forcedAggro = false;

        // 1. GATHER: Rally to Chief
        if (warState === 'GATHER') {
            if (friendlyLeader && !friendlyLeader.dead) {
                moveTargetX = friendlyLeader.x + (Math.random() * 200 - 100);
                moveTargetY = friendlyLeader.y;
            }
        }
        // 2. ATTACK: Charge Enemy Chief
        else if (warState === 'ATTACK') {
            const enemyChief = enemies.find(e => e instanceof Player && e.team !== this.team);
            if (enemyChief && !enemyChief.dead) {
                moveTargetX = enemyChief.x;
                moveTargetY = enemyChief.y;
                forcedAggro = true;
            }
        }

        // --- TARGETING ---
        let bestScore = -Infinity;
        const detectionRange = forcedAggro ? 800 : ((enemies.length < 5) ? 10000 : 600);

        enemies.forEach(e => {
            const dx = e.x - this.x;
            const dy = e.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < detectionRange) {
                let score = 10000 - dist;
                if (e instanceof Warrior) score += 500;
                else if (e instanceof Player) score += 1000;
                if (score > bestScore) {
                    bestScore = score;
                    targetEnemy = e;
                }
            }
        });

        // ATTACK LOGIC
        if (targetEnemy && (forcedAggro || enemies.length < 5 || Math.abs(targetEnemy.x - this.x) < 600)) {
            if (Math.abs(targetEnemy.x - this.x) < 400) {
                this.vx *= 0.8;
            }

            if (this.attackCooldown <= 0) {
                this.attackCooldown = 1.5 + Math.random();
                const dx = targetEnemy.x - this.x;
                const dy = (targetEnemy.y - 20) - this.y;
                let angle = Math.atan2(dy, dx);
                const variance = (Math.random() - 0.5) * 0.25;
                angle += variance;
                spawnProjectileCallback(this.x, this.y, angle, this.team, 10);
            }

            if (warState !== 'BUILD') {
                // Keep moving towards global objective (moveTargetX)
            } else {
                const dir = Math.sign(targetEnemy.x - this.x);
                this.vx += dir * 50;
            }

        }

        // MOVEMENT LOGIC (If not attacking/gathering heavily)
        if (warState === 'BUILD' && moveTargetX === null) {
            this.roleTimer -= dt;
            if (this.roleTimer <= 0) {
                this.roleTimer = 10 + Math.random() * 10;
                if (this.role === 'bodyguard' && Math.random() < 0.2) this.role = 'raider';
            }

            if (this.role === 'bodyguard' && friendlyLeader && !friendlyLeader.dead) {
                moveTargetX = friendlyLeader.x + (Math.random() - 0.5) * 150;
                moveTargetY = friendlyLeader.y;
            } else {
                this.patrolTimer -= dt;
                if (this.patrolTimer <= 0 || this.patrolTargetX === null || Math.abs(this.x - this.patrolTargetX) < 100) {
                    this.patrolTimer = 8 + Math.random() * 12;
                    if (islands.length > 0) {
                        const randomIsland = islands[Math.floor(Math.random() * islands.length)];
                        this.patrolTargetX = randomIsland.x + (randomIsland.w / 2);
                        this.patrolTargetY = randomIsland.y - 50;
                    } else {
                        this.patrolTargetX = Math.random() * worldWidth;
                        this.patrolTargetY = this.y;
                    }
                }
                moveTargetX = this.patrolTargetX;
                moveTargetY = this.patrolTargetY;
            }
        }
    }
}

export class Projectile extends Entity {
    constructor(x, y, angle, team, damage) {
        super(x, y, 32, 10);
        this.team = team;
        this.damage = damage;
        const speed = 600;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.angle = angle;
        this.life = 3.0;
        this.trailTimer = 0;
    }

    update(dt, spawnParticleCallback, walls) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        if (this.life <= 0) this.dead = true;

        // Wall Collision
        if (walls) {
            for (let wall of walls) {
                if (!wall.dead &&
                    this.x < wall.x + wall.w &&
                    this.x + this.w > wall.x &&
                    this.y < wall.y + wall.h &&
                    this.y + this.h > wall.y) {
                    this.dead = true;
                    wall.hp -= 20; // Projectiles hurt walls
                    spawnParticleCallback(this.x, this.y, 'gray');
                }
            }
        }

        this.trailTimer -= dt;
        if (this.trailTimer <= 0 && spawnParticleCallback) {
            this.trailTimer = 0.05;
            spawnParticleCallback(this.x, this.y, this.team === 'green' ? 'lightgreen' : 'lightblue');
        }
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;
        const screenX = rect.x;
        const screenY = rect.y;

        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(this.angle);
        this.drawSprite(ctx, Assets.projectile, 0, 0, this.w, this.h);
        ctx.restore();
    }
}




export class Totem {
    constructor(x, y, team) {
        this.x = x;
        this.y = y;
        this.team = team;
        this.w = 40;
        this.h = 80;
        this.range = 300;
        this.conversionRate = 5.0; // Seconds to convert
        this.active = true;
        this.hue = (team === 'green') ? 45 : 225; // Yellowish / Bluish
    }

    update(dt, villagers) {
        if (!this.active) return;

        // Find enemy units in range
        villagers.forEach(v => {
            if (v.team !== this.team && !v.dead) {
                const dist = Math.sqrt((v.x - this.x) ** 2 + (v.y - this.y) ** 2);
                if (dist < this.range) {
                    // CONVERSION LOGIC
                    if (!v.conversionTimer) v.conversionTimer = 0;
                    v.conversionTimer += dt;

                    // Visual feedback for conversion
                    if (Math.random() < 0.1) {
                        v.isBeingConverted = true;
                    }

                    if (v.conversionTimer > this.conversionRate) {
                        v.team = this.team;
                        v.conversionTimer = 0;
                        v.isBeingConverted = false;
                        // Todo: trigger conversion effect
                    }
                } else {
                    v.conversionTimer = 0;
                    v.isBeingConverted = false;
                }
            }
        });
    }

    draw(ctx) {
        if (!this.active) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.filter = `hue-rotate(${this.hue}deg)`;

        if (Assets.totem) {
            ctx.drawImage(Assets.totem, -20, -80, 40, 80);
        } else {
            // Fallback
            ctx.fillStyle = (this.team === 'green') ? '#AAFF00' : '#00AAFF';
            ctx.fillRect(-10, -80, 20, 80);
        }

        ctx.restore();
    }
}
