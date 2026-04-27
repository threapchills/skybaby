/* ENTITIES - REMASTERED 2.5D
   Procedural floating island rendering with visible depth,
   entity shadows, optimized rendering (NO CSS filters),
   object pooling for particles.
*/

// === World vertical bounds (no vertical wraparound) ===
// World is a horizontal cylinder: it wraps left-right, but top and bottom are hard.
// CEILING_Y is an invisible ceiling set well above the highest islands.
// Rock cross-section is rendered from GROUND_TOP downward; units begin to
// "hasten home" once they sink below HASTEN_TRIGGER (a soft band above the rock)
// and are clamped at GROUND_TOP so they cannot penetrate the floor.
//
// Ground thickness and hasten band scale with world height so the crust feels
// substantial whether the world is 3000 or 8000+ tall.
export const WORLD_CEILING_Y = -300;
const WORLD_GROUND_FRACTION = 0.115;  // ~12% of worldH = visible rock band
// Hasten band tightened so the visible top of the rock crust IS the place
// where collision starts pushing units back up. Previously the band was
// 7% (~560px on an 8000-tall world), which looked like a phantom ceiling
// hundreds of pixels above the painted rock. Now it kicks in right at the
// surface so players feel the floor where they see the floor.
const WORLD_HASTEN_FRACTION = 0.012;
export function getWorldGroundThickness(worldHeight) { return Math.round(worldHeight * WORLD_GROUND_FRACTION); }
export function getWorldHastenBand(worldHeight)      { return Math.round(worldHeight * WORLD_HASTEN_FRACTION); }
export function getWorldGroundY(worldHeight)         { return worldHeight - getWorldGroundThickness(worldHeight); }
export function getWorldHastenY(worldHeight)         { return getWorldGroundY(worldHeight) - getWorldHastenBand(worldHeight); }

// Apply a hasten-home upward impulse + steer toward the nearest island above.
// Used by every freely-moving unit when it sinks toward the rock floor.
//
// For non-player units the mode is STICKY: once a unit enters the hasten
// band, it stays in hasten-home mode until it actually lands on an island
// (onGround/isGrounded becomes true) OR climbs well clear of the band.
// Without stickiness, the tight hasten band only nudged a unit up briefly
// and gravity dragged it right back down — units clumped on the rock floor.
//
// Player chiefs are non-sticky so the player can fly low intentionally.
function _hastenHome(entity, islands, dt, worldHeight) {
    const groundY = getWorldGroundY(worldHeight);
    const hastenY = getWorldHastenY(worldHeight);
    const isPlayer = entity instanceof Player;
    const grounded = entity.onGround || entity.isGrounded;

    if (isPlayer) {
        // Players only get the impulse while actually inside the band.
        if (entity.y <= hastenY) return;
    } else {
        // Sticky mode: latch on entering the band, latch off only on a real
        // island landing or a clear escape above the band.
        if (entity.y > hastenY) entity._hasteningHome = true;
        if (grounded || entity.y < hastenY - 800) entity._hasteningHome = false;
        if (!entity._hasteningHome) return;
    }

    // Strong upward acceleration. Once latched, even units that have climbed
    // above the band still get gentle lift so they keep pushing toward an
    // island instead of stalling and falling back.
    const inBand = entity.y > hastenY;
    const depth = inBand
        ? (entity.y - hastenY) / Math.max(1, (groundY - hastenY))
        : 0.15;
    const upward = -1400 * Math.min(1.5, 0.4 + depth * 1.6);
    entity.vy = Math.min(entity.vy, upward);

    // Steer horizontally toward the nearest island above, picking the shortest
    // wrap-aware horizontal distance. (Generous threshold so units mid-climb
    // still have a target to aim for.)
    if (islands && islands.length) {
        let best = null, bestD = Infinity;
        for (let i = 0; i < islands.length; i++) {
            const isl = islands[i];
            if (isl.y > entity.y - 30) continue;
            const dx = isl.x + isl.w * 0.5 - entity.x;
            const d = Math.abs(dx);
            if (d < bestD) { bestD = d; best = isl; }
        }
        if (best) {
            const tx = best.x + best.w * 0.5;
            const speedCap = entity.speed || 280;
            if (entity.x < tx - 10) entity.vx = Math.min(speedCap, (entity.vx || 0) + 900 * dt);
            else if (entity.x > tx + 10) entity.vx = Math.max(-speedCap, (entity.vx || 0) - 900 * dt);
        }
    }

    // Hard clamp at the rock surface so nothing tunnels through.
    if (entity.y + (entity.h || 0) > groundY) {
        entity.y = groundY - (entity.h || 0);
        if (entity.vy > 0) entity.vy = 0;
    }
}

// Clamp upward motion at the invisible ceiling.
function _clampCeiling(entity) {
    if (entity.y < WORLD_CEILING_Y) {
        entity.y = WORLD_CEILING_Y;
        if (entity.vy < 0) entity.vy = 0;
    }
}

// --- GLOBAL ASSET LOADER ---
export const Assets = {
    tilesetNormal: new Image(), tilesetWinter: new Image(),
    treeNormal: new Image(), treeWinter: new Image(),
    grass: new Image(),
    teepeeGreen: new Image(), teepeeBlue: new Image(),
    fire: new Image(), leaf: new Image(),
    playerGreen: new Image(), playerBlue: new Image(),
    pig: new Image(),
    villagerGreen: [], villagerBlue: [],
    warriorGreen: new Image(), warriorBlue: new Image(),
    projectile: new Image(), totem: new Image(),
    // Step 4 — Priests + Tokobus only ship a green source. Every other team's
    // version is derived at runtime by hue rotation (see PRIEST_TOKOBU_HUE).
    priestGreen: new Image(),
    tokobuGreen: [],
    heads: []  // populated below from the player-heads-to-randomly-select folder
};

Assets.tilesetNormal.src = 'assets/environment/island_tileset.png';
Assets.tilesetWinter.src = 'assets/environment/island_tileset_winter.png';
Assets.treeNormal.src = 'assets/environment/tree_variant1.png';
Assets.treeWinter.src = 'assets/environment/tree_variant1_winter.png';
Assets.grass.src = 'assets/environment/grass.png';
Assets.teepeeGreen.src = 'assets/environment/teepee_green.png';
Assets.teepeeBlue.src = 'assets/environment/teepee_blue.png';
Assets.fire.src = 'assets/environment/fireplace_lit.png';
Assets.leaf.src = 'assets/environment/leaf.png';
Assets.totem.src = 'assets/environment/totem.png';
Assets.playerGreen.src = 'assets/sprites/player_green.png';
Assets.playerBlue.src = 'assets/sprites/player_blue.png';
Assets.pig.src = 'assets/sprites/pig.png';
Assets.warriorGreen.src = 'assets/sprites/warrior_green.png';
Assets.warriorBlue.src = 'assets/sprites/warrior_blue.png';
Assets.projectile.src = 'assets/sprites/projectile_arrow.png';
Assets.priestGreen.src = 'assets/sprites/hooded_mystic.png';

for (let i = 1; i <= 4; i++) {
    let vG = new Image(); vG.src = `assets/sprites/villager_green_${i}.png`;
    Assets.villagerGreen.push(vG);
    let vB = new Image(); vB.src = `assets/sprites/villager_blue_${i}.png`;
    Assets.villagerBlue.push(vB);
}

for (let i = 1; i <= 2; i++) {
    const t = new Image();
    t.src = `assets/sprites/Tokobu-green-${i}.png`;
    Assets.tokobuGreen.push(t);
}

// === FOUR-TEAM PALETTE ===
// The two source tribes (green, blue) ship as pre-painted sprites.
// Yellow is derived from green at runtime via a hue rotation; red from blue.
// This keeps the asset pipeline cheap while doubling the tribe count.
export const TEAMS = ['green', 'blue', 'yellow', 'red'];
export const TEAM_PALETTE = {
    green:  { display: 'GREEN',  hex: '#5fc070', light: '#9ce088', particle: '#90EE90', aura: '80,255,120',  glowSoft: '0,255,0',   chiefIs: 'player' },
    blue:   { display: 'BLUE',   hex: '#5fa0c0', light: '#9cc8ee', particle: '#ADD8E6', aura: '80,180,255',  glowSoft: '0,150,255', chiefIs: 'enemy'  },
    yellow: { display: 'YELLOW', hex: '#e6c044', light: '#ffe080', particle: '#FFE39C', aura: '255,210,80',  glowSoft: '255,200,0', chiefIs: null     },
    red:    { display: 'RED',    hex: '#c04444', light: '#ee8888', particle: '#FF8888', aura: '255,90,90',   glowSoft: '255,40,40', chiefIs: null     },
};
// Hue rotations (in degrees) applied to the GREEN sprite to get YELLOW
// and to the BLUE sprite to get RED. Empirical values that read clearly.
const TEAM_HUE_FROM = {
    yellow: { source: 'green', deg: -55 },
    red:    { source: 'blue',  deg: 130 },
};

// Per-team sprite map. The two source teams point at the existing assets;
// derived teams get filled in once their source images decode.
//
// Priest + Tokobu slots: green is the only native source for these. Every
// other team's variant is hue-rotated from the green source (see
// PRIEST_TOKOBU_HUE below) so the four tribes still read distinctly.
Assets.byTeam = {
    green:  { player: Assets.playerGreen, warrior: Assets.warriorGreen, villagers: Assets.villagerGreen, teepee: Assets.teepeeGreen, priest: Assets.priestGreen, tokobu: Assets.tokobuGreen },
    blue:   { player: Assets.playerBlue,  warrior: Assets.warriorBlue,  villagers: Assets.villagerBlue,  teepee: Assets.teepeeBlue,  priest: null,               tokobu: [null, null] },
    yellow: { player: null, warrior: null, villagers: [null, null, null, null], teepee: null, priest: null, tokobu: [null, null] },
    red:    { player: null, warrior: null, villagers: [null, null, null, null], teepee: null, priest: null, tokobu: [null, null] },
};

function _tintImage(srcImg, hueDeg) {
    if (!srcImg || !(srcImg.complete && srcImg.naturalWidth > 0)) return null;
    const c = document.createElement('canvas');
    c.width = srcImg.naturalWidth;
    c.height = srcImg.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.filter = `hue-rotate(${hueDeg}deg) saturate(1.15)`;
    ctx.drawImage(srcImg, 0, 0);
    // Mark canvas as "complete" so imgReady-style checks pass — drawImage
    // accepts canvases directly.
    c.complete = true;
    c.naturalWidth = c.width;
    return c;
}

function _onSourceLoad(img, cb) {
    if (img.complete && img.naturalWidth > 0) { cb(); return; }
    img.addEventListener('load', cb);
}

// Wire up derived team sprites. Each fires once its source image is decoded.
for (const team of ['yellow', 'red']) {
    const meta = TEAM_HUE_FROM[team];
    const src = Assets.byTeam[meta.source];
    _onSourceLoad(src.player,  () => { Assets.byTeam[team].player  = _tintImage(src.player,  meta.deg); });
    _onSourceLoad(src.warrior, () => { Assets.byTeam[team].warrior = _tintImage(src.warrior, meta.deg); });
    _onSourceLoad(src.teepee,  () => { Assets.byTeam[team].teepee  = _tintImage(src.teepee,  meta.deg); });
    src.villagers.forEach((vimg, idx) => {
        _onSourceLoad(vimg, () => { Assets.byTeam[team].villagers[idx] = _tintImage(vimg, meta.deg); });
    });
}

// Priest + Tokobu hue rotations applied to the GREEN source for every other
// team. Blue gets a fresh angle (no native blue art exists for these units);
// yellow and red mirror the villager rotations so the four tribes feel
// chromatically consistent across all unit types.
const PRIEST_TOKOBU_HUE = {
    blue:   180,
    yellow: -55,
    red:    130,
};
for (const team of ['blue', 'yellow', 'red']) {
    const deg = PRIEST_TOKOBU_HUE[team];
    _onSourceLoad(Assets.priestGreen, () => {
        Assets.byTeam[team].priest = _tintImage(Assets.priestGreen, deg);
    });
    Assets.tokobuGreen.forEach((tImg, idx) => {
        _onSourceLoad(tImg, () => {
            Assets.byTeam[team].tokobu[idx] = _tintImage(tImg, deg);
        });
    });
}

export function teamSprite(slot, team, variantIdx) {
    const bucket = Assets.byTeam[team];
    if (!bucket) return null;
    if (slot === 'villagers') return bucket.villagers[variantIdx % bucket.villagers.length] || bucket.villagers[0];
    if (slot === 'tokobu')    return bucket.tokobu ? (bucket.tokobu[variantIdx % bucket.tokobu.length] || bucket.tokobu[0]) : null;
    return bucket[slot];
}

export function teamColor(team, channel) {
    const p = TEAM_PALETTE[team] || TEAM_PALETTE.green;
    return p[channel] || p.hex;
}

