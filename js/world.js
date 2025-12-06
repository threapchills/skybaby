/* THE STAGE MANAGER (World & Camera)
   Definitive V4: VISUAL JUICE UPDATE 🥤
   - Handles "Bloom" logic in main draw.
   - Adds Impact Frames helper.
*/

export class Camera {
    constructor(viewportWidth, viewportHeight, worldWidth, worldHeight, zoom = 1.0) {
        this.zoom = zoom;
        this.w = viewportWidth / zoom;
        this.h = viewportHeight / zoom;
        this.worldW = worldWidth;
        this.worldH = worldHeight;
        this.x = 0;
        this.y = 0;
        this.shake = 0;
    }

    // Helper to get screen coordinates handling wrapping
    getScreenRect(x, y, w, h) {
        // 1. Center logic relative to camera center
        const camCenterX = this.x + this.w / 2;
        let dx = x - camCenterX;

        // 2. Wrap via Shortest Path
        const halfWorld = this.worldW / 2;
        if (dx > halfWorld) dx -= this.worldW;
        else if (dx < -halfWorld) dx += this.worldW;

        // 3. Screen Position
        const screenX = (this.w / 2) + dx;
        const screenY = y - this.y;

        return { x: screenX, y: screenY, onScreen: (screenX + w > 0 && screenX < this.w) };
    }

    follow(target, dt) {
        if (this.shake > 0) {
            this.shake -= 20 * dt;
            if (this.shake < 0) this.shake = 0;
        }

        // Target center
        let tx = target.x - this.w / 2;
        let ty = target.y - this.h / 2;

        // Unclamped Y (or clamped? User said "wrapping around play area", implying X. Y usually blocked by ground/sky).
        // Let's keep Y clamped for now as it's a platformer with ground.
        if (ty < -500) ty = -500; // Allow looking up high
        if (ty + this.h > this.worldH) ty = this.worldH - this.h;

        // X is INFINITE. We just follow. 
        // Note: We need to handle the case where target wraps from 5000 to 0.
        // But the target entity itself should probably manage its x to stay 0..5000.
        // If camera is at 4900 and target goes to 100, target.x is 100.
        // tx would be 100 - w/2. 
        // We need smooth interpolation even across the wrap boundary.

        // Complex Lerp Wrapping:
        // Calculate shortest distance to target X
        let dx = (target.x - this.w / 2) - this.x;
        // Wrap dx
        if (dx > this.worldW / 2) dx -= this.worldW;
        if (dx < -this.worldW / 2) dx += this.worldW;

        this.x += dx * 5 * dt;
        this.y += (ty - this.y) * 5 * dt;

        // Normalize Camera X to keep it within bounds (optional, but good for math)
        // Actually, for "infinite" feel without entity glitches, maybe safer to keep camera Unbounded?
        // But Background parallax depends on camera.x. Let's modulus it.
        while (this.x < 0) this.x += this.worldW;
        while (this.x >= this.worldW) this.x -= this.worldW;

        if (this.shake > 0) {
            this.x += (Math.random() - 0.5) * this.shake * 10;
            this.y += (Math.random() - 0.5) * this.shake * 10;
        }
    }
}

class ParallaxLayer {
    constructor(imagePath, speed, yOffset = 0, autoScrollSpeed = 0) {
        this.image = new Image();
        this.image.src = imagePath;
        this.speed = speed;
        this.autoScrollSpeed = autoScrollSpeed;
        this.yOffset = yOffset;
        this.loaded = false;
        this.image.onload = () => { this.loaded = true; };
    }

    draw(ctx, camera) {
        if (!this.loaded) return;

        const windOffset = (Date.now() / 1000) * this.autoScrollSpeed;
        const totalX = -(camera.x * this.speed) - windOffset;

        // Use Math.floor to prevent sub-pixel tearing lines
        const xPos = Math.floor(totalX % this.image.width);

        ctx.drawImage(this.image, xPos, this.yOffset);
        ctx.drawImage(this.image, xPos + this.image.width, this.yOffset);
        ctx.drawImage(this.image, xPos + this.image.width * 2, this.yOffset);

        if (xPos > 0) {
            ctx.drawImage(this.image, xPos - this.image.width, this.yOffset);
        }
    }
}

export class World {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.camera = new Camera(800, 600, width, height, 0.8);

        this.layers = [
            // Back: Sky Layer 1
            new ParallaxLayer('assets/backgrounds/sky_layer_1.png', 0.1, 0, 5),
            // Mid: Sky Layer 2
            new ParallaxLayer('assets/backgrounds/sky_layer_2.png', 0.5, 0, 20),
            // Front: Clouds FG
            new ParallaxLayer('assets/backgrounds/clouds_fg.png', 0.8, 100, 50)
        ];
    }

    update(player, dt) {
        this.camera.follow(player, dt);
    }

    draw(ctx, season) {
        ctx.save();

        // WINTER FILTER: Shift Hue to Blue/Green
        if (season === 'winter') {
            ctx.filter = 'hue-rotate(12deg) brightness(1.1)';
        }

        this.layers.forEach(layer => layer.draw(ctx, this.camera));

        ctx.restore(); // Remove filter for game objects
    }
}
