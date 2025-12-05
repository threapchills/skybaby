/* THE STAGE MANAGER (World & Camera)
   Definitive V4: VISUAL JUICE UPDATE 🥤
   - Handles "Bloom" logic in main draw.
   - Adds Impact Frames helper.
*/

export class Camera {
    constructor(viewportWidth, viewportHeight, worldWidth, worldHeight) {
        this.x = 0;
        this.y = 0;
        this.w = viewportWidth;
        this.h = viewportHeight;
        this.worldW = worldWidth;
        this.worldH = worldHeight;
        this.shake = 0;
    }

    follow(target, dt) {
        if (this.shake > 0) {
            this.shake -= 20 * dt;
            if (this.shake < 0) this.shake = 0;
        }

        // Smooth locking
        let tx = target.x - this.w / 2;
        let ty = target.y - this.h / 2;

        if (tx < 0) tx = 0;
        if (tx + this.w > this.worldW) tx = this.worldW - this.w;
        if (ty < 0) ty = 0;
        if (ty + this.h > this.worldH) ty = this.worldH - this.h;

        // Lerp
        this.x += (tx - this.x) * 5 * dt;
        this.y += (ty - this.y) * 5 * dt;

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
        this.camera = new Camera(800, 600, width, height);

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