// Mystic head pool — every chief is crowned by a random spirit head.
const HEAD_FILES = [
    'air_heads_3.png', 'air_heads_4.png', 'air_heads_5.png',
    'air_heads_6.png', 'air_heads_8.png', 'air_heads_9.png',
    'fire_heads_1.png', 'fire_heads_2.png', 'fire_heads_3.png',
    'fire_heads_4.png', 'fire_heads_5.png', 'fire_heads_6.png',
    'fire_heads_7.png', 'fire_heads_8.png', 'fire_heads_9.png',
    'water_heads_1.png', 'water_heads_2.png', 'water_heads_4.png',
    'water_heads_5.png', 'water_heads_6.png', 'water_heads_7.png'
];
for (let i = 0; i < HEAD_FILES.length; i++) {
    const im = new Image();
    im.src = `assets/sprites/player-heads-to-randomly-select/${HEAD_FILES[i]}`;
    // Each head carries an element tag for tinting on aura/halo
    const el = HEAD_FILES[i].split('_')[0]; // 'air', 'fire', 'water'
    im._element = el;
    Assets.heads.push(im);
}

// Walk every Image in Assets and report ready / total counts.
// Used by the loading screen to show real progress.
export function getAssetProgress() {
    let ready = 0, total = 0;
    const check = (im) => {
        if (!im) return;
        total++;
        if (im.complete && im.naturalWidth > 0) ready++;
    };
    check(Assets.tilesetNormal); check(Assets.tilesetWinter);
    check(Assets.treeNormal);    check(Assets.treeWinter);
    check(Assets.grass);
    check(Assets.teepeeGreen);   check(Assets.teepeeBlue);
    check(Assets.fire);          check(Assets.leaf);
    check(Assets.totem);
    check(Assets.playerGreen);   check(Assets.playerBlue);
    check(Assets.pig);
    check(Assets.warriorGreen);  check(Assets.warriorBlue);
    check(Assets.projectile);
    check(Assets.priestGreen);
    Assets.villagerGreen.forEach(check);
    Assets.villagerBlue.forEach(check);
    Assets.tokobuGreen.forEach(check);
    Assets.heads.forEach(check);
    return { ready, total };
}

// --- HELPERS ---
function imgReady(img) {
    return img && img.complete && img.naturalWidth > 0;
}

function drawShadow(ctx, x, y, w) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y, w * 0.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
}

// --- PARTICLE POOL ---
const PARTICLE_POOL_SIZE = 600;
const particlePool = [];
let activeParticles = [];

class PooledParticle {
    constructor() { this.reset(); }
    reset() {
        this.x = 0; this.y = 0;
        this.vx = 0; this.vy = 0;
        this.life = 0; this.maxLife = 0;
        this.size = 4; this.color = '#ff0000';
        this.type = 'normal'; // 'normal', 'trail', 'glow'
        this.active = false;
        this.gravity = 400;
    }
}

// Pre-allocate pool
for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
    particlePool.push(new PooledParticle());
}

export function spawnParticle(x, y, color, speed, life, size, type) {
    // Find inactive particle
    for (let i = 0; i < particlePool.length; i++) {
        const p = particlePool[i];
        if (!p.active) {
            p.active = true;
            p.x = x; p.y = y;
            p.color = color || '#cc0000';
            p.life = life || 0.5;
            p.maxLife = p.life;
            p.size = (size || 5) * 1.5;
            p.type = type || 'normal';
            if (type === 'trail') {
                p.vx = (Math.random() - 0.5) * 10;
                p.vy = (Math.random() - 0.5) * 10;
                p.gravity = 0;
            } else if (type === 'glow') {
                const a = Math.random() * Math.PI * 2;
                p.vx = Math.cos(a) * (speed || 50);
                p.vy = Math.sin(a) * (speed || 50) - 30;
                p.gravity = 100;
            } else {
                const a = Math.random() * Math.PI * 2;
                p.vx = Math.cos(a) * (speed || 100);
                p.vy = Math.sin(a) * (speed || 100) - 50;
                p.gravity = 400;
            }
            activeParticles.push(p);
            return p;
        }
    }
    return null;
}

export function spawnBlood(x, y, color, count) {
    const c = Math.min(count || 20, 30);
    for (let i = 0; i < c; i++) {
        spawnParticle(x, y, color || '#cc0000', 80 + Math.random() * 80, 0.4 + Math.random() * 0.4, 4 + Math.random() * 5, 'normal');
    }
}

export function updateParticles(dt) {
    for (let i = activeParticles.length - 1; i >= 0; i--) {
        const p = activeParticles[i];
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) {
            p.active = false;
            p.reset();
            activeParticles[i] = activeParticles[activeParticles.length - 1];
            activeParticles.pop();
        }
    }
}

