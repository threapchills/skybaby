/* WORLD & CAMERA SYSTEM - REMASTERED v2
   Cinematic camera + multi-pass sky pipeline:
     - Random per-session sky variant from the painted set
     - Procedural gradient that follows day/night (multiply blended)
     - Parallax mid-clouds + drifting fg cloud bank that overlays entities
     - Volumetric god-ray pass for that golden-hour feel
     - Horizon haze and high-altitude fog for depth
*/

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
        this.image = new Image();
        this.image.src = imagePath;
        this.speed = speed;
        this.autoScrollSpeed = autoScrollSpeed || 0;
        this.yOffset = yOffset || 0;
        this.alpha = alpha !== undefined ? alpha : 1.0;
        this.loaded = false;
        this.image.onload = () => { this.loaded = true; };
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

// Painted-sky variant (full-canvas, very slow parallax)
class SkyVariant {
    constructor(path, mood) {
        this.image = new Image();
        this.image.src = path;
        this.mood = mood;
        this.loaded = false;
        this.image.onload = () => { this.loaded = true; };
    }

    draw(ctx, camera, alpha) {
        if (!this.loaded) return;
        const ih = this.image.height;
        const iw = this.image.width;
        // Scale so the painted sky comfortably covers the viewport plus headroom.
        const scale = (camera.effectiveH * 1.15) / ih;
        const sw = iw * scale;
        const sh = ih * scale;
        const yPos = -sh * 0.05;
        const speed = 0.03;
        const totalX = -(camera.x * speed);
        const xPos = ((totalX % sw) + sw) % sw - sw;
        const needed = Math.ceil(camera.effectiveW / sw) + 2;

        const prev = ctx.globalAlpha;
        ctx.globalAlpha = prev * (alpha !== undefined ? alpha : 1);
        for (let i = 0; i < needed; i++) {
            ctx.drawImage(this.image, xPos + sw * i, yPos, sw, sh);
        }
        ctx.globalAlpha = prev;
    }
}

const SKY_VARIANTS = [
    { path: 'assets/backgrounds/sky_aurora_variance_1775766450789_resized.png',  mood: 'aurora',  tint: { r: 30,  g: 50,  b: 90  }, name: 'AURORA' },
    { path: 'assets/backgrounds/sky_crimson_variance_1775766465664_resized.png', mood: 'crimson', tint: { r: 90,  g: 30,  b: 30  }, name: 'CRIMSON' },
    { path: 'assets/backgrounds/sky_foggy_variance_1775766531966_resized.png',   mood: 'foggy',   tint: { r: 80,  g: 90,  b: 100 }, name: 'MISTHAVEN' },
    { path: 'assets/backgrounds/sky_pastel_variance_1775766480395_resized.png',  mood: 'pastel',  tint: { r: 200, g: 160, b: 180 }, name: 'PASTEL DAWN' },
    { path: 'assets/backgrounds/sky_starry_variance_1775766496425_resized.png',  mood: 'starry',  tint: { r: 20,  g: 30,  b: 70  }, name: 'STARFALL' },
    { path: 'assets/backgrounds/sky_storm_variance_1775766174444_resized.png',   mood: 'storm',   tint: { r: 40,  g: 40,  b: 70  }, name: 'TEMPEST' },
    { path: 'assets/backgrounds/sky_sunset_variance_1775766189071_resized.png',  mood: 'sunset',  tint: { r: 200, g: 100, b: 70  }, name: 'EMBERSKY' },
    { path: 'assets/backgrounds/sky_toxic_variance_1775766518363_resized.png',   mood: 'toxic',   tint: { r: 60,  g: 130, b: 50  }, name: 'VENOMSKY' }
];

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

        // 5. Distant horizon haze (bottom band)
        const horizonGrad = ctx.createLinearGradient(0, eh * 0.55, 0, eh);
        horizonGrad.addColorStop(0, 'rgba(0,0,0,0)');
        horizonGrad.addColorStop(1, `rgba(${tint.r},${tint.g},${tint.b},0.45)`);
        ctx.fillStyle = horizonGrad;
        ctx.fillRect(0, eh * 0.55, ew, eh * 0.45);

        // 6. High-altitude haze (top band — gives that lofty blue-of-the-stratosphere feel)
        const topGrad = ctx.createLinearGradient(0, 0, 0, eh * 0.35);
        topGrad.addColorStop(0, `rgba(${tint.r},${tint.g},${tint.b},0.25)`);
        topGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = topGrad;
        ctx.fillRect(0, 0, ew, eh * 0.35);

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

        // Drifting front cloud bank — this is the Silksong-style overlay that
        // crosses in front of the player layer. Kept very transparent so it
        // reads as soft atmospheric scrim, not occlusion.
        this.fgCloudsFront.draw(ctx, cam, 1.0);

        // Bottom volumetric fog (scrolls horizontally, sells altitude)
        const time = Date.now() / 1000;
        const fogY = eh * 0.7;
        const fogH = eh * 0.4;
        const tint = this.skyMeta.tint;
        const fogGrad = ctx.createLinearGradient(0, fogY, 0, fogY + fogH);
        fogGrad.addColorStop(0, 'rgba(0,0,0,0)');
        fogGrad.addColorStop(0.5, `rgba(${tint.r},${tint.g},${tint.b},0.18)`);
        fogGrad.addColorStop(1, `rgba(${Math.floor(tint.r*0.6)},${Math.floor(tint.g*0.6)},${Math.floor(tint.b*0.7)},0.32)`);
        ctx.fillStyle = fogGrad;
        ctx.fillRect(0, fogY, ew, fogH);

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
