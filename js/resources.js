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

        // UI ELEMENTS CACHE
        this.ui = {
            pPop: document.getElementById('p-pop'),
            pTents: document.getElementById('p-tents'),
            pHealth: document.getElementById('p-health'),
            ePop: document.getElementById('e-pop'),
            eTents: document.getElementById('e-tents'),
            eHealth: document.getElementById('e-health'),
            barAir: document.getElementById('bar-air'),
            barWater: document.getElementById('bar-water'),
            barEarth: document.getElementById('bar-earth'),
            pipsFire: document.getElementById('pips-fire'),
            spells: [
                document.getElementById('spell-0'),
                document.getElementById('spell-1'),
                document.getElementById('spell-2'),
                document.getElementById('spell-3')
            ]
        };

        // Init Fire Pips
        this.ui.pipsFire.innerHTML = '';
        for (let i = 0; i < this.maxFire; i++) {
            let p = document.createElement('div');
            p.className = 'pip';
            this.ui.pipsFire.appendChild(p);
        }
        this.domPips = Array.from(this.ui.pipsFire.children);
    }

    cycleSpell(direction) {
        this.currentSpell += direction;
        if (this.currentSpell > 3) this.currentSpell = 0;
        if (this.currentSpell < 0) this.currentSpell = 3;
        this.updateSpellUI();
    }

    setSpell(index) {
        if (index >= 0 && index <= 3) {
            this.currentSpell = index;
            this.updateSpellUI();
        }
    }

    updateSpellUI() {
        this.ui.spells.forEach((el, i) => {
            if (i === this.currentSpell) el.classList.add('active');
            else el.classList.remove('active');
        });
    }

    // --- REPLENISHMENT ---
    replenishAll() {
        this.earth = this.maxEarth;
        this.air = this.maxAir;
        this.water = this.maxWater;
        this.fire = this.maxFire;
        console.log("🌟 MANA RUSH! Resources Replenished!");
        this.showFloatingMessage("MANA RUSH!", "#FFD700");
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

    // NEW DOM-BASED UI UPDATE
    updateUI(playerHp, playerMaxHp, enemyHp, enemyMaxHp) {
        // Update Stats
        this.ui.pPop.textContent = this.greenPop;
        this.ui.pTents.textContent = `Tents: ${this.greenTents}`;
        this.ui.ePop.textContent = this.bluePop;
        this.ui.eTents.textContent = `Tents: ${this.blueTents}`;

        // Health Bars
        const pPct = Math.max(0, (playerHp / playerMaxHp) * 100);
        this.ui.pHealth.style.width = `${pPct}%`;

        const ePct = Math.max(0, (enemyHp / enemyMaxHp) * 100);
        this.ui.eHealth.style.width = `${ePct}%`;

        // Resource Bars
        this.ui.barAir.style.width = `${(this.air / this.maxAir) * 100}%`;
        this.ui.barWater.style.width = `${(this.water / this.maxWater) * 100}%`;
        this.ui.barEarth.style.width = `${(this.earth / this.maxEarth) * 100}%`;

        // Fire Pips
        this.domPips.forEach((pip, i) => {
            if (i < this.fire) pip.classList.add('active');
            else pip.classList.remove('active');
        });
    }

    showFloatingMessage(text, color) {
        const msg = document.getElementById('message-area');
        msg.textContent = text;
        msg.style.color = color;
        msg.style.opacity = 1;
        msg.style.transform = "scale(1.2)";
        setTimeout(() => {
            msg.style.opacity = 0;
            msg.style.transform = "scale(1)";
        }, 2000);
    }
}
