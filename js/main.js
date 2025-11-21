/* THE HEART OF THE GAME
   Definitive V5: Socially Distanced Islands.
*/

import { InputHandler } from './input.js';
import { ResourceManager } from './resources.js';
import { World } from './world.js';
import { Player, Island, Villager, Warrior, Projectile, Particle } from './entities.js';
import { AudioManager } from './audio.js';

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        this.worldWidth = 6000; 
        this.worldHeight = 3000;

        this.input = new InputHandler();
        this.resources = new ResourceManager();
        this.world = new World(this.worldWidth, this.worldHeight);
        
        this.audio = new AudioManager(); 
        this.audio.loadAll(); 
        
        this.player = new Player(400, 200, 'green'); 
        this.enemyChief = new Player(5500, 200, 'blue');

        this.islands = [];
        this.villagers = [];
        this.projectiles = [];
        this.particles = [];

        this._generateWorld();

        this.lastTime = 0;
        this.spawnTimer = 0;
        this.hookTarget = null;
        this.gameOver = false;

        window.addEventListener('click', () => this._startAudio(), { once: true });
        window.addEventListener('keydown', () => this._startAudio(), { once: true });

        requestAnimationFrame((ts) => this.loop(ts));
    }

    _startAudio() {
        if (this.audioStarted) return;
        this.audioStarted = true;
        this.audio.resume();
        this.audio.startLoop('ambience', 0.5);
        this.audio.startLoop('music', 0.4);
        this.audio.startLoop('fall', 0.0); 
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
        // STARTING BASES
        this.islands.push(new Island(200, 1000, 600, 100, 'green')); 
        this.islands.push(new Island(5200, 1000, 600, 100, 'blue'));

        // PROCEDURAL GENERATION (Strict No Overlap)
        const maxAttempts = 50; // More attempts because buffer is bigger
        
        for (let i = 0; i < 25; i++) {
            let placed = false;
            for(let attempt = 0; attempt < maxAttempts; attempt++) {
                const rx = 800 + Math.random() * 4200; 
                const ry = 500 + Math.random() * 1500;
                const rw = 300 + Math.random() * 500;
                const rh = 100;

                // Check Collision with ALL existing islands
                let overlaps = false;
                for (let existing of this.islands) {
                    // INCREASED BUFFER TO 300px
                    if (rx < existing.x + existing.w + 300 && 
                        rx + rw + 300 > existing.x &&
                        ry < existing.y + existing.h + 300 && 
                        ry + rh + 300 > existing.y) {
                        overlaps = true;
                        break;
                    }
                }

                if (!overlaps) {
                    let team = 'neutral';
                    if (rx < 1500) team = 'green';
                    if (rx > 4500) team = 'blue';
                    this.islands.push(new Island(rx, ry, rw, rh, team));
                    placed = true;
                    break;
                }
            }
        }

        this.player.visitedIslands.add(this.islands[0]);
    }

    loop(timestamp) {
        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        if (dt > 0.1) { requestAnimationFrame((ts) => this.loop(ts)); return; }

        this.update(dt);
        this.draw();
        requestAnimationFrame((ts) => this.loop(ts));
    }

    update(dt) {
        if (this.gameOver) return;

        if (this.audio.initialized) {
            const heightRatio = 1.0 + (Math.max(0, 2000 - this.player.y) / 4000);
            this.audio.setLoopPitch('music', heightRatio);
            if (this.player.vy > 300 && !this.player.isGrounded) {
                this.audio.setLoopVolume('fall', 0.6);
            } else {
                this.audio.setLoopVolume('fall', 0.0);
            }
        }

        const isMoving = this.player.update(dt, this.input, this.resources, this.worldWidth, this.worldHeight, this.islands, this.audio);
        this.world.update(this.player);

        if (!this.enemyChief.dead) {
            const dx = this.player.x - this.enemyChief.x;
            const dy = this.player.y - this.enemyChief.y;
            this.enemyChief.x += (dx * 0.15) * dt;
            this.enemyChief.y += (dy * 0.15) * dt;
            this.enemyChief.update(dt, null, null, this.worldWidth, this.worldHeight, this.islands, null); 
        }

        this._checkWinConditions(dt);
        this.resources.earth = Math.max(1, this.player.visitedIslands.size);
        
        let nearWater = false;
        let nearFire = false;
        this.islands.forEach(island => {
            island.update(dt); 
            const dist = Math.sqrt((island.x - this.player.x)**2 + (island.y - this.player.y)**2);
            if (dist < 400 && (island.team === 'green' || island.team === 'neutral')) {
                nearWater = true; 
                if (island.hasFireplace) nearFire = true;
            }
        });
        this.resources.update(dt, isMoving, nearWater, nearFire);

        if (!this.player.dead) {
            this._handleShooting(dt);
            this._handleHookshot(dt);
        }

        this.spawnTimer += dt;
        if (this.spawnTimer > 4.0) { 
            this._spawnVillagers(); 
            this.spawnTimer = 0;
        }

        this._handleCombat(dt);
        this.particles.forEach(p => p.update(dt));
        this.particles = this.particles.filter(p => !p.dead);
    }

    _checkWinConditions(dt) {
        const greenCount = this.villagers.filter(v => v.team === 'green').length;
        const blueCount = this.villagers.filter(v => v.team === 'blue').length;

        if (this.player.dead) {
            if (greenCount > 0) {
                this.player.respawnTimer -= dt;
                if (this.player.respawnTimer <= 0) {
                    this.player.dead = false;
                    this.player.hp = 100;
                    this.player.x = this.islands[0].x; 
                    this.player.y = this.islands[0].y - 100;
                    this._spawnBlood(this.player.x, this.player.y, '#00ff00');
                }
            } else {
                this.gameOver = true;
                alert("DEFEAT! Your tribe has fallen.");
            }
        }

        if (this.enemyChief.dead) {
            if (blueCount > 0) {
                this.enemyChief.respawnTimer -= dt;
                if (this.enemyChief.respawnTimer <= 0) {
                    this.enemyChief.dead = false;
                    this.enemyChief.hp = 100;
                    this.enemyChief.x = this.islands[this.islands.length-1].x;
                    this.enemyChief.y = this.islands[this.islands.length-1].y - 100;
                }
            } else {
                this.gameOver = true;
                alert("VICTORY! You have conquered the skies!");
            }
        }
    }

    _handleHookshot(dt) {
        if (this.input.mouse.rightDown) {
            const mx = this.input.mouse.x + this.world.camera.x;
            const my = this.input.mouse.y + this.world.camera.y;

            let hit = false;
            for (let island of this.islands) {
                if (mx >= island.x && mx <= island.x + island.w &&
                    my >= island.y && my <= island.y + island.h) {
                    
                    hit = true;
                    if (this.resources.spendWater(25 * dt)) {
                        const dx = this.player.x - island.x;
                        const dy = this.player.y - island.y;
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        island.vx += (dx / dist) * 600 * dt;
                        island.vy += (dy / dist) * 600 * dt;
                    }
                    break;
                }
            }
            this.hookTarget = {x: mx, y: my, hit: hit};
        } else {
            this.hookTarget = null;
        }
    }

    _handleCombat(dt) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.update(dt);
            let hitSomething = false;

            if (p.team === 'green' && !this.enemyChief.dead && this._checkHit(p, this.enemyChief)) {
                this._spawnBlood(p.x, p.y);
                this.enemyChief.hp -= 5;
                hitSomething = true;
                this.audio.play('hit', 0.4, 0.3);
                if (this.enemyChief.hp <= 0) {
                    this.enemyChief.dead = true;
                    this.enemyChief.respawnTimer = 5.0;
                    this._spawnBlood(p.x, p.y);
                }
            }
            
            if (p.team === 'blue' && !this.player.dead && this._checkHit(p, this.player)) {
                this._spawnBlood(p.x, p.y);
                this.player.hp -= 5;
                hitSomething = true;
                this.audio.play('hit', 0.4, 0.3);
                if (this.player.hp <= 0) {
                    this.player.dead = true;
                    this.player.respawnTimer = 5.0;
                }
            }
            
            for (let v of this.villagers) {
                if (v.team !== p.team && !v.dead && this._checkHit(p, v)) {
                    this._spawnBlood(v.x, v.y);
                    v.hp -= 10;
                    hitSomething = true;
                    this.audio.play('hit', 0.3, 0.3);
                    if (v.hp <= 0) {
                         v.dead = true;
                         this._spawnBlood(v.x, v.y);
                    }
                }
            }

            if (hitSomething) p.dead = true;
            if (p.dead) this.projectiles.splice(i, 1);
        }

        this.villagers.forEach(v => {
            if (v instanceof Warrior) {
                const enemies = this.villagers.filter(e => e.team !== v.team && !e.dead);
                if (v.team === 'green' && !this.enemyChief.dead) enemies.push(this.enemyChief);
                if (v.team === 'blue' && !this.player.dead) enemies.push(this.player);

                v.update(dt, this.islands, enemies, (x, y, angle, team) => {
                    this.projectiles.push(new Projectile(x, y, angle, team));
                }, this.worldWidth, this.worldHeight, this.audio); 
            } else {
                v.update(dt, this.islands, this.worldWidth, this.worldHeight);
            }
        });
        this.villagers = this.villagers.filter(v => !v.dead);
    }

    _checkHit(proj, entity) {
        return (proj.x > entity.x && proj.x < entity.x + entity.w &&
                proj.y > entity.y && proj.y < entity.y + entity.h);
    }

    _spawnBlood(x, y, color='#cc0000') {
        for (let i=0; i<25; i++) {
            const size = 5 + Math.random() * 7;
            this.particles.push(new Particle(x, y, color, Math.random()*150, 0.5 + Math.random()*0.5, size));
        }
    }

    _handleShooting(dt) {
        if (this.input.mouse.leftDown) {
            if (!this.player.fireCooldown) this.player.fireCooldown = 0;
            this.player.fireCooldown -= dt;

            if (this.player.fireCooldown <= 0 && this.resources.spendFire()) {
                this.player.fireCooldown = 0.2; 
                const mx = this.input.mouse.x + this.world.camera.x;
                const my = this.input.mouse.y + this.world.camera.y;
                const angle = Math.atan2(my - (this.player.y+20), mx - (this.player.x+20));
                this.projectiles.push(new Projectile(this.player.x + 20, this.player.y + 20, angle, 'green'));
                this.audio.play('shoot', 0.4, 0.0);
            }
        }
    }

    _spawnVillagers() {
        const greenPop = this.villagers.filter(v => v.team === 'green').length;
        const greenCap = this.resources.earth * 5; 
        if (greenPop < greenCap) {
            const myIslands = this.islands.filter(i => i.team === 'green' || this.player.visitedIslands.has(i));
            if (myIslands.length > 0) {
                const island = myIslands[Math.floor(Math.random() * myIslands.length)];
                const unit = (Math.random() < 0.4) ? 
                    new Warrior(island.x + 50, island.y - 40, 'green') :
                    new Villager(island.x + 50, island.y - 40, 'green');
                unit.homeIsland = island;
                this.villagers.push(unit);
            }
        }
        if (this.villagers.filter(v => v.team === 'blue').length < 30) {
            const enemyIslands = this.islands.filter(i => i.team === 'blue');
             if (enemyIslands.length > 0) {
                const island = enemyIslands[Math.floor(Math.random() * enemyIslands.length)];
                const unit = (Math.random() < 0.5) ? 
                    new Warrior(island.x + 50, island.y - 40, 'blue') :
                    new Villager(island.x + 50, island.y - 40, 'blue');
                unit.homeIsland = island;
                this.villagers.push(unit);
            }
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.world.draw(this.ctx);
        this.islands.forEach(i => i.draw(this.ctx, this.world.camera));
        this.villagers.forEach(v => v.draw(this.ctx, this.world.camera));
        this.projectiles.forEach(p => p.draw(this.ctx, this.world.camera));
        if (!this.enemyChief.dead) this.enemyChief.draw(this.ctx, this.world.camera);
        if (!this.player.dead) this.player.draw(this.ctx, this.world.camera);
        this.particles.forEach(p => p.draw(this.ctx, this.world.camera));

        if (this.hookTarget) {
            this.ctx.strokeStyle = this.hookTarget.hit ? 'cyan' : 'gray';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            this.ctx.moveTo(this.player.x - this.world.camera.x + 20, this.player.y - this.world.camera.y + 20);
            this.ctx.lineTo(this.hookTarget.x - this.world.camera.x, this.hookTarget.y - this.world.camera.y);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        this.resources.drawUI(this.ctx);
        
        const mx = this.input.mouse.x;
        const my = this.input.mouse.y;
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(mx, my, 10, 0, Math.PI*2);
        this.ctx.stroke();

        if (this.player.dead) {
            this.ctx.fillStyle = 'red';
            this.ctx.font = '30px Arial';
            this.ctx.fillText(`RESPAWNING IN ${Math.ceil(this.player.respawnTimer)}...`, this.canvas.width/2 - 100, this.canvas.height/2);
        }
    }
}

window.onload = () => { new Game(); };
