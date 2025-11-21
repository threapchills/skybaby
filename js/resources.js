/* THE SPIRIT LEDGER (Resource Manager)
   This file tracks the four sacred elements.
   It handles regeneration, depletion, and drawing the UI bars
   so the player knows if they are about to crash into a mountain.
*/

export class ResourceManager {
    constructor() {
        // EARTH: The solid ground beneath your feet.
        // Represents the number of islands you control.
        // More Earth = More villagers can spawn.
        this.earth = 1; 

        // AIR: The breath of the wind.
        // Used for flying. If this hits 0, you are just falling with style.
        this.air = 100;
        this.maxAir = 100;

        // WATER: The flow of life (Mana).
        // Used for dragging massive islands around like furniture.
        this.water = 100;
        this.maxWater = 100;

        // FIRE: The spark of war (Ammo).
        // Used for shooting fireballs at people you dislike.
        this.fire = 0;
        this.maxFire = 10; // You can only carry so much fire before your pants burn.

        // Regeneration Rates (per second)
        this.airRegenRate = 20;
        this.waterRegenRate = 15;
        this.fireRegenRate = 1; // Fire is slow to kindle!
    }

    /**
     * Updates the resource logic based on time and player state
     * @param {number} dt - Delta time in seconds
     * @param {boolean} isMoving - Is the player pressing WASD?
     * @param {boolean} isNearWaterSource - Is player near a Tree/Teepee?
     * @param {boolean} isNearFireSource - Is player near a Fireplace?
     */
    update(dt, isMoving, isNearWaterSource, isNearFireSource) {
        // --- AIR LOGIC ---
        if (isMoving) {
            // Flying tires you out!
            this.air -= 30 * dt;
        } else {
            // Hovering or standing still catches your breath
            this.air += this.airRegenRate * dt;
        }
        // Clamp Air
        if (this.air < 0) this.air = 0;
        if (this.air > this.maxAir) this.air = this.maxAir;


        // --- WATER LOGIC ---
        // Only regenerates if you are near the sacred sources (Teepees/Trees)
        if (isNearWaterSource) {
            this.water += this.waterRegenRate * dt;
            if (this.water > this.maxWater) this.water = this.maxWater;
        }

        // --- FIRE LOGIC ---
        // Only regenerates near a fireplace
        if (isNearFireSource) {
            // We accumulate "fire charge" as a float, but use it as an integer
            // For now, we just increment the integer slowly if we wanted, 
            // but let's assume we pick up "charges" discretely.
            // Actually, let's use a timer approach for smooth filling.
            // We won't do partial fireballs, but we track partial regen.
        }
    }

    // Call this when dragging an island
    // Returns true if we had enough water, false if we are dry
    spendWater(amount) {
        if (this.water >= amount) {
            this.water -= amount;
            return true;
        }
        return false;
    }

    // Call this when shooting a fireball
    spendFire() {
        if (this.fire > 0) {
            this.fire--;
            return true;
        }
        return false;
    }

    // Called when a villager lights a fire or we stand near one
    addFireAmmo(amount) {
        this.fire += amount;
        if (this.fire > this.maxFire) this.fire = this.maxFire;
    }

    // Called when we capture or build a new island
    addEarth() {
        this.earth++;
    }

    // Called if an island is destroyed or lost
    removeEarth() {
        if (this.earth > 0) this.earth--;
    }

    /**
     * Draws the HUD (Heads Up Display)
     * @param {CanvasRenderingContext2D} ctx 
     */
    drawUI(ctx) {
        ctx.save();
        
        // Define some UI constants
        const barWidth = 150;
        const barHeight = 15;
        const startX = 20;
        const startY = 20;
        const padding = 25; // Vertical space between bars

        // Font settings
        ctx.font = "bold 14px 'Segoe UI', sans-serif";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "black";
        ctx.shadowBlur = 4;
        ctx.lineWidth = 2;

        // --- 1. EARTH (Islands Owned) ---
        ctx.fillStyle = "#8B4513"; // SaddleBrown
        ctx.fillText(`EARTH (Islands): ${this.earth}`, startX, startY);

        // --- 2. AIR (Stamina) ---
        let yPos = startY + padding;
        this._drawBar(ctx, startX, yPos, this.air, this.maxAir, "#FFFFFF", "#87CEEB", "AIR");

        // --- 3. WATER (Mana) ---
        yPos += padding;
        this._drawBar(ctx, startX, yPos, this.water, this.maxWater, "#00BFFF", "#00008B", "WATER");

        // --- 4. FIRE (Ammo) ---
        // Fire is discrete (integers), so let's draw pips or dots instead of a bar
        yPos += padding;
        ctx.fillStyle = "#FF4500"; // OrangeRed
        ctx.fillText("FIRE:", startX, yPos + (barHeight/2));
        
        for (let i = 0; i < this.maxFire; i++) {
            ctx.beginPath();
            // Draw circles next to the text
            const pipX = startX + 50 + (i * 15);
            const pipY = yPos + 8;
            ctx.arc(pipX, pipY, 5, 0, Math.PI * 2);
            
            if (i < this.fire) {
                ctx.fillStyle = "#FFD700"; // Gold (Lit)
                ctx.fill();
                ctx.stroke(); // Outline
            } else {
                ctx.strokeStyle = "#555"; // Empty socket
                ctx.stroke();
            }
        }

        ctx.restore();
    }

    // Helper to draw a resource bar
    _drawBar(ctx, x, y, current, max, colorForeground, colorBackground, label) {
        // Draw Background (Empty Container)
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(x, y, 150, 15);

        // Draw Foreground (Fill)
        const fillWidth = (current / max) * 150;
        ctx.fillStyle = colorForeground;
        ctx.fillRect(x, y, fillWidth, 15);

        // Draw Border
        ctx.strokeStyle = "#333";
        ctx.strokeRect(x, y, 150, 15);

        // Draw Label Text inside or next to it
        ctx.fillStyle = "#FFF";
        ctx.fillText(label, x + 160, y + 8);
    }
}