export function drawParticles(ctx, camera) {
    // Group draws by composite mode to minimise state changes.
    let inLighter = false;
    for (let i = 0; i < activeParticles.length; i++) {
        const p = activeParticles[i];
        const sx = p.x - camera.x;
        const sy = p.y - camera.y;
        if (sx < -50 || sx > camera.effectiveW + 50) continue;

        const alpha = p.life / p.maxLife;
        if (p.type === 'glow') {
            if (!inLighter) { ctx.globalCompositeOperation = 'lighter'; inLighter = true; }
            // Soft outer halo + bright core (two passes of the same arc)
            ctx.globalAlpha = alpha * 0.35;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(sx, sy, p.size * 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = alpha * 0.85;
            ctx.beginPath();
            ctx.arc(sx, sy, p.size * 0.9, 0, Math.PI * 2);
            ctx.fill();
        } else if (p.type === 'trail') {
            if (inLighter) { ctx.globalCompositeOperation = 'source-over'; inLighter = false; }
            ctx.globalAlpha = alpha * 0.7;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(sx, sy, p.size * 0.5, 0, Math.PI * 2);
            ctx.fill();
        } else {
            if (inLighter) { ctx.globalCompositeOperation = 'source-over'; inLighter = false; }
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.fillRect(sx - p.size * 0.5, sy - p.size * 0.5, p.size, p.size);
        }
    }
    if (inLighter) ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
}

export function getActiveParticleCount() { return activeParticles.length; }

// --- BASE CLASS ---
export class Entity {
    constructor(x, y, w, h) {
        this.x = x; this.y = y;
        this.w = w; this.h = h;
        this.dead = false;
    }

    drawSprite(ctx, img, sx, sy, w, h) {
        if (imgReady(img)) ctx.drawImage(img, sx, sy, w, h);
    }
}

// --- ISLAND (2.5D Floating) ---
export class Island extends Entity {
    constructor(x, y, w, h, team) {
        super(x, y, w, h);
        this.team = team;
        this.activeTileset = Assets.tilesetNormal;
        this.activeTree = Assets.treeNormal;

        this.hasTeepee = true;
        this.hasFireplace = Math.random() > 0.4;
        this.conversionTimer = 0;

        // 2.5D depth (visible underside) - MASSIVE floating rocks
        this.depth = 140 + Math.random() * 120;

        // Procedural rocky bottom edge
        this.rockPoints = [];
        const segments = Math.max(5, Math.floor(w / 35));
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const baseDepth = this.depth * (1 - Math.pow(2 * t - 1, 4));
            this.rockPoints.push({
                x: t * w,
                y: baseDepth * (0.6 + Math.random() * 0.4) + (Math.random() - 0.5) * 12
            });
        }

        // Hanging roots/vines drape from the underside lip into the void.
        // Pre-built so they're stable across frames.
        this.roots = [];
        const numRoots = 3 + Math.floor(w / 80);
        for (let i = 0; i < numRoots; i++) {
            this.roots.push({
                x: 30 + Math.random() * (w - 60),
                len: 30 + Math.random() * 60,
                sway: Math.random() * Math.PI * 2,
                thick: 1.5 + Math.random() * 1.6
            });
        }
        // Mossy patches on the underside top edge for cohesion with grass
        this.mossPatches = [];
        const numMoss = 3 + Math.floor(w / 90);
        for (let i = 0; i < numMoss; i++) {
            this.mossPatches.push({
                x: Math.random() * w,
                w: 30 + Math.random() * 50,
                drop: 4 + Math.random() * 12
            });
        }
        // Embedded rock chunks in the underside for pixel-art-friendly texture
        this.rockChunks = [];
        const numChunks = 4 + Math.floor(w / 50);
        for (let i = 0; i < numChunks; i++) {
            this.rockChunks.push({
                x: Math.random() * w,
                y: 0.15 + Math.random() * 0.55,   // 0..1 down the depth
                r: 4 + Math.random() * 9,
                shade: -10 + Math.random() * 20
            });
        }

        // Trees - split into background and foreground layers
        // BG trees: normal game-layer trees behind entities
        // FG trees: a touch bigger, drawn OVER entities for Silksong depth.
        // Rare so they accent rather than crowd the scene.
        this.trees = [];
        const numTrees = 3 + Math.floor(Math.random() * (w / 60));
        for (let i = 0; i < numTrees; i++) {
            const xPos = 20 + Math.random() * (w - 80);
            const edgeDist = Math.min(xPos, w - xPos) / w;
            // Edge trees can be foreground — but sparingly so the action stays readable.
            const isFg = edgeDist < 0.18 ? Math.random() < 0.35 : Math.random() < 0.04;
            this.trees.push({
                x: xPos,
                // FG trees a touch larger to suggest closer-to-camera; not dominating.
                scale: isFg ? (1.05 + Math.random() * 0.45) : (1.0 + Math.random() * 1.2),
                burnt: false, burntTimer: 0,
                layer: isFg ? 'fg' : 'bg'
            });
        }

        // Background grass patches (drawn with island)
        this.grassPatches = [];
        const numGrass = 3 + Math.floor(Math.random() * (w / 40));
        for (let i = 0; i < numGrass; i++) {
            this.grassPatches.push({
                x: Math.random() * (w - 40),
                scale: 1.0 + Math.random() * 1.0
            });
        }

        // Foreground grass tufts (drawn over entities - big, lush)
        this.fgGrass = [];
        const numFgGrass = 2 + Math.floor(Math.random() * (w / 80));
        for (let i = 0; i < numFgGrass; i++) {
            this.fgGrass.push({
                x: Math.random() * (w - 50),
                scale: 1.5 + Math.random() * 1.5,
                flip: Math.random() > 0.5
            });
        }

        this.vx = 0; this.vy = 0;
        this.friction = 0.92;
        this.mass = w * h;
        // Per-team population on this island (used by main.js totem logic).
        this.greenCount = 0; this.blueCount = 0;
        this.yellowCount = 0; this.redCount = 0;

        // Pre-built underside path for rendering efficiency
        this._undersidePath = null;
    }

    setSeason(isWinter) {
        this.activeTileset = isWinter ? Assets.tilesetWinter : Assets.tilesetNormal;
        this.activeTree = isWinter ? Assets.treeWinter : Assets.treeNormal;
    }

    update(dt, player, enemyChief, audio) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx *= this.friction;
        this.vy *= this.friction;

        // Heal burnt trees
        for (let i = 0; i < this.trees.length; i++) {
            const t = this.trees[i];
            if (t.burnt) {
                t.burntTimer -= dt;
                if (t.burntTimer <= 0) t.burnt = false;
            }
        }

        if (this.conversionTimer > 0) {
            this.conversionTimer -= dt;
            return;
        }

        // Territory conversion — any chief whose team isn't already this island's
        // is close enough to its teepee will flip the island. Generalised across
        // all four tribes via the chiefs array passed in by the game loop.
        if (this.hasTeepee) {
            const tentX = this.x + this.w * 0.5;
            const tentY = this.y - 30;
            const range = 150;
            const chiefs = (player && player._allChiefs) ? player._allChiefs : null;
            const list = chiefs || [player, enemyChief].filter(Boolean);
            for (let ci = 0; ci < list.length; ci++) {
                const chief = list[ci];
                if (!chief || chief.dead) continue;
                const dx = (chief.x + 20) - tentX;
                const dy = (chief.y + 20) - tentY;
                if (dx * dx + dy * dy < range * range && this.team !== chief.team) {
                    this.team = chief.team;
                    this.conversionTimer = 2.0;
                    if (audio) audio.play('teepee', 0.6, 0.1);
                    break;
                }
            }
        }
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h + this.depth);
        if (!rect.onScreen) return;

        const sx = rect.x;
        const sy = rect.y;
        const w = this.w;
        const h = this.h;
        const dep = this.depth;

        // === 2.5D FLOATING ISLAND RENDERING ===

        // The crust is the part the tileset paints (roughly the top quarter
        // of the island block). The rocky underside picks up directly from
        // the bottom of that crust so there is no visible seam.
        const crustH = Math.min(h, 28);              // visible "earth" height shown above
        const undersideTop = sy + crustH - 2;        // slight overlap upward to kill any gap

        // 1. Drop shadow (projected below the island)
        ctx.fillStyle = 'rgba(0,0,0,0.10)';
        ctx.beginPath();
        ctx.ellipse(sx + w * 0.5, undersideTop + dep + 45, w * 0.48, 18, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. Rocky underside — palette tuned to match the painted tileset above.
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(sx, undersideTop);
        for (let i = 0; i < this.rockPoints.length; i++) {
            const rp = this.rockPoints[i];
            ctx.lineTo(sx + rp.x, undersideTop + rp.y);
        }
        ctx.lineTo(sx + w, undersideTop);
        ctx.closePath();
        ctx.clip(); // clip subsequent fills to underside silhouette

        const underTopY = undersideTop;
        const underBotY = undersideTop + dep;
        const underGrad = ctx.createLinearGradient(0, underTopY, 0, underBotY);
        // Mossy crust at top fading through warm earth, cool stone, into deep void.
        underGrad.addColorStop(0.00, '#5d6e2a');   // mossy green crust
        underGrad.addColorStop(0.10, '#6a4a23');   // warm earth
        underGrad.addColorStop(0.35, '#4b3018');   // mid earth
        underGrad.addColorStop(0.65, '#2a1c10');   // deep stone
        underGrad.addColorStop(1.00, '#0c0604');   // void
        ctx.fillStyle = underGrad;
        ctx.fillRect(sx, underTopY, w, dep + 4);

        // Strata bands (subtle horizontal layering — geological feel)
        for (let b = 0; b < 3; b++) {
            const bandY = underTopY + dep * (0.18 + b * 0.22);
            ctx.fillStyle = `rgba(20,12,5,${0.10 + b * 0.04})`;
            ctx.fillRect(sx, bandY, w, 2 + b);
        }

        // Embedded rock chunks (pixel-friendly painterly stones)
        for (let i = 0; i < this.rockChunks.length; i++) {
            const rc = this.rockChunks[i];
            const cx = sx + rc.x;
            const cy = underTopY + dep * rc.y;
            const baseShade = 60 + rc.shade;
            ctx.fillStyle = `rgb(${baseShade},${baseShade - 8},${baseShade - 16})`;
            ctx.beginPath();
            ctx.arc(cx, cy, rc.r, 0, Math.PI * 2);
            ctx.fill();
            // Highlight on top
            ctx.fillStyle = `rgba(255,220,180,0.18)`;
            ctx.beginPath();
            ctx.arc(cx - rc.r * 0.25, cy - rc.r * 0.3, rc.r * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }

        // Soft inner shadow on the inside of the underside silhouette
        const rim = ctx.createLinearGradient(0, underTopY, 0, underTopY + 18);
        rim.addColorStop(0, 'rgba(0,0,0,0.0)');
        rim.addColorStop(1, 'rgba(0,0,0,0.0)');
        ctx.fillStyle = rim;
        ctx.fillRect(sx, underTopY, w, dep);
        ctx.restore();

        // Underside silhouette outline (very subtle — just enough to read)
        ctx.beginPath();
        ctx.moveTo(sx, undersideTop);
        for (let i = 0; i < this.rockPoints.length; i++) {
            const rp = this.rockPoints[i];
            ctx.lineTo(sx + rp.x, undersideTop + rp.y);
        }
        ctx.lineTo(sx + w, undersideTop);
        ctx.strokeStyle = 'rgba(40,24,12,0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Mossy patches drooping over the underside lip — softens the seam
        // between tileset top and procedural underside.
        for (let i = 0; i < this.mossPatches.length; i++) {
            const m = this.mossPatches[i];
            const mx = sx + m.x;
            const my = undersideTop;
            const grad = ctx.createLinearGradient(0, my - 2, 0, my + m.drop);
            grad.addColorStop(0, 'rgba(74,110,40,0.95)');
            grad.addColorStop(0.6, 'rgba(58,86,28,0.65)');
            grad.addColorStop(1, 'rgba(40,60,18,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(mx, my - 2);
            ctx.bezierCurveTo(mx + m.w * 0.25, my + m.drop * 0.4, mx + m.w * 0.55, my + m.drop, mx + m.w * 0.5, my + m.drop);
            ctx.bezierCurveTo(mx + m.w * 0.55, my + m.drop * 0.6, mx + m.w * 0.85, my + m.drop * 0.4, mx + m.w, my - 2);
            ctx.closePath();
            ctx.fill();
        }

        // Hanging roots — subtle sway via Date.now()
        const time = Date.now() * 0.001;
        for (let i = 0; i < this.roots.length; i++) {
            const r = this.roots[i];
            const baseX = sx + r.x;
            const baseY = undersideTop + 2;
            const swayX = Math.sin(time * 0.6 + r.sway) * 4;
            const tipX = baseX + swayX;
            const tipY = baseY + r.len;
            const grad = ctx.createLinearGradient(0, baseY, 0, tipY);
            grad.addColorStop(0, 'rgba(60,42,22,0.85)');
            grad.addColorStop(1, 'rgba(40,28,14,0.0)');
            ctx.strokeStyle = grad;
            ctx.lineWidth = r.thick;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(baseX, baseY);
            ctx.quadraticCurveTo(baseX + swayX * 0.5, baseY + r.len * 0.5, tipX, tipY);
            ctx.stroke();
        }

        // 3. Tileset overlay on top surface (drawn AFTER underside so the painted
        // crust covers any seam and the colour transition reads as one piece).
        if (imgReady(this.activeTileset)) {
            const sliceW = Math.floor(this.activeTileset.width / 3);
            const sliceH = this.activeTileset.height;
            ctx.drawImage(this.activeTileset, 0, 0, sliceW, sliceH, sx, sy - 2, sliceW, crustH + 4);
            const rightX = sx + w - sliceW;
            const midW = rightX - (sx + sliceW);
            if (midW > 0) {
                ctx.drawImage(this.activeTileset, sliceW, 0, sliceW, sliceH, sx + sliceW, sy - 2, midW + 2, crustH + 4);
            }
            ctx.drawImage(this.activeTileset, sliceW * 2, 0, sliceW, sliceH, rightX, sy - 2, sliceW, crustH + 4);
        } else {
            // Fallback painted crust if tileset isn't ready
            const sideH = crustH;
            const sideGrad = ctx.createLinearGradient(0, sy, 0, sy + sideH);
            sideGrad.addColorStop(0, '#5a8c3a');
            sideGrad.addColorStop(0.3, '#7a5c3a');
            sideGrad.addColorStop(1, '#6b4226');
            ctx.fillStyle = sideGrad;
            ctx.fillRect(sx, sy, w, sideH);
        }

        // Top grass surface band — sits ON TOP of the tileset for that crisp
        // emerald edge, team-tinted.
        const topGrad = ctx.createLinearGradient(0, sy - 4, 0, sy + 6);
        const _grassTints = {
            green:  ['#4CAF50', '#2E7D32'],
            blue:   ['#42A5F5', '#1565C0'],
            yellow: ['#F5C842', '#C09015'],
            red:    ['#E5524C', '#A01F1F'],
            neutral:['#66BB6A', '#558B2F'],
        };
        const _gt = _grassTints[this.team] || _grassTints.neutral;
        topGrad.addColorStop(0, _gt[0]);
        topGrad.addColorStop(1, _gt[1]);
        ctx.fillStyle = topGrad;
        ctx.fillRect(sx, sy - 3, w, 6);

        // 4. Grass sprites on top edge (lush, big)
        if (imgReady(Assets.grass)) {
            for (let i = 0; i < this.grassPatches.length; i++) {
                const g = this.grassPatches[i];
                const gw = 56 * g.scale;
                const gh = 56 * g.scale;
                ctx.drawImage(Assets.grass, sx + g.x, sy - (40 * g.scale), gw, gh);
            }
        }

        // 5. Background trees only (foreground trees rendered later via drawForeground)
        // Trees anchor by the bottom of their sprite so the trunk meets the
        // island surface no matter how large the tree is scaled. A tiny fixed
        // overlap plants the root flare into the grass without poking through
        // the island's underside.
        if (imgReady(this.activeTree)) {
            const TREE_PLANT_OVERLAP = 6;
            for (let i = 0; i < this.trees.length; i++) {
                const tree = this.trees[i];
                if (tree.layer === 'fg') continue;

                const tw = 200 * tree.scale;
                const th = 260 * tree.scale;
                const treeY = sy + TREE_PLANT_OVERLAP - th;

                if (tree.burnt) {
                    ctx.globalAlpha = 0.4;
                }

                // Tree shadow
                ctx.fillStyle = 'rgba(0,0,0,0.12)';
                ctx.beginPath();
                ctx.ellipse(sx + tree.x + tw * 0.4, sy - 2, tw * 0.3, 8, 0, 0, Math.PI * 2);
                ctx.fill();

                ctx.drawImage(this.activeTree, sx + tree.x, treeY, tw, th);
                ctx.globalAlpha = 1;
            }
        }

        // 6. Teepee (massive structure - people look tiny next to it)
        const teepeeImg = teamSprite('teepee', this.team);
        if (imgReady(teepeeImg)) {
            const tpW = 200;
            const tpH = 200;
            const tpX = sx + w * 0.3 - tpW * 0.5;
            const tpY = sy - tpH + 20;
            // Teepee shadow
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.beginPath();
            ctx.ellipse(tpX + tpW * 0.5, sy - 2, tpW * 0.38, 9, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.drawImage(teepeeImg, tpX, tpY, tpW, tpH);
        }

        // 7. Fire with glow (large campfire)
        if (this.hasFireplace && imgReady(Assets.fire)) {
            const fireW = 150;
            const fireH = 150;
            const fx = sx + w * 0.55 - fireW * 0.5;
            const fy = sy - fireH + 36;

            // Daytime base glow (subtle — the dramatic illumination is in
            // drawFireGlow, which fires only at night)
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = 'rgba(255,140,40,0.12)';
            ctx.beginPath();
            ctx.arc(fx + fireW * 0.5, fy + fireH * 0.4, 90, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';

            ctx.drawImage(Assets.fire, fx, fy, fireW, fireH);

            // Cache fire centre in world coords so drawFireGlow doesn't have
            // to recompute it.
            this._fireWorldX = this.x + w * 0.55;
            this._fireWorldY = this.y - fireH + 36 + fireH * 0.4;
        }

        // Territory border glow — every owned tribe shows a faint band of its colour.
        if (TEAM_PALETTE[this.team]) {
            ctx.fillStyle = `rgba(${TEAM_PALETTE[this.team].glowSoft},0.08)`;
            ctx.fillRect(sx - 2, sy - 5, w + 4, 10);
        }
    }

    // Warm volumetric fire-light pass — only contributes at night so days
    // stay clean. Uses additive blending for a true illumination feel.
    drawFireGlow(ctx, camera, nightIntensity) {
        if (!this.hasFireplace || nightIntensity <= 0.05) return;
        if (this._fireWorldX === undefined) return; // not yet drawn this frame
        const rect = camera.getScreenRect(this._fireWorldX, this._fireWorldY, 0, 0);
        if (!rect.onScreen) return;

        const fx = rect.x;
        const fy = rect.y;
        const t = Date.now() * 0.001;
        // Two-axis flicker for organic warmth
        const flicker = 1 + (Math.sin(t * 7 + this.x * 0.013) * 0.07 + Math.sin(t * 11 + this.y * 0.017) * 0.05);
        const r = (220 + 80 * flicker) * (0.6 + nightIntensity * 0.6);

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // Outer warm wash — the throw of the fire onto the surrounding scene
        const g1 = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
        g1.addColorStop(0.00, `rgba(255,170,70,${0.42 * nightIntensity})`);
        g1.addColorStop(0.35, `rgba(255,120,40,${0.20 * nightIntensity})`);
        g1.addColorStop(0.70, `rgba(180,60,20,${0.06 * nightIntensity})`);
        g1.addColorStop(1.00, 'rgba(160,40,0,0)');
        ctx.fillStyle = g1;
        ctx.fillRect(fx - r, fy - r, r * 2, r * 2);

        // Hot centre — bright core
        const cr = 70 * flicker;
        const g2 = ctx.createRadialGradient(fx, fy, 0, fx, fy, cr);
        g2.addColorStop(0.00, `rgba(255,240,200,${0.65 * nightIntensity})`);
        g2.addColorStop(0.45, `rgba(255,180,90,${0.30 * nightIntensity})`);
        g2.addColorStop(1.00, 'rgba(255,140,40,0)');
        ctx.fillStyle = g2;
        ctx.fillRect(fx - cr, fy - cr, cr * 2, cr * 2);

        // Occasional ember spark released upward
        if (Math.random() < 0.35 * nightIntensity) {
            spawnParticle(
                this._fireWorldX + (Math.random() - 0.5) * 30,
                this._fireWorldY - 20,
                Math.random() < 0.5 ? '#FFD27A' : '#FF8030',
                40 + Math.random() * 30,
                0.6 + Math.random() * 0.6,
                1.5 + Math.random() * 2,
                'glow'
            );
        }

        ctx.restore();
    }

    // Silksong-style foreground layer: trees & grass rendered OVER entities
    // FG trees are bigger (closer to camera = larger), with a dark tint
    // to create that silhouette depth effect. Smart transparency near player.
    drawForeground(ctx, camera, playerSX, playerSY) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h + this.depth);
        if (!rect.onScreen) return;

        const sx = rect.x;
        const sy = rect.y;

        // Solids must read SOLID. Instead of permanently translucent
        // foreground props, draw them at full opacity but skip the ones
        // close enough to the player that they'd occlude. The result is
        // crisp tree silhouettes that simply move out of the way when the
        // player passes through their footprint.
        const occludeRadius = 110; // px on screen — props within this skip
        function shouldDraw(elScreenX, elScreenY) {
            const dx = elScreenX - playerSX;
            const dy = elScreenY - playerSY;
            return (dx * dx + dy * dy) > occludeRadius * occludeRadius;
        }

        // Foreground trees — opaque at distance, vanish near the player.
        if (imgReady(this.activeTree)) {
            const TREE_PLANT_OVERLAP = 6;
            for (let i = 0; i < this.trees.length; i++) {
                const tree = this.trees[i];
                if (tree.layer !== 'fg') continue;

                const tw = 200 * tree.scale;
                const th = 260 * tree.scale;
                const treeX = sx + tree.x;
                const treeY = sy + TREE_PLANT_OVERLAP - th;
                const treeCX = treeX + tw * 0.4;
                const treeCY = treeY + th * 0.5;

                if (!shouldDraw(treeCX, treeCY)) continue;

                if (tree.burnt) {
                    // Burnt is the only allowed FG transparency — reads as a
                    // ghostly scorched silhouette, deliberately not solid.
                    ctx.globalAlpha = 0.4;
                    ctx.drawImage(this.activeTree, treeX, treeY, tw, th);
                    ctx.globalAlpha = 1;
                } else {
                    ctx.drawImage(this.activeTree, treeX, treeY, tw, th);
                }
            }
        }

        // Foreground tall grass tufts — opaque at distance, vanish near player.
        if (imgReady(Assets.grass)) {
            for (let i = 0; i < this.fgGrass.length; i++) {
                const g = this.fgGrass[i];
                const gw = 70 * g.scale;
                const gh = 70 * g.scale;
                const gx = sx + g.x;
                const gy = sy - (48 * g.scale);
                const gcx = gx + gw * 0.5;
                const gcy = gy + gh * 0.5;

                if (!shouldDraw(gcx, gcy)) continue;

                if (g.flip) {
                    ctx.save();
                    ctx.translate(gx + gw, gy);
                    ctx.scale(-1, 1);
                    ctx.drawImage(Assets.grass, 0, 0, gw, gh);
                    ctx.restore();
                } else {
                    ctx.drawImage(Assets.grass, gx, gy, gw, gh);
                }
            }
        }
    }
}

// --- PLAYER / CHIEF ---
export class Player extends Entity {
    constructor(x, y, team) {
        super(x, y, 40, 40);
        this.team = team;
        this.vx = 0; this.vy = 0;
        this.hp = 100; this.maxHp = 100;

        this.speed = 450;
        this.acceleration = 3000;
        this.friction = 0.85;
        this.gravity = 800;
        this.maxFallSpeed = 1000;
        this.jumpForce = -600;
        this.flyForce = -500;

        this.isGrounded = false;
        this.hpRegenTimer = 0;
        this.fireCooldown = 0;
        this.visitedIslands = new Set();
        this.respawnTimer = 8.0;

        // AI (enemy chief)
        this.mana = 100; this.maxMana = 100;
        this.aiTargetIsland = null;
        this.aiStateTimer = 0;

        // === COSMETIC ===
        // Each chief is crowned with a random spirit head (mystic theme)
        this.headIdx = Math.floor(Math.random() * Math.max(1, Assets.heads.length));
        this.bobPhase = Math.random() * Math.PI * 2;
        this.flyTrailTimer = 0;
        this._lastVy = 0;
        this._squash = 1.0;       // 1.0 = neutral, <1 = flat, >1 = stretched
    }

    update(dt, input, resources, worldWidth, worldHeight, islands, audio, enemy, walls) {
        if (this.dead || dt <= 0) return false;

        // HP regen
        if (this.hp < this.maxHp) {
            this.hpRegenTimer += dt;
            if (this.hpRegenTimer > 2.0) { this.hp++; this.hpRegenTimer = 0; }
        }

        this.fireCooldown -= dt;

        let moving = false;
        let wantJump = false;

        if (this.team === 'green' && input) {
            if (input.keys.a) { this.vx -= this.acceleration * dt; moving = true; }
            if (input.keys.d) { this.vx += this.acceleration * dt; moving = true; }
            if (input.keys.space || input.keys.w) wantJump = true;
            if (input.keys.s) this.vy += 2000 * dt;
        } else {
            // Every non-player chief (blue, yellow, red) runs the same wandering
            // AI: pick a non-friendly island and beeline toward it, then pick a
            // new one when the timer expires.
            moving = true;
            this.aiStateTimer -= dt;
            if (!this.aiTargetIsland || this.aiStateTimer <= 0) {
                this.aiStateTimer = 5 + Math.random() * 5;
                const targets = islands.filter(i => i.team !== this.team);
                this.aiTargetIsland = targets.length > 0
                    ? targets[Math.floor(Math.random() * targets.length)]
                    : islands[Math.floor(Math.random() * islands.length)];
            }
            if (this.aiTargetIsland) {
                const tx = this.aiTargetIsland.x + this.aiTargetIsland.w * 0.5;
                if (this.x < tx - 50) this.vx += this.acceleration * dt;
                else if (this.x > tx + 50) this.vx -= this.acceleration * dt;
                if (this.isGrounded && (Math.abs(this.vx) < 50 || Math.random() < 0.015)) wantJump = true;
            }
        }

        if (!moving) {
            this.vx *= this.friction;
            if (Math.abs(this.vx) < 10) this.vx = 0;
        }
        if (this.vx > this.speed) this.vx = this.speed;
        if (this.vx < -this.speed) this.vx = -this.speed;

        // Wall collision
        if (walls) {
            for (let i = 0; i < walls.length; i++) {
                const wall = walls[i];
                if (!wall.dead &&
                    this.x + this.vx * dt < wall.x + wall.w &&
                    this.x + this.w + this.vx * dt > wall.x &&
                    this.y < wall.y + wall.h &&
                    this.y + this.h > wall.y) {
                    this.vx = 0;
                }
            }
        }

        this.x += this.vx * dt;
        this.vy += this.gravity * dt;
        if (this.vy > this.maxFallSpeed) this.vy = this.maxFallSpeed;

        if (wantJump) {
            if (this.isGrounded) {
                this.vy = this.jumpForce;
                this.isGrounded = false;
                if (audio) audio.play('jump', 0.4, 0.1);
            } else if (this.team === 'green') {
                // Player flight — full lift.
                this.vy -= 1500 * dt;
                if (this.vy < this.flyForce) this.vy = this.flyForce;
            } else {
                // AI chiefs glide with reduced lift so they can still cross
                // the larger world without dominating airspace.
                this.vy -= 900 * dt;
                if (this.vy < this.flyForce * 0.7) this.vy = this.flyForce * 0.7;
            }
        }

        // Save previous bottom before moving
        const prevBottom = this.y + this.h;

        this.y += this.vy * dt;
        this.isGrounded = false;

        if (this.vy >= 0) {
            const newBottom = this.y + this.h;
            for (let i = 0; i < islands.length; i++) {
                const island = islands[i];
                if (this.x < island.x + island.w && this.x + this.w > island.x) {
                    // Crossed the surface OR within generous fixed threshold
                    if ((prevBottom <= island.y + 5 && newBottom >= island.y - 5) ||
                        (newBottom >= island.y - 5 && newBottom <= island.y + 40)) {
                        this.y = island.y - this.h + 1;
                        this.vy = 0;
                        this.isGrounded = true;
                        this.x += island.vx * dt;
                    }
                }
            }
        }

        // Horizontal wrap — preserved (world is a cylinder).
        if (this.x > worldWidth) this.x = 0;
        if (this.x < -this.w) this.x = worldWidth;

        // Vertical bounds — invisible ceiling above, rock floor below with
        // hasten-home impulse so a Player who slips off the islands gets
        // shepherded back up rather than wrapping or dying.
        _clampCeiling(this);
        _hastenHome(this, islands, dt, worldHeight);

        return Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1;
    }

    draw(ctx, camera) {
        if (this.dead) return;
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;

        const sx = Math.floor(rect.x);
        const sy = Math.floor(rect.y);

        // Idle bob & landing squash (purely cosmetic — derived, no state cost)
        this.bobPhase += 0.06;
        const bob = this.isGrounded ? Math.sin(this.bobPhase) * 0.6 : 0;
        // squash on hard landing
        if (this.isGrounded && this._lastVy > 600) this._squash = 0.78;
        else this._squash += (1.0 - this._squash) * 0.18;
        this._lastVy = this.vy;

        const drawY = sy + bob;

        // === DROP SHADOW (scales with altitude — looks great mid-air) ===
        let altitudeShadowScale = 1.0;
        if (!this.isGrounded) {
            const fall = Math.min(180, Math.abs(this.vy) * 0.05);
            altitudeShadowScale = Math.max(0.55, 1 - fall / 200);
        }
        ctx.fillStyle = `rgba(0,0,0,${0.18 * altitudeShadowScale})`;
        ctx.beginPath();
        ctx.ellipse(sx + this.w * 0.5, sy + this.h, this.w * 0.5 * altitudeShadowScale, 4 * altitudeShadowScale, 0, 0, Math.PI * 2);
        ctx.fill();

        // === MYSTIC HEAD (random spirit avatar, scaled & pinned over the body) ===
        const headImg = Assets.heads[this.headIdx];
        const headReady = imgReady(headImg);

        // === CHIEF AURA (pulsing halo behind the head — brighter for the player) ===
        const aurPulse = 0.45 + Math.sin(Date.now() * 0.003) * 0.18;
        const aurR = 18;
        let aurColor;
        if (headReady) {
            const el = headImg._element;
            const k = this.team === 'green' ? 0.32 : 0.22; // player aura a touch brighter
            if (el === 'fire')      aurColor = `rgba(255,140,40,${k * aurPulse})`;
            else if (el === 'water') aurColor = `rgba(80,180,255,${k * aurPulse})`;
            else                     aurColor = `rgba(220,220,255,${k * aurPulse})`;
        } else {
            aurColor = `rgba(${teamColor(this.team, 'aura')},${0.22 * aurPulse})`;
        }
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = aurColor;
        ctx.beginPath();
        ctx.arc(sx + this.w * 0.5, drawY - 14, aurR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Chief indicator arrow (player only) — sits above the head with a soft glow
        if (this.team === 'green') {
            const ax = sx + this.w * 0.5;
            const ay = drawY - 38;
            ctx.save();
            ctx.shadowColor = 'rgba(124,255,149,0.8)';
            ctx.shadowBlur = 8;
            ctx.fillStyle = '#9CFFB5';
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax - 8, ay - 11);
            ctx.lineTo(ax + 8, ay - 11);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            ctx.strokeStyle = 'rgba(0,40,10,0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax - 8, ay - 11);
            ctx.lineTo(ax + 8, ay - 11);
            ctx.closePath();
            ctx.stroke();
        }

        // === BODY SPRITE with squash/stretch ===
        const img = teamSprite('player', this.team);
        const sq = this._squash;
        const bodyW = 48 * (2 - sq);   // squash horizontally, stretch when squashed
        const bodyH = 48 * sq;
        const bodyX = sx - 4 - (bodyW - 48) * 0.5;
        const bodyY = drawY - 4 + (48 - bodyH);
        if (img && (img.complete !== false) && (img.naturalWidth || img.width)) {
            ctx.drawImage(img, bodyX, bodyY, bodyW, bodyH);
        } else {
            ctx.fillStyle = teamColor(this.team, 'hex');
            ctx.fillRect(sx, drawY, this.w, this.h);
        }

        // === HEAD OVERLAY ===
        // Matched in size to the original pixel-art head/headdress so the
        // painted spirit head reads as the chief's actual head, not a totem.
        if (headReady) {
            const targetW = 22;
            const aspect = headImg.naturalHeight / headImg.naturalWidth;
            const headW = targetW;
            const headH = targetW * aspect;
            const headX = sx + this.w * 0.5 - headW * 0.5;
            // Bottom of head sits just over the body's shoulders, replacing
            // the area where the original head/headdress used to be.
            const headY = drawY - headH * 0.85;

            // Subtle shadow tucked under the chin
            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.translate(1, 1);
            ctx.drawImage(headImg, headX, headY, headW, headH);
            ctx.restore();

            ctx.drawImage(headImg, headX, headY, headW, headH);
        }

        // === FLIGHT TRAIL (when ascending fast) ===
        if (!this.isGrounded && this.vy < -200 && Math.random() < 0.55) {
            spawnParticle(
                this.x + this.w * 0.5 + (Math.random() - 0.5) * 16,
                this.y + this.h * 0.9,
                teamColor(this.team, 'light'),
                10, 0.4, 4 + Math.random() * 3, 'glow'
            );
        }

        // === HEALTH BAR (slimmer, glassy) ===
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(sx, sy - 10, this.w, 4);
        const hpPct = Math.max(0, this.hp / this.maxHp);
        const hpCol = hpPct > 0.5 ? '#7CFF95' : hpPct > 0.25 ? '#FFD24A' : '#FF5A5A';
        ctx.fillStyle = hpCol;
        ctx.fillRect(sx + 1, sy - 9, (this.w - 2) * hpPct, 2);
    }
}

// --- VILLAGER ---
export class Villager extends Entity {
    constructor(x, y, team) {
        super(x, y, 24, 24);
        this.team = team;
        this.hp = 10;
        this.homeIsland = null;
        this.vx = 0; this.vy = 0;
        this.stateTimer = 0;
        this.onGround = false;
        this.maxFallSpeed = 800;
        this.variantIndex = Math.floor(Math.random() * 4);
        this.attractorX = null;
        this.conversionTimer = 0;
        this.isBeingConverted = false;
    }

    update(dt, islands, worldWidth, worldHeight, pigs, walls, warState) {
        this.vy += 500 * dt;
        if (this.vy > this.maxFallSpeed) this.vy = this.maxFallSpeed;

        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
            this.stateTimer = 2 + Math.random() * 3;
            let interestX = null;

            if (this.homeIsland) {
                if (warState === 'ATTACK' && this.homeIsland.hasTeepee && Math.random() < 0.7) {
                    interestX = this.homeIsland.x + 80;
                } else if (Math.random() < 0.5 && pigs) {
                    const localPigs = pigs.filter(p => p.homeIsland === this.homeIsland);
                    if (localPigs.length > 0) interestX = localPigs[Math.floor(Math.random() * localPigs.length)].x;
                }
                if (interestX === null && this.homeIsland.hasTeepee && this.homeIsland.team === this.team) {
                    interestX = this.homeIsland.x + 80;
                }
                if (interestX === null) interestX = this.homeIsland.x + Math.random() * this.homeIsland.w;
            }

            this.attractorX = interestX;
            if (this.attractorX !== null) {
                this.vx = Math.abs(this.x - this.attractorX) > 40
                    ? (this.attractorX > this.x ? 60 : -60)
                    : (Math.random() - 0.5) * 40;
            } else {
                this.vx = (Math.random() - 0.5) * 60;
            }
        }

        // Wall bounce
        if (walls) {
            for (let i = 0; i < walls.length; i++) {
                const wall = walls[i];
                if (!wall.dead &&
                    this.x + this.vx * dt < wall.x + wall.w &&
                    this.x + this.w + this.vx * dt > wall.x &&
                    this.y < wall.y + wall.h && this.y + this.h > wall.y) {
                    this.vx *= -1;
                }
            }
        }

        // Random jump
        if (Math.abs(this.vx) > 10 && this.onGround && Math.random() < 0.008) {
            this.vy = -300; this.onGround = false;
        }

        // Stick to island
        if (this.onGround && this.homeIsland) {
            this.x += this.homeIsland.vx * dt;
            const nextX = this.x + this.w * 0.5 + (this.vx > 0 ? 10 : -10);
            if (nextX < this.homeIsland.x || nextX > this.homeIsland.x + this.homeIsland.w) this.vx *= -1;
        }

        // Save previous bottom
        const prevBottom = this.y + this.h;

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        this.onGround = false;
        if (this.vy >= 0) {
            const newBottom = this.y + this.h;
            for (let i = 0; i < islands.length; i++) {
                const island = islands[i];
                if (this.x + this.w > island.x && this.x < island.x + island.w) {
                    if ((prevBottom <= island.y + 5 && newBottom >= island.y - 5) ||
                        (newBottom >= island.y - 5 && newBottom <= island.y + 40)) {
                        this.y = island.y - this.h;
                        this.vy = 0;
                        this.onGround = true;
                        this.homeIsland = island;
                    }
                }
            }
        }

        // Horizontal wrap, vertical clamp + hasten-home (no longer dies on fall).
        if (this.x > worldWidth) this.x = 0;
        if (this.x < 0) this.x = worldWidth;
        _clampCeiling(this);
        _hastenHome(this, islands, dt, worldHeight);
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;
        const sx = Math.floor(rect.x);
        const sy = Math.floor(rect.y);

        // Shadow
        drawShadow(ctx, sx, sy + this.h, this.w);

        // Conversion glow
        if (this.isBeingConverted) {
            ctx.fillStyle = 'rgba(255,255,0,0.15)';
            ctx.beginPath();
            ctx.arc(sx + this.w * 0.5, sy + this.h * 0.5, 16, 0, Math.PI * 2);
            ctx.fill();
        }

        const variants = (Assets.byTeam[this.team] && Assets.byTeam[this.team].villagers) || Assets.villagerGreen;
        const img = variants[this.variantIndex];
        if (img && (img.complete !== false) && (img.naturalWidth || img.width)) {
            ctx.drawImage(img, sx, sy, this.w, this.h);
        } else {
            ctx.fillStyle = teamColor(this.team, 'hex');
            ctx.fillRect(sx, sy, this.w, this.h);
        }
    }
}

