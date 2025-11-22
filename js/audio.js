/* THE CONDUCTOR (Audio Engine)
   Definitive V3: Bulletproof Loading & Safety Checks.
*/

export class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.sounds = {};
        this.files = {
            'ambience': 'assets/sounds/ambience.ogg',
            'jump': 'assets/sounds/jump.ogg',
            'land': 'assets/sounds/land.ogg',
            'fall': 'assets/sounds/fall.ogg',
            'shoot': 'assets/sounds/shoot.ogg',
            'hit': 'assets/sounds/hit.ogg',
            'music': 'assets/sounds/music.ogg',
            'teepee': 'assets/sounds/teepee.ogg',
            'death': 'assets/sounds/death.ogg'
        };
        
        this.loops = {};
        this.isMuted = false;
        this.initialized = false;
    }

    async loadAll() {
        const promises = Object.entries(this.files).map(([key, url]) => this._loadBuffer(key, url));
        await Promise.all(promises);
        console.log("🎵 Audio Loaded & Ready!");
    }

    async _loadBuffer(key, url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            this.sounds[key] = audioBuffer;
        } catch (e) {
            console.warn(`⚠️ Sound file missing or broken: ${url}. Error: ${e.message}`);
            // We don't re-throw, so Promise.all continues
        }
    }

    resume() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume().then(() => {
                this.initialized = true;
            }).catch(e => console.error(e));
        } else {
            this.initialized = true;
        }
    }

    play(name, vol = 1.0, pitchVar = 0.0) {
        if (!this.sounds[name]) return;

        try {
            const source = this.ctx.createBufferSource();
            source.buffer = this.sounds[name];
            
            if (pitchVar > 0) {
                const variance = (Math.random() * pitchVar * 2) - pitchVar;
                source.playbackRate.value = 1.0 + variance;
            }

            const gainNode = this.ctx.createGain();
            gainNode.gain.value = vol;

            source.connect(gainNode);
            gainNode.connect(this.ctx.destination);
            source.start(0);
        } catch (e) {
            console.warn(`Audio play error for ${name}:`, e);
        }
    }

    startLoop(name, vol = 1.0) {
        if (!this.sounds[name]) {
            // If sound isn't loaded yet, try again in 500ms, up to a limit? 
            // For now, just return to avoid infinite recursion crashing
            return;
        }
        if (this.loops[name]) return; 

        try {
            const source = this.ctx.createBufferSource();
            source.buffer = this.sounds[name];
            source.loop = true;

            const gainNode = this.ctx.createGain();
            gainNode.gain.value = vol;

            source.connect(gainNode);
            gainNode.connect(this.ctx.destination);
            source.start(0);

            this.loops[name] = { source, gain: gainNode };
        } catch (e) {
            console.warn(`Audio loop error for ${name}:`, e);
        }
    }

    setLoopVolume(name, vol) {
        if (this.loops[name]) {
            try {
                this.loops[name].gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);
            } catch (e) {}
        }
    }

    setLoopPitch(name, rate) {
        if (this.loops[name]) {
            try {
                this.loops[name].source.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.1);
            } catch (e) {}
        }
    }
}
