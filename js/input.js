/* THE NERVOUS SYSTEM (Input Handler)
   This module listens to the whispers of the keyboard and the
   movements of the mouse. It translates your physical will 
   into digital spirit energy.
*/

export class InputHandler {
    constructor() {
        // The State of the Keys (True = Pressed, False = released)
        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false,
            space: false, // Just in case we need a jump or brake later
            shift: false  // Maybe for a speed boost?
        };

        // The State of the Mouse
        this.mouse = {
            x: 0,
            y: 0,
            leftDown: false,
            rightDown: false,
            isDragging: false // For moving islands later
        };

        // Bind the event listeners to the window/document
        this._initListeners();
    }

    _initListeners() {
        // 1. KEYBOARD EARS
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(key)) {
                this.keys[key] = true;
            }
            if (e.key === 'Shift') this.keys.shift = true;
            if (e.key === ' ') this.keys.space = true;
        });

        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(key)) {
                this.keys[key] = false;
            }
            if (e.key === 'Shift') this.keys.shift = false;
            if (e.key === ' ') this.keys.space = false;
        });

        // 2. MOUSE EYES
        // We need the canvas element to calculate relative coordinates
        const canvas = document.getElementById('gameCanvas');

        window.addEventListener('mousemove', (e) => {
            // Get the canvas position on the screen to offset the mouse
            const rect = canvas.getBoundingClientRect();
            
            // Calculate mouse position relative to the canvas 
            // (0,0 is top left of the game window)
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        });

        window.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.mouse.leftDown = true;   // Left Click (Fireball)
            if (e.button === 2) this.mouse.rightDown = true;  // Right Click (Drag Island)
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.mouse.leftDown = false;
            if (e.button === 2) this.mouse.rightDown = false;
        });

        // PREVENT CONTEXT MENU
        // We don't want a browser menu popping up when you try to drag an island!
        window.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            return false;
        });
    }

    // A helper to get the "Vector" of movement based on keys
    // Returns {x: -1/0/1, y: -1/0/1}
    getMoveVector() {
        let x = 0;
        let y = 0;

        if (this.keys.a) x -= 1;
        if (this.keys.d) x += 1;
        if (this.keys.w) y -= 1;
        if (this.keys.s) y += 1;

        // Normalize diagonal movement so you don't fly faster diagonally
        // (Pythagoras would be very upset if we didn't do this)
        if (x !== 0 && y !== 0) {
            const factor = 1 / Math.sqrt(2);
            x *= factor;
            y *= factor;
        }

        return { x, y };
    }
}