// --- WARRIOR ---
export class Warrior extends Villager {
    constructor(x, y, team) {
        super(x, y, team);
        this.w = 32; this.h = 32;
        this.hp = 10;
        this.attackCooldown = 0;
        // Bodyguard/Homebody/Raider role system
        const r = Math.random();
        this.role = r < 0.3 ? 'bodyguard' : r < 0.65 ? 'homebody' : 'raider';
        this.maxFallSpeed = 1000;
        this.patrolTargetX = null;
        this.patrolTimer = 0;
        this.roleTimer = 5 + Math.random() * 10;
        // Set externally by spawn logic to scale enemy aggression dynamically.
        // 1.0 = baseline; >1 means faster attacks and harder hits.
        this.difficultyScale = 1.0;
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;
        const sx = Math.floor(rect.x);
        const sy = Math.floor(rect.y);

        drawShadow(ctx, sx, sy + this.h, this.w);

        const img = teamSprite('warrior', this.team);
        if (img && (img.complete !== false) && (img.naturalWidth || img.width)) {
            ctx.drawImage(img, sx, sy, this.w, this.h);
        } else {
            ctx.fillStyle = teamColor(this.team, 'hex');
            ctx.fillRect(sx, sy, this.w, this.h);
        }
    }

    updateLogic(dt, islands, enemies, spawn, worldWidth, worldHeight, audio, friendlyLeader, allVillagers, walls, warState) {
        this.vy += 500 * dt;
        if (this.vy > this.maxFallSpeed) this.vy = this.maxFallSpeed;
        this.attackCooldown -= dt;

        // Separation
        if (allVillagers) {
            for (let i = 0; i < allVillagers.length; i++) {
                const v = allVillagers[i];
                if (v === this || v.dead) continue;
                const dx = this.x - v.x;
                const dy = this.y - v.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < 400 && distSq > 0) {
                    const dist = Math.sqrt(distSq);
                    const push = (20 - dist) * 10;
                    this.vx += (dx / dist) * push * 5;
                    this.x += (dx / dist) * 2;
                }
            }
        }

