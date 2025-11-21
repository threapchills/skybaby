/* THE STAGE MANAGER (World & Camera)
   Fixed filenames to match your uploads!
*/

export class Camera {
    constructor(viewportWidth, viewportHeight, worldWidth, worldHeight) {
        this.x = 0;
        this.y = 0;
        this.w = viewportWidth;
        this.h = viewportHeight;
        this.worldW = worldWidth;
        this.worldH = worldHeight;
    }

    follow(target) {
        // Smooth locking
        this.x = target.x - this.w / 2;
        this.y = target.y - this.h / 2;

        if (this.x < 0) this.x = 0;
        if (this.x + this.w > this.worldW) this.x = this.worldW - this.w;
        if (this.y < 0) this.y = 0;
        if (this.y + this.h > this.worldH) this.y = this.worldH - this.h;
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

        // FILENAMES UPDATED TO MATCH YOUR UPLOADS
        this.layers = [
            // Back: Sky Layer 1
            new ParallaxLayer('assets/backgrounds/sky_layer_1.png', 0.1, 0, 5),
            // Mid: Sky Layer 2
            new ParallaxLayer('assets/backgrounds/sky_layer_2.png', 0.5, 0, 20),
            // Front: Clouds FG
            new ParallaxLayer('assets/backgrounds/clouds_fg.png', 0.8, 100, 50)     
        ];
    }

    update(player) {
        this.camera.follow(player);
    }

    draw(ctx) {
        this.layers.forEach(layer => layer.draw(ctx, this.camera));
    }
}
