/* THE CAST OF CHARACTERS (Entities)
   Definitive V33: THE BALANCING ACT UPDATE ⚖️
   - FIXED: Villagers and Warriors now have 10 HP (One-shot kill range).
   - FIXED: Projectiles now carry specific damage values.
   - FIXED: Warrior arrows deal 10 dmg, Shaman arrows deal 25 dmg.
*/

// --- GLOBAL ASSET LOADER ---
// We load these ONCE. All entities share them.
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
    projectile: new Image()
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

Assets.playerGreen.src = 'assets/sprites/player_green.png';
Assets.playerBlue.src = 'assets/sprites/player_blue.png';
Assets.pig.src = 'assets/sprites/pig.png';
Assets.warriorGreen.src = 'assets/sprites/warrior_green.png';
Assets.warriorBlue.src = 'assets/sprites/warrior_blue.png';
Assets.projectile.src = 'assets/sprites/projectile_arrow.png';

// Load Villager Variants (1-4)
for(let i=1; i<=4; i++) {
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

    // Helper to safely draw an image if it's loaded
    drawSprite(ctx, img, screenX, screenY, width, height) {
        if (img && img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, screenX, screenY, width, height);
        }
    }
}

// --- PARTICLES & EFFECTS ---

export class Leaf extends Entity {
    constructor(x, y) {
        super(x, y, 32, 32); 
        this.life = 5.0 + Math.random() * 5.0; 
        this.scale = 0.5 + Math.random() * 0.8; 
        this.angle = Math.random() * Math.PI * 2; 
        this.rotationSpeed = (Math.random() - 0.5) * 4.0; 
        this.vx = 100 + Math.random() * 200; 
        this.vy = 20 + Math.random() * 50; 
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.angle += this.rotationSpeed * dt;
        this.life -= dt;
        if (this.life <= 0) this.dead = true;
    }

    draw(ctx, camera) {
        if (this.x < camera.x - 50 || this.x > camera.x + camera.w + 50 ||
            this.y < camera.y - 50 || this.y > camera.y + camera.h + 50) return;

        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(this.angle);
        ctx.scale(this.scale, this.scale);
        this.drawSprite(ctx, Assets.leaf, -16, -16, 32, 32);
        ctx.restore();
    }
}

