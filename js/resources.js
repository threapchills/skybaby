/* THE SPIRIT LEDGER (Resource Manager)
   Definitive V7: Earth is now a Scoreboard. Dragging is Free.
*/

export class ResourceManager {
    constructor() {
        // EARTH: Now tracks count, not a depletable resource
        this.islandsOwned = 1;
        this.villagerCount = 0;

        this.air = 100;
        this.maxAir = 100;
        this.airRegenRate = 30; 
        this.airDepletionRate = 60; 

        this.water = 100;
        this.maxWater = 100;
        this.waterRegenRate = 20;

        this.fire = 5;
        this.maxFire = 10;
        this.fireRegenTimer = 0; 
    }

    update(dt, isMoving, isNearWaterSource, isNearFireSource) {
        // AIR
        this.air += this.airRegenRate * dt;
        if (this.air > this.maxAir) this.air = this.maxAir;

        // WATER (Still used for... actually nothing now if dragging is free? 
        // Let's keep it for future magic or dashes)
        if (isNearWaterSource) {
            this.water += this.waterRegenRate * dt;
            if (this.water > this.maxWater) this.water = this.maxWater;
        }

        // FIRE
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

    // Called by main.js to sync stats
    updateStats(islands, villagers) {
        this.islandsOwned = islands;
        this.villagerCount = villagers;
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

        // EARTH (Scoreboard)
        ctx.fillStyle = "#8B4513"; 
        ctx.fillText(`EARTH DOMINION:`, startX, startY);
        ctx.font = "14px 'Segoe UI', sans-serif";
        ctx.fillStyle = "#CD853F"; 
        ctx.fillText(`Islands: ${this.islandsOwned} | Villagers: ${this.villagerCount}`, startX, startY + 20);

        // AIR
        let yPos = startY + padding + 20;
        this._drawBar(ctx, startX, yPos, this.air, this.maxAir, "#FFFFFF", "#87CEEB", "AIR");

        // WATER
        yPos += padding;
        this._drawBar(ctx, startX, yPos, this.water, this.maxWater, "#00BFFF", "#00008B", "WATER");

        // FIRE
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
