/* THE CONDUCTOR (Audio Engine)
   Polished: Reliable Music & Consistent Gunshots!
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
            'music': 'assets/sounds/music.ogg'
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
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            this.sounds[key] = audioBuffer;
        } catch (e) {
            console.warn(`⚠️ Sound file missing: ${url}`);
        }
    }

    resume() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume().then(() => {
                console.log("🔊 Audio Context Resumed!");
                this.initialized = true;
            });
        } else {
            this.initialized = true;
        }
    }

    play(name, vol = 1.0, pitchVar = 0.0) {
        if (!this.sounds[name]) return;

        const source = this.ctx.createBufferSource();
        source.buffer = this.sounds[name];
        
        // Pitch Randomization (Optional)
        if (pitchVar > 0) {
            const variance = (Math.random() * pitchVar * 2) - pitchVar;
            source.playbackRate.value = 1.0 + variance;
        }

        const gainNode = this.ctx.createGain();
        gainNode.gain.value = vol;

        source.connect(gainNode);
        gainNode.connect(this.ctx.destination);
        source.start(0);
    }

    startLoop(name, vol = 1.0) {
        if (!this.sounds[name]) {
            // If sound isn't loaded yet, try again in 100ms
            setTimeout(() => this.startLoop(name, vol), 100);
            return;
        }
        if (this.loops[name]) return; // Already playing

        const source = this.ctx.createBufferSource();
        source.buffer = this.sounds[name];
        source.loop = true;

        const gainNode = this.ctx.createGain();
        gainNode.gain.value = vol;

        source.connect(gainNode);
        gainNode.connect(this.ctx.destination);
        source.start(0);

        this.loops[name] = { source, gain: gainNode };
    }

    setLoopVolume(name, vol) {
        if (this.loops[name]) {
            // Smooth fade (0.1s)
            this.loops[name].gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);
        }
    }

    setLoopPitch(name, rate) {
        if (this.loops[name]) {
            this.loops[name].source.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.1);
        }
    }
}
