/* THE STAGE MANAGER (World & Camera)
   This file sets the stage. It defines the boundaries of reality
   and controls the "Camera" which is essentially a floating eye
   stalking our glorious Chieftain.
*/

export class Camera {
    constructor(viewportWidth, viewportHeight, worldWidth, worldHeight) {
        this.x = 0;
        this.y = 0;
        this.w = viewportWidth;
        this.h = viewportHeight;
        
        // The limits of our known universe
        this.worldW = worldWidth;
        this.worldH = worldHeight;
    }

    // The "Stalker" function. Keeps the target centered.
    // Target must have x and y properties (like our Chieftain).
    follow(target) {
        // Center the camera on the target
        // We subtract half the screen width/height to put the target in the middle
        this.x = target.x - this.w / 2;
        this.y = target.y - this.h / 2;

        // CLAMPING: Prevent the camera from seeing the void outside the world
        // "Here be dragons" (or null pointer exceptions)
        
        // Left limit
        if (this.x < 0) this.x = 0;
        // Right limit
        if (this.x + this.w > this.worldW) this.x = this.worldW - this.w;
        
        // Top limit
        if (this.y < 0) this.y = 0;
        // Bottom limit
        if (this.y + this.h > this.worldH) this.y = this.worldH - this.h;
    }
}

class ParallaxLayer {
    constructor(imagePath, speed, yOffset = 0) {
        this.image = new Image();
        this.image.src = imagePath;
        this.speed = speed; // 0.0 = static, 1.0 = moves with camera
        this.yOffset = yOffset;
        this.loaded = false;

        this.image.onload = () => {
            this.loaded = true;
        };
    }

    draw(ctx, camera) {
        if (!this.loaded) {
            // If the image isn't loaded, draw a placeholder colour so we know it's trying!
            ctx.fillStyle = `rgba(100, 149, 237, ${this.speed + 0.2})`; // Cornflower Blue variations
            ctx.fillRect(0, 0, camera.w, camera.h);
            return;
        }

        // PARALLAX MATHS (Hold onto your hats!)
        // We calculate how much the layer has moved based on the camera X
        // The % (modulo) operator makes the image repeat infinitely
        
        const xPos = -(camera.x * this.speed) % this.image.width;
        
        // We need to draw the image enough times to fill the screen width
        // Usually 2 or 3 times is enough if the image is wide
        
        // Draw first copy
        ctx.drawImage(this.image, xPos, this.yOffset);
        
        // Draw second copy (to the right)
        if (xPos + this.image.width < camera.w) {
            ctx.drawImage(this.image, xPos + this.image.width, this.yOffset);
        }
        
        // Draw third copy (just in case screen is huge or image is small)
        if (xPos + this.image.width * 2 < camera.w) {
            ctx.drawImage(this.image, xPos + this.image.width * 2, this.yOffset);
        }
    }
}

export class World {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        
        // The Camera (800x600 viewport)
        this.camera = new Camera(800, 600, width, height);

        // The Background Layers
        // Speed 0.1 = Far away (Mountains)
        // Speed 0.5 = Middle distance (Clouds)
        // Speed 0.8 = Close up (Foreground clouds?)
        this.layers = [
            new ParallaxLayer('assets/backgrounds/bg_sky_far.png', 0.1, 0),
            new ParallaxLayer('assets/backgrounds/bg_clouds_mid.png', 0.5, 50), // Slightly lower
            new ParallaxLayer('assets/backgrounds/clouds_fg.png', 0.8, 100)     // Even lower
        ];
    }

    update(player) {
        // Tell the camera to chase the player like a puppy
        this.camera.follow(player);
    }

    draw(ctx) {
        // Draw all background layers in order (back to front)
        this.layers.forEach(layer => layer.draw(ctx, this.camera));
        
        // Debug: Draw world boundaries if you want to see the "Edge of the World"
        /*
        ctx.strokeStyle = "red";
        ctx.lineWidth = 5;
        ctx.strokeRect(-this.camera.x, -this.camera.y, this.width, this.height);
        */
    }
}
