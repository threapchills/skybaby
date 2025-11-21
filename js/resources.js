/* THE SPIRIT LEDGER (Resource Manager)
   Tuned: Expensive Flight, Walking for Earth.
*/

export class ResourceManager {
    constructor() {
        this.earth = 20; // Start with a little bit
        this.maxEarth = 100;

        this.air = 100;
        this.maxAir = 100;
        this.airRegenRate = 30; 
        this.airDepletionRate = 60; // TRIPLED COST (was 15-20ish)

        this.water = 100;
        this.maxWater = 100;
        this.waterRegenRate = 20;

        this.fire = 5;
        this.maxFire = 10;
        this.fireRegenTimer = 0; 
    }

    update(dt, isMoving, isNearWaterSource, isNearFireSource) {
        // AIR
        if (isMoving) {
            // Moving in air costs air (handled in Player update really, but we track regen here)
            // We actually handle air drain in Player.update for flight, 
            // but if we want general movement tiredness we could do it here.
            // For now, we just regen if NOT flying.
        }
        // Air regen is handled by the fact we only drain when flying.
        // So we always try to regen unless maxed.
        this.air += this.airRegenRate * dt;
        if (this.air > this.maxAir) this.air = this.maxAir;

        // WATER
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

        // EARTH: No passive trickle anymore. It comes from walking.
        // We just clamp it here.
        if (this.earth > this.maxEarth) this.earth = this.maxEarth;
    }

    spendEarth(amount) {
        if (this.earth >= amount) {
            this.earth -= amount;
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

    // Called when walking
    addPassiveEarth(amount) {
        this.earth += amount;
        if (this.earth > this.maxEarth) this.earth = this.maxEarth;
    }

    // Called when discovering new land
    addEarth(amount) {
        this.earth += amount;
        if (this.earth > this.maxEarth) this.earth = this.maxEarth;
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

        this._drawBar(ctx, startX, startY, this.earth, this.maxEarth, "#8B4513", "#3e2723", "EARTH");

        let yPos = startY + padding;
        this._drawBar(ctx, startX, yPos, this.air, this.maxAir, "#FFFFFF", "#87CEEB", "AIR");

        yPos += padding;
        this._drawBar(ctx, startX, yPos, this.water, this.maxWater, "#00BFFF", "#00008B", "WATER");

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
