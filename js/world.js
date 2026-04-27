/* WORLD & CAMERA SYSTEM - REMASTERED v2
   Cinematic camera + multi-pass sky pipeline:
     - Random per-session sky variant from the painted set
     - Procedural gradient that follows day/night (multiply blended)
     - Parallax mid-clouds + drifting fg cloud bank that overlays entities
     - Volumetric god-ray pass for that golden-hour feel
     - Horizon haze and high-altitude fog for depth
     - Solid rock/soil cross-section at the world's bottom (topology v3)
*/

import { getWorldGroundY, WORLD_GROUND_THICKNESS, WORLD_CEILING_Y } from './entities.js?v=5';

export class Camera {
    constructor(viewportWidth, viewportHeight, worldWidth, worldHeight) {
        this.w = viewportWidth;
        this.h = viewportHeight;
        this.worldW = worldWidth;
        this.worldH = worldHeight;
        this.x = 0;
        this.y = 0;

        // Zoom system
        this.zoom = 0.75;
        this.targetZoom = 0.75;
        this.baseZoom = 0.75;
        this.minZoom = 0.5;
        this.maxZoom = 1.4;

        // Trauma-based shake
        this.trauma = 0;
        this.maxTrauma = 1.0;
        this.traumaDecay = 1.2;
        this.shakeScale = 12;
        this.shakeAngle = 0;
        this.shakeTime = 0;

        // Time dilation
        this.timeDilation = 1.0;
        this.targetTimeDilation = 1.0;
        this.dilationLerpSpeed = 4.0;

        // Look-ahead
        this.lookAheadX = 0;
        this.lookAheadY = 0;
        this.lookAheadScale = 0.15;
    }

    get effectiveW() { return this.w / this.zoom; }
    get effectiveH() { return this.h / this.zoom; }

    addTrauma(amount) {
        this.trauma = Math.min(this.maxTrauma, this.trauma + amount);
    }

    setTimeDilation(target, speed) {
        this.targetTimeDilation = Math.max(0.05, Math.min(1.0, target));
        if (speed !== undefined) this.dilationLerpSpeed = speed;
    }

    resetTimeDilation() {
        this.targetTimeDilation = 1.0;
        this.dilationLerpSpeed = 4.0;
    }

    setZoom(target) {
        this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, target));
    }

    resetZoom() {
        this.targetZoom = this.baseZoom;
    }

    getScreenRect(worldX, worldY, w, h) {
        const ew = this.effectiveW;
        const eh = this.effectiveH;
        const camCenterX = this.x + ew / 2;
        let dx = worldX - camCenterX;

        const halfWorld = this.worldW / 2;
        if (dx > halfWorld) dx -= this.worldW;
        else if (dx < -halfWorld) dx += this.worldW;

        const screenX = (ew / 2) + dx;
        const screenY = worldY - this.y;
        const margin = 100;

        return {
            x: screenX,
            y: screenY,
            onScreen: (screenX + w > -margin && screenX < ew + margin &&
                       screenY + h > -margin && screenY < eh + margin)
        };
    }

    follow(target, realDt) {
        this.timeDilation += (this.targetTimeDilation - this.timeDilation) * this.dilationLerpSpeed * realDt;
        this.zoom += (this.targetZoom - this.zoom) * 3.0 * realDt;

        const ew = this.effectiveW;
        const eh = this.effectiveH;

        this.lookAheadX += ((target.vx || 0) * this.lookAheadScale - this.lookAheadX) * 2.0 * realDt;
        this.lookAheadY += ((target.vy || 0) * this.lookAheadScale * 0.5 - this.lookAheadY) * 2.0 * realDt;

        let tx = target.x + this.lookAheadX - ew / 2;
        let ty = target.y + this.lookAheadY - eh / 2;

        if (ty < -600) ty = -600;
        if (ty + eh > this.worldH + 200) ty = this.worldH + 200 - eh;

        let dx = tx - this.x;
        if (dx > this.worldW / 2) dx -= this.worldW;
        if (dx < -this.worldW / 2) dx += this.worldW;

        const followSpeed = 4.0;
        this.x += dx * followSpeed * realDt;
        this.y += (ty - this.y) * followSpeed * realDt;

        while (this.x < 0) this.x += this.worldW;
        while (this.x >= this.worldW) this.x -= this.worldW;

        if (this.trauma > 0) {
            this.trauma = Math.max(0, this.trauma - this.traumaDecay * realDt);
            const shake = this.trauma * this.trauma;
            this.shakeTime += realDt * 30;
            const offsetX = Math.sin(this.shakeTime * 1.1) * shake * this.shakeScale;
            const offsetY = Math.cos(this.shakeTime * 1.7) * shake * this.shakeScale;
            this.shakeAngle = Math.sin(this.shakeTime * 0.7) * shake * 0.02;
            this.x += offsetX;
            this.y += offsetY;
        } else {
            this.shakeAngle = 0;
        }
    }
}

