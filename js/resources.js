/* RESOURCE MANAGER
   Mana is permanently full (infinite by design — no bar surfaces it any more).
   Drives the four-tribe pip strip and the slim player HP bar. */

const TEAM_KEYS = ['green', 'blue', 'yellow', 'red'];

export class ResourceManager {
    constructor() {
        // Snapshot of every team's standings (set by updateStats each tick).
        this.teamPops  = { green: 0, blue: 0, yellow: 0, red: 0 };
        this.teamTents = { green: 0, blue: 0, yellow: 0, red: 0 };

        this.currentSpell = 0;
        this.spellNames  = ["FIREBALL", "AEROKINESIS", "QUAKE", "TIDE OF LIFE"];
        this.spellColors = ["#FF4500", "#87CEEB", "#8B4513", "#00BFFF"];

        // Mana stays infinite. Kept as a number so existing call sites that
        // read it don't blow up.
        this.mana = Infinity;
        this.maxMana = Infinity;

        // Throttle UI updates to ~20 fps; the canvas paints at 60 either way.
        this._uiTimer = 0;
        this._uiInterval = 0.05;

        // Cache pip element references and their value spans.
        const pip = (team) => {
            const el = document.getElementById('pip-' + team);
            if (!el) return null;
            return {
                el,
                pop:   el.querySelector('.pip-pop'),
                tents: el.querySelector('.pip-tents'),
            };
        };
        this.ui = {
            pips: {
                green:  pip('green'),
                blue:   pip('blue'),
                yellow: pip('yellow'),
                red:    pip('red'),
            },
            playerHpFill: document.getElementById('player-hp-fill'),
            msgArea:      document.getElementById('message-area'),
            spells: [
                document.getElementById('spell-0'),
                document.getElementById('spell-1'),
                document.getElementById('spell-2'),
                document.getElementById('spell-3'),
            ],
        };

        // Mark the player tribe (green) so the pip strip highlights it. Done
        // once because tribe identity doesn't change mid-session.
        const greenPip = this.ui.pips.green;
        if (greenPip && greenPip.el) greenPip.el.classList.add('is-player');
    }

    cycleSpell(direction) {
        this.currentSpell = ((this.currentSpell + direction) % 4 + 4) % 4;
        this._updateSpellUI();
    }

    setSpell(index) {
        if (index >= 0 && index <= 3) {
            this.currentSpell = index;
            this._updateSpellUI();
        }
    }

    _updateSpellUI() {
        if (!this.ui.spells[0]) return;
        for (let i = 0; i < 4; i++) {
            const el = this.ui.spells[i];
            if (!el) continue;
            if (i === this.currentSpell) el.classList.add('active');
            else                          el.classList.remove('active');
        }
    }

    // --- Mana shims (mana is infinite; these stay no-ops/always-succeed). ---
    replenishAll() { this.showMessage("ENEMY CHIEF SLAIN!", "#FFD700"); }
    addMana()      { /* no-op */ }
    addSouls()     { /* no-op */ }
    spendMana()    { return true; }
    spendAir()     { return true; }

    // Per-tick stats from the game loop. teamPops + teamTents are dictionaries
    // keyed by team name. Older positional args are kept for API stability;
    // they're now ignored in favour of the team dictionaries.
    updateStats(_gTents, _gPop, _bTents, _bPop, teamTents, teamPops) {
        if (teamTents && teamPops) {
            this.teamTents = teamTents;
            this.teamPops  = teamPops;
        }
    }

    updateUI(playerHp, playerMaxHp, _enemyHp, _enemyMaxHp, dt) {
        this._uiTimer += dt || 0;
        if (this._uiTimer < this._uiInterval) return;
        this._uiTimer = 0;

        for (const team of TEAM_KEYS) {
            const pip = this.ui.pips[team];
            if (!pip) continue;
            const pop   = this.teamPops[team]  | 0;
            const tents = this.teamTents[team] | 0;
            if (pip.pop)   pip.pop.textContent   = pop;
            if (pip.tents) pip.tents.textContent = tents;
            // Mark wiped-out tribes so the eye skips past them.
            const wiped = pop <= 0 && tents <= 0;
            if (wiped) pip.el.classList.add('is-dead');
            else        pip.el.classList.remove('is-dead');
        }

        if (this.ui.playerHpFill) {
            const pct = Math.max(0, Math.min(1, playerHp / playerMaxHp)) * 100;
            this.ui.playerHpFill.style.width = pct + '%';
        }
    }

    showMessage(text, color) {
        const msg = this.ui.msgArea;
        if (!msg) return;
        // Hard guard against legacy difficulty-tier strings ever surfacing.
        if (typeof text === 'string') {
            const t = text.toUpperCase();
            if (t.includes('TIDE TURNS') ||
                t.includes('THE TIDE') ||
                /\b(CALM|STEADY|BALANCED|FIERCE|RELENTLESS|WRATHFUL|EASING)\b/.test(t)) {
                return;
            }
        }
        msg.textContent = text;
        msg.style.color = color;
        msg.style.opacity = '1';
        msg.style.transform = 'scale(1.15)';
        clearTimeout(this._msgTimeout);
        this._msgTimeout = setTimeout(() => {
            msg.style.opacity = '0';
            msg.style.transform = 'scale(1)';
        }, 2000);
    }
}
