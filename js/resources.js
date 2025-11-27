/* THE SPIRIT LEDGER (Resource Manager)
   Definitive V22: NO REGEN UPDATE 🛑
   - Automatic regeneration removed for spells.
   - Added replenishAll() for when Enemy Chief dies.
   - Fire resource is now exclusively for Fireball Spell (not Arrows).
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

        // RESOURCES (Rare/Limited)
        this.earth = 50; 
        this.maxEarth = 200;
        this.earthCost = 30;

        this.air = 100;
        this.maxAir = 100;
        this.airCostPerSecond = 40; 

        this.water = 100;
        this.maxWater = 100;
        this.waterCost = 50; 

        this.fire = 5; 
        this.maxFire = 10;
        // Fire regen removed (Arrows are infinite, Fireball is limited)
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

    // --- SPENDING ---

    addEarth(amount) {
        // Passive earth from island capture still allowed? 
        // User said "Only upon killing enemy shaman". 
        // I will disable passive collection to be strict with the new rule.
        // this.earth += amount;
    }

    addPassiveEarth(amount) {
        // Disabled for strict mana rules
    }

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

    update(dt, isMoving, isNearWaterSource, isNearFireSource) {
        // REGEN DISABLED as per new requirements.
        // Resources are now a finite tactical pool until victory.
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
        this._drawBar(ctx, startX, yPos, this.air, this.maxAir, "#FFFFFF", "#87CEEB", "AIR (Hookshot)");

        yPos += padding;
        this._drawBar(ctx, startX, yPos, this.water, this.maxWater, "#00BFFF", "#00008B", "WATER (Summon)");

        yPos += padding;
        this._drawBar(ctx, startX, yPos, this.earth, this.maxEarth, "#CD853F", "#8B4513", "EARTH (Wall)");

        yPos += padding;
        ctx.fillStyle = "#FF4500"; 
        ctx.fillText("FIRE (Ball):", startX, yPos + 10);
        
        for (let i = 0; i < this.maxFire; i++) {
            const pipX = startX + 100 + (i * 18);
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
