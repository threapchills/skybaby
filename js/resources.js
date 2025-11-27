/* THE SPIRIT LEDGER (Resource Manager)
   Definitive V25: THE "SLOW BURN" UPDATE 🔥
   - Fireball regen slowed down to 1 charge every 3 seconds.
   - Water refuel confirmed at 5 per kill (20 kills to full).
*/

export class ResourceManager {
    constructor() {
        this.greenTents = 1;
        this.greenPop = 0;
        this.blueTents = 1;
        this.bluePop = 0;
        
        // --- SPELL SYSTEM ---
        // 0: FIRE (Ball), 1: AIR (Hook), 2: EARTH (Wall), 3: WATER (Spawn)
        this.currentSpell = 0; 
        this.spellNames = ["FIREBALL", "AEROKINESIS", "STONE WALL", "TIDE OF LIFE"];
        this.spellColors = ["#FF4500", "#87CEEB", "#8B4513", "#00BFFF"];

        // RESOURCES
        this.earth = 50; 
        this.maxEarth = 200;
        this.earthCost = 30;

        this.air = 100;
        this.maxAir = 100;
        this.airCostPerSecond = 40; 

        this.water = 25; 
        this.maxWater = 100;
        this.waterCost = 50; 

        this.fire = 5; 
        this.maxFire = 10;
        this.fireRegenTimer = 0;
    }

    cycleSpell(direction) {
        this.currentSpell += direction;
        if (this.currentSpell > 3) this.currentSpell = 0;
        if (this.currentSpell < 0) this.currentSpell = 3;
    }

    setSpell(index) {
        if (index >= 0 && index <= 3) this.currentSpell = index;
    }

    // --- REPLENISHMENT ---
    replenishAll() {
        this.earth = this.maxEarth;
        this.air = this.maxAir;
        this.water = this.maxWater;
        this.fire = this.maxFire;
        console.log("🌟 MANA RUSH! Resources Replenished!");
    }

    // New: Water from Blood (Kills)
    addWater(amount) {
        this.water += amount;
        if (this.water > this.maxWater) this.water = this.maxWater;
    }

    // --- SPENDING ---

    spendEarth() {
        if (this.earth >= this.earthCost) {
            this.earth -= this.earthCost;
            return true;
        }
        return false;
    }

    spendWater() {
        if (this.water >= this.waterCost) {
            this.water -= this.waterCost;
            return true;
        }
        return false;
    }

    spendAir(dt) {
        const cost = this.airCostPerSecond * dt;
        if (this.air >= cost) {
            this.air -= cost;
            return true;
        }
        return false;
    }

    spendFire() {
        if (this.fire > 0) {
            this.fire--;
            return true;
        }
        return false;
    }

    // UPDATED REGEN LOGIC
    update(dt, isGrounded, isMoving, isNearFire) {
        // 2) Fire: Stand near fire to refuel
        // Slowed down to 4.0s per charge!
        if (isNearFire && this.fire < this.maxFire) {
            this.fireRegenTimer += dt;
            if (this.fireRegenTimer > 4.0) { 
                this.fire++;
                this.fireRegenTimer = 0;
            }
        } else {
            this.fireRegenTimer = 0;
        }

        // 3) Earth: Walk on ground to refuel
        if (isGrounded && isMoving && this.earth < this.maxEarth) {
            this.earth += 40 * dt; 
        }

        // 4) Air: Fly/Fall to refuel
        if (!isGrounded && this.air < this.maxAir) {
            this.air += 30 * dt; 
        }
        
        // Cap values just in case
        if (this.earth > this.maxEarth) this.earth = this.maxEarth;
        if (this.air > this.maxAir) this.air = this.maxAir;
    }

    updateStats(gTents, gPop, bTents, bPop) {
        this.greenTents = gTents;
        this.greenPop = gPop;
        this.blueTents = bTents;
        this.bluePop = bPop;
    }

    drawUI(ctx) {
        ctx.save();
        
        const startX = 20;
        const startY = 30;
        const padding = 30; 

        ctx.font = "bold 16px 'Segoe UI', sans-serif";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "black";
        ctx.shadowBlur = 4;
        ctx.lineWidth = 2;

        // --- SPELL SELECTOR ---
        const spellX = startX + 500;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(spellX - 10, startY - 15, 250, 40);
        
        ctx.fillStyle = "#FFF";
        ctx.fillText("SPELL (Right Click):", spellX, startY + 5);
        ctx.fillStyle = this.spellColors[this.currentSpell];
        ctx.font = "bold 20px 'Segoe UI', sans-serif";
        ctx.fillText(this.spellNames[this.currentSpell], spellX + 170, startY + 5);
        
        for(let i=0; i<4; i++) {
            ctx.beginPath();
            ctx.arc(spellX + 175 + (i*20), startY + 25, 6, 0, Math.PI*2);
            if(i === this.currentSpell) {
                ctx.fillStyle = this.spellColors[i];
                ctx.fill();
                ctx.strokeStyle = "white";
                ctx.stroke();
            } else {
                ctx.strokeStyle = "gray";
                ctx.stroke();
            }
        }
        // -----------------------------

        // SCOREBOARD
        ctx.fillStyle = "#8B4513"; 
        ctx.fillText(`WAR STATUS:`, startX, startY);
        
        ctx.font = "14px 'Segoe UI', sans-serif";
        
        // GREEN STATS
        ctx.fillStyle = "#32CD32"; 
        ctx.fillText(`YOU (Green): ${this.greenTents} Tents | ${this.greenPop} Tribe`, startX, startY + 20);
        
        // BLUE STATS
        ctx.fillStyle = "#4169E1"; 
        ctx.fillText(`ENEMY (Blue): ${this.blueTents} Tents | ${this.bluePop} Tribe`, startX + 250, startY + 20);

        // BARS
        let yPos = startY + padding + 25;
        this._drawBar(ctx, startX, yPos, this.air, this.maxAir, "#FFFFFF", "#87CEEB", "AIR (Refills in Sky)");

        yPos += padding;
        this._drawBar(ctx, startX, yPos, this.water, this.maxWater, "#00BFFF", "#00008B", "WATER (Refills on Kills)");

        yPos += padding;
        this._drawBar(ctx, startX, yPos, this.earth, this.maxEarth, "#CD853F", "#8B4513", "EARTH (Refills Walking)");

        yPos += padding;
        ctx.fillStyle = "#FF4500"; 
        ctx.fillText("FIRE (Refills at Fire):", startX, yPos + 10);
        
        for (let i = 0; i < this.maxFire; i++) {
            const pipX = startX + 160 + (i * 18);
            const pipY = yPos + 10;
            ctx.beginPath();
            ctx.arc(pipX, pipY, 6, 0, Math.PI * 2);
            
            if (i < this.fire) {
                ctx.fillStyle = "#FFD700"; 
                ctx.fill();
                ctx.stroke();
            } else {
                ctx.strokeStyle = "#555"; 
                ctx.stroke();
            }
        }

        ctx.restore();
    }

    _drawBar(ctx, x, y, current, max, colorForeground, colorBackground, label) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(x, y, 200, 20);

        const fillWidth = (current / max) * 200;
        ctx.fillStyle = colorForeground;
        ctx.fillRect(x, y, fillWidth, 20);

        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, 200, 20);

        ctx.fillStyle = "#FFF";
        ctx.fillText(label, x + 210, y + 10);
    }
}
