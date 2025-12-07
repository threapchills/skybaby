
export class ResourceManager {
    constructor() {
        this.greenTents = 1;
        this.greenPop = 0;
        this.blueTents = 1;
        this.bluePop = 0;

        // --- SPELL SYSTEM ---
        // 0: FIRE (Ball), 1: AIR (Hook), 2: EARTH (Quake), 3: WATER (Spawn)
        this.currentSpell = 0;
        this.spellNames = ["FIREBALL", "AEROKINESIS", "QUAKE", "TIDE OF LIFE"];
        this.spellColors = ["#FF4500", "#87CEEB", "#8B4513", "#00BFFF"];

        // RESOURCES - MANA OVERHAUL
        this.mana = 100;
        this.maxMana = 100;

        this.manaRegenTimer = 0;

        // UI ELEMENTS CACHE
        this.ui = {
            pPop: document.getElementById('p-pop'),
            pTents: document.getElementById('p-tents'),
            pHealth: document.getElementById('p-health'),
            ePop: document.getElementById('e-pop'),
            eTents: document.getElementById('e-tents'),
            eHealth: document.getElementById('e-health'),
            barMana: document.getElementById('bar-mana'), // SINGLE BAR
            msgArea: document.getElementById('message-area'),
            spells: [
                document.getElementById('spell-0'),
                document.getElementById('spell-1'),
                document.getElementById('spell-2'),
                document.getElementById('spell-3')
            ]
        };
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
        this.mana = this.maxMana;
        console.log("🌟 MANA RUSH! Resources Replenished!");
        this.showFloatingMessage("MANA SURGE!", "#FFD700");
    }

    addMana(amount) {
        this.mana = Math.min(this.mana + amount, this.maxMana);
    }

    // New: Water from Blood (Kills) - Economy of Souls
    addWater(amount) {
        this.addMana(amount); // Soul = Mana (Efficiency)
        this.showFloatingMessage("SOUL CAPTURED!", "#00BFFF");
    }

    // --- SPENDING ---

    spendMana(amount) {
        if (this.mana >= amount) {
            this.mana -= amount;
            return true;
        }
        this.showFloatingMessage("NOT ENOUGH MANA!", "#FF4500");
        return false;
    }

    spendEarth() { return this.spendMana(90); } // Legacy wrapper if needed, but better to call spendMana directly
    spendWater() { return this.spendMana(80); }
    spendAir(dt) { return this.spendMana(5 * dt); } // Low cost per second? 
    spendFire() { return this.spendMana(80); }

    update(dt, isGrounded, isMoving, isNearFire) {
        // RECHARGE SLOWLY WHEN WAITING BY ANY CAMPFIRE
        if (isNearFire) {
            this.manaRegenTimer += dt;
            if (this.manaRegenTimer > 0.1) {
                this.manaRegenTimer = 0;
                // Regen rate: ~10 per second
                if (this.mana < this.maxMana) {
                    this.mana = Math.min(this.mana + 1, this.maxMana);
                }
            }
        } else {
            this.manaRegenTimer = 0;
        }
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

        // Resource Bars - SINGLE MANA BAR
        if (this.ui.barMana) {
            this.ui.barMana.style.width = `${(this.mana / this.maxMana) * 100}%`;
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