        let moveTargetX = null;
        let moveTargetY = null;
        let targetEnemy = null;
        let forcedAggro = false;

        // War state behavior
        if (warState === 'GATHER' && friendlyLeader && !friendlyLeader.dead) {
            moveTargetX = friendlyLeader.x + (Math.random() * 200 - 100);
            moveTargetY = friendlyLeader.y;
        } else if (warState === 'ATTACK') {
            // Pick the CLOSEST hostile chief — not the first one in the
            // enemies array. The old `.find` always returned the player chief
            // for blue/yellow/red warriors (since the player sits at index 0
            // of the enemies snapshot), causing every rival tribe to gang up
            // on green. Now yellow may attack red, blue may attack yellow,
            // etc. — a real four-way melee with no allies.
            let closest = null;
            let bestSq = Infinity;
            for (let i = 0; i < enemies.length; i++) {
                const e = enemies[i];
                if (!(e instanceof Player) || e.team === this.team || e.dead) continue;
                const dx = e.x - this.x;
                const dy = e.y - this.y;
                const d = dx * dx + dy * dy;
                if (d < bestSq) { bestSq = d; closest = e; }
            }
            if (closest) {
                moveTargetX = closest.x;
                moveTargetY = closest.y;
                forcedAggro = true;
            }
        }

        // Target selection — baseline range, no difficulty scaling.
        // (Earlier versions scaled this with DDA and it compounded into runaway
        // enemy advantage. Held flat now.)
        //
        // Combat triangle (step 4): Warriors cannot harm Priests or Tokobus.
        // Skip them entirely so arrows ignore those silhouettes.
        let bestScore = -Infinity;
        const detectionRange = forcedAggro ? 800 : (enemies.length < 5 ? 10000 : 600);

        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (e.team === this.team || e.dead) continue;
            if (e instanceof Priest || e instanceof Tokobu) continue;
            const dx = e.x - this.x;
            const dy = e.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < detectionRange) {
                let score = 10000 - dist;
                // Tokobu extends Warrior, but the guard above already
                // excludes them — only "real" warriors get the score boost.
                if (e instanceof Warrior) score += 500;
                else if (e instanceof Player) score += 1000;
                if (score > bestScore) { bestScore = score; targetEnemy = e; }
            }
        }

        // Attack
        if (targetEnemy && (forcedAggro || enemies.length < 5 || Math.abs(targetEnemy.x - this.x) < 600)) {
            if (Math.abs(targetEnemy.x - this.x) < 400) this.vx *= 0.8;

            if (this.attackCooldown <= 0) {
                // Baseline cooldown and damage for both teams.
                this.attackCooldown = 1.5 + Math.random();
                const dx = targetEnemy.x - this.x;
                const dy = (targetEnemy.y - 20) - this.y;
                const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.25;
                spawn.projectile(this.x, this.y, angle, this.team, 10);
            }

            if (warState === 'BUILD') {
                this.vx += Math.sign(targetEnemy.x - this.x) * 50;
            }
        }

        // Movement - Bodyguard/Homebody/Raider state tree
        if (warState === 'BUILD' && moveTargetX === null) {
            this.roleTimer -= dt;
            if (this.roleTimer <= 0) {
                this.roleTimer = 10 + Math.random() * 10;
                // Role transitions with weighted probabilities
                const r = Math.random();
                if (this.role === 'bodyguard') {
                    this.role = r < 0.3 ? 'homebody' : r < 0.6 ? 'raider' : 'bodyguard';
                } else if (this.role === 'homebody') {
                    this.role = r < 0.25 ? 'bodyguard' : r < 0.5 ? 'raider' : 'homebody';
                } else { // raider
                    this.role = r < 0.2 ? 'bodyguard' : r < 0.45 ? 'homebody' : 'raider';
                }
            }

            if (this.role === 'bodyguard' && friendlyLeader && !friendlyLeader.dead) {
                // Stay near chief
                moveTargetX = friendlyLeader.x + (Math.random() - 0.5) * 150;
                moveTargetY = friendlyLeader.y;
            } else if (this.role === 'homebody' && this.homeIsland) {
                // Defend home island - stay on it, patrol back and forth
                moveTargetX = this.homeIsland.x + Math.random() * this.homeIsland.w;
                moveTargetY = this.homeIsland.y - 30;
            } else {
                // Raider - seek enemy territory
                this.patrolTimer -= dt;
                if (this.patrolTimer <= 0 || this.patrolTargetX === null || Math.abs(this.x - this.patrolTargetX) < 100) {
                    this.patrolTimer = 8 + Math.random() * 12;
                    if (islands.length > 0) {
                        // Prefer enemy islands
                        const enemyIslands = islands.filter(i => i.team !== this.team && i.team !== 'neutral');
                        const targetIslands = enemyIslands.length > 0 ? enemyIslands : islands;
                        const ri = targetIslands[Math.floor(Math.random() * targetIslands.length)];
                        this.patrolTargetX = ri.x + ri.w * 0.5;
                        this.patrolTargetY = ri.y - 50;
                    }
                }
                moveTargetX = this.patrolTargetX;
                moveTargetY = this.patrolTargetY;
            }
        }

        // Apply movement
        if (moveTargetX !== null) {
            const dx = moveTargetX - this.x;
            if (Math.abs(dx) > 10) this.vx += Math.sign(dx) * 1500 * dt;
            else this.vx *= 0.9;
        } else {
            this.vx *= 0.9;
        }

        // Fly towards target Y
        if (moveTargetY !== null) {
            const dy = moveTargetY - this.y;
            if (Math.abs(dy) > 50) this.vy += Math.sign(dy) * 1500 * dt;
        }

        // Speed cap — baseline, equal for both teams.
        const maxSpeed = 350;
        if (this.vx > maxSpeed) this.vx = maxSpeed;
        if (this.vx < -maxSpeed) this.vx = -maxSpeed;
        if (this.vy > maxSpeed) this.vy = maxSpeed;
        if (this.vy < -maxSpeed) this.vy = -maxSpeed;

        // Save previous bottom
        const prevBottom = this.y + this.h;

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Landing
        this.onGround = false;
        if (this.vy >= 0) {
            const newBottom = this.y + this.h;
            for (let i = 0; i < islands.length; i++) {
                const island = islands[i];
                if (this.x + this.w > island.x && this.x < island.x + island.w) {
                    if ((prevBottom <= island.y + 5 && newBottom >= island.y - 5) ||
                        (newBottom >= island.y - 5 && newBottom <= island.y + 40)) {
                        this.y = island.y - this.h;
                        this.vy = 0;
                        this.onGround = true;
                        this.homeIsland = island;
                        this.x += island.vx * dt;
                    }
                }
            }
        }

        // AI jump
        if (this.onGround) {
            if (Math.random() < 0.005) { this.vy = -500; this.onGround = false; }
            if (moveTargetX !== null && Math.abs(moveTargetX - this.x) > 100 && Math.random() < 0.02) {
                this.vy = -500; this.onGround = false;
            }
        }

        // Horizontal wrap, vertical clamp + hasten-home (no longer dies on fall).
        if (this.x > worldWidth) this.x = 0;
        if (this.x < 0) this.x = worldWidth;
        _clampCeiling(this);
        _hastenHome(this, islands, dt, worldHeight);
    }
}

