/* THE SPIRIT LEDGER (Resource Manager)
   Definitive V21: ELEMENTAL OVERLOAD UPDATE 🧙‍♂️
   - Tracks current Spell Selection.
   - Handles costs for Earth (Wall) and Water (Spawn).
   - Draws the new Spell Wheel UI.
*/

export class ResourceManager {
    constructor() {
        this.greenTents = 1;
        this.greenPop = 0;
        this.blueTents = 1;
        this.bluePop = 0;
        
        // --- SPELL SYSTEM ---
        // 0: FIRE (Default), 1: AIR (Push/Move), 2: EARTH (Wall), 3: WATER (Spawn)
        this.currentSpell = 0; 
        this.spellNames = ["FIREBALL", "AEROKINESIS", "STONE WALL", "TIDE OF LIFE"];
        this.spellColors = ["#FF4500", "#87CEEB", "#8B4513", "#00BFFF"];

        // RESOURCES
        this.earth = 50; // Start with some earth for walls
        this.maxEarth = 200;

        this.air = 100;
        this.maxAir = 100;
        this.airRegenRate = 30; 
        
        // Hookshot drains air now
        this.airCostPerSecond = 40; 

        this.water = 100;
        this.maxWater = 100;
        this.waterRegenRate = 15;
        this.waterCost = 50; // Cost for Spawn Spell

        this.fire = 5;
        this.maxFire = 10;
        this.fireRegenTimer = 0; 
        this.earthCost = 30; // Cost for Wall
    }

    cycleSpell(direction) {
        this.currentSpell += direction;
        if (this.currentSpell > 3) this.currentSpell = 0;
        if (this.currentSpell < 0) this.currentSpell = 3;
    }

    setSpell(index) {
        if (index >= 0 && index <= 3) this.currentSpell = index;
    }

    addEarth(amount) {
        this.earth += amount;
        if (this.earth > this.maxEarth) this.earth = this.maxEarth;
    }

    addPassiveEarth(amount) {
        this.earth += amount;
        if (this.earth > this.maxEarth) this.earth = this.maxEarth;
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

    // Spend Air over time (dt)
    spendAir(dt) {
        const cost = this.airCostPerSecond * dt;
        if (this.air >= cost) {
            this.air -= cost;
            return true;
        }
        return false;
    }

    update(dt, isMoving, isNearWaterSource, isNearFireSource) {
        // Regen Air
        this.air += this.airRegenRate * dt;
        if (this.air > this.maxAir) this.air = this.maxAir;

        // Regen Water
        if (isNearWaterSource) {
            this.water += this.waterRegenRate * dt;
            if (this.water > this.maxWater) this.water = this.maxWater;
        }

        // Regen Fire
        if (isNearFireSource && this.fire < this.maxFire) {
            this.fireRegenTimer += dt;
            if (this.fireRegenTimer > 0.25) { 
                this.fire++;
                this.fireRegenTimer = 0;
            }
        } else {
            this.fireRegenTimer = 0;
        }
    }

    spendFire() {
        if (this.fire > 0) {
            this.fire--;
            return true;
        }
        return false;
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

        // --- SPELL SELECTOR (New!) ---
        const spellX = startX + 500;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(spellX - 10, startY - 15, 250, 40);
        
        ctx.fillStyle = "#FFF";
        ctx.fillText("SPELL:", spellX, startY + 5);
        ctx.fillStyle = this.spellColors[this.currentSpell];
        ctx.font = "bold 20px 'Segoe UI', sans-serif";
        ctx.fillText(this.spellNames[this.currentSpell], spellX + 60, startY + 5);
        
        // Draw little icons/dots for selection
        for(let i=0; i<4; i++) {
            ctx.beginPath();
            ctx.arc(spellX + 65 + (i*20), startY + 25, 6, 0, Math.PI*2);
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
        this._drawBar(ctx, startX, yPos, this.air, this.maxAir, "#FFFFFF", "#87CEEB", "AIR (Right Click)");

        yPos += padding;
        this._drawBar(ctx, startX, yPos, this.water, this.maxWater, "#00BFFF", "#00008B", "WATER");

        yPos += padding;
        this._drawBar(ctx, startX, yPos, this.earth, this.maxEarth, "#CD853F", "#8B4513", "EARTH");

        yPos += padding;
        ctx.fillStyle = "#FF4500"; 
        ctx.fillText("FIRE:", startX, yPos + 10);
        
        for (let i = 0; i < this.maxFire; i++) {
            const pipX = startX + 60 + (i * 18);
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
