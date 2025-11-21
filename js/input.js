/* THE NERVOUS SYSTEM (Input Handler)
   Now with Spacebar support for Jumping/Flying!
*/

export class InputHandler {
    constructor() {
        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false,
            space: false, // JUMP / FLY
            shift: false
        };

        this.mouse = {
            x: 0,
            y: 0,
            leftDown: false,
            rightDown: false,
            isDragging: false 
        };

        this._initListeners();
    }

    _initListeners() {
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(key)) this.keys[key] = true;
            if (e.code === 'Space') this.keys.space = true; // Use code for Space
            if (e.key === 'Shift') this.keys.shift = true;
        });

        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(key)) this.keys[key] = false;
            if (e.code === 'Space') this.keys.space = false;
            if (e.key === 'Shift') this.keys.shift = false;
        });

        const canvas = document.getElementById('gameCanvas');

        window.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            // Scale mouse coordinates in case canvas is resized by CSS
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            this.mouse.x = (e.clientX - rect.left) * scaleX;
            this.mouse.y = (e.clientY - rect.top) * scaleY;
        });

        window.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.mouse.leftDown = true;   
            if (e.button === 2) this.mouse.rightDown = true;  
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.mouse.leftDown = false;
            if (e.button === 2) this.mouse.rightDown = false;
        });

        window.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            return false;
        });
    }
}