// --- TOKOBU ---
// Tanky monster unit. Inherent triangle: kills Warriors and Peasants on
// contact; immune to Warrior arrows; cannot be killed by other Tokobus.
// Only Priests can neutralise a Tokobu (by conversion). Player spells
// (fireball / quake) still damage them.
//
// Extends Warrior so the existing dispatch in main.js (instanceof Warrior →
// updateLogic) flows through unchanged. updateLogic is overridden completely
// with melee-on-contact behaviour.
export class Tokobu extends Warrior {
    constructor(x, y, team) {
        super(x, y, team);
        // MASSIVE — Tokobus tower over warriors (32) and chiefs (40), reading
        // unmistakably as battlefield monsters.
        this.w = 128; this.h = 128;
        this.hp = 280; this.maxHp = 280;
        this.attackCooldown = 1.4 + Math.random() * 0.8;
        this.maxFallSpeed = 1000;
        this.variantIndex = Math.floor(Math.random() * 2);
        this.target = null;
        this._retargetTimer = 0;
        this._fireballRange = 800;       // hurl from a distance
        this._fireballCooldown = 2.6;
        this.conversionTimer = 0;
        this.isBeingConverted = false;
        this._wasGrounded = false;
        // Cosmetic state — drama dials. None of these touch combat/balance.
        this._breathPhase = Math.random() * Math.PI * 2;
        this._sigilPhase = Math.random() * Math.PI * 2;
        this._emberTimer = Math.random() * 0.2;
        this._fireRecoil = 0;            // 0..1 shudder right after hurling a fireball
        this._smokeTimer = 0;
    }

    updateLogic(dt, islands, enemies, spawn, worldWidth, worldHeight, _audio, friendlyLeader, allVillagers, walls, warState) {
        this.vy += 500 * dt;
        if (this.vy > this.maxFallSpeed) this.vy = this.maxFallSpeed;
        this.attackCooldown -= dt;

        // Drama — recoil decays after a fireball, charcoal smoke trails
        // behind a moving Tokobu so they always feel like a furnace on legs.
        this._fireRecoil = Math.max(0, this._fireRecoil - dt * 3);
        const moveSpeed = Math.abs(this.vx) + Math.abs(this.vy);
        if (moveSpeed > 30) {
            this._smokeTimer -= dt;
            if (this._smokeTimer <= 0) {
                this._smokeTimer = 0.15;
                spawnParticle(
                    this.x + this.w * 0.5 + (Math.random() - 0.5) * 30,
                    this.y + this.h * 0.85,
                    '#3a2a22', 20 + Math.random() * 30, 0.7 + Math.random() * 0.5,
                    5 + Math.random() * 4, 'normal'
                );
            }
        }

        // Separation from nearby allies / corpses — generous radius because
        // the silhouette is so large.
        if (allVillagers) {
            for (let i = 0; i < allVillagers.length; i++) {
                const v = allVillagers[i];
                if (v === this || v.dead) continue;
                const dx = this.x - v.x;
                const dy = this.y - v.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < 1600 && distSq > 0) {
                    const dist = Math.sqrt(distSq);
                    const push = (40 - dist) * 6;
                    this.vx += (dx / dist) * push * 3;
                }
            }
        }

        // Re-pick target periodically — only valid prey are Warriors and
        // Peasants (Villagers). Skip Priests, other Tokobus, and chiefs.
        this._retargetTimer -= dt;
        const targetGone = !this.target || this.target.dead || this.target.team === this.team;
        if (targetGone || this._retargetTimer <= 0) {
            this._retargetTimer = 0.6;
            this.target = null;
            let bestSq = this._fireballRange * this._fireballRange;
            for (let i = 0; i < enemies.length; i++) {
                const e = enemies[i];
                if (!e || e === this || e.dead || e.team === this.team) continue;
                if (e instanceof Player) continue;          // chiefs are above the triangle
                if (e instanceof Priest) continue;          // cannot harm priests
                if (e instanceof Tokobu) continue;          // cannot harm other tokobus
                const dx = e.x - this.x, dy = e.y - this.y;
                const d = dx * dx + dy * dy;
                if (d < bestSq) { bestSq = d; this.target = e; }
            }
        }

        // Default to gathering near friendly chief if nothing to hunt.
        let moveTargetX = null, moveTargetY = null;
        if (this.target && !this.target.dead) {
            // Hold position at lobbing range — keeps targets in firing arc.
            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const idealRange = 420;
            if (dist > idealRange + 80) {
                moveTargetX = this.target.x;
                moveTargetY = this.target.y;
            } else if (dist < idealRange - 120) {
                moveTargetX = this.x - dx;       // back off slightly
                moveTargetY = this.y;
            }
        } else if (friendlyLeader && !friendlyLeader.dead) {
            moveTargetX = friendlyLeader.x + (Math.random() - 0.5) * 240;
            moveTargetY = friendlyLeader.y;
        }

        if (moveTargetX !== null) {
            const dx = moveTargetX - this.x;
            if (Math.abs(dx) > 16) this.vx += Math.sign(dx) * 900 * dt;
            else this.vx *= 0.85;
        } else {
            this.vx *= 0.9;
        }
        if (moveTargetY !== null) {
            const dy = moveTargetY - this.y;
            if (Math.abs(dy) > 80) this.vy += Math.sign(dy) * 900 * dt;
        }

        // Speed cap — slower than warriors so they read as ponderous heavies.
        const maxSpeed = 200;
        if (this.vx > maxSpeed) this.vx = maxSpeed;
        if (this.vx < -maxSpeed) this.vx = -maxSpeed;
        if (this.vy > maxSpeed * 1.6) this.vy = maxSpeed * 1.6;
        if (this.vy < -maxSpeed * 1.2) this.vy = -maxSpeed * 1.2;

        // Hurl a fireball if a valid target is in range.
        if (this.target && !this.target.dead && this.attackCooldown <= 0 && spawn && spawn.fireball) {
            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;
            const r = this._fireballRange;
            if (dx * dx + dy * dy < r * r) {
                this.attackCooldown = this._fireballCooldown + Math.random() * 0.6;
                const angle = Math.atan2((this.target.y + 20) - (this.y + this.h * 0.4),
                                         this.target.x - (this.x + this.w * 0.5))
                              + (Math.random() - 0.5) * 0.18;
                spawn.fireball(
                    this.x + this.w * 0.5,
                    this.y + this.h * 0.4,
                    angle,
                    this.team,
                    'tokobu'
                );
                this._fireRecoil = 1;
                // Recoil knockback against the firing direction.
                this.vx -= Math.cos(angle) * 60;
                this.vy -= Math.sin(angle) * 30;
                // Muzzle flash — bigger plume now, twin pass for hot core + halo.
                for (let k = 0; k < 14; k++) {
                    spawnParticle(
                        this.x + this.w * 0.5 + Math.cos(angle) * 40 + (Math.random() - 0.5) * 18,
                        this.y + this.h * 0.4 + Math.sin(angle) * 40 + (Math.random() - 0.5) * 18,
                        k < 6 ? '#FFE7A0' : '#FF8030',
                        80 + Math.random() * 60, 0.4 + Math.random() * 0.4,
                        4 + Math.random() * 4, 'glow'
                    );
                }
            }
        }

        // Position update.
        const prevBottom = this.y + this.h;
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        this.onGround = false;
        if (this.vy >= 0) {
            const newBottom = this.y + this.h;
            for (let i = 0; i < islands.length; i++) {
                const island = islands[i];
                if (this.x + this.w > island.x && this.x < island.x + island.w) {
                    if ((prevBottom <= island.y + 5 && newBottom >= island.y - 5) ||
                        (newBottom >= island.y - 5 && newBottom <= island.y + 40)) {
                        this.y = island.y - this.h;
                        this.vy = 0;
                        this.onGround = true;
                        this.homeIsland = island;
                        this.x += island.vx * dt;
                    }
                }
            }
        }

        // Stomp dust on hard landing — wider plume to match the heavy frame.
        if (this.onGround && !this._wasGrounded) {
            for (let i = 0; i < 12; i++) {
                spawnParticle(
                    this.x + this.w * 0.5 + (Math.random() - 0.5) * 90,
                    this.y + this.h,
                    '#7a5b3a', 100 + Math.random() * 60, 0.5 + Math.random() * 0.3,
                    4 + Math.random() * 4, 'normal'
                );
            }
        }
        this._wasGrounded = this.onGround;

        // Inter-island leap occasionally.
        if (this.onGround) {
            if (Math.random() < 0.003) { this.vy = -700; this.onGround = false; }
            if (moveTargetX !== null && Math.abs(moveTargetX - this.x) > 200 && Math.random() < 0.018) {
                this.vy = -700; this.onGround = false;
            }
        }

        // Bounds — wrap horizontally, clamp vertically, hasten home if falling.
        if (this.x > worldWidth) this.x = 0;
        if (this.x < 0) this.x = worldWidth;
        _clampCeiling(this);
        _hastenHome(this, islands, dt, worldHeight);
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;

        // === DRAMA PASS ===
        // Tokobus must read as battlefield monsters at any zoom: heavy
        // bedded shadow, breathing silhouette, smouldering aura, infernal
        // sigil burning at their feet.

        this._breathPhase += 0.04;
        this._sigilPhase  += 0.025;
        this._emberTimer  -= 1 / 60;
        const breath = 1 + Math.sin(this._breathPhase) * 0.025;
        const recoilShake = this._fireRecoil > 0
            ? (Math.sin(this._fireRecoil * 32) * this._fireRecoil * 4)
            : 0;

        const sx = Math.floor(rect.x + recoilShake);
        const sy = Math.floor(rect.y);
        const cx = sx + this.w * 0.5;
        const cy = sy + this.h * 0.5;
        const baseY = sy + this.h;

