/* THE CAST OF CHARACTERS (Entities)
   Definitive V12: Physics Fixed (No more zoomies), Silent Warriors, Tent Conversion.
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

export class Particle extends Entity {
    constructor(x, y, color, speed, life, size = 5) {
        super(x, y, size, size, null);
        this.color = color;
        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed - 50; 
        this.life = life;
        this.maxLife = life;
    }

    update(dt) {
        this.vy += 500 * dt; 
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

export class Pig extends Entity {
    constructor(x, y) {
        super(x, y, 32, 24, 'assets/sprites/pig.png'); 
        this.hp = 10;
        this.vx = 0;
        this.vy = 0; 
        this.stateTimer = 0;
        this.onGround = false;
        this.maxFallSpeed = 800; 
        this.homeIsland = null;
    }

    update(dt, islands, worldWidth, worldHeight) {
        this.vy += 500 * dt; 
        if (this.vy > this.maxFallSpeed) this.vy = this.maxFallSpeed; 
        
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
            this.stateTimer = Math.random() * 3 + 2; 
            this.vx = (Math.random() - 0.5) * 40; 
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
}

export class Player extends Entity {
    constructor(x, y, team) {
        super(x, y, 40, 40, `assets/sprites/player_${team}.png`);
        this.team = team; 
        this.vx = 0;
        this.vy = 0;
        this.hp = 100; 
        this.maxHp = 100;
        
        // --- PHYSICS TUNING (RESET TO SANITY) ---
        this.maxSpeed = 250; // Cap horizontal speed
        this.acceleration = 1500; // Force applied per second
        this.friction = 0.85; // Velocity retention per frame
        this.gravity = 600; 
        this.maxFallSpeed = 800; 
        this.jumpForce = -500; 
        this.flyForce = -400; 
        
        this.isGrounded = false;
        this.hpRegenTimer = 0;
        this.fireCooldown = 0; 
        
        this.visitedIslands = new Set();
    }

    update(dt, input, resources, worldWidth, worldHeight, islands, audio, enemy) {
        if (this.dead) return; 

        // HP REGEN
        if (this.hp < this.maxHp) {
            this.hpRegenTimer += dt;
            if (this.hpRegenTimer > 2.0) { 
                this.hp++;
                this.hpRegenTimer = 0;
            }
        }

        // AI LOGIC (Blue Shaman)
        if (this.team === 'blue' && enemy) {
            this.fireCooldown -= dt;
            const dx = enemy.x - this.x;
            const dy = enemy.y - this.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist < 500 && this.fireCooldown <= 0) {
                this.fireCooldown = 1.0; 
                const angle = Math.atan2(dy, dx);
                this.shootRequest = { x: this.x, y: this.y, angle: angle };
            }
        }

        // --- PHYSICS CORE ---
        // Apply Acceleration
        if (input && input.keys) {
            if (input.keys.a) this.vx -= this.acceleration * dt; 
            if (input.keys.d) this.vx += this.acceleration * dt;
        }
        
        // Apply Friction
        this.vx *= this.friction; 

        // Cap Horizontal Speed
        if (this.vx > this.maxSpeed) this.vx = this.maxSpeed;
        if (this.vx < -this.maxSpeed) this.vx = -this.maxSpeed;

        // Apply Velocity to Position
        this.x += this.vx * dt; 

        // Vertical Physics
        this.vy += this.gravity * dt;
        if (this.vy > this.maxFallSpeed) this.vy = this.maxFallSpeed;

        // Jumping / Flying
        if (input && input.keys.space) {
            if (this.isGrounded) {
                this.vy = this.jumpForce;
                this.isGrounded = false;
                if(audio) audio.play('jump', 0.4, 0.1);
            } else if (resources && resources.air > 0) {
                this.vy -= 1200 * dt; 
                if (this.vy < this.flyForce) this.vy = this.flyForce;
                resources.air -= 80 * dt; 
            }
        }
        this.y += this.vy * dt;

        // Collisions & Earth Gathering
        this.isGrounded = false;
        if (this.vy >= 0) { 
            for (let island of islands) {
                if (this.x + this.w > island.x + 5 && this.x < island.x + island.w - 5) {
                    const feet = this.y + this.h;
                    const threshold = 10 + (this.vy * dt * 2); 
                    
                    if (feet >= island.y - 10 && feet <= island.y + threshold) {
                         this.y = island.y - this.h + 4; 
                         this.vy = 0;
                         this.isGrounded = true;
                         
                         if (this.team === 'green' && !this.visitedIslands.has(island) && resources) {
                            this.visitedIslands.add(island);
                            resources.addEarth(20); 
                         }

                         if (this.team === 'green' && Math.abs(this.vx) > 10 && resources) { // Threshold for walking
                             resources.addPassiveEarth(10 * dt);
                         }
                    }
                }
            }
        }

        // Wrapping
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

        if (this.image && this.imageLoaded) {
            ctx.drawImage(this.image, screenX - 4, screenY - 4, 48, 48);
        } else {
            ctx.fillStyle = this.team === 'green' ? '#0f0' : '#00f';
            ctx.fillRect(screenX, screenY, this.w, this.h);
        }

        ctx.fillStyle = 'red';
        ctx.fillRect(screenX, screenY - 10, this.w, 4);
        ctx.fillStyle = '#0f0';
        ctx.fillRect(screenX, screenY - 10, this.w * (this.hp / this.maxHp), 4);
    }
}

export class Island extends Entity {
    constructor(x, y, w, h, team) {
        super(x, y, w, h, null);
        this.team = team;
        
        this.tileset = new Image();
        this.tileset.src = 'assets/environment/island_tileset.png';
        
        this.imgTeepee = new Image();
        this._updateTeepeeImage();
        
        this.imgFire = new Image();
        this.imgFire.src = 'assets/environment/fireplace_lit.png';

        this.imgTree = new Image();
        this.imgTree.src = 'assets/environment/tree_variant1.png';

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

        this.vx = 0;
        this.vy = 0;
        this.friction = 0.90; 
    }

    _updateTeepeeImage() {
        if (this.team === 'green') {
            this.imgTeepee.src = 'assets/environment/teepee_green.png';
        } else if (this.team === 'blue') {
            this.imgTeepee.src = 'assets/environment/teepee_blue.png';
        } else {
            this.imgTeepee.src = 'assets/environment/teepee_green.png'; 
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
            
            // Player Conversion
            if (player && !player.dead) {
                const tentX = this.x + 20 + 48; 
                const tentY = this.y - 20; 
                const dx = (player.x + player.w/2) - tentX;
                const dy = (player.y + player.h/2) - tentY;
                if (Math.sqrt(dx*dx + dy*dy) < range) {
                    if (this.team !== 'green') {
                        this.team = 'green';
                        this._updateTeepeeImage();
                        this.conversionTimer = 2.0; 
                        if (audio) audio.play('teepee', 0.6, 0.1); 
                    }
                }
            }

            // Enemy Conversion
            if (enemyChief && !enemyChief.dead) {
                const tentX = this.x + 20 + 48;
                const tentY = this.y - 20;
                const dx = (enemyChief.x + enemyChief.w/2) - tentX;
                const dy = (enemyChief.y + enemyChief.h/2) - tentY;
                if (Math.sqrt(dx*dx + dy*dy) < range) {
                    if (this.team !== 'blue') {
                        this.team = 'blue';
                        this._updateTeepeeImage();
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

        if (this.hasTeepee && this.imgTeepee.complete) {
            ctx.drawImage(this.imgTeepee, screenX + 20, screenY - 66, 96, 96);
        }
        if (this.imgTree.complete) {
            this.trees.forEach(tree => {
                ctx.save();
                ctx.filter = `hue-rotate(${tree.hueRotate}deg)`;
                const treeW = 120 * tree.scale;
                const treeH = 150 * tree.scale;
                const treeY = screenY - (110 * tree.scale); 
                ctx.drawImage(this.imgTree, screenX + tree.x, treeY, treeW, treeH);
                ctx.restore();
            });
        }
        if (this.hasFireplace && this.imgFire.complete) {
            ctx.drawImage(this.imgFire, screenX + (this.w/2) - 40, screenY - 54, 80, 80);
        }
    }
}

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
        this.onGround = false;
        this.maxFallSpeed = 800; 
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
}

export class Warrior extends Villager {
    constructor(x, y, team) {
        super(x, y, team);
        this.w = 32; this.h = 32; 
        this.image.src = `assets/sprites/warrior_${team}.png`;
        this.hp = 50; 
        this.attackCooldown = 0;
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
                    spawnProjectileCallback(this.x, this.y, angle, this.team);
                    // SILENCE: No audio play call here
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
    constructor(x, y, angle, team) {
        super(x, y, 32, 10, 'assets/sprites/projectile_arrow.png'); 
        this.team = team;
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
        if (this.image && this.imageLoaded) {
            ctx.drawImage(this.image, 0, 0, this.w, this.h);
        } else {
            ctx.fillStyle = 'yellow';
            ctx.fillRect(0, 0, this.w, this.h);
        }
        ctx.restore();
    }
}