export class Snowflake {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = -50 + Math.random() * 150; 
        this.vy = 150 + Math.random() * 150; 
        this.size = 2 + Math.random() * 3; 
        this.life = 4.0; 
        this.dead = false;
        this.sway = Math.random() * Math.PI; 
    }

    update(dt) {
        this.sway += dt * 5;
        this.x += (this.vx + Math.sin(this.sway) * 50) * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        if (this.life <= 0) this.dead = true;
    }

    draw(ctx, camera) {
        if (this.x < camera.x - 50 || this.x > camera.x + camera.w + 50 ||
            this.y < camera.y - 50 || this.y > camera.y + camera.h + 50) return;

        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        ctx.fillStyle = 'white';
        ctx.globalAlpha = 0.8;
        ctx.fillRect(screenX, screenY, this.size, this.size);
        ctx.globalAlpha = 1.0;
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

// --- GAME OBJECTS ---

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
        if (this.x + this.w < camera.x || this.x > camera.x + camera.w) return;
        const screenX = Math.floor(this.x - camera.x);
        const screenY = Math.floor(this.y - camera.y);
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
    }

    update(dt, input, resources, worldWidth, worldHeight, islands, audio, enemy) {
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
            this.fireCooldown -= dt;
            const dx = enemy.x - this.x;
            const dy = enemy.y - this.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
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

        this.x += this.vx * dt; 
        this.vy += this.gravity * dt;
        if (this.vy > this.maxFallSpeed) this.vy = this.maxFallSpeed;

        if (wantJump) {
            if (this.isGrounded) {
                this.vy = this.jumpForce;
                this.isGrounded = false;
                if(audio) audio.play('jump', 0.4, 0.1);
            } else if (this.team === 'green' && resources && resources.air > 0) {
                this.vy -= 1500 * dt; 
                if (this.vy < this.flyForce) this.vy = this.flyForce;
                resources.air -= 80 * dt; 
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
                        
                        if (this.team === 'green' && resources) {
                           if (!this.visitedIslands.has(island)) {
                               this.visitedIslands.add(island);
                               resources.addEarth(20); 
                           }
                           if (Math.abs(this.vx) > 10) { 
                               resources.addPassiveEarth(10 * dt);
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

        const screenX = Math.floor(this.x - camera.x);
        const screenY = Math.floor(this.y - camera.y);
        
        if (this.team === 'green') {
            ctx.fillStyle = '#00ff00';
            ctx.beginPath();
            ctx.moveTo(screenX + this.w/2, screenY - 25);
            ctx.lineTo(screenX + this.w/2 - 10, screenY - 35);
            ctx.lineTo(screenX + this.w/2 + 10, screenY - 35);
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
                hueRotate: Math.floor(Math.random() * 40) - 20 
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

        if (this.conversionTimer > 0) {
            this.conversionTimer -= dt;
            return;
        }

        if (this.hasTeepee) {
            const range = 150; 
            
            if (player && !player.dead) {
                const tentX = this.x + 20 + 48; 
                const tentY = this.y - 20; 
                const dx = (player.x + player.w/2) - tentX;
                const dy = (player.y + player.h/2) - tentY;
                if (Math.sqrt(dx*dx + dy*dy) < range) {
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
                const dx = (enemyChief.x + enemyChief.w/2) - tentX;
                const dy = (enemyChief.y + enemyChief.h/2) - tentY;
                if (Math.sqrt(dx*dx + dy*dy) < range) {
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
        if (this.x + this.w < camera.x || this.x > camera.x + camera.w) return;

        const screenX = Math.floor(this.x - camera.x);
        const screenY = Math.floor(this.y - camera.y);

        // 1. Tileset (Bottom)
        if (this.activeTileset.complete && this.activeTileset.naturalWidth > 0) {
            const sliceW = Math.floor(this.activeTileset.width / 3);
            const sliceH = this.activeTileset.height;
            ctx.drawImage(this.activeTileset, 0, 0, sliceW, sliceH, screenX, screenY, sliceW, sliceH);
            const rightX = screenX + this.w - sliceW;
            const middleWidth = rightX - (screenX + sliceW);
            if (middleWidth > 0) {
                ctx.drawImage(this.activeTileset, sliceW, 0, sliceW, sliceH, screenX + sliceW, screenY, middleWidth + 2, sliceH);
            }
            ctx.drawImage(this.activeTileset, sliceW * 2, 0, sliceW, sliceH, rightX, screenY, sliceW, sliceH);
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
                ctx.filter = `hue-rotate(${tree.hueRotate}deg)`;
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
            this.drawSprite(ctx, Assets.fire, screenX + (this.w/2) - 40, screenY - 54, 80, 80);
        }
    }
}

export class Villager extends Entity {
    constructor(x, y, team) {
        super(x, y, 24, 24); 
        this.team = team;
        this.hp = 10; // MODIFIED: Low HP
        this.homeIsland = null;
        this.vx = 0;
        this.vy = 0; 
        this.stateTimer = 0;
        this.onGround = false;
        this.maxFallSpeed = 800; 
        
        this.variantIndex = Math.floor(Math.random() * 4); 
    }

    update(dt, islands, worldWidth, worldHeight) {
        this.vy += 500 * dt; 
        if (this.vy > this.maxFallSpeed) this.vy = this.maxFallSpeed; 
        
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
            this.stateTimer = Math.random() * 2 + 1;
            this.vx = (Math.random() - 0.5) * 80; 
        }

        if (this.onGround && this.homeIsland) {
            const lookAhead = this.vx > 0 ? 10 : -10;
            const nextX = this.x + this.w/2 + lookAhead;
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
        
        if (this.y > worldHeight) this.y = -50; 
        if (this.x > worldWidth) this.x = 0;
        if (this.x < 0) this.x = worldWidth;
    }

    draw(ctx, camera) {
        if (this.x + this.w < camera.x || this.x > camera.x + camera.w) return;
        const screenX = Math.floor(this.x - camera.x);
        const screenY = Math.floor(this.y - camera.y);
        
        const variants = (this.team === 'green') ? Assets.villagerGreen : Assets.villagerBlue;
        const img = variants[this.variantIndex];
        this.drawSprite(ctx, img, screenX, screenY, this.w, this.h);
    }
}

export class Warrior extends Villager {
    constructor(x, y, team) {
        super(x, y, team);
        this.w = 32; this.h = 32; 
        this.hp = 10; // MODIFIED: Low HP so 1 arrow kills
        this.attackCooldown = 0;
    }

    draw(ctx, camera) {
        if (this.x + this.w < camera.x || this.x > camera.x + camera.w) return;
        const screenX = Math.floor(this.x - camera.x);
        const screenY = Math.floor(this.y - camera.y);
        
        const img = (this.team === 'green') ? Assets.warriorGreen : Assets.warriorBlue;
        this.drawSprite(ctx, img, screenX, screenY, this.w, this.h);
    }

    update(dt, islands, enemies, spawnProjectileCallback, worldWidth, worldHeight, audio) {
        this.vy += 500 * dt;
        if (this.vy > this.maxFallSpeed) this.vy = this.maxFallSpeed;

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
                    // MODIFIED: Pass damage (10)
                    spawnProjectileCallback(this.x, this.y, angle, this.team, 10);
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
            
            if (this.onGround && this.homeIsland) {
                const lookAhead = this.vx > 0 ? 20 : -20;
                const nextX = this.x + this.w/2 + lookAhead;
                if (nextX < this.homeIsland.x || nextX > this.homeIsland.x + this.homeIsland.w) {
                    let canJump = false;
                    for(let other of islands) {
                        if (other === this.homeIsland) continue;
                        if (Math.abs((this.x + (this.vx > 0 ? 150 : -150)) - other.x) < 100 || 
                            Math.abs((this.x + (this.vx > 0 ? 150 : -150)) - (other.x + other.w)) < 100) {
                            if (Math.abs(other.y - this.y) < 100) {
                                canJump = true;
                                break;
                            }
                        }
                    }
                    if (canJump) {
                        this.vy = -400; 
                        this.onGround = false;
                    } else {
                        this.vx *= -1; 
                    }
                }
            }
        }

        this.attackCooldown -= dt;

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

        if (this.y > worldHeight) this.y = -50;
        if (this.x > worldWidth) this.x = 0;
        if (this.x < 0) this.x = worldWidth;
    }
}

export class Projectile extends Entity {
    // MODIFIED: Accepts damage
    constructor(x, y, angle, team, damage) {
        super(x, y, 32, 10); 
        this.team = team;
        this.damage = damage; // Store damage
        const speed = 600; 
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.angle = angle; 
        this.life = 3.0;
        this.trailTimer = 0;
    }

    update(dt, spawnParticleCallback) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        if (this.life <= 0) this.dead = true;

        this.trailTimer -= dt;
        if (this.trailTimer <= 0 && spawnParticleCallback) {
            this.trailTimer = 0.05; 
            spawnParticleCallback(this.x, this.y, this.team === 'green' ? 'lightgreen' : 'lightblue');
        }
    }

    draw(ctx, camera) {
        if (this.x + this.w < camera.x || this.x > camera.x + camera.w) return;
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(this.angle);
        this.drawSprite(ctx, Assets.projectile, 0, 0, this.w, this.h);
        ctx.restore();
    }
}