        // 1. Massive bedded shadow — much darker and wider than a warrior's.
        ctx.fillStyle = 'rgba(0,0,0,0.42)';
        ctx.beginPath();
        ctx.ellipse(cx, baseY - 2, this.w * 0.62, 13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(cx, baseY - 2, this.w * 0.78, 18, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. Infernal sigil at its feet — a slowly-rotating rune glyph in
        // the team colour. Reads from far away, even when the silhouette
        // is half off-screen.
        ctx.save();
        ctx.translate(cx, baseY - 4);
        ctx.rotate(this._sigilPhase);
        ctx.globalCompositeOperation = 'lighter';
        const sigilR = this.w * 0.42;
        const sigilGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, sigilR);
        sigilGrad.addColorStop(0, `rgba(${teamColor(this.team, 'aura')},0.30)`);
        sigilGrad.addColorStop(0.7, `rgba(${teamColor(this.team, 'aura')},0.10)`);
        sigilGrad.addColorStop(1, `rgba(${teamColor(this.team, 'aura')},0)`);
        ctx.fillStyle = sigilGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, sigilR, sigilR * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        // Three notch-marks for an actual rune feel.
        ctx.strokeStyle = `rgba(${teamColor(this.team, 'aura')},0.55)`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * sigilR * 0.55, Math.sin(a) * sigilR * 0.25);
            ctx.lineTo(Math.cos(a) * sigilR * 0.95, Math.sin(a) * sigilR * 0.43);
            ctx.stroke();
        }
        ctx.restore();

        // 3. Body — drawn with a vertical breath squash, slightly anchored
        // to the feet. globalAlpha stays at 1 so the silhouette is solid.
        const bodyW = this.w * (2 - breath);
        const bodyH = this.h * breath;
        const bodyX = sx + (this.w - bodyW) * 0.5;
        const bodyY = sy + (this.h - bodyH);
        const img = teamSprite('tokobu', this.team, this.variantIndex);
        if (img && (img.complete !== false) && (img.naturalWidth || img.width)) {
            ctx.drawImage(img, bodyX, bodyY, bodyW, bodyH);
        } else {
            ctx.fillStyle = teamColor(this.team, 'hex');
            ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
        }

        // 4. Heat haze under the feet — tinted ember layer.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(${teamColor(this.team, 'aura')},0.18)`;
        ctx.beginPath();
        ctx.ellipse(cx, baseY - 4, this.w * 0.40, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 5. Cylindrical menacing aura — fattest when firing.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const auraR = this.w * (0.55 + this._fireRecoil * 0.20);
        const aura = ctx.createRadialGradient(cx, cy, this.w * 0.18, cx, cy, auraR);
        aura.addColorStop(0, `rgba(${teamColor(this.team, 'aura')},${0.04 + this._fireRecoil * 0.18})`);
        aura.addColorStop(1, `rgba(${teamColor(this.team, 'aura')},0)`);
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(cx, cy, auraR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 6. Glowing eye-spark — twin embers on the upper third of the body.
        const eyeY = sy + this.h * 0.32;
        const eyeFlick = 0.7 + Math.sin(this._breathPhase * 4) * 0.3;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,180,80,${0.85 * eyeFlick})`;
        ctx.beginPath();
        ctx.arc(cx - this.w * 0.13, eyeY, 2.4, 0, Math.PI * 2);
        ctx.arc(cx + this.w * 0.13, eyeY, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,80,30,${0.55 * eyeFlick})`;
        ctx.beginPath();
        ctx.arc(cx - this.w * 0.13, eyeY, 5.6, 0, Math.PI * 2);
        ctx.arc(cx + this.w * 0.13, eyeY, 5.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 7. Constant slow ember emission — tiny upward sparks.
        if (this._emberTimer <= 0) {
            this._emberTimer = 0.18 + Math.random() * 0.15;
            spawnParticle(
                this.x + this.w * 0.5 + (Math.random() - 0.5) * this.w * 0.6,
                this.y + this.h * (0.4 + Math.random() * 0.5),
                Math.random() < 0.5 ? '#FFB060' : '#FF7030',
                30 + Math.random() * 30, 0.7 + Math.random() * 0.5,
                1.8 + Math.random() * 2, 'glow'
            );
        }

        // 8. Conversion overlay — golden bath that grows as the priest
        // closes in on flipping them.
        if (this.isBeingConverted) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = 'rgba(255,235,140,0.22)';
            ctx.beginPath();
            ctx.arc(cx, cy, this.w * 0.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // 9. HP bar — slim, only shown when wounded. Wider than a warrior's.
        if (this.hp < this.maxHp) {
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(sx, sy - 10, this.w, 5);
            const pct = Math.max(0, this.hp / this.maxHp);
            ctx.fillStyle = pct > 0.5 ? '#7CFF95' : pct > 0.25 ? '#FFD24A' : '#FF5A5A';
            ctx.fillRect(sx + 1, sy - 9, (this.w - 2) * pct, 3);
        }
    }
}

// --- PRIEST ---
// Conversion specialist. Inherent triangle: cannot be killed by Warriors or
// Tokobus; can convert Warriors and Tokobus by holding them in its aura.
// Cannot convert Peasants. Player spells still damage Priests.
//
// Extends Villager so the standard wandering update applies. Conversion is
// applied separately each frame via applyConversion(dt, allUnits) — main.js
// dispatches that call right after v.update().
export class Priest extends Villager {
    constructor(x, y, team) {
        super(x, y, team);
        // Bumped silhouette so the hooded mystic actually reads as a caster
        // alongside warriors (32) and chiefs (40). Combat values unchanged.
        this.w = 40; this.h = 48;
        this.hp = 60; this.maxHp = 60;
        this.maxFallSpeed = 700;
        this.conversionRange = 240;
        this.conversionTime  = 4.5;   // seconds of continuous exposure to flip
        this.conversionTargets = new Map();
        // Cosmetic state — drama dials. None of these touch combat/balance.
        this._auraPhase  = Math.random() * Math.PI * 2;
        this._hoverPhase = Math.random() * Math.PI * 2;
        this._runePhase  = Math.random() * Math.PI * 2;
    }

    // Sweep nearby Warriors and Tokobus and advance per-target timers. Each
    // priest tracks its own targets, so multiple priests stacking on a target
    // means the first to finish wins — overwhelming priestly presence still
    // accelerates conversion by raising the chance of close range.
    applyConversion(dt, allUnits) {
        const range2 = this.conversionRange * this.conversionRange;
        // Drop stale references (targets that died or already flipped).
        for (const [u] of this.conversionTargets) {
            if (u.dead || u.team === this.team) {
                this.conversionTargets.delete(u);
                u.isBeingConverted = false;
            }
        }

        for (let i = 0; i < allUnits.length; i++) {
            const u = allUnits[i];
            if (!u || u === this || u.dead || u.team === this.team) continue;
            // Tokobu extends Warrior, so this single check captures both.
            if (!(u instanceof Warrior)) continue;

            const dx = u.x - this.x, dy = u.y - this.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < range2) {
                const t = (this.conversionTargets.get(u) || 0) + dt;
                if (t >= this.conversionTime) {
                    u.team = this.team;
                    u.isBeingConverted = false;
                    this.conversionTargets.delete(u);
                    // Sparkle pop on flip.
                    for (let k = 0; k < 8; k++) {
                        spawnParticle(
                            u.x + (Math.random() - 0.5) * 20,
                            u.y + (Math.random() - 0.5) * 20,
                            teamColor(this.team, 'particle'),
                            60 + Math.random() * 60, 0.5 + Math.random() * 0.4,
                            3 + Math.random() * 2, 'glow'
                        );
                    }
                } else {
                    this.conversionTargets.set(u, t);
                    u.isBeingConverted = true;
                }
            } else if (this.conversionTargets.has(u)) {
                this.conversionTargets.delete(u);
                // Don't force-clear the flag; another priest may still be
                // converting this unit and will re-set it on its own pass.
            }
        }
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;

        // === PRIESTLY PASS ===
        // The Priest is the rarest unit in the field. Read at any distance
        // means a slowly-rotating ground rune, a breathing halo, a hover
        // bob, and a wisp curling off the hood.

        this._auraPhase  += 0.045;
        this._hoverPhase += 0.05;
        this._runePhase  += 0.012;

        const pulse = 0.55 + Math.sin(this._auraPhase) * 0.25;
        const hoverDY = Math.sin(this._hoverPhase) * 1.2;

        const sx = Math.floor(rect.x);
        const sy = Math.floor(rect.y + hoverDY);
        const cx = sx + this.w * 0.5;
        const cy = sy + this.h * 0.5;
        const baseY = Math.floor(rect.y) + this.h;   // rune sits on ground, not the bob

        // 1. Shadow on the actual ground (separate from the floating body).
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(cx, baseY, this.w * 0.45, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. Sigil ring on the ground — slowly rotating glyph in the team's
        // aura colour. Reads from far away as "magic happens here".
        ctx.save();
        ctx.translate(cx, baseY - 1);
        ctx.rotate(this._runePhase);
        ctx.globalCompositeOperation = 'lighter';
        const ringR = this.w * 0.85;
        ctx.strokeStyle = `rgba(${teamColor(this.team, 'aura')},${0.45 * pulse})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, ringR, ringR * 0.32, 0, 0, Math.PI * 2);
        ctx.stroke();
        // Inner faint ring
        ctx.strokeStyle = `rgba(${teamColor(this.team, 'aura')},${0.20 * pulse})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, ringR * 0.65, ringR * 0.22, 0, 0, Math.PI * 2);
        ctx.stroke();
        // Six tick marks around the outer ring — reads as runic.
        ctx.strokeStyle = `rgba(${teamColor(this.team, 'aura')},${0.55 * pulse})`;
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * ringR * 0.85, Math.sin(a) * ringR * 0.27);
            ctx.lineTo(Math.cos(a) * ringR * 1.05, Math.sin(a) * ringR * 0.34);
            ctx.stroke();
        }
        ctx.restore();

        // 3. Aura halo — soft radial wash in the team colour. The conversion
        // range is gameplay-meaningful so the visible halo nudges close to it.
        const auraR = this.conversionRange * 0.55;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const ag = ctx.createRadialGradient(cx, cy, 0, cx, cy, auraR);
        ag.addColorStop(0.00, `rgba(${teamColor(this.team, 'aura')},${0.12 * pulse})`);
        ag.addColorStop(0.60, `rgba(${teamColor(this.team, 'aura')},${0.05 * pulse})`);
        ag.addColorStop(1.00, `rgba(${teamColor(this.team, 'aura')},0)`);
        ctx.fillStyle = ag;
        ctx.beginPath();
        ctx.arc(cx, cy, auraR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 4. Sprite (hooded mystic, hue-tinted by team). Solid — no alpha.
        const img = teamSprite('priest', this.team);
        if (img && (img.complete !== false) && (img.naturalWidth || img.width)) {
            ctx.drawImage(img, sx, sy, this.w, this.h);
        } else {
            ctx.fillStyle = teamColor(this.team, 'hex');
            ctx.fillRect(sx, sy, this.w, this.h);
        }

        // 5. Halo arc behind the head — a thin crescent, sells "spiritual".
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(${teamColor(this.team, 'aura')},${0.55 * pulse})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, sy + this.h * 0.18, this.w * 0.42, Math.PI * 1.05, Math.PI * 1.95);
        ctx.stroke();
        ctx.restore();

        // 6. Wisp curling off the hood — bigger, brighter, with a trail.
        const wispY = sy - 6;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const wispGrad = ctx.createRadialGradient(cx, wispY, 0, cx, wispY, 8);
        wispGrad.addColorStop(0, `rgba(${teamColor(this.team, 'aura')},${0.85 * pulse})`);
        wispGrad.addColorStop(1, `rgba(${teamColor(this.team, 'aura')},0)`);
        ctx.fillStyle = wispGrad;
        ctx.beginPath();
        ctx.arc(cx, wispY, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx, wispY, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 7. Sparse spark trail — emit ~3x/s when active.
        if (Math.random() < 0.05) {
            spawnParticle(
                cx + (Math.random() - 0.5) * 10,
                wispY - 4,
                teamColor(this.team, 'particle'),
                10, 0.6 + Math.random() * 0.4,
                1.2 + Math.random() * 1.6, 'glow'
            );
        }
    }
}

// --- PIG ---
export class Pig extends Entity {
    constructor(x, y) {
        super(x, y, 32, 24);
        this.hp = 10;
        this.vx = 0; this.vy = 0;
        this.stateTimer = 0;
        this.onGround = false;
        this.maxFallSpeed = 800;
        this.homeIsland = null;
    }

    update(dt, islands, worldWidth, worldHeight) {
        this.vy += 800 * dt;
        if (this.vy > this.maxFallSpeed) this.vy = this.maxFallSpeed;

        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
            this.stateTimer = 2 + Math.random() * 3;
            this.vx = (Math.random() - 0.5) * 40;
        }

        if (this.onGround && this.homeIsland) {
            if (this.x < this.homeIsland.x) this.vx = Math.abs(this.vx);
            if (this.x > this.homeIsland.x + this.homeIsland.w) this.vx = -Math.abs(this.vx);
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        this.onGround = false;
        if (this.vy >= 0) {
            for (let i = 0; i < islands.length; i++) {
                const island = islands[i];
                if (this.x < island.x + island.w && this.x + this.w > island.x) {
                    const threshold = island.y + 30 + this.vy * dt;
                    if (this.y + this.h >= island.y && this.y + this.h <= threshold) {
                        this.y = island.y - this.h;
                        this.vy = 0;
                        this.onGround = true;
                        this.homeIsland = island;
                    }
                }
            }
        }

        // Horizontal wrap, vertical clamp + hasten-home (pigs head back up too).
        if (this.x > worldWidth) this.x = 0;
        if (this.x < 0) this.x = worldWidth;
        _clampCeiling(this);
        _hastenHome(this, islands, dt, worldHeight);
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;
        const sx = Math.floor(rect.x);
        const sy = Math.floor(rect.y);

        drawShadow(ctx, sx, sy + this.h, this.w);

        if (imgReady(Assets.pig)) {
            ctx.drawImage(Assets.pig, sx, sy, this.w, this.h);
        } else {
            ctx.fillStyle = '#FFC0CB';
            ctx.fillRect(sx, sy, this.w, this.h);
        }
    }
}

// --- PROJECTILE ---
export class Projectile extends Entity {
    constructor(x, y, angle, team, damage) {
        super(x, y, 32, 10);
        this.team = team;
        this.damage = damage;
        const speed = 600;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.angle = angle;
        this.life = 3.0;
        this.trailTimer = 0;
    }

    update(dt, walls) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        if (this.life <= 0) this.dead = true;

        // Spawn trail particle
        this.trailTimer -= dt;
        if (this.trailTimer <= 0) {
            this.trailTimer = 0.04;
            spawnParticle(this.x, this.y, teamColor(this.team, 'particle'), 5, 0.3, 3, 'trail');
        }

        // Wall collision
        if (walls) {
            for (let i = 0; i < walls.length; i++) {
                const wall = walls[i];
                if (!wall.dead &&
                    this.x < wall.x + wall.w && this.x + this.w > wall.x &&
                    this.y < wall.y + wall.h && this.y + this.h > wall.y) {
                    this.dead = true;
                    wall.hp -= 20;
                    spawnParticle(this.x, this.y, '#888', 30, 0.3, 3, 'normal');
                }
            }
        }
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;

