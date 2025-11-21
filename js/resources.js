/* THE SPIRIT LEDGER (Resource Manager)
   Updated: Universal Fire, Earth Slider, and Balanced Costs.
*/

export class ResourceManager {
    constructor() {
        // EARTH: Now a float (0-100) for smooth depletion
        this.earth = 100; 
        this.maxEarth = 100;

        // AIR: Stamina for flying.
        this.air = 100;
        this.maxAir = 100;
        this.airRegenRate = 40; 
        this.airDepletionRate = 15; 

        // WATER: Mana for general magic (unused currently, but kept for future)
        this.water = 100;
        this.maxWater = 100;
        this.waterRegenRate = 20;

        // FIRE: Ammo.
        this.fire = 5;
        this.maxFire = 10;
        this.fireRegenTimer = 0; 
    }

    update(dt, isMoving, isNearWaterSource, isNearFireSource) {
        // --- AIR LOGIC ---
        if (isMoving) {
            this.air -= this.airDepletionRate * dt;
        } else {
            this.air += this.airRegenRate * dt;
        }
        if (this.air < 0) this.air = 0;
        if (this.air > this.maxAir) this.air = this.maxAir;

        // --- WATER LOGIC ---
        if (isNearWaterSource) {
            this.water += this.waterRegenRate * dt;
            if (this.water > this.maxWater) this.water = this.maxWater;
        }

        // --- FIRE LOGIC (Universal Source) ---
        // Regenerate faster (0.25s per ammo) if near ANY fire
        if (isNearFireSource && this.fire < this.maxFire) {
            this.fireRegenTimer += dt;
            if (this.fireRegenTimer > 0.25) { 
                this.fire++;
                this.fireRegenTimer = 0;
            }
        } else {
            this.fireRegenTimer = 0;
        }

        // --- EARTH LOGIC (Regen) ---
        // Earth refills slowly over time if you own islands, faster if you explore
        // (Handled via 'addEarth' calls in player collision for exploration bursts)
        this.earth += 2 * dt; // Passive trickle
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

        // EARTH (Now a Bar)
        this._drawBar(ctx, startX, startY, this.earth, this.maxEarth, "#8B4513", "#3e2723", "EARTH");

        // AIR
        let yPos = startY + padding;
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
                ctx.fillStyle = "#FFD700"; // Lit
                ctx.fill();
                ctx.stroke();
            } else {
                ctx.strokeStyle = "#555"; // Empty
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