// Tiled parallax layer (used for mid + foreground cloud bands)
class ParallaxLayer {
    constructor(imagePath, speed, yOffset, autoScrollSpeed, alpha) {
        this.image = _bgImageCache[imagePath] || new Image();
        if (!this.image.src) this.image.src = imagePath;
        this.speed = speed;
        this.autoScrollSpeed = autoScrollSpeed || 0;
        this.yOffset = yOffset || 0;
        this.alpha = alpha !== undefined ? alpha : 1.0;
        this.loaded = this.image.complete && this.image.naturalWidth > 0;
        if (!this.loaded) {
            const onload = () => { this.loaded = true; };
            if (this.image.addEventListener) this.image.addEventListener('load', onload);
            else this.image.onload = onload;
        }
    }

    draw(ctx, camera, alphaMul) {
        if (!this.loaded) return;
        const prevAlpha = ctx.globalAlpha;
        const a = this.alpha * (alphaMul !== undefined ? alphaMul : 1);
        ctx.globalAlpha = prevAlpha * a;

        const windOffset = (Date.now() / 1000) * this.autoScrollSpeed;
        const totalX = -(camera.x * this.speed) - windOffset;
        const imgW = this.image.width;
        const xPos = ((totalX % imgW) + imgW) % imgW - imgW;

        const needed = Math.ceil(camera.effectiveW / imgW) + 2;
        for (let i = 0; i < needed; i++) {
            ctx.drawImage(this.image, xPos + imgW * i, this.yOffset);
        }
        ctx.globalAlpha = prevAlpha;
    }
}

// Painted-sky variant (full-canvas, very slow parallax).
// The painted skies aren't designed to tile, so alternate tiles get
// horizontally mirror-flipped — adjoining edges then match perfectly,
// producing seamless infinite scrolling.
class SkyVariant {
    constructor(path, mood) {
        // Reuse the preloaded image when available so the loading screen
        // can guarantee the painting is fully decoded before play begins.
        this.image = _bgImageCache[path] || new Image();
        if (!this.image.src) this.image.src = path;
        this.mood = mood;
        this.loaded = this.image.complete && this.image.naturalWidth > 0;
        if (!this.loaded) {
            const onload = () => { this.loaded = true; };
            if (this.image.addEventListener) this.image.addEventListener('load', onload);
            else this.image.onload = onload;
        }
    }

    draw(ctx, camera, alpha) {
        if (!this.loaded) return;
        const ih = this.image.height;
        const iw = this.image.width;
        // Scale up so we mostly see the painted top half of the image — the
        // horizon line that lives in the lower portion stays below the viewport.
        const scale = (camera.effectiveH * 1.7) / ih;
        const sw = iw * scale;
        const sh = ih * scale;
        // Anchor sky a little above the viewport top — view sits in the
        // upper third of the painting (clouds), well clear of the horizon.
        const yPos = -sh * 0.02;
        const speed = 0.03;

        const shift = -(camera.x * speed);
        const firstTileIdx = Math.floor(-shift / sw);
        const firstTileX = firstTileIdx * sw + shift;
        const needed = Math.ceil(camera.effectiveW / sw) + 2;

        const prev = ctx.globalAlpha;
        ctx.globalAlpha = prev * (alpha !== undefined ? alpha : 1);
        for (let i = 0; i < needed; i++) {
            const tileIdx = firstTileIdx + i;
            const tileX = firstTileX + i * sw;
            const flip = (((tileIdx % 2) + 2) % 2) === 1;
            if (flip) {
                ctx.save();
                ctx.translate(tileX + sw, yPos);
                ctx.scale(-1, 1);
                ctx.drawImage(this.image, 0, 0, sw, sh);
                ctx.restore();
            } else {
                ctx.drawImage(this.image, tileX, yPos, sw, sh);
            }
        }
        ctx.globalAlpha = prev;
    }
}