        // Motion-blur streak — short additive line behind the arrow
        const trailColor = `rgba(${teamColor(this.team, 'aura')},0.55)`;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = trailColor;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const trailLen = 22;
        ctx.moveTo(rect.x, rect.y);
        ctx.lineTo(rect.x - Math.cos(this.angle) * trailLen, rect.y - Math.sin(this.angle) * trailLen);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.translate(rect.x, rect.y);
        ctx.rotate(this.angle);

        if (imgReady(Assets.projectile)) {
            ctx.drawImage(Assets.projectile, 0, 0, this.w, this.h);
        } else {
            ctx.fillStyle = teamColor(this.team, 'hex');
            ctx.fillRect(0, 0, this.w, this.h);
        }
        ctx.restore();
    }
}

// --- FIREBALL ---
// `source` distinguishes player-cast fireballs (default 'spell') from
// Tokobu-thrown fireballs ('tokobu'). Player spells override the combat
// triangle and can kill anything; Tokobu fireballs respect it (no harm to
// Priests or other Tokobus).
export class Fireball extends Entity {
    constructor(x, y, angle, team, source) {
        super(x, y, 60, 60);
        this.team = team;
        this.source = source || 'spell';
        const speed = source === 'tokobu' ? 320 : 400;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.angle = angle;
        this.life = 4.0;
        this.damage = 100;
        this._particleTimer = 0;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        if (this.life <= 0) this.dead = true;

        // Embers + glow + smoke trail (pooled)
        this._particleTimer -= dt;
        if (this._particleTimer <= 0) {
            this._particleTimer = 0.025;
            const hot = this.team === 'green' ? '#FFB040' : '#C080FF';
            const core = this.team === 'green' ? '#FF6020' : '#8A2BE2';
            // Glow puff
            spawnParticle(
                this.x + (Math.random() - 0.5) * 22,
                this.y + (Math.random() - 0.5) * 22,
                core, 30, 0.32 + Math.random() * 0.28, 10 + Math.random() * 14, 'glow'
            );
            // Bright ember speck
            spawnParticle(
                this.x + (Math.random() - 0.5) * 16,
                this.y + (Math.random() - 0.5) * 16,
                hot, 0, 0.5 + Math.random() * 0.4, 1.5 + Math.random() * 2, 'glow'
            );
        }
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;

        const cx = rect.x + this.w * 0.5;
        const cy = rect.y + this.h * 0.5;
        const breathe = 1 + Math.sin(Date.now() * 0.02) * 0.08;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // Outer glow halo (huge, subtle)
        const haloColor = this.team === 'green'
            ? 'rgba(255,140,40,0.10)'
            : 'rgba(160,80,255,0.10)';
        ctx.fillStyle = haloColor;
        ctx.beginPath();
        ctx.arc(cx, cy, 70 * breathe, 0, Math.PI * 2);
        ctx.fill();

        // Mid glow
        const midColor = this.team === 'green'
            ? 'rgba(255,90,20,0.35)'
            : 'rgba(140,60,255,0.35)';
        ctx.fillStyle = midColor;
        ctx.beginPath();
        ctx.arc(cx, cy, 28 * breathe, 0, Math.PI * 2);
        ctx.fill();

        // Hot inner
        ctx.fillStyle = this.team === 'green' ? 'rgba(255,200,60,0.65)' : 'rgba(200,140,255,0.65)';
        ctx.beginPath();
        ctx.arc(cx, cy, 14 * breathe, 0, Math.PI * 2);
        ctx.fill();

        // Bright white core
        ctx.fillStyle = 'rgba(255,255,220,0.85)';
        ctx.beginPath();
        ctx.arc(cx, cy, 6 * breathe, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// --- STONE WALL ---
export class StoneWall extends Entity {
    constructor(x, y) {
        super(x, y, 40, 120);
        this.hp = 250; this.maxHp = 250;
        this.vx = 0; this.vy = 0;
        this.onGround = false;
    }

    update(dt, islands, worldHeight) {
        this.vy += 1000 * dt;
        this.y += this.vy * dt;
        this.onGround = false;

        if (this.vy >= 0) {
            for (let i = 0; i < islands.length; i++) {
                const island = islands[i];
                if (this.x + this.w > island.x && this.x < island.x + island.w) {
                    const threshold = 10 + this.vy * dt * 2;
                    if (this.y + this.h >= island.y && this.y + this.h <= island.y + threshold) {
                        this.y = island.y - this.h;
                        this.vy = 0;
                        this.onGround = true;
                        this.x += island.vx * dt;
                        this.y += island.vy * dt;
                    }
                }
            }
        }

        // Walls that reach the rock floor crumble into oblivion (no village
        // worth defending lives down there).
        if (this.y > getWorldGroundY(worldHeight)) this.dead = true;
        if (this.hp <= 0) this.dead = true;
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;
        const sx = Math.floor(rect.x);
        const sy = Math.floor(rect.y);

        // 2.5D wall with depth
        const wallDepth = 8;
        ctx.fillStyle = '#555';
        ctx.fillRect(sx + wallDepth, sy + wallDepth, this.w, this.h);
        ctx.fillStyle = '#696969';
        ctx.fillRect(sx, sy, this.w, this.h);
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, sy, this.w, this.h);

        // Damage cracks
        const dmg = 1 - this.hp / this.maxHp;
        if (dmg > 0.2) {
            ctx.strokeStyle = '#333';
            ctx.beginPath();
            ctx.moveTo(sx + 5, sy + 10);
            ctx.lineTo(sx + 20, sy + 40);
            ctx.stroke();
        }
        if (dmg > 0.5) {
            ctx.beginPath();
            ctx.moveTo(sx + 35, sy + 80);
            ctx.lineTo(sx + 10, sy + 100);
            ctx.stroke();
        }
    }
}

// --- RAIN CLOUD ---
export class RainCloud extends Entity {
    constructor(x, y, team) {
        super(x, y, 100, 50);
        this.team = team;
        this.life = 2.0;
        this._dropTimer = 0;
    }

    update(dt) {
        this.life -= dt;
        if (this.life <= 0) this.dead = true;

        this._dropTimer -= dt;
        if (this._dropTimer <= 0) {
            this._dropTimer = 0.05;
            spawnParticle(
                this.x + (Math.random() - 0.5) * 120,
                this.y + Math.random() * 15,
                '#87CEEB', 200, 0.5, 2, 'normal'
            );
        }
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;

        const color = `rgba(${teamColor(this.team, 'aura')},0.35)`;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(rect.x, rect.y, 40, 0, Math.PI * 2);
        ctx.arc(rect.x + 30, rect.y - 10, 50, 0, Math.PI * 2);
        ctx.arc(rect.x - 30, rect.y - 10, 50, 0, Math.PI * 2);
        ctx.fill();
    }
}

// --- VISUAL EFFECT ---
export class VisualEffect extends Entity {
    constructor(x, y, type) {
        super(x, y, 0, 0);
        this.type = type;
        this.life = type === 'impact' ? 0.15 : 0.4;
    }

    update(dt) {
        this.life -= dt;
        if (this.life <= 0) this.dead = true;
    }

    draw(ctx, camera) {
        if (this.type === 'lightning') {
            const rect = camera.getScreenRect(this.x, this.y, 0, 0);
            if (!rect.onScreen) return;

            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            let cx = rect.x;
            ctx.moveTo(cx, 0);
            for (let cy = 0; cy < camera.effectiveH; cy += 20) {
                cx += (Math.random() - 0.5) * 60;
                ctx.lineTo(cx, cy);
            }
            ctx.stroke();

            if (Math.random() > 0.5) {
                ctx.fillStyle = 'rgba(255,255,255,0.08)';
                ctx.fillRect(0, 0, camera.effectiveW, camera.effectiveH);
            }
        }
    }
}

// --- TOTEM ---
export class Totem {
    constructor(x, y, team) {
        this.x = x; this.y = y;
        this.team = team;
        this.w = 60; this.h = 120;
        this.range = 300;
        this.conversionRate = 5.0;
        this.active = true;
        this._pulseTime = Math.random() * 6.28;
    }

    update(dt, villagers) {
        if (!this.active) return;
        this._pulseTime += dt * 2;

        for (let i = 0; i < villagers.length; i++) {
            const v = villagers[i];
            if (v.team === this.team || v.dead) continue;
            const dx = v.x - this.x;
            const dy = v.y - this.y;
            if (dx * dx + dy * dy < this.range * this.range) {
                if (!v.conversionTimer) v.conversionTimer = 0;
                v.conversionTimer += dt;
                v.isBeingConverted = true;

                if (v.conversionTimer > this.conversionRate) {
                    v.team = this.team;
                    v.conversionTimer = 0;
                    v.isBeingConverted = false;
                }
            } else {
                if (v.conversionTimer > 0) {
                    v.conversionTimer = 0;
                    v.isBeingConverted = false;
                }
            }
        }
    }

    draw(ctx, cam) {
        if (!this.active) return;
        const rect = cam.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;

        const sx = rect.x;
        const sy = rect.y;
        const pulse = 0.5 + Math.sin(this._pulseTime) * 0.2;

        // Aura ring
        const auraColor = `rgba(${teamColor(this.team, 'glowSoft')},${pulse * 0.06})`;
        ctx.fillStyle = auraColor;
        ctx.beginPath();
        ctx.arc(sx, sy - 60, this.range * 0.3, 0, Math.PI * 2);
        ctx.fill();

        // Totem sprite
        if (imgReady(Assets.totem)) {
            ctx.drawImage(Assets.totem, sx - 30, sy - 120, 60, 120);
        } else {
            ctx.fillStyle = teamColor(this.team, 'light');
            ctx.fillRect(sx - 15, sy - 120, 30, 120);
        }

        // Top glow
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(${teamColor(this.team, 'glowSoft')},${pulse * 0.3})`;
        ctx.beginPath();
        ctx.arc(sx, sy - 115, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
    }
}

// --- WEATHER: LEAF ---
export class Leaf {
    constructor(x, y, layer) {
        this.x = x; this.y = y;
        this.layer = layer || 'fg';
        this.dead = false;

        if (this.layer === 'fg') {
            this.scale = 1.0 + Math.random() * 0.5;
            this.vx = 200 + Math.random() * 300;
            this.vy = 50 + Math.random() * 100;
            this.rotationSpeed = (Math.random() - 0.5) * 6;
        } else {
            this.scale = 0.4 + Math.random() * 0.4;
            this.vx = 50 + Math.random() * 100;
            this.vy = 10 + Math.random() * 30;
            this.rotationSpeed = (Math.random() - 0.5) * 2;
        }
        this.angle = Math.random() * Math.PI * 2;
        this.life = 5 + Math.random() * 5;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.angle += this.rotationSpeed * dt;
        this.life -= dt;
        if (this.life <= 0) this.dead = true;
    }

    draw(ctx, camera) {
        const sx = this.x - camera.x;
        const sy = this.y - camera.y;
        if (sx < -50 || sx > camera.effectiveW + 50) return;

        if (imgReady(Assets.leaf)) {
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(this.angle);
            ctx.globalAlpha = Math.min(1, this.life * 0.5);
            const s = 32 * this.scale;
            ctx.drawImage(Assets.leaf, -s * 0.5, -s * 0.5, s, s);
            ctx.globalAlpha = 1;
            ctx.restore();
        } else {
            // Fallback: colored rectangle
            ctx.globalAlpha = Math.min(1, this.life * 0.5);
            ctx.fillStyle = '#c44';
            const s = 8 * this.scale;
            ctx.fillRect(sx - s * 0.5, sy - s * 0.5, s, s);
            ctx.globalAlpha = 1;
        }
    }
}

// --- WEATHER: SNOWFLAKE ---
export class Snowflake {
    constructor(x, y, layer) {
        this.x = x; this.y = y;
        this.layer = layer || 'fg';
        this.dead = false;
        this.sway = Math.random() * Math.PI;
        this.life = 8;

        if (this.layer === 'fg') {
            this.size = 6 + Math.random() * 6;
            this.vx = -100 + Math.random() * 200;
            this.vy = 200 + Math.random() * 200;
            this.swaySpeed = 3 + Math.random() * 4;
        } else {
            this.size = 2 + Math.random() * 3;
            this.vx = -20 + Math.random() * 40;
            this.vy = 80 + Math.random() * 50;
            this.swaySpeed = 1 + Math.random() * 2;
        }
    }

    update(dt) {
        this.sway += dt * this.swaySpeed;
        const swayAmp = this.layer === 'fg' ? 80 : 20;
        this.x += (this.vx + Math.sin(this.sway) * swayAmp) * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        if (this.life <= 0) this.dead = true;
    }

    draw(ctx, camera) {
        const sx = this.x - camera.x;
        const sy = this.y - camera.y;
        if (sx < -20 || sx > camera.effectiveW + 20) return;

        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(sx, sy, this.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
    }
}
