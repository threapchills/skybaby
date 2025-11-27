/* THE NERVOUS SYSTEM (Input Handler)
   Now with Spacebar support for Jumping/Flying!
   UPDATED: Added Scroll Wheel & Number Keys for Spell Switching! 🧙‍♂️
*/

export class InputHandler {
    constructor() {
        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false,
            space: false, // JUMP / FLY
            shift: false,
            digit1: false,
            digit2: false,
            digit3: false,
            digit4: false
        };

        this.mouse = {
            x: 0,
            y: 0,
            leftDown: false,
            rightDown: false,
            isDragging: false,
            wheelDelta: 0 // New: Track scroll direction
        };

        this.scrollCallback = null; // Callback for instantaneous scroll events

        this._initListeners();
    }

    onScroll(callback) {
        this.scrollCallback = callback;
    }

    _initListeners() {
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(key)) this.keys[key] = true;
            if (e.code === 'Space') this.keys.space = true;
            if (e.key === 'Shift') this.keys.shift = true;
            
            // Map digits
            if (e.code === 'Digit1') this.keys.digit1 = true;
            if (e.code === 'Digit2') this.keys.digit2 = true;
            if (e.code === 'Digit3') this.keys.digit3 = true;
            if (e.code === 'Digit4') this.keys.digit4 = true;
        });

        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(key)) this.keys[key] = false;
            if (e.code === 'Space') this.keys.space = false;
            if (e.key === 'Shift') this.keys.shift = false;
            
            if (e.code === 'Digit1') this.keys.digit1 = false;
            if (e.code === 'Digit2') this.keys.digit2 = false;
            if (e.code === 'Digit3') this.keys.digit3 = false;
            if (e.code === 'Digit4') this.keys.digit4 = false;
        });

        const canvas = document.getElementById('gameCanvas');

        window.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
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

        window.addEventListener('wheel', (e) => {
            this.mouse.wheelDelta = Math.sign(e.deltaY);
            if (this.scrollCallback) {
                this.scrollCallback(this.mouse.wheelDelta);
            }
        }, { passive: true });

        window.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            return false;
        });
    }
}