// Curated milieu set — castles, ruins, and industrial silhouettes removed
// so the sky reads as pure mythic skybound landscape.
const SKY_VARIANTS = [
    { path: 'assets/backgrounds/sky_foggy_variance_1775766531966_resized.png',   mood: 'foggy',   tint: { r: 80,  g: 90,  b: 100 }, name: 'MISTHAVEN' },
    { path: 'assets/backgrounds/sky_pastel_variance_1775766480395_resized.png',  mood: 'pastel',  tint: { r: 200, g: 160, b: 180 }, name: 'PASTEL DAWN' },
    { path: 'assets/backgrounds/sky_sunset_variance_1775766189071_resized.png',  mood: 'sunset',  tint: { r: 200, g: 100, b: 70  }, name: 'EMBERSKY' }
];

// Pre-load every sky and parallax image and report progress.
// Loading screen uses this so the gradient pop-in never happens.
const _allBackgroundImages = [];
function _registerBg(path) {
    const im = new Image();
    im.src = path;
    _allBackgroundImages.push(im);
    return im;
}
const _bgImageCache = {};
for (const v of SKY_VARIANTS) _bgImageCache[v.path] = _registerBg(v.path);
_bgImageCache['assets/backgrounds/sky_layer_2.png']  = _registerBg('assets/backgrounds/sky_layer_2.png');
_bgImageCache['assets/backgrounds/clouds_fg.png']    = _registerBg('assets/backgrounds/clouds_fg.png');

export function getBackgroundProgress() {
    let ready = 0, total = _allBackgroundImages.length;
    for (const im of _allBackgroundImages) {
        if (im.complete && im.naturalWidth > 0) ready++;
    }
    return { ready, total };
}

export function pickRandomSkyVariant() {
    return SKY_VARIANTS[Math.floor(Math.random() * SKY_VARIANTS.length)];
}

export function getSkyVariantImage(path) {
    return _bgImageCache[path];
}

export class World {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.camera = new Camera(800, 600, width, height);

        // Pick a random painted sky variant for this session
        const pickIdx = Math.floor(Math.random() * SKY_VARIANTS.length);
        this.skyMeta = SKY_VARIANTS[pickIdx];
        this.skyVariant = new SkyVariant(this.skyMeta.path, this.skyMeta.mood);

        // Mid + foreground cloud bands (existing assets, retuned for cinematic depth)
        this.midClouds = new ParallaxLayer('assets/backgrounds/sky_layer_2.png', 0.18, -60, 6, 0.45);
        this.fgCloudsBack = new ParallaxLayer('assets/backgrounds/clouds_fg.png', 0.42, 40, 18, 0.32);

        // The drifting "in-front-of-everything" cloud bank (Silksong-style)
        this.fgCloudsFront = new ParallaxLayer('assets/backgrounds/clouds_fg.png', 0.85, 220, 42, 0.18);

        // Procedural gradient overlay tints (per-mood)
        this.skyColors = {
            day:   { top: '#1a0533', mid: '#2d1b69', bot: '#ff6b35' },
            night: { top: '#050510', mid: '#0a0a20', bot: '#1a0a30' }
        };

        // Atmospheric mote field (always-on dust drifting in foreground)
        this.motes = [];
        for (let i = 0; i < 40; i++) {
            this.motes.push({
                x: Math.random() * 1600,
                y: Math.random() * 900,
                z: 0.2 + Math.random() * 1.2,           // depth: bigger = closer
                phase: Math.random() * Math.PI * 2,
                speed: 8 + Math.random() * 18,
                size: 0.6 + Math.random() * 1.8
            });
        }

