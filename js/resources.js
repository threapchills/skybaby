
export class ResourceManager {
    constructor() {
        this.greenTents = 1;
        this.greenPop = 0;
        this.blueTents = 1;
        this.bluePop = 0;

        // --- SPELL SYSTEM ---
        // 0: FIRE (Ball), 1: AIR (Hook), 2: EARTH (Quake), 3: WATER (Spawn)
        this.currentSpell = 0;
        this.spellNames = ["FIREBALL", "AEROKINESIS", "EARTHQUAKE", "TIDE OF LIFE"];
        this.spellColors = ["#FF4500", "#87CEEB", "#8B4513", "#00BFFF"];

        // RESOURCES
        this.earth = 50;
        this.maxEarth = 200;
        this.earthCost = 90; // TRIPLED

        this.air = 100;
        this.maxAir = 100;
        this.airCostPerSecond = 60; // INCREASED

        this.water = 25;
        this.maxWater = 100;
        this.waterCost = 100; // DOUBLED

        this.fire = 5;
        this.maxFire = 10;
        this.fireRegenTimer = 0;
        this.universalRegenTimer = 0;

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
        if (this.ui.pipsFire) {
            this.ui.pipsFire.innerHTML = '';
            for (let i = 0; i < this.maxFire; i++) {
                let p = document.createElement('div');
                p.className = 'pip';
                this.ui.pipsFire.appendChild(p);
            }
            this.domPips = Array.from(this.ui.pipsFire.children);
        } else {
            this.domPips = [];
        }
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
        if (!this.ui.spells) return;
        this.ui.spells.forEach((el, i) => {
            if (el) {
                if (i === this.currentSpell) el.classList.add('active');
                else el.classList.remove('active');
            }
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

    // New: Water from Blood (Kills) - DISABLED as per overhaul
    addWater(amount) {
        // this.water += amount;
        // if (this.water > this.maxWater) this.water = this.maxWater;
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

    // UPDATED REGEN LOGIC: ONLY FIRE REGENS EVERYTHING, BUT SLOWLY
    update(dt, isGrounded, isMoving, isNearFire) {
        if (isNearFire) {
            this.universalRegenTimer += dt;

            // SLOW REGEN: e.g. every 0.2s check
            if (this.universalRegenTimer > 0.2) {
                this.universalRegenTimer = 0;

                // Increment small amounts
                this.earth = Math.min(this.earth + 2, this.maxEarth);  // ~10 per second
                this.air = Math.min(this.air + 2, this.maxAir);        // ~10 per second
                this.water = Math.min(this.water + 1, this.maxWater);  // ~5 per second

                // Fire is discrete, so use a separate timer or threshold?
                // Let's just use a decimal accumulator or simple chance?
                // Or just use a separate timer for Fire pips.
            }

            // Fire specific slow regen
            this.fireRegenTimer += dt;
            if (this.fireRegenTimer > 1.0) { // 1 pip per second
                if (this.fire < this.maxFire) {
                    this.fire++;
                    this.fireRegenTimer = 0;
                }
            }

        } else {
            this.universalRegenTimer = 0;
            this.fireRegenTimer = 0;
        }

        // No other passive regen!
    }

    updateStats(gTents, gPop, bTents, bPop) {
        this.greenTents = gTents;
        this.greenPop = gPop;
        this.blueTents = bTents;
        this.bluePop = bPop;
    }

    // NEW DOM-BASED UI UPDATE
    updateUI(playerHp, playerMaxHp, enemyHp, enemyMaxHp) {
        if (!this.ui.pPop) return; // Safety check if UI not found

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
        if (this.domPips) {
            this.domPips.forEach((pip, i) => {
                if (i < this.fire) pip.classList.add('active');
                else pip.classList.remove('active');
            });
        }
    }

    showFloatingMessage(text, color) {
        const msg = document.getElementById('message-area');
        if (msg) {
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
}
