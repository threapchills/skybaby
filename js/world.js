/* THE STAGE MANAGER (World & Camera)
   Includes "Windy" parallax that moves automatically!
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
        this.x = target.x - this.w / 2;
        this.y = target.y - this.h / 2;

        // Clamp to world bounds
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
        this.speed = speed; // How fast it moves with camera
        this.autoScrollSpeed = autoScrollSpeed; // How fast it moves by itself (Wind)
        this.yOffset = yOffset;
        this.loaded = false;
        this.image.onload = () => { this.loaded = true; };
    }

    draw(ctx, camera) {
        if (!this.loaded) return;

        // Calculate position based on Camera AND Time (Wind)
        // We use Date.now() for a continuous flow
        const windOffset = (Date.now() / 1000) * this.autoScrollSpeed; 
        const totalX = -(camera.x * this.speed) - windOffset;
        
        // Modulo to loop the image
        const xPos = totalX % this.image.width;
        
        // Draw enough copies to fill the screen width + a buffer
        // (We draw 3 just to be safe for wide screens)
        ctx.drawImage(this.image, xPos, this.yOffset);
        ctx.drawImage(this.image, xPos + this.image.width, this.yOffset);
        ctx.drawImage(this.image, xPos + this.image.width * 2, this.yOffset);
        
        // If we are scrolling left (negative), we might need to draw one behind too
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
            // Sky: Far away, moves slow, slight wind
            new ParallaxLayer('assets/backgrounds/bg_sky_far.png', 0.1, 0, 5),
            // Clouds Mid: Moves medium, medium wind
            new ParallaxLayer('assets/backgrounds/bg_clouds_mid.png', 0.5, 50, 20),
            // Clouds Close: Moves fast, fast wind
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