        // Lightning timer for storm sky
        this._lightningCooldown = 5 + Math.random() * 10;
        this._lightningFlash = 0;
    }

    update(player, realDt) {
        this.camera.follow(player, realDt);

        // Drift motes
        for (let i = 0; i < this.motes.length; i++) {
            const m = this.motes[i];
            m.x -= m.speed * m.z * realDt;
            m.phase += realDt * (0.6 + m.z * 0.4);
            if (m.x < -50) m.x = this.camera.effectiveW + 50;
        }

        // Storm lightning ambient
        if (this.skyMeta.mood === 'storm') {
            this._lightningCooldown -= realDt;
            if (this._lightningCooldown <= 0) {
                this._lightningCooldown = 6 + Math.random() * 14;
                this._lightningFlash = 0.55;
            }
            if (this._lightningFlash > 0) this._lightningFlash = Math.max(0, this._lightningFlash - realDt * 2.5);
        }
    }

    // === BACK PASS: behind everything ===
    drawBackground(ctx, season, dayProgress) {
        const cam = this.camera;
        const ew = cam.effectiveW;
        const eh = cam.effectiveH;

        // 1. Procedural sky gradient (under everything)
        const nightBlend = Math.max(0, -Math.sin(dayProgress || 0)) * 0.7;
        const grad = ctx.createLinearGradient(0, 0, 0, eh);
        const tint = this.skyMeta.tint;

        if (nightBlend < 0.3) {
            // Daytime — blend procedural with sky-mood tint at the horizon
            grad.addColorStop(0, this.skyColors.day.top);
            grad.addColorStop(0.45, this.skyColors.day.mid);
            grad.addColorStop(1, `rgb(${tint.r},${tint.g},${tint.b})`);
        } else {
            grad.addColorStop(0, this.skyColors.night.top);
            grad.addColorStop(0.5, this.skyColors.night.mid);
            grad.addColorStop(1, `rgb(${Math.floor(tint.r*0.4)},${Math.floor(tint.g*0.4)},${Math.floor(tint.b*0.5)})`);
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, ew, eh);

        // 2. Painted sky variant (full canvas, very slow parallax)
        const dayDim = 1 - nightBlend * 0.55;
        this.skyVariant.draw(ctx, cam, 0.85 * dayDim);

        // 3. Mid-cloud band
        const winterDim = season === 'winter' ? 0.85 : 1.0;
        this.midClouds.draw(ctx, cam, winterDim);

        // 4. Background fg cloud bank (still behind entities)
        this.fgCloudsBack.draw(ctx, cam, winterDim);

        // 5. Distant horizon haze — gradient spans the full canvas so its
        // rectangle has no visible top edge. Stops are positioned so the
        // haze starts fading in around 55% down and tops out at the bottom.
        const horizonGrad = ctx.createLinearGradient(0, 0, 0, eh);
        horizonGrad.addColorStop(0.00, 'rgba(0,0,0,0)');
        horizonGrad.addColorStop(0.55, 'rgba(0,0,0,0)');
        horizonGrad.addColorStop(1.00, `rgba(${tint.r},${tint.g},${tint.b},0.45)`);
        ctx.fillStyle = horizonGrad;
        ctx.fillRect(0, 0, ew, eh);

        // 6. High-altitude haze — same trick: full-canvas rect, gradient
        // controls visibility, no chance of a hard rectangle edge.
        const topGrad = ctx.createLinearGradient(0, 0, 0, eh);
        topGrad.addColorStop(0.00, `rgba(${tint.r},${tint.g},${tint.b},0.25)`);
        topGrad.addColorStop(0.35, 'rgba(0,0,0,0)');
        topGrad.addColorStop(1.00, 'rgba(0,0,0,0)');
        ctx.fillStyle = topGrad;
        ctx.fillRect(0, 0, ew, eh);

        // 7. God rays (additive, only when sky has warm tint)
        if (this.skyMeta.mood === 'sunset' || this.skyMeta.mood === 'pastel' || this.skyMeta.mood === 'crimson') {
            this._drawGodRays(ctx, cam, dayDim);
        }

        // 8. Storm lightning flash
        if (this._lightningFlash > 0) {
            ctx.fillStyle = `rgba(180,200,255,${this._lightningFlash * 0.5})`;
            ctx.fillRect(0, 0, ew, eh);
        }
    }

    // === FOREGROUND PASS: drawn AFTER entities for true depth ===
    drawForeground(ctx) {
        const cam = this.camera;
        const ew = cam.effectiveW;
        const eh = cam.effectiveH;

        // Rock/soil cross-section — the planet's crust. Painted before the
        // front cloud bank so atmospheric scrim still drifts across its top.
        this._drawGround(ctx, cam);

        // Drifting front cloud bank — this is the Silksong-style overlay that
        // crosses in front of the player layer. Kept very transparent so it
        // reads as soft atmospheric scrim, not occlusion.
        this.fgCloudsFront.draw(ctx, cam, 1.0);

        // Bottom volumetric fog — full-canvas gradient with stops positioned
        // so the fog only appears in the lower portion. No hard rect edges.
        const time = Date.now() / 1000;
        const tint = this.skyMeta.tint;
        const fogGrad = ctx.createLinearGradient(0, 0, 0, eh);
        fogGrad.addColorStop(0.00, 'rgba(0,0,0,0)');
        fogGrad.addColorStop(0.70, 'rgba(0,0,0,0)');
        fogGrad.addColorStop(0.85, `rgba(${tint.r},${tint.g},${tint.b},0.18)`);
        fogGrad.addColorStop(1.00, `rgba(${Math.floor(tint.r*0.6)},${Math.floor(tint.g*0.6)},${Math.floor(tint.b*0.7)},0.32)`);
        ctx.fillStyle = fogGrad;
        ctx.fillRect(0, 0, ew, eh);

        // Atmospheric motes — drifting dust/embers in front of action
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < this.motes.length; i++) {
            const m = this.motes[i];
            const sway = Math.sin(m.phase) * 6;
            const x = m.x + sway;
            const y = m.y + Math.cos(m.phase * 0.7) * 4;
            const a = 0.18 + Math.sin(m.phase) * 0.12;
            const sz = m.size * m.z;
            ctx.fillStyle = `rgba(255,240,200,${Math.max(0.04, a) * m.z})`;
            ctx.beginPath();
            ctx.arc(x, y, sz, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
    }

    // Draw the solid rock/soil cross-section that closes the bottom of the
    // world. The crust reads as warm earth on top fading into deep mineral
    // grey below, with a subtle stratification pattern that drifts with the
    // camera so it doesn't feel pasted on. Strata anchor in WORLD coordinates
    // so they slide past as the player moves left/right (horizontal wrap is
    // preserved by the modulo in the X projection).
    _drawGround(ctx, cam) {
        const ew = cam.effectiveW;
        const eh = cam.effectiveH;
        const groundY = getWorldGroundY(this.height);
        const screenTop = groundY - cam.y;
        if (screenTop >= eh) return; // ground entirely off-screen below

        const drawTop = Math.max(0, screenTop);
        const drawH = eh - drawTop;
        if (drawH <= 0) return;

        // Earth gradient: lichen-stained crust at the lip, warm soil mid,
        // deep stone at the base. Mike's brief: solid, elegant, beautiful.
        const grad = ctx.createLinearGradient(0, screenTop, 0, eh);
        grad.addColorStop(0.00, '#5d4434');
        grad.addColorStop(0.05, '#6b4a37');
        grad.addColorStop(0.30, '#3e2a1f');
        grad.addColorStop(0.70, '#241813');
        grad.addColorStop(1.00, '#100a08');
        ctx.fillStyle = grad;
        ctx.fillRect(0, drawTop, ew, drawH);

        // A bright moss/grass lip kissing the top of the crust — the line
        // where the islands' world ends and the crust begins.
        const lipH = 6;
        const lipGrad = ctx.createLinearGradient(0, screenTop - 2, 0, screenTop + lipH);
        lipGrad.addColorStop(0.00, 'rgba(120, 160, 80, 0.0)');
        lipGrad.addColorStop(0.40, 'rgba(120, 160, 80, 0.55)');
        lipGrad.addColorStop(1.00, 'rgba(60, 80, 40, 0.0)');
        ctx.fillStyle = lipGrad;
        ctx.fillRect(0, screenTop - 2, ew, lipH + 2);

        // Stratified rock layers — drifting bands that anchor in world space.
        // Periodicity wraps with the world width so horizontal cylinder still
        // reads as a continuous crust.
        const layerCount = 5;
        ctx.save();
        ctx.globalAlpha = 0.35;
        for (let i = 0; i < layerCount; i++) {
            const t = (i + 1) / (layerCount + 1);
            const layerY = screenTop + drawH * t;
            const thickness = 2 + (i % 2);
            // Phase based on world X so strata "move" as you travel.
            const phase = (cam.x * 0.6 + i * 137) % 240;
            const dashLen = 60;
            const gapLen = 30;
            ctx.fillStyle = i % 2 === 0
                ? 'rgba(255, 220, 180, 0.18)'
                : 'rgba(60, 30, 20, 0.55)';
            for (let x = -dashLen + ((-phase) % (dashLen + gapLen)); x < ew; x += dashLen + gapLen) {
                ctx.fillRect(x, layerY, dashLen, thickness);
            }
        }
        ctx.restore();

        // Embedded boulders — sparse rounded stones poking out of the crust
        // for material variety. Position seeded on world X so they stay put.
        ctx.save();
        ctx.globalAlpha = 0.5;
        const stoneSpacing = 320;
        const camWorldX = cam.x;
        const startWorldX = Math.floor(camWorldX / stoneSpacing) * stoneSpacing - stoneSpacing;
        for (let wx = startWorldX; wx < camWorldX + ew + stoneSpacing; wx += stoneSpacing) {
            // Cheap deterministic hash from world X
            const seed = Math.sin(wx * 12.9898) * 43758.5453;
            const frac = seed - Math.floor(seed);
            const sx = (wx - camWorldX) + frac * 60;
            const sy = screenTop + 18 + frac * (drawH * 0.35);
            const r = 14 + frac * 22;
            const stoneGrad = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.4, r * 0.2, sx, sy, r);
            stoneGrad.addColorStop(0, '#7a6555');
            stoneGrad.addColorStop(1, '#2c1f17');
            ctx.fillStyle = stoneGrad;
            ctx.beginPath();
            ctx.ellipse(sx, sy, r, r * 0.78, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // Soft inner shadow at the lip so the rock reads as massive depth
        // rather than a flat band.
        const shadow = ctx.createLinearGradient(0, screenTop, 0, screenTop + 80);
        shadow.addColorStop(0, 'rgba(0,0,0,0.45)');
        shadow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = shadow;
        ctx.fillRect(0, screenTop, ew, Math.min(80, drawH));
    }

    _drawGodRays(ctx, cam, intensity) {
        const ew = cam.effectiveW;
        const eh = cam.effectiveH;
        const tint = this.skyMeta.tint;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const sunX = ew * 0.72;
        const sunY = eh * 0.18;
        const rayCount = 6;
        for (let i = 0; i < rayCount; i++) {
            const angle = -0.3 + (i / rayCount) * 0.6 + Math.sin(Date.now() * 0.0003 + i) * 0.04;
            const len = eh * 1.3;
            ctx.save();
            ctx.translate(sunX, sunY);
            ctx.rotate(Math.PI * 0.5 + angle);
            const grad = ctx.createLinearGradient(0, 0, 0, len);
            const a = 0.06 * intensity;
            grad.addColorStop(0, `rgba(${Math.min(255,tint.r+80)},${Math.min(255,tint.g+50)},${Math.min(255,tint.b+30)},${a})`);
            grad.addColorStop(0.6, `rgba(${tint.r},${tint.g},${tint.b},${a*0.4})`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(-60, 0, 120, len);
            ctx.restore();
        }
        ctx.restore();
    }

    // Backwards-compat shim — main.js called world.draw() previously
    draw(ctx, season, dayProgress) {
        this.drawBackground(ctx, season, dayProgress);
    }
}
